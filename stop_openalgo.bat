@echo off
title Stopping OpenAlgo...
cd /d "%~dp0"

for /f "tokens=5" %%a in ('netstat -aon ^| findstr ":5000" ^| findstr "LISTENING"') do (
    taskkill /F /PID %%a >nul 2>&1
)

wmic process where "commandline like '%%app.py%%' and name like '%%python%%'" call terminate >nul 2>&1

exit /b 0
