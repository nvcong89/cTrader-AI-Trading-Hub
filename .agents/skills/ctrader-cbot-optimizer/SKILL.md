---
name: ctrader-cbot-optimizer
description: Dedicated cBot Parameter Optimization Agent Skill using official cTrader CLI backtest sweeps and grid search optimization.
---

# cTrader cBot Optimizer Agent Skill (Dedicated)

This skill performs dedicated multi-parameter optimization, grid search sweeps, and sensitivity analysis for cBots using `ctrader-cli`.

## Core Responsibilities & Capabilities

1. **Grid Parameter Search**: Sweeps combinations of indicators (ADX levels, RSI periods, TEMA fast/slow), StopLoss %, TakeProfit %, and Risk Factor %.
2. **Native Execution Engine**: Runs grid backtest passes via `ctrader-cli backtest` with `--CustomParameter` overrides to ensure 100% execution accuracy.
3. **Parameter Ranking & Evaluation**: Scores and ranks candidate parameter sets by Net Profit, Win Rate, Profit Factor, and Max Equity Drawdown.
4. **Mandatory Comprehensive Output Standard**:
   - **Method Declaration**: Explicitly state `Official cTrader CLI Parameter Optimization Sweep`.
   - **Baseline vs Optimized Parameters**: Show parameter comparisons before and after optimization.
   - **Analytical Strategy Evaluation**: Provide in-depth analysis of optimal risk vs return trade-offs and robustness recommendations.

## Two-Step Risk-Managed Optimization Methodology (Mandatory Standard)

1. **Step 1: Exploration & Range Narrowing (Genetic Algorithm / Broad Sweep)**
   - Used when optimizing large parameter spaces (5+ parameters) or unknown indicator bounds.
   - Rapidly identifies high-performance candidate value ranges (e.g. SL: 1.0%-1.5%, TP: 2.0%-3.0%, minADX: 12-20, Risk: 5%-15%).

2. **Step 2: Exhaustive Grid Search & Parameter Plateau Verification (Grid Search)**
   - Runs exhaustive grid search (`run_cli_optimizer.ps1`) within the narrowed parameter boundaries.
   - **Parameter Plateau Analysis**: Ensures selected optimal parameters sit within a broad, flat plateau of surrounding profitable settings (high robustness) rather than an isolated overfitting peak.
   - Generates final CSV rankings (`Optimization_Results.csv`) and JSON reports in `opt_reports/`.

## High-Speed Multi-Threaded Acceleration & Offline Data Priority

1. **Offline M1 Data Priority (CSV Mode)**:
   - Always check and prioritize local M1 tick/bar data (`HistoricalData/XAUUSD/XAUUSD-Minute.csv`) using `--data-mode=m1-csv --data-file=HistoricalData/XAUUSD/XAUUSD-Minute.csv`.
   - Eliminates network latency from Spotware servers and reduces execution time per pass from ~25s down to ~2s.

2. **Multi-Threaded Parallel Grid Sweeps**:
   - Executes multiple parameter backtest passes concurrently (`-MaxParallelJobs 4` or higher) utilizing multi-core CPU capacity.

## Execution Strategy: Asynchronous Background Execution
- **Non-blocking Grid Sweeps**: Optimizer sweeps MUST be launched as asynchronous background tasks (`run_command` in background mode).
- **Concurrent Interaction**: User can perform other tasks (cBot editing, backtesting other models, code analysis) without blocking.
- **Incremental Result Caching**: Saves individual pass JSON reports to `opt_reports/` directory so results persist and can be inspected live during execution.



## How to Run Optimization

```powershell
powershell -ExecutionPolicy Bypass -File .agents/skills/ctrader-cbot-optimizer/scripts/run_cli_optimizer.ps1 -BotName "v102F" -Start "02/01/2023" -End "08/08/2026" -CtId "YOUR_CTID" -PwdFile "./.ctrader_pwd.txt" -Account "YOUR_ACCOUNT_ID"
```
