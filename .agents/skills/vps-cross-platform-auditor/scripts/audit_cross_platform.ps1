# ==============================================================================
# VPS Cross-Platform Windows & Linux Deployment Auditor (PowerShell Runner)
# ==============================================================================
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
$OutputEncoding = [System.Text.Encoding]::UTF8

$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$PythonScript = Join-Path $ScriptDir "audit_cross_platform.py"

if (-not (Test-Path $PythonScript)) {
    Write-Host "[ERROR] Không tìm thấy audit_cross_platform.py tại: $PythonScript" -ForegroundColor Red
    exit 1
}

& python $PythonScript
exit $LASTEXITCODE
