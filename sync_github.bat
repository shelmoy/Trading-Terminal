@echo off
title OpenAlgo - Git Sync to GitHub
cd /d "%~dp0"
echo ====================================================
echo        OpenAlgo - GitHub Version Control Sync
echo ====================================================
echo.

git status --short

echo.
set /p commit_msg="Enter commit message (or press Enter for auto-generated message): "
if "%commit_msg%"=="" (
    for /f "tokens=2 delims==" %%I in ('wmic os get localdatetime /value') do set datetime=%%I
    set commit_msg=Update OpenAlgo - %datetime:~0,4%-%datetime:~4,2%-%datetime:~6,2% %datetime:~8,2%:%datetime:~10,2%
)

echo.
echo Staging changes...
git add -A

echo Committing changes...
git commit -m "%commit_msg%"

echo.
echo Pushing to GitHub (origin main)...
git push origin main

if %errorlevel% equ 0 (
    echo.
    echo ====================================================
    echo   SUCCESS: Changes successfully pushed to GitHub!
    echo ====================================================
) else (
    echo.
    echo ====================================================
    echo   NOTE: If push was rejected, you may need to pull:
    echo   git pull --rebase origin main
    echo   and then run this script again.
    echo ====================================================
)

echo.
pause
