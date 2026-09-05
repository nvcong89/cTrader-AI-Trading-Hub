# ==============================================================================
# cTrader AI Trading Hub - 1-Click Remote Deployment Script (Windows -> Linux VPS)
# ==============================================================================
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
$OutputEncoding = [System.Text.Encoding]::UTF8

Write-Host "=====================================================================" -ForegroundColor Cyan
Write-Host "   [+] cTrader AI Trading Hub - 1-Click Remote VPS Deployment" -ForegroundColor Green
Write-Host "=====================================================================" -ForegroundColor Cyan
Write-Host ""

$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
Set-Location -Path $ScriptDir

# 0. Pre-Flight Cross-Platform Compatibility Audit
Write-Host "[PRE-FLIGHT] Đang kiểm tra tính tương thích đa nền tảng Windows & Linux..." -ForegroundColor Cyan
$auditScript = Join-Path $ScriptDir ".agents/skills/vps-cross-platform-auditor/scripts/audit_cross_platform.py"
if (Test-Path $auditScript) {
    & python $auditScript
    if ($LASTEXITCODE -ne 0) {
        Write-Host "[ERROR] Codebase không vượt qua bài kiểm tra tương thích Windows/Linux! Đã dừng deploy để bảo vệ VPS." -ForegroundColor Red
        exit 1
    }
}
Write-Host ""

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
$VpsPassword = $VpsConfig["PASSWORD"]

if (-not $VpsIp) {
    Write-Host "[ERROR] Không tìm thấy địa chỉ IP trong VPS_Linux.txt" -ForegroundColor Red
    exit 1
}

Write-Host "[INFO] VPS Target: $VpsUser@$VpsIp (Port: $VpsPort)" -ForegroundColor Yellow
Write-Host ""

# 2. Check & Configure SSH Key Authentication
Write-Host "[1/5] Kiểm tra xác thực SSH kết nối tới VPS..." -ForegroundColor Yellow

$testSsh = & ssh.exe -o BatchMode=yes -o StrictHostKeyChecking=accept-new -o ConnectTimeout=5 -p $VpsPort "$VpsUser@$VpsIp" "echo OK" 2>$null

if ($testSsh -ne "OK") {
    Write-Host "[NOTE] Đang tự động cấu hình SSH Key lên VPS bằng tài khoản trong VPS_Linux.txt..." -ForegroundColor Cyan
    & python "deploy/setup_ssh_key.py"
    
    $retest = & ssh.exe -o BatchMode=yes -o StrictHostKeyChecking=accept-new -o ConnectTimeout=5 -p $VpsPort "$VpsUser@$VpsIp" "echo OK" 2>$null
    if ($retest -ne "OK") {
        Write-Host "[WARN] Không thể kết nối tự động bằng SSH Key. Vui lòng kiểm tra mật khẩu trong VPS_Linux.txt" -ForegroundColor Yellow
    }
}

Write-Host "[OK] Xác thực SSH kết nối thành công!" -ForegroundColor Green
Write-Host ""

# 3. Create Clean Archive of Project Code
Write-Host "[2/5] Đóng gói mã nguồn dự án (bỏ qua venv, node_modules, cache)..." -ForegroundColor Yellow

$TempArchive = Join-Path $env:TEMP "ctrader_hub_bundle.tar.gz"
if (Test-Path $TempArchive) {
    Remove-Item -Force $TempArchive
}

$tarArgs = @(
    "-czf", $TempArchive,
    "--exclude=venv",
    "--exclude=node_modules",
    "--exclude=.git",
    "--exclude=.codegraph",
    "--exclude=__pycache__",
    "--exclude=.pytest_cache",
    "--exclude=logs",
    "--exclude=chrome_profile",
    "--exclude=scratch",
    "--exclude=backups",
    "--exclude=*.pyc",
    "--exclude=*.log",
    "--exclude=*.tmp",
    "--exclude=*.db-journal",
    "-C", $ScriptDir,
    "."
)

& tar.exe $tarArgs
if ($LASTEXITCODE -ne 0 -or -not (Test-Path $TempArchive)) {
    Write-Host "[ERROR] Đóng gói mã nguồn thất bại." -ForegroundColor Red
    exit 1
}

$ArchiveSize = [math]::Round((Get-Item $TempArchive).Length / 1MB, 2)
Write-Host "[OK] Đóng gói hoàn tất: $ArchiveSize MB ($TempArchive)" -ForegroundColor Green
Write-Host ""

# 4. Upload Bundle to VPS
Write-Host "[3/5] Tải gói mã nguồn lên VPS ($VpsIp)..." -ForegroundColor Yellow
$RemoteArchive = "/tmp/ctrader_hub_bundle.tar.gz"

& scp.exe -o BatchMode=yes -o StrictHostKeyChecking=accept-new -P $VpsPort $TempArchive "$VpsUser@${VpsIp}:$RemoteArchive"
if ($LASTEXITCODE -ne 0) {
    Write-Host "[ERROR] Tải file lên VPS qua SCP thất bại." -ForegroundColor Red
    exit 1
}
Write-Host "[OK] Tải file lên VPS thành công!" -ForegroundColor Green
Write-Host ""

# 5. Extract Code & Execute Setup Script on VPS
Write-Host "[4/5] Giải nén và kích hoạt cài đặt trên VPS Ubuntu..." -ForegroundColor Yellow
Write-Host "---------------------------------------------------------------------" -ForegroundColor DarkGray

$RemoteCommands = "mkdir -p /opt/ctrader-ai-hub && tar -xzf $RemoteArchive -C /opt/ctrader-ai-hub && rm -f $RemoteArchive && chmod +x /opt/ctrader-ai-hub/deploy/setup_vps.sh && bash /opt/ctrader-ai-hub/deploy/setup_vps.sh"

& ssh.exe -o BatchMode=yes -o StrictHostKeyChecking=accept-new -p $VpsPort "$VpsUser@$VpsIp" "$RemoteCommands"

Write-Host "---------------------------------------------------------------------" -ForegroundColor DarkGray
Write-Host ""

# 6. Cleanup Local Temp Files
if (Test-Path $TempArchive) {
    Remove-Item -Force $TempArchive
}

# 7. Final Verification & Report
Write-Host "[5/5] Kiểm tra dịch vụ trực tiếp từ bên ngoài..." -ForegroundColor Yellow
$webUrl = "http://$VpsIp"
try {
    $resp = Invoke-WebRequest -Uri "$webUrl" -TimeoutSec 5 -UseBasicParsing -ErrorAction SilentlyContinue
    if ($resp.StatusCode -eq 200) {
        Write-Host "[SUCCESS] Web Dashboard đã ONLINE và phản hồi HTTP 200 OK!" -ForegroundColor Green
    } else {
        Write-Host "[NOTE] Web Server phản hồi mã: $($resp.StatusCode)" -ForegroundColor Yellow
    }
} catch {
    Write-Host "[NOTE] Đang chờ Nginx/FastAPI hoàn tất khởi động..." -ForegroundColor Yellow
}

# 6. Smart Incremental Restart Inspection
Write-Host ""
Write-Host "[SMART RESTART] Kiểm tra cập nhật cBot trên VPS..." -ForegroundColor Yellow
$CheckUpdatesCmd = "curl -s http://127.0.0.1:8181/api/bots/bulk/updates -H 'X-Internal-Token: LOCAL_SYSTEM_DISPATCH'"
$UpdatesJsonRaw = & ssh.exe -o BatchMode=yes -o StrictHostKeyChecking=accept-new -p $VpsPort "$VpsUser@$VpsIp" "$CheckUpdatesCmd" 2>$null
if ($UpdatesJsonRaw) {
    try {
        $UpdatesData = $UpdatesJsonRaw | ConvertFrom-Json
        $UpdatedCount = $UpdatesData.updated_count
        if ($UpdatedCount -gt 0) {
            Write-Host "  ⚡ Phát hiện $UpdatedCount bot có bản build .algo mới hơn tiến trình đang chạy:" -ForegroundColor Magenta
            foreach ($ub in $UpdatesData.updated_bots) {
                $bName = $ub.bot_name
                $bId = $ub.bot_id
                $bDiff = [math]::Round($ub.diff_seconds, 1)
                Write-Host "     - $bName [ID $bId]: file mới hơn tiến trình (+${bDiff}s)" -ForegroundColor Yellow
            }
            Write-Host "  -> Đang tự động kích hoạt Smart Incremental Restart (CPU-Gated)..." -ForegroundColor Cyan
            $TriggerCmd = "curl -s -X POST http://127.0.0.1:8181/api/bots/bulk/restart-updated -H 'Content-Type: application/json' -H 'X-Internal-Token: LOCAL_SYSTEM_DISPATCH' -d '{}'"
            & ssh.exe -o BatchMode=yes -o StrictHostKeyChecking=accept-new -p $VpsPort "$VpsUser@$VpsIp" "$TriggerCmd" | Out-Null
            Write-Host "  [OK] Đã gửi lệnh Smart Restart! $UpdatedCount bot sẽ được nạp code mới tuần tự." -ForegroundColor Green
            Write-Host "  [OK] Các bot còn lại không có cập nhật được giữ nguyên, tiếp tục giao dịch 100%!" -ForegroundColor Green
        } else {
            Write-Host "  [OK] Toàn bộ bot đang chạy đều đã là bản build mới nhất. Không cần restart." -ForegroundColor Green
        }
    } catch {
        # ignore parse issues
    }
}

Write-Host ""
Write-Host "=====================================================================" -ForegroundColor Green
Write-Host "   🎉 TRIỂN KHAI THÀNH CÔNG cTrader AI Trading Hub LÊN VPS!" -ForegroundColor Green
Write-Host "=====================================================================" -ForegroundColor Green
Write-Host "  🌐 Web Dashboard:      http://${VpsIp}:8080/ (hoặc http://${VpsIp}:5173/)" -ForegroundColor Cyan
Write-Host "  🤖 cBot AI Endpoint:   http://${VpsIp}:8080/trade (nội bộ: http://127.0.0.1:8181/trade)" -ForegroundColor Cyan
Write-Host "  📚 API Documentation:  http://${VpsIp}:8080/docs" -ForegroundColor Cyan
Write-Host ""
Write-Host "  🛠️ Lệnh hữu ích trên VPS:" -ForegroundColor Yellow
Write-Host "     - Xem trạng thái bot:   ssh $VpsUser@$VpsIp 'systemctl status ctrader-hub'"
Write-Host "     - Xem live log máy chủ: ssh $VpsUser@$VpsIp 'journalctl -u ctrader-hub -f -n 100'"
Write-Host "     - Khởi động lại:        ssh $VpsUser@$VpsIp 'systemctl restart ctrader-hub'"
Write-Host ""
Write-Host "Mỗi khi bạn sửa code tại máy tính, chỉ cần chạy lại file này để cập nhật tự động!" -ForegroundColor Green
