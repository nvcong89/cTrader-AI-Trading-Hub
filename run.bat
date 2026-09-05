@echo off
title AI Gemini Server - 1-Click Startup Script
chcp 65001 >nul
echo ===================================================
echo   AI Gemini Server - 1-Click Startup Script (React + FastAPI)
echo ===================================================
echo.
echo [1/2] Starting FastAPI Backend on port 8181...
start "FastAPI Backend" cmd /k "chcp 65001 >nul && call venv\Scripts\activate.bat && set PYTHONUNBUFFERED=1 && set HEADLESS=False && uvicorn main:app --host 127.0.0.1 --port 8181 --log-level info --access-log"

echo.
echo [2/2] Starting React Frontend on port 5173...
start "React Frontend" cmd /k "cd frontend && chcp 65001 >nul && npm run dev"

echo.
echo ===================================================
echo   All services started in separate terminal windows!
echo   - Backend API: http://127.0.0.1:8181
echo   - Frontend UI: http://localhost:5173
echo ===================================================
echo.
pause
