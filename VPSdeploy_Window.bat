@echo off
chcp 65001 >nul
setlocal EnableDelayedExpansion
title AI Gemini Server - VPS Windows 1-Click Deployment Launcher

:: Ensure script always executes in its own directory
cd /d "%~dp0"

echo =====================================================================
echo    [+] AI GEMINI TRADING SERVER - VPS WINDOWS 1-CLICK DEPLOYMENT
echo =====================================================================
echo.

:: 0. Pre-Flight Cross-Platform Compatibility Audit
echo [PRE-FLIGHT] Running Cross-Platform Compliance Audit...
if exist ".agents\skills\vps-cross-platform-auditor\scripts\audit_cross_platform.py" (
    python .agents\skills\vps-cross-platform-auditor\scripts\audit_cross_platform.py
    if !ERRORLEVEL! NEQ 0 (
        echo [ERROR] Audit failed! Please resolve cross-platform issues before deploying.
        pause
        exit /b 1
    )
)
echo.

:: 1. Load Host IP Address from VPS_IP.txt (or Auto-detect)
set "SERVER_IP="

if exist "VPS_IP.txt" (
    for /f "usebackq tokens=* eol=# delims=" %%i in ("VPS_IP.txt") do (
        set "line=%%i"
        set "line=!line: =!"
        if "!line:~0,7!"=="VPS_IP=" (
            set "SERVER_IP=!line:~7!"
        ) else if "!line:~0,10!"=="SERVER_IP=" (
            set "SERVER_IP=!line:~10!"
        ) else if not "!line!"=="" (
            set "SERVER_IP=!line!"
        )
    )
    if not "!SERVER_IP!"=="" (
        echo [INFO] Loaded Server IP from VPS_IP.txt: !SERVER_IP!
    )
)

if "!SERVER_IP!"=="" (
    echo [INFO] VPS_IP.txt not configured. Auto-detecting public IP via api.ipify.org...
    for /f "tokens=*" %%a in ('powershell -NoProfile -ExecutionPolicy Bypass -Command "(Invoke-RestMethod -Uri https://api.ipify.org -TimeoutSec 3).Trim()" 2^>nul') do (
        if not "%%a"=="" set "SERVER_IP=%%a"
    )
    if "!SERVER_IP!"=="" set "SERVER_IP=127.0.0.1"
    echo # Enter your Public VPS IP Address or Custom Domain Name below> VPS_IP.txt
    echo !SERVER_IP!>> VPS_IP.txt
    echo [INFO] Detected Server IP: !SERVER_IP! (Saved to VPS_IP.txt)
)
echo.

:: 2. Terminate Any Stale / Hanging Instances on Ports 8181 and 5173
echo [1/6] Cleaning up old port instances 8181 and 5173...
powershell -NoProfile -ExecutionPolicy Bypass -Command "Get-NetTCPConnection -LocalPort 8181,5173 -State Listen -ErrorAction SilentlyContinue | ForEach-Object { Stop-Process -Id $_.OwningProcess -Force -ErrorAction SilentlyContinue }" >nul 2>&1
echo [SUCCESS] Ports 8181 and 5173 are clean and ready.
echo.

:: 3. Check and Configure Windows Firewall for Remote Access
echo [2/6] Checking Windows Firewall rules for remote access...
net session >nul 2>&1
if %ERRORLEVEL% EQU 0 (
    netsh advfirewall firewall show rule name="Trading Hub Backend 8181" >nul 2>&1
    if %ERRORLEVEL% NEQ 0 (
        echo  - Opening inbound TCP port 8181 for FastAPI Backend...
        netsh advfirewall firewall add rule name="Trading Hub Backend 8181" dir=in action=allow protocol=TCP localport=8181 >nul 2>&1
    )
    netsh advfirewall firewall show rule name="Trading Hub Frontend 5173" >nul 2>&1
    if %ERRORLEVEL% NEQ 0 (
        echo  - Opening inbound TCP port 5173 for React Web Dashboard...
        netsh advfirewall firewall add rule name="Trading Hub Frontend 5173" dir=in action=allow protocol=TCP localport=5173 >nul 2>&1
    )
    echo [SUCCESS] Windows Firewall configured for remote access.
) else (
    echo [NOTE] Running without Administrator rights.
)
echo.

:: 4. Verify Configuration Files
echo [3/6] Verifying environment configuration files...
if not exist "telegram.env" (
    if exist "telegrame.env" (
        copy "telegrame.env" "telegram.env" >nul
        echo  - Standardized telegrame.env to telegram.env
    ) else (
        echo groupID=YOUR_TELEGRAM_CHAT_ID> telegram.env
        echo bot_token=YOUR_TELEGRAM_BOT_TOKEN>> telegram.env
        echo  - Initialized default telegram.env template.
    )
) else (
    echo  - [telegram.env] OK
)

if not exist "API_key.env" (
    if exist "API_key.env.example" (
        copy "API_key.env.example" "API_key.env" >nul
        echo  - Initialized API_key.env from example template.
    ) else (
        echo QWEN_API_KEY=> API_key.env
        echo GEMINI_API_KEY=> API_key.env
        echo DEEPSEEK_API_KEY=> API_key.env
        echo OPENAI_API_KEY=> API_key.env
        echo  - Initialized blank API_key.env
    )
) else (
    echo  - [API_key.env] OK
)

if not exist "account_login.env" (
    echo ADMIN_USERNAME=admin> account_login.env
    echo ADMIN_PASSWORD=password123>> account_login.env
    echo.>> account_login.env
    echo GUEST_USERNAME=guest>> account_login.env
    echo GUEST_PASSWORD=guest>> account_login.env
    echo  - Initialized default account_login.env
) else (
    echo  - [account_login.env] OK
)

if not exist "VPS_IP.txt" (
    if exist "VPS_IP.txt.example" (
        copy "VPS_IP.txt.example" "VPS_IP.txt" >nul
        echo  - Initialized VPS_IP.txt from example template.
    ) else (
        echo 127.0.0.1> VPS_IP.txt
        echo  - Initialized default VPS_IP.txt
    )
) else (
    echo  - [VPS_IP.txt] OK
)
echo [SUCCESS] All configuration files verified.
echo.

:: 5. Verify and Update Python and Node Dependencies
echo [4/6] Checking and updating Python and Node dependencies...
if not exist "venv\Scripts\activate.bat" (
    echo [SETUP] Creating Python virtual environment...
    python -m venv venv
    call venv\Scripts\activate.bat
    echo [SETUP] Installing Python requirements...
    pip install -r requirements.txt
) else (
    call venv\Scripts\activate.bat
    pip install -r requirements.txt --quiet
)

if not exist "frontend\node_modules" (
    echo [SETUP] Installing frontend npm packages...
    pushd frontend
    call npm install
    popd
)
echo  - Building High-Speed Production Frontend Bundle (dist/)...
pushd frontend
call npm run build
popd
echo [SUCCESS] Dependencies verified and production bundle built.
echo.

:: 6. Build and Deploy cBots to cTrader Robots directory
echo [5/6] Building cBots and deploying algo packages...
where dotnet >nul 2>&1
if %ERRORLEVEL% EQU 0 (
    echo  - Compiling Asian Range Judas Sweep AI Bot...
    dotnet build "cbot\Asian Range Judas Sweep AI Bot\Asian Range Judas Sweep AI Bot\Asian Range Judas Sweep AI Bot.csproj" -c Release --nologo -v q >nul 2>&1
    echo  - Compiling Smart Trend and AI Agent XAU M15...
    dotnet build "cbot\Smart Trend and AI Agent XAU M15\Smart Trend and AI Agent XAU M15\Smart Trend and AI Agent XAU M15.csproj" -c Release --nologo -v q >nul 2>&1
    echo  - Compiling cbot_agent_template...
    dotnet build "cbot\cbot_agent_template\cbot_agent_template\cbot_agent_template.csproj" -c Release --nologo -v q >nul 2>&1
    echo [SUCCESS] All cBots compiled cleanly and synced to cTrader Robots directory.
) else (
    echo [NOTE] Dotnet SDK not detected in PATH. Skipping background compilation.
)
echo.

:: 7. Launch FastAPI Backend and React Frontend
echo [6/6] Launching Server Services...
echo  - Starting High-Speed Production Server (FastAPI + SPA) on 0.0.0.0:8181...
start "VPS FastAPI Backend" cmd /k "cd /d ""%~dp0"" && chcp 65001 >nul && call venv\Scripts\activate.bat && set PYTHONUNBUFFERED=1 && set HEADLESS=False && uvicorn main:app --host 0.0.0.0 --port 8181 --log-level info --access-log"

echo  - Starting Optional Vite Dev Server on 0.0.0.0:5173...
start "VPS React Frontend" cmd /k "cd /d ""%~dp0frontend"" && chcp 65001 >nul && npm run dev -- --host 0.0.0.0 --port 5173"

:: 8. Summary Dashboard HUD
echo.
echo =====================================================================
echo   REMOTE ACCESS ENDPOINTS:
echo   -------------------------------------------------------------------
echo   - 🔥 Production UI (Instant Load) : http://!SERVER_IP!:8181
echo   - 🛠️ Dev Server UI (Development)  : http://!SERVER_IP!:5173
echo   - 📖 Backend API & Documentation  : http://!SERVER_IP!:8181/docs
echo   - 💻 Localhost High-Speed Link    : http://localhost:8181
echo =====================================================================
echo.
pause
