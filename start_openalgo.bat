@echo off
title OpenAlgo Server
cd /d "%~dp0"
echo ====================================================
echo Starting OpenAlgo Trading Terminal...
echo Host: http://127.0.0.1:5000
echo ====================================================

REM Check if uv is installed, otherwise install or use python
where uv >nul 2>nul
if %errorlevel% neq 0 (
    echo [INFO] UV package manager not found. Checking Python...
    where python >nul 2>nul
    if %errorlevel% neq 0 (
        echo [ERROR] Python is not installed or not in PATH!
        echo Please install Python 3.11+ from https://www.python.org/downloads/
        pause
        exit /b 1
    )
    echo [INFO] Installing UV for fast, isolated execution...
    python -m pip install uv
)

REM Precompress frontend assets if needed
if exist utils\precompress_assets.py (
    uv run python utils/precompress_assets.py >nul 2>nul
)

REM Open browser after 2 seconds in the background
start "" cmd /c "timeout /t 2 /nobreak >nul && start http://127.0.0.1:5000"

REM Run OpenAlgo
uv run app.py
if %errorlevel% neq 0 (
    echo [WARNING] UV run failed. Attempting with standard Python...
    python app.py
)
pause
