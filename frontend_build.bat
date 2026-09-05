@echo off
echo ===================================================
echo AI Gemini Server - Frontend Production Build Script
echo ===================================================

cd /d "%~dp0frontend"

echo.
echo Checking Node.js environment...
call npm --version >nul 2>&1
if %ERRORLEVEL% NEQ 0 (
    echo [ERROR] Node.js / npm is not found in PATH. Please install Node.js!
    pause
    exit /b 1
)

echo.
echo Building React Frontend for Production (TypeScript + Vite)...
echo.
call npm run build

if %ERRORLEVEL% EQU 0 (
    echo.
    echo ===================================================
    echo [SUCCESS] Frontend production build succeeded!
    echo Output directory: frontend\dist
    echo ===================================================
) else (
    echo.
    echo ===================================================
    echo [ERROR] Frontend build failed with errors above.
    echo ===================================================
)

echo.
pause
