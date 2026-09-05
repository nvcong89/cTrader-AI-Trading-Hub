[CmdletBinding()]
param (
    [Parameter(Mandatory = $true)]
    [string]$BotName
)

$ErrorActionPreference = "Stop"

$workspaceRoot = (Get-Item "$PSScriptRoot/../../../..").FullName

# Locate bot directory
$botDir = Get-ChildItem -Path (Join-Path $workspaceRoot "cbot") -Directory -Recurse -Depth 2 | Where-Object { $_.Name -like "*$BotName*" -and $_.FullName -notmatch '[\\/](bin|obj|\.git)[\\/]' } | Select-Object -First 1

if (-not $botDir) {
    Write-Host "cBot project directory matching '$BotName' not found." -ForegroundColor Red
    exit 1
}

Write-Host "======================================================" -ForegroundColor Cyan
Write-Host "  cTrader cBot Automated Code Reviewer Agent          " -ForegroundColor Cyan
Write-Host "======================================================" -ForegroundColor Cyan
Write-Host "Target cBot: $($botDir.Name)" -ForegroundColor Yellow
Write-Host "Path       : $($botDir.FullName)`n" -ForegroundColor Yellow

$csFiles = Get-ChildItem -Path $botDir.FullName -Recurse -Filter "*.cs" | Where-Object { $_.FullName -notmatch '[\\/](bin|obj)[\\/]' }

$checklist = @()

# 1. AccessRights Check
$accessRightsCheck = $false
$isFullAccessExpected = $botDir.Name -match 'F$' -or $botDir.Name -match '_F'
foreach ($f in $csFiles) {
    $content = Get-Content -Path $f.FullName -Raw
    if ($content -match 'AccessRights\s*=\s*AccessRights\.None' -or ($isFullAccessExpected -and $content -match 'AccessRights\s*=\s*AccessRights\.FullAccess')) {
        $accessRightsCheck = $true
        break
    }
}
$checklist += [PSCustomObject]@{
    Rule = "Security Permission Level"
    Passed = $accessRightsCheck
    Details = if ($accessRightsCheck) { "Passed: Correct AccessRights configured ($(if ($isFullAccessExpected) { 'FullAccess' } else { 'None' }))." } else { "FAILED: AccessRights mismatch or missing." }
}

# 2. In-Code License Check
$licenseCheck = $false
foreach ($f in $csFiles) {
    $content = Get-Content -Path $f.FullName -Raw
    if ($content -match 'private\s+(readonly|const)\s+bool\s+Unlimited_License\s*=' -or $content -match 'Unlimited_License\s*=') {
        $licenseCheck = $true
        break
    }
}
$checklist += [PSCustomObject]@{
    Rule = "In-Code Hidden License & ExpiryDate"
    Passed = $licenseCheck
    Details = if ($licenseCheck) { "Passed: In-code license present." } else { "FAILED: In-code license configuration missing." }
}

# 3. Position Close Signal Execution Check
$closeSignalCheck = $false
foreach ($f in $csFiles) {
    $content = Get-Content -Path $f.FullName -Raw
    if ($content -match 'closeBuyCondition|closeSellCondition' -and $content -match 'ClosePositions|ClosePosition') {
        $closeSignalCheck = $true
        break
    }
}
$checklist += [PSCustomObject]@{
    Rule = "Opposite/Close Signal Position Exit"
    Passed = $closeSignalCheck
    Details = if ($closeSignalCheck) { "Passed: Position closure on close signals implemented." } else { "WARNING: Close signal handling not detected." }
}

# 4. Non-blocking Async Telegram Check
$asyncTelegramCheck = $true
foreach ($f in $csFiles) {
    if ($f.Name -match 'Telegram') {
        $content = Get-Content -Path $f.FullName -Raw
        if ($content -match '\.Result' -or $content -match '\.Wait\(\)') {
            $asyncTelegramCheck = $false
            break
        }
    }
}
$checklist += [PSCustomObject]@{
    Rule = "Non-blocking Async Telegram Alerts"
    Passed = $asyncTelegramCheck
    Details = if ($asyncTelegramCheck) { "Passed: Telegram uses non-blocking async Task." } else { "FAILED: Blocking .Result/.Wait() found in Telegram code." }
}

# 5. RunningMode Backtest Sandbox Protection Check
$runningModeCheck = $true
foreach ($f in $csFiles) {
    $content = Get-Content -Path $f.FullName -Raw
    if (($content -match 'HttpWebRequest' -or $content -match 'HttpClient' -or $content -match 'System\.IO\.File') -and $content -notmatch 'RunningMode') {
        $runningModeCheck = $false
        break
    }
}
$checklist += [PSCustomObject]@{
    Rule = "Backtesting Sandbox Guard (RunningMode)"
    Passed = $runningModeCheck
    Details = if ($runningModeCheck) { "Passed: Network/File I/O operations are guarded with RunningMode checks for backtesting." } else { "WARNING: Network/File I/O operations found without RunningMode guard (may fail during backtesting under AccessRights.None)." }
}

# Print Checklist Results
Write-Host "------------------------------------------------------" -ForegroundColor Gray
Write-Host "CODE AUDIT CHECKLIST RESULTS:" -ForegroundColor White
Write-Host "------------------------------------------------------" -ForegroundColor Gray

$passedCount = 0
foreach ($item in $checklist) {
    if ($item.Passed) {
        $passedCount++
        Write-Host "[PASSED] " -NoNewline -ForegroundColor Green
        Write-Host "$($item.Rule): " -NoNewline -ForegroundColor White
        Write-Host "$($item.Details)" -ForegroundColor Gray
    } else {
        Write-Host "[FAILED] " -NoNewline -ForegroundColor Red
        Write-Host "$($item.Rule): " -NoNewline -ForegroundColor White
        Write-Host "$($item.Details)" -ForegroundColor Yellow
    }
}

# 5. Compilation Check
Write-Host "`n------------------------------------------------------" -ForegroundColor Gray
Write-Host "RUNNING COMPILATION AUDIT:" -ForegroundColor White
Write-Host "------------------------------------------------------" -ForegroundColor Gray

$compilerScript = Join-Path $workspaceRoot ".agents\skills\ctrader-cbot-compiler\scripts\compile_cbots.ps1"
$buildLog = powershell -ExecutionPolicy Bypass -File $compilerScript -BotName $botDir.Name 2>&1 | Out-String

$buildPassed = $LASTEXITCODE -eq 0

if ($buildPassed) {
    Write-Host "[SUCCESS] cBot compiled cleanly without errors." -ForegroundColor Green
} else {
    Write-Host "[FAILED] Compilation errors detected!" -ForegroundColor Red
    Write-Host $buildLog -ForegroundColor DarkRed
}

Write-Host "`n======================================================" -ForegroundColor Cyan
Write-Host "  CODE REVIEW AUDIT SUMMARY                           " -ForegroundColor Cyan
Write-Host "======================================================" -ForegroundColor Cyan
Write-Host "Rules Passed  : $passedCount / $($checklist.Count)"
Write-Host "Build Status  : $(if ($buildPassed) { 'PASSED' } else { 'FAILED' })"

if ($passedCount -eq $checklist.Count -and $buildPassed) {
    Write-Host "`nOVERALL STATUS: PASSED (Bot is production ready!)" -ForegroundColor Green
} else {
    Write-Host "`nOVERALL STATUS: REQUIRES ATTENTION (Fix issues above)" -ForegroundColor Red
    exit 1
}
