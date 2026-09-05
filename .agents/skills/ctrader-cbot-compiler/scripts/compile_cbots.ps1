[CmdletBinding()]
param (
    [Parameter(Mandatory = $false)]
    [string]$BotName,

    [Parameter(Mandatory = $false)]
    [string]$Configuration = "Release",

    [Parameter(Mandatory = $false)]
    [string]$CtId = "",

    [Parameter(Mandatory = $false)]
    [string]$PwdFile = ".ctrader_pwd.txt",

    [Parameter(Mandatory = $false)]
    [string]$Account = "",

    [Parameter(Mandatory = $false)]
    [switch]$Force
)

$ErrorActionPreference = "Stop"

$workspaceRoot = (Get-Item "$PSScriptRoot/../../../..").FullName
Set-Location $workspaceRoot

# Ensure cTrader CLI is in PATH
$cliDir = "C:\Users\210608\AppData\Local\Spotware\cTrader\abb70432efbee65d18af69e79fe8efe1"
if ((Test-Path $cliDir) -and ($env:Path -notlike "*$cliDir*")) {
    $env:Path = "$env:Path;$cliDir"
}

# Resolve PwdFile path
if (-not [System.IO.Path]::IsPathRooted($PwdFile)) {
    if (Test-Path (Join-Path $workspaceRoot "pwd.txt")) {
        $PwdFile = Join-Path $workspaceRoot "pwd.txt"
    } elseif (Test-Path (Join-Path $workspaceRoot $PwdFile)) {
        $PwdFile = Join-Path $workspaceRoot $PwdFile
    } else {
        $PwdFile = Join-Path $workspaceRoot "pwd.txt"
    }
}

Write-Host "======================================================" -ForegroundColor Cyan
Write-Host "  cTrader cBot Automated Native CLI Compiler Agent    " -ForegroundColor Cyan
Write-Host "======================================================" -ForegroundColor Cyan

# Discover all .csproj files excluding test projects and build outputs
$allProjects = Get-ChildItem -Path $workspaceRoot -Recurse -Filter "*.csproj" | Where-Object {
    $_.FullName -notmatch "cTrader_Bots\.Tests" -and $_.FullName -notmatch '[\\/](bin|obj)[\\/]'
}

if ($BotName) {
    $allProjects = $allProjects | Where-Object { $_.Name -like "*$BotName*" -or $_.Directory.Name -like "*$BotName*" }
    Write-Host "Filtered targets matching '$BotName': $($allProjects.Count) project(s)" -ForegroundColor Yellow
} else {
    Write-Host "Discovered $($allProjects.Count) cBot project(s)." -ForegroundColor Yellow
}

if ($allProjects.Count -eq 0) {
    Write-Host "No matching .csproj projects found." -ForegroundColor Red
    exit 1
}

$results = @()
$successCount = 0
$skippedCount = 0
$failCount = 0

foreach ($proj in $allProjects) {
    $projName = [System.IO.Path]::GetFileNameWithoutExtension($proj.Name)
    $projDir = $proj.Directory.FullName

    # Get latest modification time among source files (.cs, .csproj)
    $sourceFiles = Get-ChildItem -Path $projDir -Recurse -Include "*.cs", "*.csproj" | Where-Object {
        $_.FullName -notmatch '[\\/](bin|obj)[\\/]'
    }

    $latestSourceTime = ($sourceFiles | Measure-Object -Property LastWriteTime -Maximum).Maximum

    # Check for existing .algo package in workspace root and cbot folder
    $targetAlgoName = "$projName.algo"
    $rootAlgo = Get-ChildItem -Path $workspaceRoot -File -Filter "*.algo" | Where-Object {
        $_.Name -eq $targetAlgoName -or $_.BaseName -eq $projName
    } | Select-Object -First 1
    $cbotAlgo = Get-Item (Join-Path $workspaceRoot "cbot\$targetAlgoName") -ErrorAction SilentlyContinue

    # Incremental build check: skip only if both root and cbot .algo are newer than all source files
    if (-not $Force -and -not $BotName -and $rootAlgo -and $cbotAlgo -and $latestSourceTime -and ($rootAlgo.LastWriteTime -ge $latestSourceTime) -and ($cbotAlgo.LastWriteTime -ge $latestSourceTime)) {
        Write-Host "`n------------------------------------------------------" -ForegroundColor Gray
        Write-Host "[SKIPPED] $projName (No changes detected since last build: $($rootAlgo.LastWriteTime.ToString('yyyy-MM-dd HH:mm:ss')))" -ForegroundColor DarkGray
        $skippedCount++
        $results += [PSCustomObject]@{
            Project = $projName
            Status  = "SKIPPED"
            Message = "No source changes detected."
        }
        continue
    }

    Write-Host "`n------------------------------------------------------" -ForegroundColor Gray
    Write-Host "Building & Packaging cBot: $projName ($Configuration)" -ForegroundColor White

    $isCliSuccess = $false
    $buildLog = ""

    # Execute dotnet build with Release configuration (cTrader Automate SDK packages .algo)
    $dotnetLog = dotnet build $proj.FullName -c $Configuration 2>&1 | Out-String
    if ($LASTEXITCODE -eq 0) {
        $isCliSuccess = $true
        $buildLog = $dotnetLog
    } else {
        $buildLog = $dotnetLog
        # Optional fallback attempt via ctrader-cli
        if (Get-Command ctrader-cli -ErrorAction SilentlyContinue) {
            Write-Host "  -> Attempting ctrader-cli build fallback..." -ForegroundColor Yellow
            $cliBuildCmd = "ctrader-cli.exe build `"$($proj.FullName)`" -q 2>&1"
            $cliRawOutput = cmd.exe /c "$cliBuildCmd" | Out-String
            $buildLog += "`n" + $cliRawOutput
            if ($cliRawOutput -match '"success":\s*true') {
                $isCliSuccess = $true
            }
        }
    }

    if ($isCliSuccess) {
        $successCount++
        Write-Host "[SUCCESS] $projName" -ForegroundColor Green

        # Locate compiled .algo file
        $algoFiles = Get-ChildItem -Path $projDir -Recurse -Filter "*.algo" | Where-Object {
            $_.FullName -match '[\\/]bin[\\/]'
        }

        foreach ($algo in $algoFiles) {
            $destPath = Join-Path $workspaceRoot "$projName.algo"
            Copy-Item -Path $algo.FullName -Destination $destPath -Force

            $cbotDestPath = Join-Path $workspaceRoot "cbot\$projName.algo"
            Copy-Item -Path $algo.FullName -Destination $cbotDestPath -Force
            Write-Host "  -> Saved package: $projName.algo to root workspace and cbot/ folder" -ForegroundColor DarkGreen

            # Perform cTrader CLI metadata validation
            if (Get-Command ctrader-cli -ErrorAction SilentlyContinue) {
                $metaJson = cmd.exe /c "ctrader-cli metadata `"$destPath`" 2>&1" | Out-String
                if ($metaJson -match '"PropertyName"') {
                    Write-Host "  -> cTrader CLI Metadata Verification: PASSED" -ForegroundColor Green
                } else {
                    Write-Host "  -> cTrader CLI Metadata Verification: WARNING (Metadata output unexpected)" -ForegroundColor Yellow
                }
            }
        }

        $results += [PSCustomObject]@{
            Project = $projName
            Status  = "SUCCESS"
            Message = "Native cTrader CLI Build completed successfully."
        }
    } else {
        $failCount++
        Write-Host "[FAILED] $projName" -ForegroundColor Red
        Write-Host $buildLog -ForegroundColor DarkRed

        $results += [PSCustomObject]@{
            Project = $projName
            Status  = "FAILED"
            Message = $buildLog
        }
    }
}

Write-Host "`n======================================================" -ForegroundColor Cyan
Write-Host "  Compilation Summary                                 " -ForegroundColor Cyan
Write-Host "======================================================" -ForegroundColor Cyan
Write-Host " Total: $($allProjects.Count) | Success: $successCount | Skipped: $skippedCount | Failed: $failCount`n"

$results | Format-Table -AutoSize
