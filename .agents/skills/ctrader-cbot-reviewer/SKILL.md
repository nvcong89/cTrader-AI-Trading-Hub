---
name: ctrader-cbot-reviewer
description: Automated code review and compliance auditor agent for cTrader cBots. Inspects security sandbox (AccessRights.None), in-code licensing, async Telegram hazards, position close logic, RunningMode backtest guards, zero warning status, and cTrader 5.x native layout.
---

# cTrader cBot Code Reviewer Agent Skill

This skill performs comprehensive automated code reviews and compliance audits on newly created or modified cBots.

## Audit Rules Checklist

1. **Native cTrader 5.x Project Hierarchy**: Verifies `<RootFolder>.sln` at root and inner subfolder `<RootFolder>/` containing single-file `<RootFolder>.cs`, `<RootFolder>.csproj`, and `GlobalUsings.cs`.
2. **Zero Warning Status**: Verifies code builds with 0 compiler warnings (`readonly bool Unlimited_License`, `#pragma warning disable SYSLIB0014`, `#pragma warning disable CS0618`).
3. **Security Sandbox (`AccessRights.None`)**: Ensures the `[Robot]` attribute enforces `AccessRights = AccessRights.None` unless explicitly marked for FullAccess.
4. **In-Code Hidden Licensing**: Verifies `Unlimited_License` and `ExpiryDate` parameters are configured in-code (hidden from cTrader parameter UI).
5. **Opposite & Close Signal Exits**: Checks that `closeBuyCondition` and `closeSellCondition` trigger active position closures.
6. **Non-blocking Async Telegram Alerts**: Verifies Telegram network calls use `async Task` without blocking `.Result` or `.Wait()`.
7. **Backtesting Sandbox Protection (`RunningMode`)**: Verifies that network requests (News/Telegram) and File I/O check `RunningMode != RunningMode.RealTime` to prevent `SecurityException` backtest crashes under `AccessRights.None`.
8. **Clean Compilation & cTrader CLI Metadata Audit**: Builds the cBot, verifies 0 errors, generates `.algo` package, and validates parameter metadata schema using `ctrader-cli metadata`.

## How to Run

Invoke the code reviewer PowerShell script:

```powershell
# Audit a specific cBot
powershell -ExecutionPolicy Bypass -File .agents/skills/ctrader-cbot-reviewer/scripts/review_cbot.ps1 -BotName "v102"
```
