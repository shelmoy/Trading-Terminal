@echo off
title Restart OpenAlgo Server...
cd /d "%~dp0"

echo ============================================================
echo   Stopping OpenAlgo Server...
echo ============================================================

call "%~dp0stop_openalgo.bat"
timeout /t 2 /nobreak >nul

echo ============================================================
echo   Starting OpenAlgo Server...
echo ============================================================

start "OpenAlgo Backend" powershell -Command "cd 'C:\Users\ashut\.gemini\antigravity\scratch\openalgo'; uv run app.py"

echo OpenAlgo restarted successfully!
timeout /t 3 /nobreak >nul
exit /b 0
