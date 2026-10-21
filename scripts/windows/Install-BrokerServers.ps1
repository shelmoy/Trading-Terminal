[CmdletBinding()]
param(
    [string]$PrimaryRoot = (Join-Path $env:USERPROFILE '.gemini\antigravity\scratch\openalgo'),
    [string]$FyersRoot = 'C:\OpenAlgo-FYERS',
    [string]$InstallRoot = (Join-Path $env:LOCALAPPDATA 'OpenAlgo\ServerControl')
)
$ErrorActionPreference = 'Stop'
$InstallRoot = [IO.Path]::GetFullPath($InstallRoot)
foreach ($root in @($PrimaryRoot, $FyersRoot)) {
    if (-not (Test-Path -LiteralPath (Join-Path $root 'app.py'))) { throw "OpenAlgo was not found in $root" }
}
foreach ($name in @('BrokerServers.ps1', 'run_broker_instance.py')) {
    if (-not (Test-Path -LiteralPath (Join-Path $PSScriptRoot $name))) { throw "Missing controller source: $name" }
}
New-Item -ItemType Directory -Path $InstallRoot -Force | Out-Null
$stamp = Get-Date -Format 'yyyyMMdd-HHmmss-fff'
$backupRoot = Join-Path $InstallRoot "backups\$stamp"
New-Item -ItemType Directory -Path $backupRoot -Force | Out-Null
$legacyTargets = @()
foreach ($root in @($PrimaryRoot, $FyersRoot)) {
    foreach ($name in @('open_openalgo.bat', 'stop_openalgo.bat', 'restart_openalgo.bat')) {
        $legacyTargets += [IO.Path]::GetFullPath((Join-Path $root $name))
    }
}
$legacyTargets += @((Join-Path $FyersRoot 'Start-FYERS.cmd'), (Join-Path $FyersRoot 'Stop-FYERS.cmd'))
$shell = New-Object -ComObject WScript.Shell
$shortcutFolders = @(
    [Environment]::GetFolderPath('Desktop'),
    [Environment]::GetFolderPath('Programs'),
    [Environment]::GetFolderPath('Startup')
) | Select-Object -Unique
$retired = @()
foreach ($folder in $shortcutFolders) {
    foreach ($file in @(Get-ChildItem -LiteralPath $folder -Filter '*.lnk' -File -Recurse -ErrorAction SilentlyContinue | Where-Object { $_.BaseName -match 'OpenAlgo|FYERS|Kotak' })) {
        $shortcut = $shell.CreateShortcut($file.FullName)
        if ($shortcut.TargetPath -in $legacyTargets) {
            Copy-Item -LiteralPath $file.FullName -Destination (Join-Path $backupRoot ($retired.Count.ToString() + '-' + $file.Name))
            $retired += $file.FullName
        }
    }
}
foreach ($name in @('BrokerServers.ps1', 'run_broker_instance.py', 'TradingServers.ico')) {
    $destination = Join-Path $InstallRoot $name
    if (Test-Path -LiteralPath $destination) { Copy-Item -LiteralPath $destination -Destination (Join-Path $backupRoot ('previous-' + $name)) }
}
foreach ($name in @('BrokerServers.ps1', 'run_broker_instance.py')) {
    Copy-Item -LiteralPath (Join-Path $PSScriptRoot $name) -Destination (Join-Path $InstallRoot $name) -Force
}

# A vector-drawn two-server icon, kept with the controller rather than the app.
Add-Type -AssemblyName System.Drawing
if (-not ('BrokerServersIconNative' -as [type])) {
    Add-Type -TypeDefinition 'public static class BrokerServersIconNative { [System.Runtime.InteropServices.DllImport("user32.dll")] public static extern bool DestroyIcon(System.IntPtr handle); }'
}
$bitmap = New-Object Drawing.Bitmap(128, 128)
$graphics = [Drawing.Graphics]::FromImage($bitmap)
$graphics.SmoothingMode = [Drawing.Drawing2D.SmoothingMode]::AntiAlias
$graphics.Clear([Drawing.Color]::Transparent)
$background = New-Object Drawing.SolidBrush([Drawing.ColorTranslator]::FromHtml('#2563eb'))
$ink = New-Object Drawing.SolidBrush([Drawing.Color]::White)
$light = New-Object Drawing.SolidBrush([Drawing.ColorTranslator]::FromHtml('#34d399'))
$graphics.FillEllipse($background, 2, 2, 124, 124)
foreach ($top in @(33, 70)) {
    $graphics.FillRectangle($ink, 28, $top, 72, 25)
    $graphics.FillEllipse($light, 81, ($top + 7), 11, 11)
    $graphics.FillRectangle($background, 36, ($top + 9), 30, 6)
}
$handle = $bitmap.GetHicon()
$icon = [Drawing.Icon]::FromHandle($handle)
$stream = [IO.File]::Create((Join-Path $InstallRoot 'TradingServers.ico'))
try { $icon.Save($stream) } finally {
    $stream.Dispose(); $icon.Dispose(); $graphics.Dispose(); $bitmap.Dispose()
    $background.Dispose(); $ink.Dispose(); $light.Dispose()
    [BrokerServersIconNative]::DestroyIcon($handle) | Out-Null
}

$desktop = [Environment]::GetFolderPath('Desktop')
$linkPath = Join-Path $desktop 'Trading Servers.lnk'
$engine = Join-Path $env:WINDIR 'System32\WindowsPowerShell\v1.0\powershell.exe'
if (Test-Path -LiteralPath $linkPath) {
    $existing = $shell.CreateShortcut($linkPath)
    if ($existing.TargetPath -ne $engine -or $existing.Arguments -notlike ('*' + (Join-Path $InstallRoot 'BrokerServers.ps1') + '*')) {
        throw 'A different Trading Servers shortcut already exists. It was preserved.'
    }
}
$link = $shell.CreateShortcut($linkPath)
$link.TargetPath = $engine
$link.Arguments = '-NoProfile -ExecutionPolicy Bypass -STA -WindowStyle Hidden -File "{0}" -PrimaryRoot "{1}" -FyersRoot "{2}" -StateRoot "{3}"' -f (Join-Path $InstallRoot 'BrokerServers.ps1'), $PrimaryRoot, $FyersRoot, $InstallRoot
$link.WorkingDirectory = $InstallRoot
$link.IconLocation = (Join-Path $InstallRoot 'TradingServers.ico') + ',0'
$link.Description = 'Start, stop or restart Kotak and FYERS; open both in Chrome.'
$link.Save()

foreach ($path in $retired) { Remove-Item -LiteralPath $path }
$retired | ConvertTo-Json | Set-Content -LiteralPath (Join-Path $backupRoot 'retired-shortcuts.json') -Encoding UTF8
# Retire only the old FYERS start/stop helper. Credential configuration is separate.
foreach ($relative in @('Start-FYERS.cmd', 'Stop-FYERS.cmd', 'local-setup\manage_fyers.ps1')) {
    $path = Join-Path $FyersRoot $relative
    if (Test-Path -LiteralPath $path) {
        Copy-Item -LiteralPath $path -Destination (Join-Path $backupRoot ([IO.Path]::GetFileName($path)))
        Remove-Item -LiteralPath $path
    }
}
Write-Output "Installed: $linkPath"
Write-Output "Controller: $InstallRoot"
Write-Output "Old launcher recovery files: $backupRoot"
