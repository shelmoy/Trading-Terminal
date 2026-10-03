@echo off
setlocal enabledelayedexpansion
title OpenAlgo Launcher
cd /d "%~dp0"

echo ============================================================
echo   Checking OpenAlgo Server...
echo ============================================================

set RUNNING=0
for /f "tokens=5" %%a in ('netstat -aon ^| findstr ":5000" ^| findstr "LISTENING"') do (
    set RUNNING=1
)

if "!RUNNING!"=="0" (
    echo OpenAlgo is not running. Starting OpenAlgo server in background...
    start /min "OpenAlgo Backend" powershell -WindowStyle Minimized -Command "cd 'C:\Users\ashut\.gemini\antigravity\scratch\openalgo'; uv run app.py"
    
    echo Waiting for server to initialize...
    set WAIT_COUNT=0
    :WAIT_LOOP
    timeout /t 1 /nobreak >nul
    set /a WAIT_COUNT+=1
    for /f "tokens=5" %%a in ('netstat -aon ^| findstr ":5000" ^| findstr "LISTENING"') do (
        set RUNNING=1
        goto LAUNCH_CHROME
    )
    if !WAIT_COUNT! lss 15 goto WAIT_LOOP
)

:LAUNCH_CHROME
echo Server ready! Launching Chrome...
if exist "C:\Program Files\Google\Chrome\Application\chrome.exe" (
    start "" "C:\Program Files\Google\Chrome\Application\chrome.exe" "http://127.0.0.1:5000"
) else if exist "C:\Program Files (x86)\Google\Chrome\Application\chrome.exe" (
    start "" "C:\Program Files (x86)\Google\Chrome\Application\chrome.exe" "http://127.0.0.1:5000"
) else (
    start "" "http://127.0.0.1:5000"
)

exit /b 0
