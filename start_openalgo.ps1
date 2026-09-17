$PSScriptRoot = Split-Path -Parent $MyInvocation.MyCommand.Path
Set-Location $PSScriptRoot

Write-Host "====================================================" -ForegroundColor Cyan
Write-Host " Starting OpenAlgo Trading Terminal...              " -ForegroundColor Cyan
Write-Host " Host: http://127.0.0.1:5000                        " -ForegroundColor Cyan
Write-Host "====================================================" -ForegroundColor Cyan

if (-not (Get-Command uv -ErrorAction SilentlyContinue)) {
    Write-Host "[INFO] UV not found. Installing UV via pip..." -ForegroundColor Yellow
    python -m pip install uv
}

if (Test-Path "utils/precompress_assets.py") {
    uv run python utils/precompress_assets.py 2>$null
}

Start-Process "http://127.0.0.1:5000"
uv run app.py
