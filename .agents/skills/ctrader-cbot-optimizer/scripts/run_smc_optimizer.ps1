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

$optFolder = Join-Path $workspaceRoot "opt_reports_smc"
New-Item -ItemType Directory -Force -Path $optFolder | Out-Null

Write-Host "==========================================================" -ForegroundColor Cyan
Write-Host "  cTrader CLI SmartBot ICT SMC Parameter Optimizer" -ForegroundColor Cyan
Write-Host "  Bot Package : $algoPath" -ForegroundColor Cyan
Write-Host "  Symbol      : $Symbol | Timeframe: $Period" -ForegroundColor Cyan
Write-Host "  Period      : $Start to $End | Balance: `$ $Balance" -ForegroundColor Cyan
Write-Host "==========================================================" -ForegroundColor Cyan

# Parameter Search Grid
$swingPeriods = @(3, 5, 8)
$minFvgPipsList = @(5, 10, 15)
$slPcts = @(1.2, 1.8, 2.4)
$tpPcts = @(2.5, 3.2, 4.5)

$results = @()
$passCount = 0

foreach ($sp in $swingPeriods) {
    foreach ($fvg in $minFvgPipsList) {
        foreach ($sl in $slPcts) {
            foreach ($tp in $tpPcts) {
                $passCount++
                $jsonReport = Join-Path $optFolder "opt_pass_${sp}_${fvg}_${sl}_${tp}.json"

                if (-not (Test-Path $jsonReport)) {
                    Write-Host "Running Pass ${passCount}: SwingPeriod=$sp, MinFvg=$fvg, SL%=$sl, TP%=$tp..." -ForegroundColor Yellow

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
                        "--stoplossPercentage=$sl",
                        "--takeprofitPercentage=$tp"
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

                            $results += [PSCustomObject]@{
                                Pass             = $passCount
                                SwingPeriod      = $sp
                                MinFvgPips       = $fvg
                                SL_Pct           = $sl
                                TP_Pct           = $tp
                                NetProfit        = $netProf
                                EndingEquity     = $endingEq
                                WinRate_Pct      = $winRate
                                MaxEquityDD_Pct  = $maxDD
                            }
                        }
                    } catch {}
                }
            }
        }
    }
}

Write-Host "`n==========================================================" -ForegroundColor Green
Write-Host "  SMARTBOT ICT SMC OPTIMIZATION RESULTS (TOP 10 RANKED)" -ForegroundColor Green
Write-Host "==========================================================" -ForegroundColor Green

$rankedResults = $results | Sort-Object -Property NetProfit -Descending
$csvPath = Join-Path $workspaceRoot "Optimization_Results_SmartBot_ICT_SMC.csv"
$rankedResults | Export-Csv -Path $csvPath -NoTypeInformation

$top10 = $rankedResults | Select-Object -First 10
Write-Host ($top10 | Format-Table -AutoSize | Out-String) -ForegroundColor White
Write-Host "Full optimization grid saved to: $csvPath" -ForegroundColor Green
