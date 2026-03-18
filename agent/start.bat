@echo off
pushd "%~dp0"
title Personal AI Assistant - Windows Agent
echo ========================================
echo   Personal AI Assistant - Windows Agent
echo ========================================
echo.

:: Check if Python is available
python --version >/dev/null 2>&1
if %errorlevel% neq 0 (
    echo ERROR: Python not found in PATH
    echo Please install Python or add it to PATH
    pause
    popd
    exit /b 1
)

:: Copy .env if not exists
if not exist ".env" (
    if exist ".env.example" (
        copy ".env.example" ".env" >nul
        echo Created .env from .env.example
        echo Please edit .env and add your API keys
        notepad .env
        pause
    )
)

:: Install dependencies
echo Installing dependencies...
python -m pip install -r requirements.txt --quiet

:: Start agent
echo Starting agent...
echo.
python agent.py

popd
pause
