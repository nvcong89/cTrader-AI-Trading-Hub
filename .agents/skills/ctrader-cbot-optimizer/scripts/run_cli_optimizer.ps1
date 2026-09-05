<#
.SYNOPSIS
    cTrader cBot BreakEven Parameter Optimizer (ctrader-cli)
.DESCRIPTION
    Executes multi-parameter optimization grid sweeps for BreakEven Trigger (pips) using official ctrader-cli.
#>

[CmdletBinding()]
param (
    [Parameter(Mandatory = $false)]
    [string]$BotName = "v102F",

    [Parameter(Mandatory = $false)]
    [string]$Symbol = "XAUUSD",

    [Parameter(Mandatory = $false)]
    [string]$Period = "m15",

    [Parameter(Mandatory = $false)]
    [string]$Start = "02/01/2023",

    [Parameter(Mandatory = $false)]
    [string]$End = "08/08/2026",

    [Parameter(Mandatory = $false)]
    [double]$Balance = 1000,

    [Parameter(Mandatory = $false)]
    [double]$Spread = 15,

    [Parameter(Mandatory = $false)]
    [double]$Commission = 30,

    [Parameter(Mandatory = $false)]
    [string]$CtId = "",

    [Parameter(Mandatory = $false)]
    [string]$PwdFile = ".ctrader_pwd.txt",

    [Parameter(Mandatory = $false)]
    [string]$Account = ""
)

$ErrorActionPreference = "Stop"

# Ensure CLI in PATH
$cliDir = "C:\Users\210608\AppData\Local\Spotware\cTrader\abb70432efbee65d18af69e79fe8efe1"
if ($env:Path -notlike "*$cliDir*") {
    $env:Path = "$cliDir;$env:Path"
}

# Resolve bot path
$repoRoot = Get-Item $PSScriptRoot\..\..\..\.. | Select-Object -ExpandProperty FullName
$algoPath = Join-Path $repoRoot "Smart Trend Bot Pro_XAU_M15_$BotName\Smart Trend Bot Pro_XAU_M15_$BotName\bin\Release\net6.0\Smart Trend Bot Pro_XAU_M15_$BotName.algo"

if (-not (Test-Path $algoPath)) {
    $algoPath = Join-Path $repoRoot "v102F.algo"
}

if (-not (Test-Path $algoPath)) {
    Write-Error "Compiled .algo package not found at: $algoPath. Please compile the bot first."
    exit 1
}

# Ensure PwdFile absolute path
if (-not [System.IO.Path]::IsPathRooted($PwdFile)) {
    $PwdFile = Join-Path $repoRoot $PwdFile
}

$optFolder = Join-Path $repoRoot "opt_reports"
New-Item -ItemType Directory -Force -Path $optFolder | Out-Null

Write-Host "==========================================================" -ForegroundColor Cyan
Write-Host "  cTrader CLI BreakEven Parameter Optimizer" -ForegroundColor Cyan
Write-Host "  Bot Package: $algoPath" -ForegroundColor Cyan
Write-Host "  Symbol: $Symbol | Timeframe: $Period" -ForegroundColor Cyan
Write-Host "  Period: $Start to $End | Balance: `$ $Balance | Spread: $Spread pips" -ForegroundColor Cyan
Write-Host "==========================================================" -ForegroundColor Cyan

# Fixed optimal strategy & risk parameters
$sl = 1.0
$tp = 2.0
$adx = 15
$risk = 10.0

# BreakEven Trigger sweep list (pips)
$beTriggers = @(200, 300, 400, 500, 600, 800, 1000, 1200)

$cliExe = Join-Path $cliDir "ctrader-cli.exe"
$results = @()

foreach ($bePips in $beTriggers) {
    $jsonReport = Join-Path $optFolder "opt_report_BE_Trigger${bePips}.json"

    if (-not (Test-Path $jsonReport)) {
        Write-Host "Running pass: enableBreakEven=True, BreakEvenTrigger=$bePips pips..." -ForegroundColor Yellow
        [Console]::Out.Flush()

        $cmdArgs = @(
            "backtest",
            $algoPath,
            "--ctid=$CtId",
            "--pwd-file=$PwdFile",
            "--account=$Account",
            "--symbol=$Symbol",
            "--period=$Period",
            "--data-mode=m1",
            "--start=$Start",
            "--end=$End",
            "--balance=$Balance",
            "--spread=$Spread",
            "--commission=$Commission",
            "--full-access",
            "--report-json=$jsonReport",
            "--stoplossPercentage=$sl",
            "--takeprofitPercentage=$tp",
            "--minADX=$adx",
            "--riskFactor=$risk",
            "--enableBreakEvenPrice=True",
            "--breakEvenTrigger=$bePips"
        )

        $oldEA = $ErrorActionPreference
        $ErrorActionPreference = "Continue"
        & $cliExe $cmdArgs 2>&1 | Out-Null
        $ErrorActionPreference = $oldEA
        Start-Sleep -Seconds 1
    } else {
        Write-Host "Using cached report for BreakEvenTrigger=$bePips pips..." -ForegroundColor DarkGray
    }

    if (Test-Path $jsonReport) {
        $rawJson = Get-Content $jsonReport -Raw | ConvertFrom-Json
        $results += [PSCustomObject]@{
            BreakEvenTrigger_Pips = "$bePips pips ($($bePips/10) pts)"
            NetProfit             = [math]::Round($rawJson.main.netProfit, 2)
            FinalEquity           = [math]::Round($rawJson.main.endingEquity, 2)
            MaxEquityDD_Pct       = [math]::Round($rawJson.main.tradeStatistics.maxEquityDrawdownPercentages, 1)
            ROI_Percent           = [math]::Round($rawJson.main.roi, 1)
        }
    }
}

Write-Host "`n==========================================================" -ForegroundColor Green
Write-Host "  BREAKEVEN PARAMETER OPTIMIZATION RESULTS RANKED BY NET PROFIT" -ForegroundColor Green
Write-Host "==========================================================" -ForegroundColor Green
$rankedResults = $results | Sort-Object -Property NetProfit -Descending
$csvPath = Join-Path $repoRoot "BreakEven_Optimization_Results.csv"
$rankedResults | Export-Csv -Path $csvPath -NoTypeInformation
Write-Host ($rankedResults | Format-Table -AutoSize | Out-String) -ForegroundColor White
Write-Host "Results saved to: $csvPath" -ForegroundColor DarkGreen

# Send automated Telegram notification
$notifierScript = Join-Path $repoRoot ".agents\skills\ctrader-telegram-notifier\scripts\send_telegram_report.ps1"
if (Test-Path $notifierScript) {
    & powershell -ExecutionPolicy Bypass -File $notifierScript -Title "🎯 cTrader Optimization Completed ($BotName)" -Message "Parameter Optimization for $BotName ($Symbol, $Period) completed via cTrader CLI." -CsvPath $csvPath
}

