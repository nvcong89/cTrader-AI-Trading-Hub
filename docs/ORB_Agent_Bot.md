# ORB Agent Bot (24/7 SMC Market Structure & AI Agent) — Strategy & System Reference

## 1. Strategy Overview & Execution Philosophy
- **Strategy Concept**: 24/7 Continuous Smart Money Concepts (SMC) Market Structure Breakout & Liquidity Sweep Strategy with native AI Agent integration (Alibaba Qwen 3.7 Flash).
- **Session Division**: **No Session Division (Bỏ chia phiên)** — The bot operates continuously 24 hours a day, 7 days a week, dynamically tracking **Swing Highs**, **Swing Lows**, and **Equilibrium (50% Range)** across rolling N-period lookback bars.
- **Target Instruments**: XAUUSD (Gold), Forex Majors, Crypto (BTCUSD, ETHUSD), Stock Indices (US30, NAS100, VN30).
- **Timeframe**: M5 / M15 (Optimal performance on M5 bar closed).
- **Core Workflow**:
  1. **24/7 DYNAMIC SWING STRUCTURE**: On every bar, the bot scans the last `swingLookbackBars` (e.g., 20 bars) to calculate `SwingHigh`, `SwingLow`, `Equilibrium (50%)`, and `RangeWidthPips`.
  2. **RANGE VALIDATION**: Verifies that `minRangeWidthPips <= RangeWidth <= maxRangeWidthPips` to avoid entering choppy low-volatility dead zones or hyper-extended spikes.
  3. **MULTI-INDICATOR CONFLUENCE**: Computes Fast TEMA (9), Slow TEMA (21), RSI (14), ADX (14), and ATR (14) to confirm directional momentum.
  4. **AI AGENT INFERENCE**: Transmits real-time 50-bar OHLCV market snapshot + SMC structure data to AI Agent Server (`POST /trade`).
  5. **DECISION EXECUTION**: Qwen 3.7 Flash analyzes institutional liquidity sweeps, Change of Character (CHoCH), Order Blocks, and Fair Value Gaps (FVG), returning structured decisions (`BUY`, `SELL`, `HOLD`, `ADJUST`, `CLOSE_ALL`).
  6. **4-POINT METADATA VERIFICATION**: Enforces strict `[Symbol, RequestID, Timeframe, BotID]` isolation before executing orders on the Main Thread.

---

## 2. Technical Analysis & SMC Structure Engine
- **Swing Lookback Mechanism**:
  - `_swingHigh = Max(High Prices of last N bars)`
  - `_swingLow = Min(Low Prices of last N bars)`
  - `_swingMidpoint = (_swingHigh + _swingLow) / 2.0` (Equilibrium Level)
  - `_swingRangePips = (_swingHigh - _swingLow) / Symbol.PipSize`
- **Technical Indicators**:
  - **Triple Exponential Moving Average (TEMA 9 & 21)**: Identifies institutional trend direction and dynamic support/resistance.
  - **Relative Strength Index (RSI 14)**: Detects overbought (>70) and oversold (<30) exhaustion zones.
  - **Directional Movement System (ADX 14)**: Measures trend strength (`minAdxThreshold = 20.0`).
  - **Average True Range (ATR 14)**: Gauges real-time market volatility for dynamic SL/TP and trailing buffers.
- **Visual Chart Overlay**:
  - `SMC_SwingHigh` (Red Line) & `SMC_SwingLow` (Green Line).
  - `SMC_Equilibrium` (Amber Dotted Line).
  - Real-Time HUD Status Panel displaying Swing High/Low, Range Width, Open Orders, PnL, News Status, Drawdown, and AI Agent Status.

---

## 3. Gemini / Qwen AI Agent Integration
- **Payload Schema (`POST /trade`)**:
  - Transmits real-time snapshot: `request_id`, `bot_id`, `symbol`, `timeframe`, `ask`, `bid`, 50-bar OHLCV array, `strategy` (TEMA1, TEMA2, RSI, ADX, ATR, Swing High, Swing Low, Range Pips), `position` / `active_positions`, `account_number`, `account_type`, `account_balance`, `account_equity`.
- **Decision Handling Matrix**:
  - `BUY` / `SELL`: AI identifies high-probability liquidity grabs, order block bounces, or structural breakout continuations.
  - `HOLD`: AI detects equilibrium balance or impending macroeconomic volatility.
  - `ADJUST`: AI recommends dynamic SL trailing or partial profit protection (`new_sl_price`, `new_tp_price`).
  - `CLOSE_ALL`: AI triggers emergency position liquidation on structural market reversal.
- **Live Tick Streaming (`POST /api/tick`)**:
  - Synchronous Main Thread capture of price ticks dispatched asynchronously for live dashboard monitoring.

---

## 4. Risk & Capital Management
- **Volume Sizing**:
  - Dynamic `% Equity Risk` (e.g. 1.0% per trade based on SL distance) or `Fixed Lot` (e.g. 0.01 lot).
- **Stop Loss Modes**:
  - `SwingStructure`: SL placed outside the opposing Swing High/Low boundary plus buffer.
  - `ATRMultiplier`: SL based on volatility (`ATR * atrSlMultiplier`, e.g. 1.5x ATR).
  - `Midpoint`: SL placed at the 50% Equilibrium level.
  - `FixedPips` / `PercentEquity`.
- **Take Profit Modes**:
  - `RiskRewardRatio`: Dynamically scaled to target R:R (e.g. 1:2 or 1:3).
  - `ATRMultiplier`: TP based on volatility (`ATR * atrTpMultiplier`, e.g. 3.0x ATR).
  - `FixedPips` / `PercentEquity`.
- **High-Watermark Circuit Breaker**:
  - Continuously monitors Peak Equity.
  - Automatically cuts position risk by 50% when account drawdown reaches threshold (e.g. 15%).
- **ForexFactory High-Impact News Filter**:
  - Automatic JSON + XML fallback news feed.
  - Suspends trading `pauseBeforeNewsMins` (30m) before and `pauseAfterNewsMins` (30m) after High-Impact red news events.
- **Position Protection & DCA**:
  - Moving Stop Loss to Break-Even.
  - Dynamic Trailing Stop.
  - Optional Multi-Tier DCA Grid with Double Volume or Fixed Volume scaling.

---

## 5. Parameter Reference Table

| Parameter Name | Group | Type | Default | Description |
| :--- | :--- | :--- | :--- | :--- |
| `label` | Initial Settings | String | `ORB Agent Bot` | Position label for bot isolation |
| `_calculateOnBarClosed` | Initial Settings | Boolean | `true` | Evaluate breakout signals on bar close |
| `tradeDirection` | Initial Settings | Enum | `Both` | `Both`, `LongOnly`, or `ShortOnly` |
| `reverseCondition` | Initial Settings | Boolean | `false` | Flip trade directions |
| `maxPermittedOrder` | Initial Settings | Integer | `1` | Maximum concurrent open positions |
| `BotId` | AI Agent | String | `ORB_Agent_Bot` | Unique Bot ID sent to AI server |
| `ApiUrl` | AI Agent Settings | String | `http://127.0.0.1:8181/trade` | AI Agent Server endpoint |
| `aiTimeoutSeconds` | AI Agent Settings | Integer | `300` | HTTP request timeout |
| `swingLookbackBars` | 24/7 SMC Structure | Integer | `72` | Lookback bars for Swing High/Low (72 bars = 6h on M5) |
| `bufferPips` | 24/7 SMC Structure | Double | `2.0` | Pips buffer beyond swing boundaries |
| `minRangeWidthPips` | 24/7 SMC Structure | Double | `5.0` | Minimum range width to allow entry |
| `maxRangeWidthPips` | 24/7 SMC Structure | Double | `0.0` | Maximum range width (0=disabled) |
| `stopLossMode` | SMC SL & TP | Enum | `SwingStructure` | `SwingStructure`, `ATRMultiplier`, `Midpoint`, `FixedPips`, `PercentEquity` |
| `takeProfitMode` | SMC SL & TP | Enum | `RiskRewardRatio` | `RiskRewardRatio`, `ATRMultiplier`, `FixedPips`, `PercentEquity` |
| `takeProfitRRRatio` | SMC SL & TP | Double | `2.0` | Target Risk-to-Reward ratio |
| `atrSlMultiplier` | SMC SL & TP | Double | `1.5` | Stop Loss ATR Multiplier (e.g. 1.5x ATR) |
| `atrTpMultiplier` | SMC SL & TP | Double | `3.0` | Take Profit ATR Multiplier (e.g. 3.0x ATR) |
| `periodTEMA1` | Technical Indicators | Integer | `9` | Fast TEMA period |
| `periodTEMA2` | Technical Indicators | Integer | `21` | Slow TEMA period |
| `enableRsiFilter` | Technical Indicators | Boolean | `false` | Enable RSI momentum filter |
| `enableAdxFilter` | Technical Indicators | Boolean | `false` | Enable ADX trend strength filter |
| `enableNewsFilter` | News Filter | Boolean | `true` | Enable ForexFactory news protection |
| `pauseBeforeNewsMins` | News Filter | Integer | `30` | Minutes to pause before high-impact news |
| `pauseAfterNewsMins` | News Filter | Integer | `30` | Minutes to pause after high-impact news |
| `_voltoAccount` | Setting Trading Volume | Boolean | `true` | Size volume by % risk of account |
| `riskFactor` | Setting Trading Volume | Double | `1.0` | Percentage risk per trade (e.g. 1%) |
| `enableEquityProtection`| Circuit Breaker | Boolean | `false` | High-watermark drawdown protection |
| `maxEquityDDPercent` | Circuit Breaker | Double | `15.0` | Drawdown threshold to trigger risk cut |
| `enableTrailingStop` | Trailing Stop | Boolean | `false` | Trailing stop loss activation |
| `enableBreakEvenPrice` | Break Even | Boolean | `false` | Move Stop Loss to Entry price |
| `enableTelegramAlerts` | Telegram Integration | Boolean | `true` | Telegram trade alerts |
| `sendChartScreenshot` | Telegram Integration | Boolean | `false` | Send chart image with Telegram alerts |
| `showInfoPanel` | UI & Info Panel | Boolean | `true` | Render real-time HUD on chart |
