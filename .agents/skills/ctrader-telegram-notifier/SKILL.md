---
name: ctrader-telegram-notifier
description: Dedicated Telegram Notification Agent Skill for pushing cBot backtest, compilation, and parameter optimization summary reports to Telegram group.
---

# cTrader Telegram Notifier Agent Skill (Dedicated)

This skill manages automated real-time notification delivery for cBot compilation, backtest, and optimization results directly to the user's Telegram Group.

## Configured Credentials

Credentials are dynamically loaded from `telegram.env` (`TELEGRAM_BOT_TOKEN` & `TELEGRAM_CHAT_ID`).

## Core Responsibilities & Capabilities

1. **Automated Notification Trigger**: Automatically invokes after any backtest, optimization sweep, or compilation run completes.
2. **HTML Formatted Summary Reports**: Formats clean HTML messages including:
   - cBot Name & Execution Method
   - Complete Parameter Set (SL %, TP %, Risk %, ADX, Equity Protection, BreakEven)
   - Performance Metrics (Net Profit, ROI %, Max Equity Drawdown %, Profit Factor)
   - Top Ranked Results table from `Optimization_Results.csv`
3. **Non-blocking Execution**: Sends API payloads via PowerShell REST methods asynchronously without interrupting cBot execution.

## Usage Example

```powershell
powershell -ExecutionPolicy Bypass -File .agents/skills/ctrader-telegram-notifier/scripts/send_telegram_report.ps1 -Title "🚀 Backtest Completed" -Message "v102F Net Profit: +$73,314.14 | ROI: +7,331.4%"
```
