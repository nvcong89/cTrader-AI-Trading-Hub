[CmdletBinding()]
param (
    [Parameter(Mandatory = $true)]
    [string]$NewBotName,

    [Parameter(Mandatory = $false)]
    [string]$StrategyDescription = ""
)

$ErrorActionPreference = "Stop"

$workspaceRoot = Split-Path -Parent (Split-Path -Parent (Split-Path -Parent (Split-Path -Parent $PSScriptRoot)))
if (-not (Test-Path (Join-Path $workspaceRoot "cbot"))) {
    $workspaceRoot = "c:\Users\210608\Documents\GitHub\cTrader-AI-Trading-Hub"
}

$templateDir = Join-Path $workspaceRoot "cbot\cbot_agent_template"

if (-not (Test-Path $templateDir)) {
    Write-Host "Template directory not found: $templateDir" -ForegroundColor Red
    exit 1
}

# Sanitize class name (remove spaces, dots, dashes for valid C# identifier)
$sanitizedClassName = $NewBotName -replace '[^a-zA-Z0-9_]', '_'
if ($sanitizedClassName -match '^[0-9]') { $sanitizedClassName = "Bot_" + $sanitizedClassName }

$targetProjectDir = Join-Path $workspaceRoot "cbot\$NewBotName"

Write-Host "======================================================" -ForegroundColor Cyan
Write-Host "  cTrader cBot Automated Generator Agent               " -ForegroundColor Cyan
Write-Host "======================================================" -ForegroundColor Cyan
Write-Host "Bot Name   : $NewBotName" -ForegroundColor Yellow
Write-Host "Class Name : $sanitizedClassName" -ForegroundColor Yellow
Write-Host "Target Dir : $targetProjectDir" -ForegroundColor Yellow

if (Test-Path $targetProjectDir) {
    Write-Host "Target project directory already exists: $targetProjectDir" -ForegroundColor Red
    exit 1
}

# 1. Create Root Directory & Inner Subfolder (cTrader 5.x Native Architecture)
$targetInnerDir = Join-Path $targetProjectDir $NewBotName
New-Item -ItemType Directory -Path $targetInnerDir -Force | Out-Null

# 2. Copy & Process root .sln file
$slnFile = Get-ChildItem -Path $templateDir -Filter "*.sln" | Select-Object -First 1
if ($slnFile) {
    $destSlnPath = Join-Path $targetProjectDir "$NewBotName.sln"
    $slnContent = Get-Content -Path $slnFile.FullName -Raw
    $slnContent = $slnContent -replace 'cbot_agent_template', $NewBotName
    Set-Content -Path $destSlnPath -Value $slnContent -Encoding UTF8
    Write-Host "Created Solution: $NewBotName.sln" -ForegroundColor DarkGreen
}

# 3. Copy & Process inner project files (.cs, .csproj, GlobalUsings.cs)
$innerTemplateFiles = Get-ChildItem -Path (Join-Path $templateDir "cbot_agent_template") -File -ErrorAction SilentlyContinue
if (-not $innerTemplateFiles) {
    $innerTemplateFiles = Get-ChildItem -Path $templateDir -File | Where-Object { $_.Extension -ne '.sln' }
}

foreach ($file in $innerTemplateFiles) {
    $destFileName = $file.Name -replace 'cbot_agent_template', $NewBotName
    if ($file.Extension -eq '.cs' -and $file.Name -notmatch 'GlobalUsings') {
        $destFileName = "$NewBotName.cs"
    }
    $destPath = Join-Path $targetInnerDir $destFileName

    $content = Get-Content -Path $file.FullName -Raw
    $content = $content -replace 'public class cbot_agent_template', "public class $sanitizedClassName"
    $content = $content -replace 'cbot_agent_template', $NewBotName

    Set-Content -Path $destPath -Value $content -Encoding UTF8
    Write-Host "Created Project File: $destFileName" -ForegroundColor DarkGreen
}

# 4. Generate Strategy Documentation (docs/<NewBotName>.md)
$docsDir = Join-Path $workspaceRoot "docs"
if (-not (Test-Path $docsDir)) { New-Item -ItemType Directory -Path $docsDir -Force | Out-Null }

$docPath = Join-Path $docsDir "$NewBotName.md"
if (-not (Test-Path $docPath)) {
    $descText = if ($StrategyDescription) { $StrategyDescription } else { "Chiến thuật giao dịch tự động tích hợp Gemini AI Co-Pilot." }
    $docContent = @"
# 🤖 Chiến Thuật: $NewBotName

Tài liệu thiết kế kiến trúc và chiến thuật giao dịch cho **$NewBotName** (được khởi tạo từ chuẩn cbot_agent_template).

---

## 1. 🎯 Tổng Quan & Triết Lý Chiến Thuật
- **Tên cBot**: $NewBotName
- **Mô tả**: $descText
- **Cặp giao dịch mục tiêu**: `XAUUSD`
- **Khung thời gian**: `M15`

---

## 2. 📊 Hệ Thống Phân Tích Kỹ Thuật (TA Engine)
- **Chỉ báo**: Fast EMA, Slow EMA, RSI, ATR.
- **Điều kiện BUY / SELL**: Tín hiệu kích hoạt xu hướng kết hợp bộ lọc rủi ro.

---

## 3. 🤖 Tích Hợp Gemini AI Agent
- Gửi Market Snapshot thời gian thực tới `/trade`.
- Tiếp nhận và thực thi các lệnh `BUY`, `SELL`, `HOLD`, `ADJUST`, `CLOSE_ALL`.

---

## 4. 🛡️ Quản Lý Vốn & Rủi Ro
- Dynamic Volume sizing, SL/TP theo % Equity / Pips.
- High-Watermark Circuit Breaker, Break-Even, Trailing Stop, DCA Grid.

---

## 5. 📰 Bộ Lọc Tin Tức (News Filter)
- ForexFactory High-Impact News protection.

---

## 6. 📋 Bảng Tham Số Cấu Hình (Parameters Table)
- Được cấu hình trực quan thông qua Web UI Dynamic Parameter Studio.
"@
    Set-Content -Path $docPath -Value $docContent -Encoding UTF8
    Write-Host "Created Strategy Documentation: docs/$NewBotName.md" -ForegroundColor DarkGreen
}

# 5. Compile newly generated bot
Write-Host "`nProject generation complete. Compiling new bot..." -ForegroundColor Cyan
$targetCsproj = Join-Path $targetInnerDir "$NewBotName.csproj"

if (Test-Path $targetCsproj) {
    dotnet build $targetCsproj -c Release
    if ($LASTEXITCODE -eq 0) {
        $binAlgo = Join-Path $targetInnerDir "bin\Release\net6.0\$NewBotName.algo"
        $rootAlgo = Join-Path $workspaceRoot "$NewBotName.algo"
        if (Test-Path $binAlgo) {
            Copy-Item -Path $binAlgo -Destination $rootAlgo -Force
            Write-Host "Saved package: $NewBotName.algo to root workspace" -ForegroundColor Green

            if (Get-Command ctrader-cli -ErrorAction SilentlyContinue) {
                Write-Host "Verifying metadata with ctrader-cli..." -ForegroundColor Cyan
                ctrader-cli metadata "$rootAlgo"
            }
        }
    }
}
