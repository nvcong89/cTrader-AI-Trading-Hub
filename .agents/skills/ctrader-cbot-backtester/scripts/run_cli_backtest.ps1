[CmdletBinding()]
param (
    [Parameter(Mandatory = $false)]
    [string]$BotName = "SmartBot ICT SMC",

    [Parameter(Mandatory = $false)]
    [string]$AlgoPath,

    [Parameter(Mandatory = $false)]
    [string]$ParamsFile,

    [Parameter(Mandatory = $false)]
    [string]$Symbol = "XAUUSD",

    [Parameter(Mandatory = $false)]
    [string]$Period = "m15",

    [Parameter(Mandatory = $false)]
    [string]$Start = "01/01/2023",

    [Parameter(Mandatory = $false)]
    [string]$End = "08/08/2026",

    [Parameter(Mandatory = $false)]
    [double]$Balance = 1000,

    [Parameter(Mandatory = $false)]
    [string]$DataMode = "m1",

    [Parameter(Mandatory = $false)]
    [string]$DataFile,

    [Parameter(Mandatory = $false)]
    [double]$Spread = 15,

    [Parameter(Mandatory = $false)]
    [double]$Commission = 30,

    [Parameter(Mandatory = $false)]
    [string]$CtId,

    [Parameter(Mandatory = $false)]
    [string]$PwdFile,

    [Parameter(Mandatory = $false)]
    [string]$Account,

    [Parameter(Mandatory = $false)]
    [string]$ReportPath
)

$ErrorActionPreference = "Stop"

$workspaceRoot = "c:\Users\210608\Documents\GitHub\cTrader_Bots"
Set-Location $workspaceRoot

# Ensure cTrader CLI is in PATH
$cliDir = "C:\Users\210608\AppData\Local\Spotware\cTrader\abb70432efbee65d18af69e79fe8efe1"
if ((Test-Path $cliDir) -and ($env:Path -notlike "*$cliDir*")) {
    $env:Path = "$cliDir;$env:Path"
}

# Locate .algo package
if (-not $AlgoPath) {
    $AlgoPath = Join-Path $workspaceRoot "$BotName.algo"
}

if (-not (Test-Path $AlgoPath)) {
    Write-Host "Searching for .algo file in workspace..." -ForegroundColor Yellow
    $foundAlgo = Get-ChildItem -Path $workspaceRoot -Filter "*$BotName*.algo" -Recurse | Select-Object -First 1
    if ($foundAlgo) {
        $AlgoPath = $foundAlgo.FullName
    } else {
        Write-Host "Compiling bot first to generate .algo file..." -ForegroundColor Yellow
        $compilerScript = Join-Path $workspaceRoot ".agents\skills\ctrader-cbot-compiler\scripts\compile_cbots.ps1"
        if (Test-Path $compilerScript) {
            & powershell -ExecutionPolicy Bypass -File $compilerScript -BotName $BotName
        }
    }
}

if (-not (Test-Path $AlgoPath)) {
    Write-Host "Error: Could not locate compiled .algo package for '$BotName' at: $AlgoPath" -ForegroundColor Red
    exit 1
}

Write-Host "======================================================" -ForegroundColor Cyan
Write-Host "  cTrader cBot CLI Backtester Agent                   " -ForegroundColor Cyan
Write-Host "======================================================" -ForegroundColor Cyan
Write-Host "Bot Name   : $BotName" -ForegroundColor Yellow
Write-Host "Algo Path  : $AlgoPath" -ForegroundColor Yellow
Write-Host "Symbol     : $Symbol" -ForegroundColor Yellow
Write-Host "Period     : $Period" -ForegroundColor Yellow
Write-Host "Date Range   : $Start -> $End" -ForegroundColor Yellow

if (-not $ReportPath) {
    $ReportPath = Join-Path $workspaceRoot "Backtest_Report_$BotName.html"
}

# Construct ctrader-cli backtest command arguments
$cmdArgs = @("backtest", "$AlgoPath")

if ($ParamsFile -and (Test-Path $ParamsFile)) {
    $cmdArgs += "$ParamsFile"
}

$cmdArgs += "--start=$Start"
$cmdArgs += "--end=$End"
$cmdArgs += "--data-mode=$DataMode"
if ($DataFile -and (Test-Path $DataFile)) {
    $cmdArgs += "--data-file=$DataFile"
}
$cmdArgs += "--spread=$Spread"
$cmdArgs += "--balance=$Balance"
$cmdArgs += "--commission=$Commission"
$cmdArgs += "--symbol=$Symbol"
$cmdArgs += "--period=$Period"
$cmdArgs += "--report=$ReportPath"
$cmdArgs += "--full-access"

if ($CtId) { $cmdArgs += "--ctid=$CtId" }
if ($PwdFile) { $cmdArgs += "--pwd-file=$PwdFile" }
if ($Account) { $cmdArgs += "--account=$Account" }

Write-Host "`nExecuting cTrader CLI Backtest..." -ForegroundColor Cyan
Write-Host "Command: ctrader-cli $($cmdArgs -join ' ')" -ForegroundColor Gray

& ctrader-cli @cmdArgs

if ($LASTEXITCODE -eq 0) {
    Write-Host "`n[SUCCESS] Backtest completed successfully. Report saved to: $ReportPath" -ForegroundColor Green
    
    # Send automated Telegram notification
    $notifierScript = Join-Path $workspaceRoot ".agents\skills\ctrader-telegram-notifier\scripts\send_telegram_report.ps1"
    if (Test-Path $notifierScript) {
        $msgText = "Bot: $BotName | Symbol: $Symbol ($Period)`nRange: $Start -> $End`nReport Path: $ReportPath"
        & powershell -ExecutionPolicy Bypass -File $notifierScript -Title "cTrader Backtest Completed ($BotName)" -Message $msgText
    }
} else {
    Write-Host "`n[FAILED] cTrader CLI Backtest failed with exit code $LASTEXITCODE." -ForegroundColor Red
}
