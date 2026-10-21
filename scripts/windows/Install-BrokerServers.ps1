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
foreach ($name in @('BrokerServers.ps1', 'BrokerServers.UI.ps1', 'run_broker_instance.py', 'New-TradingServersIcon.ps1')) {
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
    [Environment]::GetFolderPath('CommonDesktopDirectory'),
    (Join-Path $env:USERPROFILE 'Desktop'),
    (Join-Path $env:USERPROFILE 'OneDrive\Desktop'),
    [Environment]::GetFolderPath('Programs'),
    [Environment]::GetFolderPath('Startup')
) | Select-Object -Unique
$retired = @()
foreach ($folder in $shortcutFolders) {
    if (-not $folder -or -not (Test-Path -LiteralPath $folder)) { continue }
    foreach ($file in @(Get-ChildItem -LiteralPath $folder -Filter '*.lnk' -File -Recurse -ErrorAction SilentlyContinue | Where-Object { $_.BaseName -match 'OpenAlgo|FYERS|Kotak' })) {
        $shortcut = $shell.CreateShortcut($file.FullName)
        if ($shortcut.TargetPath -in $legacyTargets) {
            Copy-Item -LiteralPath $file.FullName -Destination (Join-Path $backupRoot ($retired.Count.ToString() + '-' + $file.Name))
            $retired += $file.FullName
        }
    }
}
foreach ($name in @('BrokerServers.ps1', 'BrokerServers.UI.ps1', 'run_broker_instance.py', 'TradingServers.ico', 'TradingServers-Glass.ico')) {
    $destination = Join-Path $InstallRoot $name
    if (Test-Path -LiteralPath $destination) { Copy-Item -LiteralPath $destination -Destination (Join-Path $backupRoot ('previous-' + $name)) }
}
foreach ($name in @('BrokerServers.ps1', 'BrokerServers.UI.ps1', 'run_broker_instance.py')) {
    Copy-Item -LiteralPath (Join-Path $PSScriptRoot $name) -Destination (Join-Path $InstallRoot $name) -Force
}

# Multi-resolution glass icon, versioned to invalidate stale shell icon cache.
& (Join-Path $PSScriptRoot 'New-TradingServersIcon.ps1') -Path (Join-Path $InstallRoot 'TradingServers-Glass.ico')

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
$link.IconLocation = (Join-Path $InstallRoot 'TradingServers-Glass.ico') + ',0'
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

# Notify Explorer without restarting it or disturbing any open app windows.
if (-not ('TradingDesktopRefresh' -as [type])) {
    Add-Type @'
using System;
using System.Runtime.InteropServices;
public static class TradingDesktopRefresh {
    [DllImport("shell32.dll", CharSet = CharSet.Unicode)]
    public static extern void SHChangeNotify(uint eventId, uint flags, string first, IntPtr second);
}
'@
}
foreach ($folder in $shortcutFolders) {
    if (-not $folder -or -not (Test-Path -LiteralPath $folder)) { continue }
    foreach ($oldName in @('OpenAlgo.lnk', 'Stop OpenAlgo.lnk', 'Restart OpenAlgo.lnk')) {
        $oldPath = Join-Path $folder $oldName
        if (-not (Test-Path -LiteralPath $oldPath)) { [TradingDesktopRefresh]::SHChangeNotify(4, 0x2005, $oldPath, [IntPtr]::Zero) }
    }
    [TradingDesktopRefresh]::SHChangeNotify(0x1000, 0x2005, $folder, [IntPtr]::Zero)
}
[TradingDesktopRefresh]::SHChangeNotify(0x08000000, 0, $null, [IntPtr]::Zero)
