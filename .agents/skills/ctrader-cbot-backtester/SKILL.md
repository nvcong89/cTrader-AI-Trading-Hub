---
name: ctrader-cbot-backtester
description: Dedicated cBot Backtesting Agent Skill using official cTrader CLI engine (ctrader-cli backtest) across XAUUSD datasets and multiple timeframes.
---

# cTrader cBot Backtester Agent Skill (Dedicated)

This skill performs dedicated, high-precision backtesting for cBots using official `ctrader-cli backtest` engine.

## Core Responsibilities & Capabilities

1. **Official cTrader CLI Backtesting**: Launches `ctrader-cli backtest` against compiled `.algo` packages.
2. **Historical Data Integration**: Uses local tick/M1 historical data (`HistoricalData/XAUUSD/`) across timeframes (M5, M15, H1, H4, D1).
3. **Execution Reporting**: Generates HTML & JSON reports (`--report` and `--report-json`).
4. **Mandatory Comprehensive Output Standard**:
   - **Method Declaration**: Always explicitly declare `Official cTrader CLI Native Engine (ctrader-cli backtest)`.
   - **Complete Parameter Set**: Print all parameters used (SL %, TP %, Risk %, ADX, RSI, TEMA, Spread, Starting Balance = $1,000 USD).
   - **Analytical Evaluation**: Provide performance analysis (Win Rate, Net Profit, Profit Factor, Max Drawdown %, risk/reward balance).

## Execution Strategy: Asynchronous Background Execution
- **Non-blocking Execution**: Backtests MUST be launched as asynchronous background tasks (`run_command` in background mode).
- **Concurrent Interaction**: Allows the user to continue interactive coding, code reviews, and querying while CLI engine computes tick data in the background.

## How to Run Backtest

```powershell
powershell -ExecutionPolicy Bypass -File .agents/skills/ctrader-cbot-backtester/scripts/run_cli_backtest.ps1 -BotName "v102F" -Start "02/01/2023" -End "08/08/2026" -CtId "YOUR_CTID" -PwdFile "./.ctrader_pwd.txt" -Account "YOUR_ACCOUNT_ID"
```
