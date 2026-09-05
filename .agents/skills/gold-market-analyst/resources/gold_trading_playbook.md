# XAUUSD (Gold) Quantitative & Strategic Trading Playbook

## 1. Key Macroeconomic Drivers for Gold (XAUUSD)

Gold is a non-yielding asset priced in US Dollars. Its valuation is driven primarily by:

1. **Real Yields (US 10-Year TIPS Yield)**: Strong negative correlation (-0.85). When real yields fall (or drop into negative territory), the opportunity cost of holding physical gold decreases, fueling strong bullish rallies.
2. **US Dollar Index (DXY)**: Inverse correlation. Dollar strength makes gold more expensive in foreign currencies, exerting downward pressure.
3. **Federal Reserve Monetary Policy**: Rate cut cycles are historical bullish catalysts; hawkish rate hikes create strong resistance.
4. **Geopolitical Risk & Inflation Hedges**: Inflation surges (CPI > expectations) and geopolitical conflicts drive safe-haven inflows.
5. **Economic Calendar Impact**:
   - High Impact (Avoid or filter): **NFP (Non-Farm Payrolls)**, **CPI**, **FOMC Rate Decisions & Statements**, **PCE Price Index**.

---

## 2. Technical Analysis & Indicator Frameworks for Gold

### A. Trend & Momentum Indicators
- **TEMA (Triple Exponential Moving Average)**: Filters market lag while avoiding false whipsaws during rapid trend changes. Fast TEMA (e.g. 147) crossing Slow TEMA (e.g. 183).
- **RSI (Relative Strength Index)**: Momentum confirmation and divergence detection. RSI level thresholds (e.g. 38 for Buy, 54 for Sell) prevent buying into exhausted trends.
- **ADX (Average Directional Index)**: Quantifies trend strength. `ADX < 15-20` indicates low-volatility sideway consolidation; `ADX >= 25` confirms strong trending conditions.

### B. Volatility & Execution
- **ATR (Average True Range)**: Dynamic Stop-Loss and Take-Profit calculation. Accounts for shifting market volatility (e.g. 15-min ATR vs Daily ATR).
- **Fibonacci Retracements**: Institutional liquidity pools typically react around 0.13, 0.382, 0.50, and 0.618 levels.

---

## 3. High-Performance Strategy Templates for XAUUSD

### Strategy Option 1: Trend Breakout with ADX Volatility Gate
- **Timeframe**: M15 / H1
- **Setup**: Fast/Slow TEMA crossover + RSI momentum in direction of H4 trend + `ADX >= 20`.
- **Risk Control**: Dynamic ATR Stop-Loss (1.5x ATR), Take-Profit (4.5x ATR). High-Watermark Circuit Breaker at 10% Equity DD.

### Strategy Option 2: London Breakout & Mean Reversion
- **Timeframe**: M5 / M15
- **Setup**: Mark Asian Session High/Low range. Enter on false breakout sweep when RSI divergence forms and price returns inside range.
- **Risk Control**: Fixed 1:2.5 Risk-Reward ratio.
