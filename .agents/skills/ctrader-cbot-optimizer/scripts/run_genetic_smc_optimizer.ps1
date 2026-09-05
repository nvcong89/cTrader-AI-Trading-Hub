[CmdletBinding()]
param (
    [Parameter(Mandatory = $false)]
    [string]$BotName = "SmartBot ICT SMC",

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
    [double]$Spread = 15,

    [Parameter(Mandatory = $false)]
    [double]$Commission = 30,

    [Parameter(Mandatory = $false)]
    [string]$CtId = "",

    [Parameter(Mandatory = $false)]
    [string]$PwdFile = "./.ctrader_pwd.txt",

    [Parameter(Mandatory = $false)]
    [string]$Account = ""
)

$ErrorActionPreference = "Stop"

$workspaceRoot = (Get-Item "$PSScriptRoot/../../../..").FullName
Set-Location $workspaceRoot

$cliDir = Join-Path $env:LOCALAPPDATA "Spotware\cTrader\abb70432efbee65d18af69e79fe8efe1"
if ((Test-Path $cliDir) -and ($env:Path -notlike "*$cliDir*")) {
    $env:Path = "$cliDir;$env:Path"
}
$cliExe = Join-Path $cliDir "ctrader-cli.exe"

$algoPath = Join-Path $workspaceRoot "SmartBot ICT SMC.algo"
if (-not (Test-Path $algoPath)) {
    Write-Error "Compiled .algo package not found at: $algoPath"
    exit 1
}

$optFolder = Join-Path $workspaceRoot "opt_reports_genetic"
New-Item -ItemType Directory -Force -Path $optFolder | Out-Null

Write-Host "==========================================================" -ForegroundColor Cyan
Write-Host "  cTrader CLI Step 1: Broad Exploration / Genetic Sweep" -ForegroundColor Cyan
Write-Host "  Bot Package : $algoPath" -ForegroundColor Cyan
Write-Host "  Symbol      : $Symbol | Timeframe: $Period" -ForegroundColor Cyan
Write-Host "  Period      : $Start to $End | Balance: `$ $Balance" -ForegroundColor Cyan
Write-Host "==========================================================" -ForegroundColor Cyan

# Broad Genetic Parameter Exploration Space
$candidateSets = @(
    @{ SwingPeriod=3; MinFvg=5;  Tema=30;  MinAdx=10; Buffer=10; RR=1.5 },
    @{ SwingPeriod=3; MinFvg=10; Tema=50;  MinAdx=15; Buffer=15; RR=2.0 },
    @{ SwingPeriod=3; MinFvg=15; Tema=100; MinAdx=20; Buffer=20; RR=3.0 },
    @{ SwingPeriod=5; MinFvg=5;  Tema=50;  MinAdx=15; Buffer=15; RR=2.0 },
    @{ SwingPeriod=5; MinFvg=10; Tema=30;  MinAdx=10; Buffer=10; RR=1.5 },
    @{ SwingPeriod=5; MinFvg=15; Tema=50;  MinAdx=20; Buffer=20; RR=2.5 },
    @{ SwingPeriod=8; MinFvg=5;  Tema=100; MinAdx=15; Buffer=15; RR=2.0 },
    @{ SwingPeriod=8; MinFvg=10; Tema=50;  MinAdx=10; Buffer=10; RR=2.5 },
    @{ SwingPeriod=8; MinFvg=15; Tema=30;  MinAdx=20; Buffer=20; RR=3.0 }
)

$results = @()
$passCount = 0

foreach ($set in $candidateSets) {
    $passCount++
    $sp = $set.SwingPeriod
    $fvg = $set.MinFvg
    $tema = $set.Tema
    $adx = $set.MinAdx
    $buf = $set.Buffer
    $rr = $set.RR

    $jsonReport = Join-Path $optFolder "genetic_pass_${passCount}.json"

    if (-not (Test-Path $jsonReport)) {
        Write-Host "Running Genetic Pass ${passCount}: Swing=$sp, Fvg=$fvg, TEMA=$tema, ADX=$adx, Buf=$buf, RR=$rr..." -ForegroundColor Yellow

        $cmdArgs = @(
            "backtest",
            "$algoPath",
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
            "--SwingPeriod=$sp",
            "--MinFvgPips=$fvg",
            "--TemaPeriod=$tema",
            "--MinAdxLevel=$adx",
            "--SlBufferPips=$buf",
            "--MinRrRatio=$rr"
        )

        $oldEA = $ErrorActionPreference
        $ErrorActionPreference = "Continue"
        & $cliExe @cmdArgs 2>&1 | Out-Null
        $ErrorActionPreference = $oldEA
        Start-Sleep -Milliseconds 200
    }

    if (Test-Path $jsonReport) {
        try {
            $rawJson = Get-Content $jsonReport -Raw | ConvertFrom-Json
            if ($rawJson.main) {
                $netProf = [math]::Round($rawJson.main.netProfit, 2)
                $endingEq = [math]::Round($rawJson.main.endingEquity, 2)
                $maxDD = [math]::Round($rawJson.main.tradeStatistics.maxEquityDrawdownPercentages, 1)
                $winRate = [math]::Round($rawJson.main.tradeStatistics.winningTradesRatio, 1)
                $totTrades = $rawJson.main.tradeStatistics.totalTrades

                $results += [PSCustomObject]@{
                    Pass             = $passCount
                    SwingPeriod      = $sp
                    MinFvgPips       = $fvg
                    TemaPeriod       = $tema
                    MinAdxLevel      = $adx
                    SlBufferPips     = $buf
                    MinRrRatio       = $rr
                    TotalTrades      = $totTrades
                    NetProfit        = $netProf
                    EndingEquity     = $endingEq
                    WinRate_Pct      = $winRate
                    MaxEquityDD_Pct  = $maxDD
                }
            }
        } catch {}
    }
}

Write-Host "`n==========================================================" -ForegroundColor Green
Write-Host "  STEP 1: GENETIC BROAD SWEEP RESULTS (RANKED BY NET PROFIT)" -ForegroundColor Green
Write-Host "==========================================================" -ForegroundColor Green

$rankedResults = $results | Sort-Object -Property NetProfit -Descending
$csvPath = Join-Path $workspaceRoot "Genetic_Optimization_Results_SmartBot_ICT_SMC.csv"
$rankedResults | Export-Csv -Path $csvPath -NoTypeInformation

Write-Host ($rankedResults | Format-Table -AutoSize | Out-String) -ForegroundColor White
Write-Host "Step 1 Genetic exploration saved to: $csvPath" -ForegroundColor Green
