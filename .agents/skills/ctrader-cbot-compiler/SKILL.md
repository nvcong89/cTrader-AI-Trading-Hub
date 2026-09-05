---
name: ctrader-cbot-compiler
description: Automated compilation, error reporting, and package collector for cTrader cBots (.csproj / .algo) with incremental build support and AccessRights.None enforcement.
---

# cTrader cBot Compiler Skill

This skill automates building cTrader cBots (`.csproj`) using official `ctrader-cli build` engine, analyzing compilation warnings and errors, enforcing security standards (`AccessRights = AccessRights.None`), and placing the resulting `.algo` packages directly in the `cTrader_Bots` root folder.

## Standard Guidelines for cBots & Templates

1. **Single-File Final Project Standard**:
   - Final cBot projects should be consolidated into a single `.cs` file per project to facilitate direct rebuilding within the cTrader Automate App UI.

2. **Security & Permission Level**:
   - All cBot classes **MUST** set `AccessRights = AccessRights.None` on the `[Robot]` attribute:
     ```csharp
     [Robot(TimeZone = TimeZones.UTC, AccessRights = AccessRights.None)]
     ```
   - Do NOT set `FullAccess` unless explicitly required by local file I/O outside sandboxing.

3. **Smart Incremental Build**: Automatically detects file modification timestamps (`.cs`, `.csproj`). If a `.algo` package exists and no source files have been changed since, it skips recompilation to save time.

4. **Package Collector & cTrader CLI Validation**: After compilation, copy generated `.algo` packages directly to the root workspace directory `cTrader_Bots` and run `ctrader-cli metadata <path>` to verify parameter metadata structure.

## How to Run

To run compilation, invoke the PowerShell helper script:

```powershell
# Compile modified cBots (skips unchanged ones)
powershell -ExecutionPolicy Bypass -File .agents/skills/ctrader-cbot-compiler/scripts/compile_cbots.ps1

# Force recompile all cBots
powershell -ExecutionPolicy Bypass -File .agents/skills/ctrader-cbot-compiler/scripts/compile_cbots.ps1 -Force

# Compile a specific cBot
powershell -ExecutionPolicy Bypass -File .agents/skills/ctrader-cbot-compiler/scripts/compile_cbots.ps1 -BotName "v102"
```
