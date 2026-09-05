@echo off
chcp 65001 >nul
title 1-Click Multi-Database Merger - cTrader AI Trading Hub
color 0A

echo ======================================================================
echo    🔀 1-CLICK MULTI-DATABASE MERGER (cTrader AI Trading Hub)
echo ======================================================================
echo.

set "SCRIPT_DIR=%~dp0"
set "PYTHON_EXE=python"

if exist "%SCRIPT_DIR%..\venv\Scripts\python.exe" (
    set "PYTHON_EXE=%SCRIPT_DIR%..\venv\Scripts\python.exe"
)

"%PYTHON_EXE%" --version >nul 2>&1
if %ERRORLEVEL% neq 0 (
    color 0C
    echo [LỖI] Không tìm thấy Python trên máy tính của bạn!
    echo Vui lòng cài đặt Python 3.10+ hoặc khởi động từ môi trường ảo venv.
    echo.
    pause
    exit /b 1
)

echo [INFO] Sử dụng Python: %PYTHON_EXE%
echo [INFO] Đang quét và hợp nhất các file .db trong thư mục...
echo.

"%PYTHON_EXE%" "%SCRIPT_DIR%merge_all.py"

echo.
echo ======================================================================
echo Nhấn phím bất kỳ để thoát cửa sổ...
pause >nul
