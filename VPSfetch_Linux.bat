@echo off
chcp 65001 >nul
title cTrader AI Hub - 1-Click VPS Data & Logs Fetcher
cls
echo =====================================================================
echo    cTrader AI Hub - Tải portfolio.db và Logs từ Linux VPS về Local
echo =====================================================================
echo.

powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0fetch_from_vps.ps1"

echo.
pause
