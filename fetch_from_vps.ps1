# ==============================================================================
# cTrader AI Trading Hub - 1-Click Remote Data Fetcher (Linux VPS -> Windows Local)
# ==============================================================================
[CmdletBinding()]
param (
    [switch]$ApplyLocal = $false,
    [switch]$NonInteractive = $false
)

[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
$OutputEncoding = [System.Text.Encoding]::UTF8

Write-Host "=====================================================================" -ForegroundColor Cyan
Write-Host "   [+] cTrader AI Trading Hub - 1-Click VPS Data & Logs Fetcher" -ForegroundColor Green
Write-Host "=====================================================================" -ForegroundColor Cyan
Write-Host ""

$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
Set-Location -Path $ScriptDir

# 1. Parse VPS_Linux.txt
$VpsConfigFile = Join-Path $ScriptDir "VPS_Linux.txt"
if (-not (Test-Path $VpsConfigFile)) {
    Write-Host "[ERROR] Không tìm thấy file VPS_Linux.txt tại: $VpsConfigFile" -ForegroundColor Red
    exit 1
}

$VpsConfig = @{}
Get-Content $VpsConfigFile | ForEach-Object {
    $line = $_.Trim()
    if ($line -and -not $line.StartsWith("#")) {
        $parts = $line.Split("=", 2)
        if ($parts.Length -eq 2) {
            $VpsConfig[$parts[0].Trim().ToUpper()] = $parts[1].Trim()
        }
    }
}

$VpsIp = $VpsConfig["IP"]
$VpsUser = if ($VpsConfig["USERNAME"]) { $VpsConfig["USERNAME"] } else { "root" }
$VpsPort = if ($VpsConfig["PORT_SSH"]) { $VpsConfig["PORT_SSH"] } else { "22" }

if (-not $VpsIp) {
    Write-Host "[ERROR] Không tìm thấy địa chỉ IP trong VPS_Linux.txt" -ForegroundColor Red
    exit 1
}

Write-Host "[INFO] VPS Target: $VpsUser@$VpsIp (Port: $VpsPort)" -ForegroundColor Yellow
Write-Host ""

# 2. Check SSH connection
Write-Host "[1/4] Kiểm tra kết nối SSH tới VPS..." -ForegroundColor Yellow
$testSsh = & ssh.exe -o BatchMode=yes -o StrictHostKeyChecking=accept-new -o ConnectTimeout=5 -p $VpsPort "$VpsUser@$VpsIp" "echo OK" 2>$null
if ($testSsh -ne "OK") {
    Write-Host "[NOTE] Đang tự động cấu hình SSH Key..." -ForegroundColor Cyan
    & python "deploy/setup_ssh_key.py"
    $testSsh = & ssh.exe -o BatchMode=yes -o StrictHostKeyChecking=accept-new -o ConnectTimeout=5 -p $VpsPort "$VpsUser@$VpsIp" "echo OK" 2>$null
    if ($testSsh -ne "OK") {
        Write-Host "[ERROR] Không thể kết nối SSH tới VPS. Vui lòng kiểm tra VPS_Linux.txt hoặc đường truyền mạng." -ForegroundColor Red
        exit 1
    }
}
Write-Host "  -> Kết nối SSH thành công!" -ForegroundColor Green
Write-Host ""

# 3. Create SQLite Safe Snapshot & Bundle on VPS
Write-Host "[2/4] Tạo bản sao lưu an toàn (SQLite Safe Snapshot) & đóng gói trên VPS..." -ForegroundColor Yellow

$bundleOutput = & ssh.exe -p $VpsPort "$VpsUser@$VpsIp" "python3 /opt/ctrader-ai-hub/deploy/export_vps_bundle.py"

$remoteBundlePath = ""
$bundleOutput | ForEach-Object {
    if ($_ -match "BUNDLE_PATH:(.+)") {
        $remoteBundlePath = $Matches[1].Trim()
    }
}

if (-not $remoteBundlePath) {
    Write-Host "[ERROR] Không thể tạo bundle dữ liệu trên VPS. Chi tiết:" -ForegroundColor Red
    $bundleOutput | Write-Host
    exit 1
}

Write-Host "  -> Đã tạo gói dữ liệu an toàn trên VPS: $remoteBundlePath" -ForegroundColor Green
Write-Host ""

# 4. Download bundle to Local Machine
$timestamp = Get-Date -Format "yyyyMMdd_HHmmss"
$localDestDir = Join-Path $ScriptDir "vps_data\sync_$timestamp"
$latestDir = Join-Path $ScriptDir "vps_data\latest"
New-Item -ItemType Directory -Force -Path $localDestDir | Out-Null
New-Item -ItemType Directory -Force -Path $latestDir | Out-Null

$localTempTar = Join-Path $env:TEMP "vps_bundle_$timestamp.tar.gz"

Write-Host "[3/4] Tải gói dữ liệu từ VPS về máy local..." -ForegroundColor Yellow
& scp.exe -P $VpsPort "$VpsUser@$VpsIp`:$remoteBundlePath" "$localTempTar"
if ($LASTEXITCODE -ne 0 -or -not (Test-Path $localTempTar)) {
    Write-Host "[ERROR] Tải file từ VPS thất bại!" -ForegroundColor Red
    exit 1
}

# Cleanup remote bundle file
& ssh.exe -p $VpsPort "$VpsUser@$VpsIp" "rm -f $remoteBundlePath" 2>$null

# Extract locally
& tar.exe -xzf "$localTempTar" -C "$localDestDir"
Remove-Item -Force "$localTempTar" 2>$null

# Copy to latest directory
Copy-Item -Path "$localDestDir\*" -Destination "$latestDir" -Recurse -Force

Write-Host "  -> Tải thành công!" -ForegroundColor Green
Write-Host "  -> Lưu tại: $localDestDir" -ForegroundColor Cyan
Write-Host "  -> Bản mới nhất tại: $latestDir" -ForegroundColor Cyan
Write-Host ""

# 5. Summary of downloaded data
Write-Host "[4/4] Thong ke du lieu da tai:" -ForegroundColor Yellow
$downloadedDb = Join-Path $localDestDir "portfolio.db"
if (Test-Path $downloadedDb) {
    $dbSize = [math]::Round(((Get-Item $downloadedDb).Length / 1MB), 2)
    Write-Host "  [+] portfolio.db : $dbSize MB" -ForegroundColor Green
    
    # Query database stats locally with python cleanly
    $pyCheck = @"
import sqlite3
try:
    conn = sqlite3.connect(r'$downloadedDb')
    c = conn.cursor()
    c.execute('SELECT COUNT(*) FROM bot_instances')
    print('     - Bot instances:', c.fetchone()[0], 'bots')
    c.execute('SELECT COUNT(*) FROM positions')
    print('     - Open positions:', c.fetchone()[0])
    c.execute('SELECT COUNT(*) FROM history')
    print('     - Trade history:', c.fetchone()[0], 'trades')
    c.execute('SELECT COUNT(*) FROM logs')
    print('     - System logs:', c.fetchone()[0], 'records')
    conn.close()
except Exception as e:
    print('     - Error reading DB:', e)
"@
    & python -c "$pyCheck"
}

$downloadedLogs = Join-Path $localDestDir "logs"
if (Test-Path $downloadedLogs) {
    $logFiles = Get-ChildItem -Path $downloadedLogs -File
    Write-Host ("  [+] Bot logs: {0} files" -f $logFiles.Count) -ForegroundColor Green
    $logFiles | ForEach-Object {
        $kb = [math]::Round(($_.Length / 1KB), 1)
        Write-Host "     - $($_.Name) ($kb KB)" -ForegroundColor Gray
    }
}

$journalLog = Join-Path $localDestDir "systemd_ctrader-hub.log"
if (Test-Path $journalLog) {
    $jSize = [math]::Round(((Get-Item $journalLog).Length / 1KB), 1)
    Write-Host "  [+] Systemd Service Log: $jSize KB (500 dong gan nhat)" -ForegroundColor Green
}
Write-Host ""

# 6. Optional: Apply to local working directory
$shouldApply = $ApplyLocal
if (-not $shouldApply -and -not $NonInteractive) {
    $reply = Read-Host "Bạn có muốn áp dụng portfolio.db vừa tải vào máy local để debug/chạy thử ngay không? (y/N)"
    if ($reply -match "^[yY]") {
        $shouldApply = $true
    }
}

if ($shouldApply) {
    $localDb = Join-Path $ScriptDir "portfolio.db"
    if (Test-Path $localDb) {
        $bakDb = Join-Path $ScriptDir "portfolio.local.bak"
        Copy-Item -Path $localDb -Destination $bakDb -Force
        Write-Host "[BACKUP] Đã sao lưu database local hiện tại thành: portfolio.local.bak" -ForegroundColor Gray
    }
    Copy-Item -Path $downloadedDb -Destination $localDb -Force
    
    # Sync logs to local logs dir
    if (Test-Path $downloadedLogs) {
        $localLogDir = Join-Path $ScriptDir "logs"
        New-Item -ItemType Directory -Force -Path $localLogDir | Out-Null
        Copy-Item -Path "$downloadedLogs\*" -Destination $localLogDir -Recurse -Force
    }
    
    Write-Host "=====================================================================" -ForegroundColor Green
    Write-Host "  [OK] DA AP DUNG THANH CONG DU LIEU VPS VAO MAY LOCAL!" -ForegroundColor Green
    Write-Host "  Bay gio ban co the khoi dong Web Hub tren local de xem du lieu VPS." -ForegroundColor Cyan
    Write-Host "=====================================================================" -ForegroundColor Green
} else {
    Write-Host "=====================================================================" -ForegroundColor Green
    Write-Host "  [OK] HOAN TAT TAI DU LIEU TU VPS VE THU MUC vps_data/" -ForegroundColor Green
    Write-Host "  (De ap dung vao local sau nay: chay '.\fetch_from_vps.ps1 -ApplyLocal')" -ForegroundColor Cyan
    Write-Host "=====================================================================" -ForegroundColor Green
}
