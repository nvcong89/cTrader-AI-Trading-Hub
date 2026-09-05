"""
AI Agent Evaluation & Benchmark Harness for cTrader-AI-Trading-Hub
===================================================================
Automated test harness that feeds historical market snapshots to the configured AI Engine,
obtains structured BUY/SELL/HOLD decisions, and performs Forward Outcome Simulation (1-5 bars lookahead)
to compute directional Win Rate, Profit Factor, Latency, and Risk Management compliance.
"""

import os
import sys
import json
import time
import asyncio
import datetime
import argparse
from typing import Dict, Any, List, Optional, Tuple

# Local module imports
import database
from database import (
    get_db, 
    create_eval_run, 
    update_eval_run_progress, 
    complete_eval_run, 
    save_eval_result, 
    log_message
)
import ai_engine
import httpx

def load_telegram_config() -> Tuple[str, str]:
    """Loads Telegram credentials from environment or config files."""
    bot_token = os.environ.get("TELEGRAM_BOT_TOKEN") or ""
    chat_id = os.environ.get("TELEGRAM_CHAT_ID") or ""
    base_dir = os.path.dirname(__file__)
    for filename in ["telegram.env", "telegrame.env", ".env"]:
        env_file = os.path.join(base_dir, filename)
        if os.path.exists(env_file):
            try:
                with open(env_file, "r", encoding="utf-8") as f:
                    for line in f:
                        line = line.strip()
                        if line and not line.startswith("#") and "=" in line:
                            k, v = line.split("=", 1)
                            k, v = k.strip(), v.strip()
                            if k in ["bot_token", "TELEGRAM_BOT_TOKEN", "BOT_TOKEN"] and not bot_token:
                                bot_token = v
                            elif k in ["groupID", "group_id", "TELEGRAM_CHAT_ID", "CHAT_ID", "telegramChatId"] and not chat_id:
                                chat_id = v
            except Exception:
                pass
            if bot_token and chat_id:
                break
    return bot_token, chat_id

async def send_telegram_benchmark_report(run_data: Dict[str, Any], results: List[Dict[str, Any]]):
    """Sends structured summary of benchmark run to Telegram."""
    bot_token, chat_id = load_telegram_config()
    if not bot_token or not chat_id:
        return

    win_rate = run_data.get("win_rate", 0.0)
    status_icon = "🏆" if win_rate >= 60.0 else ("⚠️" if win_rate >= 45.0 else "❌")
    pf = run_data.get("profit_factor", 0.0)
    pnl = run_data.get("total_pnl_pips", 0.0)
    
    text = (
        f"{status_icon} <b>[AI Benchmark Completed] Run #{run_data.get('id', 0)}</b>\n\n"
        f"🤖 <b>AI Provider:</b> {run_data.get('provider', '').upper()}\n"
        f"🧠 <b>Model:</b> <code>{run_data.get('model', '')}</code>\n"
        f"📊 <b>Dataset:</b> {run_data.get('dataset_name', '')} ({run_data.get('total_scenarios', 0)} scenarios)\n\n"
        f"📈 <b>Win Rate:</b> <b>{win_rate:.1f}%</b>\n"
        f"⚖️ <b>Profit Factor:</b> <b>{pf:.2f}</b>\n"
        f"💰 <b>Total PnL:</b> <b>{pnl:+.1f} pips</b>\n"
        f"⏱️ <b>Avg Latency:</b> <b>{run_data.get('avg_latency_ms', 0):.0f} ms</b>\n\n"
        f"🎯 <b>Action Breakdown:</b>\n"
        f"• Wins: {run_data.get('total_wins', 0)} | Losses: {run_data.get('total_losses', 0)} | Holds: {run_data.get('total_holds', 0)}\n\n"
        f"📅 <i>Completed: {datetime.datetime.now().strftime('%Y-%m-%d %H:%M:%S')}</i>"
    )

    url = f"https://api.telegram.org/bot{bot_token}/sendMessage"
    payload = {"chat_id": chat_id, "text": text, "parse_mode": "HTML"}
    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            await client.post(url, json=payload)
    except Exception as e:
        print(f"[Telegram Benchmark Alert Error] {e}")


def get_default_golden_dataset() -> List[Dict[str, Any]]:
    """
    Returns a curated set of realistic XAUUSD M15 market scenarios with 35 historical bars
    and 5 forward bars for simulation testing.
    """
    scenarios = []

    # Scenario 1: Bullish Order Block Bounce (Strong Uptrend Continuation)
    scenarios.append({
        "scenario_id": "XAU_BULLISH_OB_01",
        "symbol": "XAUUSD",
        "timeframe": "M15",
        "timestamp": "2026-03-10T14:15:00",
        "ask": 2654.50,
        "bid": 2654.35,
        "strategy": {
            "tema1": 2652.80,
            "tema2": 2648.50,
            "rsi": 58.5,
            "adx": 32.4,
            "atr": 4.20,
            "recent_high": 2665.00,
            "recent_low": 2642.10
        },
        "multi_timeframe": {
            "current_tf": {"timeframe": "M15", "fast_tema": 2652.80, "slow_tema": 2648.50, "rsi": 58.5, "trend_bias": "BULLISH", "high_35": 2665.00, "low_35": 2642.10, "close": 2654.40},
            "h1_tf": {"timeframe": "H1", "fast_tema": 2645.00, "slow_tema": 2638.00, "rsi": 62.0, "trend_bias": "BULLISH", "high_35": 2670.00, "low_35": 2620.00, "close": 2654.00},
            "h4_tf": {"timeframe": "H4", "fast_tema": 2630.00, "slow_tema": 2615.00, "rsi": 65.0, "trend_bias": "BULLISH", "high_35": 2685.00, "low_35": 2580.00, "close": 2654.00}
        },
        "bars": [
            {"time": f"T-{35-i}", "open": 2640.0 + i*0.4, "high": 2641.0 + i*0.4, "low": 2639.5 + i*0.4, "close": 2640.5 + i*0.4, "volume": 1200}
            for i in range(35)
        ],
        # Forward bars show strong upward continuation
        "forward_bars": [
            {"time": "T+1", "open": 2654.40, "high": 2658.20, "low": 2653.80, "close": 2657.50, "volume": 1500},
            {"time": "T+2", "open": 2657.50, "high": 2662.00, "low": 2656.90, "close": 2661.20, "volume": 1800},
            {"time": "T+3", "open": 2661.20, "high": 2666.50, "low": 2660.50, "close": 2665.80, "volume": 2100},
            {"time": "T+4", "open": 2665.80, "high": 2668.00, "low": 2664.20, "close": 2667.10, "volume": 1400},
            {"time": "T+5", "open": 2667.10, "high": 2670.50, "low": 2666.00, "close": 2669.80, "volume": 1300}
        ]
    })

    # Scenario 2: Bearish Liquidity Sweep & Rejection (BSL Sweep Reversal)
    scenarios.append({
        "scenario_id": "XAU_BEARISH_SWEEP_02",
        "symbol": "XAUUSD",
        "timeframe": "M15",
        "timestamp": "2026-03-12T09:30:00",
        "ask": 2688.20,
        "bid": 2688.05,
        "strategy": {
            "tema1": 2682.00,
            "tema2": 2684.50,
            "rsi": 74.2,
            "adx": 28.5,
            "atr": 5.10,
            "recent_high": 2688.00,
            "recent_low": 2660.00
        },
        "multi_timeframe": {
            "current_tf": {"timeframe": "M15", "fast_tema": 2682.00, "slow_tema": 2684.50, "rsi": 74.2, "trend_bias": "BEARISH_CHONCH", "high_35": 2688.00, "low_35": 2660.00, "close": 2687.50},
            "h1_tf": {"timeframe": "H1", "fast_tema": 2675.00, "slow_tema": 2678.00, "rsi": 68.0, "trend_bias": "BEARISH", "high_35": 2690.00, "low_35": 2640.00, "close": 2685.00},
            "h4_tf": {"timeframe": "H4", "fast_tema": 2670.00, "slow_tema": 2672.00, "rsi": 55.0, "trend_bias": "NEUTRAL", "high_35": 2700.00, "low_35": 2630.00, "close": 2685.00}
        },
        "bars": [
            {"time": f"T-{35-i}", "open": 2670.0 + i*0.5, "high": 2672.0 + i*0.5, "low": 2669.0 + i*0.5, "close": 2671.0 + i*0.5, "volume": 1100}
            for i in range(35)
        ],
        # Forward bars show sharp drop after liquidity sweep
        "forward_bars": [
            {"time": "T+1", "open": 2688.00, "high": 2688.50, "low": 2682.00, "close": 2683.10, "volume": 2500},
            {"time": "T+2", "open": 2683.10, "high": 2684.00, "low": 2676.50, "close": 2677.20, "volume": 2200},
            {"time": "T+3", "open": 2677.20, "high": 2678.50, "low": 2670.00, "close": 2671.40, "volume": 1900},
            {"time": "T+4", "open": 2671.40, "high": 2673.00, "low": 2667.50, "close": 2668.20, "volume": 1600},
            {"time": "T+5", "open": 2668.20, "high": 2670.00, "low": 2663.00, "close": 2664.50, "volume": 1400}
        ]
    })

    # Scenario 3: Ranging Equilibrium / Consolidation (Ideal for HOLD)
    scenarios.append({
        "scenario_id": "XAU_RANGING_CHOP_03",
        "symbol": "XAUUSD",
        "timeframe": "M15",
        "timestamp": "2026-03-15T03:45:00",
        "ask": 2640.20,
        "bid": 2640.05,
        "strategy": {
            "tema1": 2640.10,
            "tema2": 2640.15,
            "rsi": 49.8,
            "adx": 12.3,
            "atr": 1.80,
            "recent_high": 2643.00,
            "recent_low": 2638.00
        },
        "multi_timeframe": {
            "current_tf": {"timeframe": "M15", "fast_tema": 2640.10, "slow_tema": 2640.15, "rsi": 49.8, "trend_bias": "NEUTRAL", "high_35": 2643.00, "low_35": 2638.00, "close": 2640.10},
            "h1_tf": {"timeframe": "H1", "fast_tema": 2641.00, "slow_tema": 2641.20, "rsi": 50.5, "trend_bias": "NEUTRAL", "high_35": 2648.00, "low_35": 2635.00, "close": 2640.50},
            "h4_tf": {"timeframe": "H4", "fast_tema": 2642.00, "slow_tema": 2642.00, "rsi": 51.0, "trend_bias": "NEUTRAL", "high_35": 2655.00, "low_35": 2630.00, "close": 2641.00}
        },
        "bars": [
            {"time": f"T-{35-i}", "open": 2640.0 + (i%3)*0.5, "high": 2641.5, "low": 2639.0, "close": 2640.2, "volume": 400}
            for i in range(35)
        ],
        # Forward bars stay tightly confined in range
        "forward_bars": [
            {"time": "T+1", "open": 2640.10, "high": 2641.20, "low": 2639.40, "close": 2640.30, "volume": 350},
            {"time": "T+2", "open": 2640.30, "high": 2641.80, "low": 2639.80, "close": 2640.50, "volume": 400},
            {"time": "T+3", "open": 2640.50, "high": 2641.00, "low": 2639.10, "close": 2639.80, "volume": 320},
            {"time": "T+4", "open": 2639.80, "high": 2641.40, "low": 2639.50, "close": 2640.20, "volume": 300},
            {"time": "T+5", "open": 2640.20, "high": 2641.50, "low": 2639.60, "close": 2640.10, "volume": 280}
        ]
    })

    # Scenario 4: Bullish Fair Value Gap (FVG) Retest & Expansion
    scenarios.append({
        "scenario_id": "XAU_BULLISH_FVG_04",
        "symbol": "XAUUSD",
        "timeframe": "M15",
        "timestamp": "2026-03-18T16:00:00",
        "ask": 2635.80,
        "bid": 2635.65,
        "strategy": {
            "tema1": 2632.00,
            "tema2": 2627.50,
            "rsi": 61.2,
            "adx": 35.8,
            "atr": 3.80,
            "recent_high": 2648.00,
            "recent_low": 2620.00
        },
        "multi_timeframe": {
            "current_tf": {"timeframe": "M15", "fast_tema": 2632.00, "slow_tema": 2627.50, "rsi": 61.2, "trend_bias": "BULLISH", "high_35": 2648.00, "low_35": 2620.00, "close": 2635.70},
            "h1_tf": {"timeframe": "H1", "fast_tema": 2628.00, "slow_tema": 2620.00, "rsi": 64.0, "trend_bias": "BULLISH", "high_35": 2650.00, "low_35": 2610.00, "close": 2635.00},
            "h4_tf": {"timeframe": "H4", "fast_tema": 2615.00, "slow_tema": 2600.00, "rsi": 68.0, "trend_bias": "BULLISH", "high_35": 2660.00, "low_35": 2580.00, "close": 2635.00}
        },
        "bars": [
            {"time": f"T-{35-i}", "open": 2622.0 + i*0.38, "high": 2623.5 + i*0.38, "low": 2621.5 + i*0.38, "close": 2623.0 + i*0.38, "volume": 900}
            for i in range(35)
        ],
        "forward_bars": [
            {"time": "T+1", "open": 2635.70, "high": 2639.50, "low": 2635.00, "close": 2639.10, "volume": 1600},
            {"time": "T+2", "open": 2639.10, "high": 2644.00, "low": 2638.50, "close": 2643.20, "volume": 1900},
            {"time": "T+3", "open": 2643.20, "high": 2649.50, "low": 2642.00, "close": 2648.80, "volume": 2300},
            {"time": "T+4", "open": 2648.80, "high": 2653.00, "low": 2647.50, "close": 2652.10, "volume": 1700},
            {"time": "T+5", "open": 2652.10, "high": 2655.40, "low": 2650.00, "close": 2654.50, "volume": 1500}
        ]
    })

    # Scenario 5: Bearish Breakdown below SSL Support
    scenarios.append({
        "scenario_id": "XAU_BEARISH_BOS_05",
        "symbol": "XAUUSD",
        "timeframe": "M15",
        "timestamp": "2026-03-20T11:15:00",
        "ask": 2618.50,
        "bid": 2618.35,
        "strategy": {
            "tema1": 2622.00,
            "tema2": 2626.50,
            "rsi": 36.5,
            "adx": 38.2,
            "atr": 4.50,
            "recent_high": 2640.00,
            "recent_low": 2620.00
        },
        "multi_timeframe": {
            "current_tf": {"timeframe": "M15", "fast_tema": 2622.00, "slow_tema": 2626.50, "rsi": 36.5, "trend_bias": "BEARISH", "high_35": 2640.00, "low_35": 2620.00, "close": 2618.40},
            "h1_tf": {"timeframe": "H1", "fast_tema": 2630.00, "slow_tema": 2635.00, "rsi": 38.0, "trend_bias": "BEARISH", "high_35": 2645.00, "low_35": 2618.00, "close": 2620.00},
            "h4_tf": {"timeframe": "H4", "fast_tema": 2640.00, "slow_tema": 2645.00, "rsi": 42.0, "trend_bias": "BEARISH", "high_35": 2660.00, "low_35": 2615.00, "close": 2622.00}
        },
        "bars": [
            {"time": f"T-{35-i}", "open": 2635.0 - i*0.45, "high": 2636.0 - i*0.45, "low": 2633.5 - i*0.45, "close": 2634.0 - i*0.45, "volume": 1300}
            for i in range(35)
        ],
        "forward_bars": [
            {"time": "T+1", "open": 2618.40, "high": 2619.00, "low": 2612.50, "close": 2613.20, "volume": 2200},
            {"time": "T+2", "open": 2613.20, "high": 2614.50, "low": 2607.00, "close": 2608.10, "volume": 2600},
            {"time": "T+3", "open": 2608.10, "high": 2609.50, "low": 2602.00, "close": 2603.50, "volume": 2900},
            {"time": "T+4", "open": 2603.50, "high": 2605.00, "low": 2598.50, "close": 2600.00, "volume": 2100},
            {"time": "T+5", "open": 2600.00, "high": 2602.00, "low": 2595.00, "close": 2596.50, "volume": 1800}
        ]
    })

    return scenarios

def format_benchmark_prompt(scenario: Dict[str, Any]) -> str:
    """Formats technical snapshot prompt strictly following main.py system prompt structure."""
    bars = scenario.get("bars", [])
    recent_bars = list(reversed(bars[:35]))
    bars_lines = [
        f"Bar[-{len(recent_bars)-1-i}]: O={b['open']:.2f}, H={b['high']:.2f}, L={b['low']:.2f}, C={b['close']:.2f}, V={b.get('volume', 0):.0f}"
        for i, b in enumerate(recent_bars)
    ]
    bars_summary = "\n".join(bars_lines) if bars_lines else "None"

    symbol = scenario.get("symbol", "XAUUSD")
    pip_size = 0.01 if ("JPY" in symbol or "XAU" in symbol or "GOLD" in symbol) else 0.0001
    ask = float(scenario.get("ask", 2600.0))
    bid = float(scenario.get("bid", 2600.0))
    spread_pips = round(abs(ask - bid) / pip_size, 1) if pip_size > 0 else 1.5

    mtf = scenario.get("multi_timeframe", {})
    cur = mtf.get("current_tf")
    h1 = mtf.get("h1_tf")
    h4 = mtf.get("h4_tf")
    lines = []
    if cur: lines.append(f"- Current ({cur.get('timeframe', 'M15')}): Bias={cur.get('trend_bias')} | FastMA={cur.get('fast_tema')} | SlowMA={cur.get('slow_tema')} | RSI={cur.get('rsi')} | High35={cur.get('high_35')} | Low35={cur.get('low_35')}")
    if h1: lines.append(f"- Higher TF (H1): Bias={h1.get('trend_bias')} | FastMA={h1.get('fast_tema')} | SlowMA={h1.get('slow_tema')} | RSI={h1.get('rsi')} | High35={h1.get('high_35')} | Low35={h1.get('low_35')}")
    if h4: lines.append(f"- Major TF (H4): Bias={h4.get('trend_bias')} | FastMA={h4.get('fast_tema')} | SlowMA={h4.get('slow_tema')} | RSI={h4.get('rsi')} | High35={h4.get('high_35')} | Low35={h4.get('low_35')}")
    mtf_summary = "\n".join(lines) if lines else "Current Timeframe Only"

    strat = scenario.get("strategy", {})
    prompt = f"""You are a World-Class Institutional Forex Specialist & Quantitative Trader using SMART MONEY CONCEPTS (SMC) & Price Action.

=== NEW ENTRY DISCOVERY MODE ===
The cBot currently HAS NO OPEN POSITIONS (Flat / Clean Order Book). Your PRIMARY MISSION is to ANALYZE MARKET STRUCTURE AND DISCOVER OPTIMAL, HIGH-PROBABILITY ENTRY OPPORTUNITIES.

=== 1. MARKET SNAPSHOT ===
- Symbol: {symbol} | Timeframe: {scenario.get('timeframe')}
- Current Market Prices: Ask={ask}, Bid={bid}
- Account Balance: $10,000.00 | Equity: $10,000.00

=== 2. MULTI-TIMEFRAME TREND BIAS (M15 + H1 + H4) ===
{mtf_summary}

=== 3. TECHNICAL INDICATORS & SWINGS ===
- TEMA Fast: {strat.get('tema1')} | TEMA Slow: {strat.get('tema2')}
- RSI (14): {strat.get('rsi'):.1f} | ADX: {strat.get('adx'):.1f}
- ATR (14 Volatility): {strat.get('atr'):.2f}
- Major 35-Bar Swing High (Buy-Side Liquidity BSL / Resistance): {strat.get('recent_high')}
- Major 35-Bar Swing Low (Sell-Side Liquidity SSL / Support): {strat.get('recent_low')}

=== 4. RECENT OHLCV CANDLE SEQUENCE (Last 35 bars, chronological) ===
{bars_summary}

=== 5. SMART MONEY CONCEPTS (SMC) ENTRY RULES ===
1. **Market Structure Analysis (BOS vs CHoCH)** in alignment with Higher Timeframe Bias (H1/H4).
2. **Order Blocks (OB) & Fair Value Gaps (FVG)**: Identify unmitigated Bullish/Bearish Order Blocks and pending FVG fill zones.
3. **Liquidity Sweeps (Stop Hunts)**: Detect recent sweeps of BSL or SSL followed by strong price rejection.
4. **Precision Entry, SL & TP**:
   - For BUY: SL safely below the invalidation level of Bullish OB or SSL sweep low.
   - For SELL: SL safely above the invalidation level of Bearish OB or BSL sweep high.
   - Minimum SL must be >= 10x Spread / 0.8x ATR. 1 pip = {pip_size} in price.

=== 6. VALID ACTIONS ===
- `BUY`: Validated Bullish Order Block bounce, CHoCH to upside, or SSL liquidity sweep reversal.
- `SELL`: Validated Bearish Order Block rejection, CHoCH to downside, or BSL liquidity sweep reversal.
- `HOLD`: Choppy consolidation, equilibrium, or lack of clear SMC confirmation. Wait patiently outside the market.

=== 7. REQUIRED JSON OUTPUT FORMAT ===
Reply ONLY with a pure valid JSON object (no markdown, no ```json).
{{
  "action": "BUY" | "SELL" | "HOLD",
  "volume_lots": 0.01,
  "sl_pips": {max(int(spread_pips * 10), 150)},
  "tp_pips": {int(max(int(spread_pips * 10), 150) * 2.5)},
  "new_sl_price": 0.0,
  "new_tp_price": 0.0,
  "reason": "SMC analysis explanation detailing Order Block, Liquidity Sweep, Risk:Reward setup, and confirmation.",
  "confidence": 88.5
}}"""
    return prompt

def simulate_forward_outcome(
    scenario: Dict[str, Any], 
    decision: Dict[str, Any]
) -> Tuple[str, float]:
    """
    Simulates the forward outcome over the next 1-5 bars based on actual SL/TP hit collision.
    Returns: (outcome: 'WIN' | 'LOSS' | 'TIMEOUT_WIN' | 'TIMEOUT_LOSS' | 'CORRECT_HOLD' | 'INCORRECT_HOLD', pnl_pips: float)
    """
    symbol = scenario.get("symbol", "XAUUSD")
    pip_size = scenario.get("pip_size") or (0.01 if ("XAU" in symbol or "GOLD" in symbol or "JPY" in symbol) else 0.0001)
    spread = abs(scenario.get("ask", 0) - scenario.get("bid", 0))
    spread_pips = scenario.get("spread_pips") or (round(spread / pip_size, 1) if (pip_size and spread > 0) else 15.0)
    min_sl_floor = max(round(spread_pips * 10.0), 10.0)

    action = decision.get("action", "HOLD").upper()
    sl_pips = float(decision.get("sl_pips") or min_sl_floor)
    tp_pips = float(decision.get("tp_pips") or (min_sl_floor * 2.5))
    
    # Cap safety bounds
    if sl_pips <= 0: sl_pips = min_sl_floor
    if tp_pips <= 0: tp_pips = min_sl_floor * 2.5

    forward_bars = scenario.get("forward_bars", [])

    if not forward_bars:
        return "NO_DATA", 0.0

    if action == "BUY":
        entry_price = float(scenario.get("ask", scenario.get("bid", 0.0)))
        target_tp = entry_price + (tp_pips * pip_size)
        target_sl = entry_price - (sl_pips * pip_size)

        for bar in forward_bars:
            low = bar.get("low", entry_price)
            high = bar.get("high", entry_price)
            # Check SL hit first (conservative broker execution)
            if low <= target_sl:
                return "LOSS", -sl_pips
            if high >= target_tp:
                return "WIN", tp_pips

        # If neither hit within forward bars, mark at final bar close
        last_close = forward_bars[-1].get("close", entry_price)
        diff_pips = round((last_close - entry_price) / pip_size, 1)
        outcome = "TIMEOUT_WIN" if diff_pips > 0 else ("TIMEOUT_LOSS" if diff_pips < 0 else "BREAKEVEN")
        return outcome, diff_pips

    elif action == "SELL":
        entry_price = float(scenario.get("bid", scenario.get("ask", 0.0)))
        target_tp = entry_price - (tp_pips * pip_size)
        target_sl = entry_price + (sl_pips * pip_size)

        for bar in forward_bars:
            low = bar.get("low", entry_price)
            high = bar.get("high", entry_price)
            # Check SL hit first
            if high >= target_sl:
                return "LOSS", -sl_pips
            if low <= target_tp:
                return "WIN", tp_pips

        last_close = forward_bars[-1].get("close", entry_price)
        diff_pips = round((entry_price - last_close) / pip_size, 1)
        outcome = "TIMEOUT_WIN" if diff_pips > 0 else ("TIMEOUT_LOSS" if diff_pips < 0 else "BREAKEVEN")
        return outcome, diff_pips

    else: # HOLD
        # For HOLD, evaluate if market was choppy or trending
        first_bar_open = forward_bars[0].get("open", scenario.get("ask", 0.0))
        last_bar_close = forward_bars[-1].get("close", first_bar_open)
        net_move_pips = abs(last_bar_close - first_bar_open) / pip_size

        if net_move_pips < 100.0:
            return "CORRECT_HOLD", 0.0
        else:
            return "MISSED_OPPORTUNITY", 0.0


async def run_ai_benchmark(
    provider_override: Optional[str] = None,
    model_override: Optional[str] = None,
    dataset_override: Optional[List[Dict[str, Any]]] = None,
    rate_limit_delay_secs: float = 1.0,
    page_instance=None
) -> Dict[str, Any]:
    """
    Executes a complete AI Agent Evaluation & Benchmark session.
    """
    # 1. Read AI configuration from database
    conn = get_db()
    c = conn.cursor()
    c.execute("SELECT * FROM ai_providers_config WHERE id = 1")
    cfg_row = c.fetchone()
    conn.close()
    ai_config = dict(cfg_row) if cfg_row else {"active_provider": "qwen_api"}

    if provider_override:
        ai_config["active_provider"] = provider_override
    provider = ai_config.get("active_provider", "qwen_api")

    if model_override:
        if provider == "gemini_api": ai_config["gemini_model"] = model_override
        elif provider == "deepseek_api": ai_config["deepseek_model"] = model_override
        elif provider == "openai_api": ai_config["openai_model"] = model_override
        elif provider == "qwen_api": ai_config["qwen_model"] = model_override

    # Determine effective model name
    if provider == "gemini_api": model_name = ai_config.get("gemini_model", "gemini-1.5-flash")
    elif provider == "deepseek_api": model_name = ai_config.get("deepseek_model", "deepseek-chat")
    elif provider == "openai_api": model_name = ai_config.get("openai_model", "gpt-4o-mini")
    else: model_name = ai_config.get("qwen_model", "qwen3.7-flash")

    # 2. Prepare Dataset
    dataset = dataset_override if dataset_override else get_default_golden_dataset()
    total_scenarios = len(dataset)
    dataset_name = "Golden_XAUUSD_M15_SMC"

    # 3. Create run record in SQLite DB
    run_id = create_eval_run(
        provider=provider,
        model=model_name,
        dataset_name=dataset_name,
        total_scenarios=total_scenarios
    )

    print(f"\n=======================================================")
    print(f"🚀 Starting AI Benchmark Run #{run_id}")
    print(f"🤖 Provider: {provider.upper()} | Model: {model_name}")
    print(f"📊 Dataset: {dataset_name} ({total_scenarios} scenarios)")
    print(f"=======================================================\n")

    results = []
    total_wins = 0
    total_losses = 0
    total_holds = 0
    gross_profit_pips = 0.0
    gross_loss_pips = 0.0
    latencies = []

    for idx, scenario in enumerate(dataset):
        scenario_id = scenario.get("scenario_id", f"Scenario_{idx+1}")
        prompt_text = format_benchmark_prompt(scenario)
        print(f"[{idx+1}/{total_scenarios}] Querying AI for {scenario_id}...")

        try:
            decision_dict, raw_response, latency_ms = await ai_engine.dispatch_ai_trade(
                ai_config, 
                prompt_text=prompt_text
            )
            latencies.append(latency_ms)
        except Exception as e:
            print(f"❌ Query error for {scenario_id}: {e}")
            decision_dict = {
                "action": "HOLD",
                "volume_lots": 0.01,
                "sl_pips": 0.0,
                "tp_pips": 0.0,
                "reason": f"Evaluation Error: {str(e)}",
                "confidence": 0.0
            }
            latency_ms = 0.0

        # Simulate forward outcome
        outcome, pnl_pips = simulate_forward_outcome(scenario, decision_dict)

        # Track wins/losses
        if outcome in ["WIN", "TIMEOUT_WIN"]:
            total_wins += 1
            gross_profit_pips += max(0.0, pnl_pips)
        elif outcome in ["LOSS", "TIMEOUT_LOSS"]:
            total_losses += 1
            gross_loss_pips += abs(min(0.0, pnl_pips))
        else:
            total_holds += 1

        print(f"  👉 Decision: {decision_dict.get('action')} ({decision_dict.get('confidence')}%) | Outcome: {outcome} ({pnl_pips:+.1f} pips) | Latency: {latency_ms:.0f}ms")

        # Save individual result to DB
        save_eval_result(
            run_id=run_id,
            scenario_idx=idx + 1,
            timestamp=scenario.get("timestamp", datetime.datetime.now().isoformat()),
            symbol=scenario.get("symbol", "XAUUSD"),
            timeframe=scenario.get("timeframe", "M15"),
            ask=float(scenario.get("ask", 0.0)),
            bid=float(scenario.get("bid", 0.0)),
            indicators_json=json.dumps(scenario.get("strategy", {})),
            ai_action=decision_dict.get("action", "HOLD"),
            ai_volume=float(decision_dict.get("volume_lots", 0.01)),
            ai_sl_pips=float(decision_dict.get("sl_pips", 0.0)),
            ai_tp_pips=float(decision_dict.get("tp_pips", 0.0)),
            ai_confidence=float(decision_dict.get("confidence", 0.0)),
            ai_reason=decision_dict.get("reason", ""),
            latency_ms=latency_ms,
            forward_outcome=outcome,
            pnl_pips=pnl_pips,
            forward_bars_json=json.dumps(scenario.get("forward_bars", []))
        )

        update_eval_run_progress(run_id, idx + 1)
        results.append({
            "scenario_id": scenario_id,
            "decision": decision_dict,
            "outcome": outcome,
            "pnl_pips": pnl_pips,
            "latency_ms": latency_ms
        })

        if rate_limit_delay_secs > 0 and idx < total_scenarios - 1:
            await asyncio.sleep(rate_limit_delay_secs)

    # 4. Final Aggregations
    total_trades = total_wins + total_losses
    win_rate = (total_wins / total_trades * 100.0) if total_trades > 0 else 0.0
    profit_factor = (gross_profit_pips / gross_loss_pips) if gross_loss_pips > 0 else (99.0 if gross_profit_pips > 0 else 1.0)
    net_pnl_pips = round(gross_profit_pips - gross_loss_pips, 1)
    avg_latency = round(sum(latencies) / len(latencies), 1) if latencies else 0.0

    summary_md = f"""# AI Agent Benchmark Report (Run #{run_id})

- **Provider:** {provider.upper()}
- **Model:** `{model_name}`
- **Dataset:** {dataset_name} ({total_scenarios} scenarios)
- **Win Rate:** **{win_rate:.1f}%** ({total_wins} Wins / {total_losses} Losses)
- **Profit Factor:** **{profit_factor:.2f}**
- **Net PnL:** **{net_pnl_pips:+.1f} pips**
- **Avg Latency:** **{avg_latency:.0f} ms**
- **Holds/Filtered:** {total_holds} scenarios
"""

    complete_eval_run(
        run_id=run_id,
        status="COMPLETED",
        win_rate=round(win_rate, 2),
        profit_factor=round(profit_factor, 2),
        avg_latency_ms=avg_latency,
        total_wins=total_wins,
        total_losses=total_losses,
        total_holds=total_holds,
        total_pnl_pips=net_pnl_pips,
        summary_markdown=summary_md
    )

    run_summary_data = {
        "id": run_id,
        "provider": provider,
        "model": model_name,
        "dataset_name": dataset_name,
        "total_scenarios": total_scenarios,
        "win_rate": win_rate,
        "profit_factor": profit_factor,
        "total_pnl_pips": net_pnl_pips,
        "avg_latency_ms": avg_latency,
        "total_wins": total_wins,
        "total_losses": total_losses,
        "total_holds": total_holds
    }

    # Dispatch Telegram Alert
    try:
        await send_telegram_benchmark_report(run_summary_data, results)
    except Exception as te:
        print(f"Note: Telegram report notification: {te}")

    print(f"\n=======================================================")
    print(f"✅ AI Benchmark Run #{run_id} COMPLETED")
    print(f"📈 Win Rate: {win_rate:.1f}% | PF: {profit_factor:.2f} | Net: {net_pnl_pips:+.1f} pips | Latency: {avg_latency:.0f}ms")
    print(f"=======================================================\n")

    return run_summary_data

if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="AI Agent Evaluation & Benchmark Harness")
    parser.add_argument("--provider", type=str, default=None, help="AI Provider (qwen_api, deepseek_api, gemini_api, openai_api)")
    parser.add_argument("--model", type=str, default=None, help="Model name")
    parser.add_argument("--delay", type=float, default=1.0, help="Delay between queries in seconds")
    args = parser.parse_args()

    database.init_db()
    asyncio.run(run_ai_benchmark(
        provider_override=args.provider,
        model_override=args.model,
        rate_limit_delay_secs=args.delay
    ))
