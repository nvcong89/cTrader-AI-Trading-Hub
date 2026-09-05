import os
import sys
import argparse
import pandas as pd
import numpy as np
from concurrent.futures import ProcessPoolExecutor, as_completed

DATA_DIR = r"c:\Users\210608\Documents\GitHub\cTrader_Bots\HistoricalData\XAUUSD"

def calculate_ema(series, period):
    return series.ewm(span=period, adjust=False).mean()

def calculate_tema(series, period):
    ema1 = calculate_ema(series, period)
    ema2 = calculate_ema(ema1, period)
    ema3 = calculate_ema(ema2, period)
    return 3 * (ema1 - ema2) + ema3

def calculate_rsi(series, period):
    delta = series.diff()
    gain = (delta.where(delta > 0, 0)).rolling(window=period).mean()
    loss = (-delta.where(delta < 0, 0)).rolling(window=period).mean()
    rs = gain / (loss + 1e-10)
    return 100 - (100 / (1 + rs))

def calculate_adx(high, low, close, period):
    plus_dm = high.diff()
    minus_dm = low.diff()
    plus_dm = np.where((plus_dm > minus_dm) & (plus_dm > 0), plus_dm, 0.0)
    minus_dm = np.where((minus_dm > plus_dm) & (minus_dm > 0), minus_dm, 0.0)
    
    tr1 = high - low
    tr2 = (high - close.shift()).abs()
    tr3 = (low - close.shift()).abs()
    tr = pd.concat([tr1, tr2, tr3], axis=1).max(axis=1)
    
    atr = tr.rolling(period).mean()
    plus_di = 100 * (pd.Series(plus_dm).rolling(period).mean() / (atr + 1e-10))
    minus_di = 100 * (pd.Series(minus_dm).rolling(period).mean() / (atr + 1e-10))
    
    dx = 100 * (plus_di - minus_di).abs() / (plus_di + minus_di + 1e-10)
    adx = dx.rolling(period).mean()
    return adx

def evaluate_params(args_tuple):
    df, params = args_tuple
    initial_balance = 10000.0
    
    tema1 = calculate_tema(df['Close'], params['periodTEMA1'])
    tema2 = calculate_tema(df['Close'], params['periodTEMA2'])
    rsi = calculate_rsi(df['Close'], params['periodRSI'])
    rsi_short = calculate_ema(rsi, params['periodRSIshort'])
    rsi_long = calculate_ema(rsi_short, params['periodRSIlong'])
    adx = calculate_adx(df['High'], df['Low'], df['Close'], params['periodADX'])
    ema1 = calculate_ema(df['Close'], params['periodEMA1'])
    ema2 = calculate_ema(df['Close'], params['periodEMA2'])
    
    balance = initial_balance
    peak_equity = initial_balance
    
    positions = []
    closed_trades = []
    equity_curve = []
    
    close_arr = df['Close'].to_numpy()
    high_arr = df['High'].to_numpy()
    low_arr = df['Low'].to_numpy()
    
    for i in range(200, len(df)):
        price = close_arr[i]
        high_price = high_arr[i]
        low_price = low_arr[i]
        
        current_equity = balance
        for pos in positions:
            pnl = (price - pos['entry_price']) * pos['volume'] if pos['type'] == 'BUY' else (pos['entry_price'] - price) * pos['volume']
            current_equity += pnl
            
        peak_equity = max(peak_equity, current_equity)
        current_dd_pct = ((peak_equity - current_equity) / peak_equity) * 100.0 if peak_equity > 0 else 0
        
        circuit_breaker = params.get('enableEquityProtection', True) and (current_dd_pct >= params.get('maxEquityDDPercent', 10.0))
        effective_risk = params['riskFactor'] * params.get('ddRiskReductionRatio', 0.5) if circuit_breaker else params['riskFactor']
        
        adx_val = adx.iloc[i]
        min_adx = params.get('minADX', 15)
        adx_pass = not params.get('enableADXFilter', True) or (adx_val >= min_adx)
        
        cross_up = (tema1.iloc[i-1] <= tema2.iloc[i-1]) and (tema1.iloc[i] > tema2.iloc[i])
        cross_down = (tema2.iloc[i-1] <= tema1.iloc[i-1]) and (tema2.iloc[i] > tema1.iloc[i])
        
        buy_signal = adx_pass and ((cross_up and rsi.iloc[i] > params['levelRSIBuy'] and adx_val > params['levelADXBuy']) or
                                    (rsi.iloc[i] > rsi_short.iloc[i] > rsi_long.iloc[i] and rsi.iloc[i] <= params['levelRSIcloseBuy']))
                                    
        sell_signal = adx_pass and ((cross_down and rsi.iloc[i] < params['levelRSISell'] and adx_val > params['levelADXSell']) or
                                     (rsi.iloc[i] < rsi_short.iloc[i] < rsi_long.iloc[i] and rsi.iloc[i] >= params['levelRSISell']))
                                     
        close_buy = ((rsi.iloc[i-1] <= params['levelRSIcloseBuy'] < rsi.iloc[i]) and adx_val > params['levelADXSell'] and ema1.iloc[i] < ema2.iloc[i]) or sell_signal
        close_sell = ((rsi.iloc[i-1] >= params['levelRSIcloseSell'] > rsi.iloc[i]) and adx_val > params['levelADXBuy'] and ema1.iloc[i] > ema2.iloc[i]) or buy_signal

        for pos in positions[:]:
            if pos['type'] == 'BUY':
                hit_sl = low_price <= pos['sl_price']
                hit_tp = high_price >= pos['tp_price']
                
                if hit_sl or hit_tp or close_buy:
                    exit_price = pos['sl_price'] if hit_sl else (pos['tp_price'] if hit_tp else price)
                    pnl = (exit_price - pos['entry_price']) * pos['volume']
                    balance += pnl
                    closed_trades.append({'type': 'BUY', 'pnl': pnl})
                    positions.remove(pos)
                    
            elif pos['type'] == 'SELL':
                hit_sl = high_price >= pos['sl_price']
                hit_tp = low_price <= pos['tp_price']
                
                if hit_sl or hit_tp or close_sell:
                    exit_price = pos['sl_price'] if hit_sl else (pos['tp_price'] if hit_tp else price)
                    pnl = (pos['entry_price'] - exit_price) * pos['volume']
                    balance += pnl
                    closed_trades.append({'type': 'SELL', 'pnl': pnl})
                    positions.remove(pos)

        if len(positions) < params.get('maxPermittedOrder', 1):
            spread_offset = params.get('spreadPips', 1.0) * 0.1
            comm_per_mln = params.get('commissionPerMln', 30.0)

            if buy_signal:
                entry_p = price + spread_offset
                sl_pips = (params['stoplossPercentage'] / 100.0) * entry_p / 0.01
                tp_pips = (params['takeprofitPercentage'] / 100.0) * entry_p / 0.01
                sl_price = entry_p - sl_pips * 0.01
                tp_price = entry_p + tp_pips * 0.01
                
                risk_amount = balance * (effective_risk / 100.0)
                volume = risk_amount / (sl_pips * 0.01) if sl_pips > 0 else 10.0
                volume = min(volume, params.get('maxVol', 10.0))
                
                # Deduct commission upfront (Volume * entry_p * (30 / 1,000,000))
                comm_fee = (volume * entry_p) * (comm_per_mln / 1000000.0) * 2.0
                balance -= comm_fee
                
                positions.append({'type': 'BUY', 'entry_price': entry_p, 'sl_price': sl_price, 'tp_price': tp_price, 'volume': volume})
                
            elif sell_signal:
                entry_p = price
                sl_pips = (params['stoplossPercentage'] / 100.0) * entry_p / 0.01
                tp_pips = (params['takeprofitPercentage'] / 100.0) * entry_p / 0.01
                sl_price = entry_p + sl_pips * 0.01
                tp_price = entry_p - tp_pips * 0.01
                
                risk_amount = balance * (effective_risk / 100.0)
                volume = risk_amount / (sl_pips * 0.01) if sl_pips > 0 else 10.0
                volume = min(volume, params.get('maxVol', 10.0))
                
                # Deduct commission upfront
                comm_fee = (volume * entry_p) * (comm_per_mln / 1000000.0) * 2.0
                balance -= comm_fee
                
                positions.append({'type': 'SELL', 'entry_price': entry_p, 'sl_price': sl_price, 'tp_price': tp_price, 'volume': volume})

        equity_curve.append(balance)

    total_trades = len(closed_trades)
    if total_trades == 0:
        return {'minADX': params['minADX'], 'SL%': params['stoplossPercentage'], 'TP%': params['takeprofitPercentage'], 'MaxDD_Limit': params['maxEquityDDPercent'], 'Risk%': params['riskFactor'], 'NetProfit': 0, 'Return%': 0, 'WinRate%': 0, 'Trades': 0, 'PF': 0, 'MaxDD%': 0}
        
    wins = [t for t in closed_trades if t['pnl'] > 0]
    losses = [t for t in closed_trades if t['pnl'] < 0]
    
    win_rate = (len(wins) / total_trades) * 100.0
    net_profit = balance - initial_balance
    gross_profit = sum(t['pnl'] for t in wins)
    gross_loss = abs(sum(t['pnl'] for t in losses))
    profit_factor = (gross_profit / gross_loss) if gross_loss > 0 else gross_profit
    
    eq_series = pd.Series(equity_curve)
    cummax = eq_series.cummax()
    drawdown = (cummax - eq_series) / cummax * 100.0
    max_dd = drawdown.max()
    
    return {
        'minADX': params['minADX'],
        'SL%': params['stoplossPercentage'],
        'TP%': params['takeprofitPercentage'],
        'MaxDD_Limit': params['maxEquityDDPercent'],
        'Risk%': params['riskFactor'],
        'NetProfit': net_profit,
        'Return%': (net_profit / initial_balance) * 100.0,
        'WinRate%': win_rate,
        'Trades': total_trades,
        'PF': profit_factor,
        'MaxDD%': max_dd
    }

def load_dataset(csv_path):
    with open(csv_path, 'r') as f:
        first_line = f.readline().strip()
        
    if first_line.startswith("DateTime") or first_line.startswith("Date,"):
        df = pd.read_csv(csv_path)
        if "DateTime" not in df.columns and "Date" in df.columns:
            if "Time" in df.columns:
                df['DateTime'] = pd.to_datetime(df['Date'].astype(str) + ' ' + df['Time'].astype(str))
            else:
                df['DateTime'] = pd.to_datetime(df['Date'])
    else:
        # Headerless MT4/MT5 format: Date, Time, Open, High, Low, Close, Volume
        df = pd.read_csv(csv_path, header=None, names=['Date', 'Time', 'Open', 'High', 'Low', 'Close', 'Volume'])
        df['DateTime'] = pd.to_datetime(df['Date'].astype(str) + ' ' + df['Time'].astype(str))
        
    df = df.sort_values('DateTime').reset_index(drop=True)
    return df

def main():
    parser = argparse.ArgumentParser(description="cTrader cBot Backtester & Optimizer Agent")
    parser.add_argument("--file", type=str, default=os.path.join(DATA_DIR, "XAUUSD_M15_3Y.csv"), help="Path to CSV dataset")
    parser.add_argument("--tf", type=str, default="M15", help="Timeframe: M5, M15, H1, H4, D1")
    parser.add_argument("--optimize", action="store_true", help="Run Grid Parameter Optimization")
    parser.add_argument("--risk", type=float, default=10.0, help="Fixed Account Risk %%")
    args = parser.parse_args()

    csv_path = args.file if os.path.exists(args.file) else os.path.join(DATA_DIR, f"XAUUSD_{args.tf}_3Y.csv")
    if not os.path.exists(csv_path):
        print(f"Error: Dataset {csv_path} not found.")
        return

    print(f"Loading XAUUSD dataset from: {csv_path}")
    df = load_dataset(csv_path)
    print(f"Data Loaded: {len(df)} bars from {df['DateTime'].iloc[0]} to {df['DateTime'].iloc[-1]}")

    base_params = {
        'periodTEMA1': 147,
        'periodTEMA2': 183,
        'periodRSI': 33,
        'periodRSIshort': 85,
        'periodRSIlong': 93,
        'levelRSIBuy': 38,
        'levelRSISell': 54,
        'levelRSIcloseBuy': 60,
        'levelRSIcloseSell': 24,
        'periodADX': 8,
        'levelADXBuy': 15,
        'levelADXSell': 35,
        'periodEMA1': 121,
        'periodEMA2': 133,
        'enableADXFilter': True,
        'minADX': 15,
        'enableEquityProtection': True,
        'maxEquityDDPercent': 15.0,
        'ddRiskReductionRatio': 0.5,
        'riskFactor': args.risk,
        'stoplossPercentage': 1.2,
        'takeprofitPercentage': 2.5,
        'maxPermittedOrder': 1,
        'maxVol': 10.0,
        'spreadPips': 15.0,
        'commissionPerMln': 0.0
    }

    if not args.optimize:
        res = evaluate_params((df, base_params))
        print(f"\nSingle Backtest Simulation for v102 (Risk: {args.risk}%):")
        print(f"Initial Balance:  $10,000.00")
        print(f"Final Balance:    ${(10000 + res['NetProfit']):,.2f}")
        print(f"Net Profit:       ${res['NetProfit']:,.2f} ({res['Return%']:.1f}%)")
        print(f"Total Trades:     {res['Trades']}")
        print(f"Win Rate:         {res['WinRate%']:.1f}%")
        print(f"Profit Factor:    {res['PF']:.2f}")
        print(f"Max Drawdown:     {res['MaxDD%']:.1f}%")
        print("======================================================")
    else:
        print(f"\nRunning Parallel Grid Optimization for v102 (Fixed Risk: {args.risk}%)...")
        tasks = []
        min_adx_list = [15, 20, 25]
        sl_pct_list = [1.2, 1.5, 1.8, 2.5]
        tp_pct_list = [2.5, 3.2, 5.0]
        max_dd_limit_list = [10.0, 15.0]
        
        for min_adx in min_adx_list:
            for sl_pct in sl_pct_list:
                for tp_pct in tp_pct_list:
                    for dd_limit in max_dd_limit_list:
                        test_params = base_params.copy()
                        test_params['minADX'] = min_adx
                        test_params['stoplossPercentage'] = sl_pct
                        test_params['takeprofitPercentage'] = tp_pct
                        test_params['maxEquityDDPercent'] = dd_limit
                        tasks.append((df, test_params))
                        
        print(f"Evaluating {len(tasks)} combinations using parallel process pool...")
        opt_results = []
        with ProcessPoolExecutor() as executor:
            futures = [executor.submit(evaluate_params, task) for task in tasks]
            for future in as_completed(futures):
                opt_results.append(future.result())
                
        opt_df = pd.DataFrame(opt_results).sort_values("NetProfit", ascending=False)
        
        print(f"\nTOP 5 OPTIMAL PARAMETER COMBINATIONS (Fixed Risk: {args.risk}%):")
        print(opt_df.head(5).to_string(index=False))

if __name__ == "__main__":
    main()
