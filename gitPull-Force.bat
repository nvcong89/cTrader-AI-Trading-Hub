@echo off
title Force Pull from Origin (Agent Gemini Server)
chcp 65001 >nul
echo ======================================================
echo   Agent Gemini Server - Force Pull from Origin
echo ======================================================
echo.

echo [1/3] Fetching latest commits from remote origin...
git fetch --all --prune
if %ERRORLEVEL% NEQ 0 (
    echo.
    echo [ERROR] Failed to fetch from remote origin. Please check your internet connection or git credentials.
    pause
    exit /b %ERRORLEVEL%
)

echo.
echo [2/3] Resetting local branch to origin/main (discarding conflicting local changes)...
git reset --hard origin/main
if %ERRORLEVEL% NEQ 0 (
    echo.
    echo [ERROR] Failed to reset branch to origin/main.
    pause
    exit /b %ERRORLEVEL%
)

echo.
echo [3/3] Cleaning untracked build artifacts (preserving credentials and databases)...
git clean -fd -e *.env -e .runtime_pwd* -e ctrader_account.txt -e *.db*

echo.
echo Current Git Status:
git status
echo.
echo ======================================================
echo   SUCCESS! Workspace is now 100%% synced with origin/main.
echo ======================================================
echo.
pause
