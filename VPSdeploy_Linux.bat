@echo off
title cTrader AI Trading Hub - 1-Click Linux VPS Deployment
chcp 65001 >nul
cd /d "%~dp0"

echo =====================================================================
echo    cTrader AI Trading Hub - 1-Click Remote Linux VPS Deployment
echo =====================================================================
echo.

powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0deploy_to_vps.ps1"

echo.
pause
