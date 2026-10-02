@echo off
title OpenAlgo v2.0.2.6
cd /d "%~dp0"
echo ============================================================
echo   Starting OpenAlgo (Latest v2.0.2.6)
echo   Local Web App : http://127.0.0.1:5000
echo   Initial Setup : http://127.0.0.1:5000/setup
echo ============================================================
uv run app.py
pause
