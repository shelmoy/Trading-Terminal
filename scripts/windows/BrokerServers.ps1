[CmdletBinding()]
param(
    [ValidateSet('Menu', 'Start', 'Stop', 'Restart', 'Status')][string]$Action = 'Menu',
    [ValidateSet('All', 'Kotak', 'Fyers')][string]$Broker = 'All',
    [string]$PrimaryRoot = (Join-Path $env:USERPROFILE '.gemini\antigravity\scratch\openalgo'),
    [string]$FyersRoot = 'C:\OpenAlgo-FYERS',
    [string]$StateRoot = (Join-Path $env:LOCALAPPDATA 'OpenAlgo\ServerControl'),
    [string]$StatusFile,
    [switch]$NoBrowser
)

$ErrorActionPreference = 'Stop'
$StateRoot = [IO.Path]::GetFullPath($StateRoot)
$instances = @(
    [pscustomobject]@{ Name = 'Kotak'; Root = [IO.Path]::GetFullPath($PrimaryRoot).TrimEnd('\'); Port = 5000; WsPort = 8765; ZmqPort = 5555 },
    [pscustomobject]@{ Name = 'Fyers'; Root = [IO.Path]::GetFullPath($FyersRoot).TrimEnd('\'); Port = 5001; WsPort = 8766; ZmqPort = 5556 }
)
$selected = @($instances | Where-Object { $Broker -eq 'All' -or $_.Name -eq $Broker })
$runner = Join-Path $PSScriptRoot 'run_broker_instance.py'
New-Item -ItemType Directory -Path $StateRoot -Force | Out-Null

function Write-Note([string]$Message) {
    Write-Output ('[{0}] {1}' -f (Get-Date -Format 'HH:mm:ss'), $Message)
}

function Read-EnvValue($Instance, [string]$Key) {
    $pattern = '^\s*' + [regex]::Escape($Key) + '\s*=\s*(.*?)\s*$'
    $result = $null
    foreach ($line in [IO.File]::ReadAllLines((Join-Path $Instance.Root '.env'))) {
        if ($line -match $pattern) {
            $value = $Matches[1]
            if ($value -match '^[''"](.*?)[''"]\s*(?:#.*)?$') { $value = $Matches[1] }
            else { $value = ($value -split '\s+#', 2)[0].Trim() }
            $result = $value
        }
    }
    return $result
}

function Get-ExpectedPython($Instance) {
    $paths = @((Join-Path $Instance.Root '.venv\Scripts\python.exe'))
    $cfg = Join-Path $Instance.Root '.venv\pyvenv.cfg'
    if (Test-Path -LiteralPath $cfg) {
        foreach ($line in [IO.File]::ReadAllLines($cfg)) {
            if ($line -match '^home\s*=\s*(.+)$') {
                $paths += Join-Path $Matches[1].Trim() 'python.exe'
            }
        }
    }
    return $paths
}

function Get-OwnedProcesses($Instance, [object[]]$Snapshot) {
    $app = Join-Path $Instance.Root 'app.py'
    $appArgument = '(?:"' + [regex]::Escape($app) + '"|' + [regex]::Escape($app) + ')'
    $runnerPaths = @((Join-Path $PSScriptRoot 'run_broker_instance.py'), (Join-Path $StateRoot 'run_broker_instance.py')) | Select-Object -Unique
    $runnerArguments = @($runnerPaths | ForEach-Object { '(?:"' + [regex]::Escape($_) + '"|' + [regex]::Escape($_) + ')' })
    $pythonPrefix = '(?i)^(?:"[^"]*python\.exe"|[^\s"]*python\.exe)\s+(?:(?:-u|-B|-E|-s)\s+|-X\s+[^\s"]+\s+)*'
    # The app must be the executed script, or the explicit app argument of our
    # runner. A linter/editor merely mentioning app.py is not a server process.
    $pattern = $pythonPrefix + '(?:' + $appArgument + '(?:\s|$)|(?:' + ($runnerArguments -join '|') + ')\s+--app\s+' + $appArgument + '(?:\s|$))'
    $python = @(Get-ExpectedPython $Instance)
    $owned = @($Snapshot | Where-Object {
        $_.ExecutablePath -in $python -and $_.CommandLine -match $pattern
    })
    # The venv launcher can spawn its base interpreter. Include only Python
    # descendants of a verified app, never a global python.exe/app.py match.
    do {
        $ids = @($owned | ForEach-Object { $_.ProcessId })
        $more = @(foreach ($candidate in $Snapshot) {
            if ($candidate.ProcessId -notin $ids -and $candidate.ParentProcessId -in $ids -and $candidate.ExecutablePath -in $python) {
                $parent = $owned | Where-Object { $_.ProcessId -eq $candidate.ParentProcessId } | Select-Object -First 1
                if ($parent -and $candidate.CreationDate -ge $parent.CreationDate) { $candidate }
            }
        })
        $owned += $more
    } while ($more.Count -gt 0)
    return $owned
}

function Get-Listeners {
    return @(Get-NetTCPConnection -State Listen -ErrorAction SilentlyContinue | Where-Object {
        $_.LocalPort -in @(5000, 5001, 8765, 8766, 5555, 5556)
    })
}

function Assert-Instance($Instance, [object[]]$Snapshot, [object[]]$Listeners) {
    foreach ($relative in @('app.py', '.env', '.venv\Scripts\python.exe')) {
        if (-not (Test-Path -LiteralPath (Join-Path $Instance.Root $relative) -PathType Leaf)) {
            throw "$($Instance.Name): missing $relative in $($Instance.Root)."
        }
    }
    foreach ($entry in @(@('FLASK_PORT', $Instance.Port), @('WEBSOCKET_PORT', $Instance.WsPort), @('ZMQ_PORT', $Instance.ZmqPort))) {
        if ((Read-EnvValue $Instance $entry[0]) -ne [string]$entry[1]) {
            throw "$($Instance.Name): $($entry[0]) must match configured port $($entry[1]). No settings were changed."
        }
    }
    $ids = @(Get-OwnedProcesses $Instance $Snapshot | ForEach-Object { $_.ProcessId })
    foreach ($listener in $Listeners | Where-Object { $_.LocalPort -in @($Instance.Port, $Instance.WsPort, $Instance.ZmqPort) }) {
        if ($listener.OwningProcess -notin $ids) {
            throw "$($Instance.Name): port $($listener.LocalPort) belongs to an unrecognized process (PID $($listener.OwningProcess)). It was not stopped."
        }
    }
}

function Get-HttpReady($Instance) {
    try {
        $response = Invoke-WebRequest -Uri "http://127.0.0.1:$($Instance.Port)/login" -UseBasicParsing -TimeoutSec 2
        return $response.StatusCode -eq 200
    } catch { return $false }
}

function Get-InstanceStatus($Instance, [object[]]$Snapshot, [object[]]$Listeners) {
    $owned = @(Get-OwnedProcesses $Instance $Snapshot)
    $ids = @($owned | ForEach-Object { $_.ProcessId })
    $web = @($Listeners | Where-Object { $_.LocalPort -eq $Instance.Port })
    $foreign = @($Listeners | Where-Object {
        $_.LocalPort -in @($Instance.Port, $Instance.WsPort, $Instance.ZmqPort) -and $_.OwningProcess -notin $ids
    })
    $state = 'Stopped'
    if ($foreign.Count) { $state = 'Port conflict' }
    elseif ($web.Count -and (Get-HttpReady $Instance)) { $state = 'Ready' }
    elseif ($owned.Count) { $state = 'Starting / unavailable' }
    return [pscustomobject]@{ Name = $Instance.Name; State = $state; Port = $Instance.Port; Url = "http://127.0.0.1:$($Instance.Port)"; Pids = $ids }
}

function Save-Status {
    $snapshot = @(Get-CimInstance Win32_Process)
    $listeners = @(Get-Listeners)
    $status = @($instances | ForEach-Object { Get-InstanceStatus $_ $snapshot $listeners })
    if ($StatusFile) {
        $destination = [IO.Path]::GetFullPath($StatusFile)
        if (-not $destination.StartsWith($StateRoot.TrimEnd('\') + '\', [StringComparison]::OrdinalIgnoreCase)) {
            throw 'Status file must stay inside the controller state folder.'
        }
        $temporary = "$destination.$PID.tmp"
        [IO.File]::WriteAllText($temporary, (ConvertTo-Json -InputObject $status -Depth 4))
        Move-Item -LiteralPath $temporary -Destination $destination -Force
    }
    return $status
}

function Start-Instance($Instance) {
    $snapshot = @(Get-CimInstance Win32_Process)
    Assert-Instance $Instance $snapshot @(Get-Listeners)
    $owned = @(Get-OwnedProcesses $Instance $snapshot)
    if (-not $owned.Count) {
        if (-not (Test-Path -LiteralPath $runner)) { throw 'The controller runner is missing. Reinstall the controller.' }
        $folder = Join-Path $StateRoot $Instance.Name.ToLowerInvariant()
        New-Item -ItemType Directory -Path $folder -Force | Out-Null
        $stamp = Get-Date -Format 'yyyyMMdd-HHmmss-fff'
        $outputLog = Join-Path $folder "$stamp.stdout.log"
        $errorLog = Join-Path $folder "$stamp.stderr.log"
        $app = Join-Path $Instance.Root 'app.py'
        $arguments = '-X utf8 -u "{0}" --app "{1}" --port {2} --ws-port {3} --zmq-port {4}' -f $runner, $app, $Instance.Port, $Instance.WsPort, $Instance.ZmqPort
        $process = Start-Process -FilePath (Join-Path $Instance.Root '.venv\Scripts\python.exe') -ArgumentList $arguments -WorkingDirectory $Instance.Root -WindowStyle Hidden -PassThru -RedirectStandardOutput $outputLog -RedirectStandardError $errorLog
        [pscustomobject]@{ Pid = $process.Id; Root = $Instance.Root; App = $app; Started = (Get-Date).ToString('o'); Stdout = $outputLog; Stderr = $errorLog } |
            ConvertTo-Json | Set-Content -LiteralPath (Join-Path $folder 'process.json') -Encoding UTF8
        # Preserve the established PID locations for maintenance tools.
        $legacy = if ($Instance.Name -eq 'Kotak') { Join-Path $Instance.Root 'tmp\broker-instance-service\server.pid' } else { Join-Path $Instance.Root 'local-setup\server.pid' }
        New-Item -ItemType Directory -Path (Split-Path $legacy) -Force | Out-Null
        Set-Content -LiteralPath $legacy -Value $process.Id -Encoding ascii
        Write-Note "$($Instance.Name): starting (PID $($process.Id))."
    } else { Write-Note "$($Instance.Name): existing server found; checking readiness." }
    $deadline = (Get-Date).AddSeconds(120)
    do {
        $snapshot = @(Get-CimInstance Win32_Process)
        $listeners = @(Get-Listeners)
        Assert-Instance $Instance $snapshot $listeners
        if ((Get-InstanceStatus $Instance $snapshot $listeners).State -eq 'Ready') {
            Write-Note "$($Instance.Name): ready at http://127.0.0.1:$($Instance.Port)"
            return
        }
        if (-not @(Get-OwnedProcesses $Instance $snapshot).Count) {
            throw "$($Instance.Name): the server exited. Logs: $StateRoot\$($Instance.Name.ToLowerInvariant())."
        }
        Start-Sleep -Milliseconds 700
    } while ((Get-Date) -lt $deadline)
    throw "$($Instance.Name): did not become ready within 120 seconds. The process was retained; see $StateRoot for logs."
}

function Stop-Instance($Instance) {
    $snapshot = @(Get-CimInstance Win32_Process)
    Assert-Instance $Instance $snapshot @(Get-Listeners)
    $owned = @(Get-OwnedProcesses $Instance $snapshot)
    if (-not $owned.Count) { Write-Note "$($Instance.Name): already stopped."; return }
    # Stop the worker children before their launchers. Recheck process creation
    # time so a recycled PID can never become a termination target.
    $ordered = @($owned | Sort-Object CreationDate -Descending)
    foreach ($original in $ordered) {
        $current = Get-CimInstance Win32_Process -Filter "ProcessId = $($original.ProcessId)" -ErrorAction SilentlyContinue
        if (-not $current) { continue }
        if ($current.CreationDate -ne $original.CreationDate -or $current.ExecutablePath -ne $original.ExecutablePath) {
            throw "$($Instance.Name): process identity changed; refusing to stop that PID."
        }
        Stop-Process -Id $current.ProcessId -Force -ErrorAction Stop
    }
    $deadline = (Get-Date).AddSeconds(12)
    do {
        $remaining = @(Get-Listeners | Where-Object { $_.LocalPort -in @($Instance.Port, $Instance.WsPort, $Instance.ZmqPort) })
        if (-not $remaining.Count) { Write-Note "$($Instance.Name): stopped."; return }
        Start-Sleep -Milliseconds 250
    } while ((Get-Date) -lt $deadline)
    throw "$($Instance.Name): a port is still occupied. No unrelated process was stopped."
}

function Open-Chrome([object[]]$Targets) {
    $candidates = @(
        (Join-Path $env:ProgramFiles 'Google\Chrome\Application\chrome.exe'),
        (Join-Path ${env:ProgramFiles(x86)} 'Google\Chrome\Application\chrome.exe'),
        (Join-Path $env:LOCALAPPDATA 'Google\Chrome\Application\chrome.exe')
    )
    $chrome = $candidates | Where-Object { Test-Path -LiteralPath $_ } | Select-Object -First 1
    if (-not $chrome) { throw 'Servers are ready, but Google Chrome was not found.' }
    $urls = @($Targets | ForEach-Object { '"http://127.0.0.1:{0}/trading"' -f $_.Port })
    # Chrome forwards these tabs to its existing window; it opens normally if closed.
    Start-Process -FilePath $chrome -ArgumentList (@('--new-tab') + $urls)
    Write-Note 'Opened the selected brokers as Chrome tabs (reusing an existing window when available).'
}

function Show-Controller {
    . (Join-Path $PSScriptRoot 'BrokerServers.UI.ps1')
}

if ($Action -eq 'Menu') {
    $uiMutex = New-Object Threading.Mutex($false, 'Local\OpenAlgoBrokerServersUI')
    $uiLock = $false
    try {
        try { $uiLock = $uiMutex.WaitOne(0) } catch [Threading.AbandonedMutexException] { $uiLock = $true }
        if (-not $uiLock) {
            Add-Type -AssemblyName System.Windows.Forms
            [Windows.Forms.MessageBox]::Show('Trading Servers is already open.', 'Trading Servers') | Out-Null
        } else { Show-Controller }
    } finally { if ($uiLock) { $uiMutex.ReleaseMutex() }; $uiMutex.Dispose() }
    exit 0
}
if ($Action -eq 'Status') {
    Save-Status | Format-Table Name, State, Url -AutoSize
    exit 0
}
$operationMutex = New-Object Threading.Mutex($false, 'Local\OpenAlgoBrokerServersOperation')
$operationLock = $false
$resultCode = 0
try {
    try { $operationLock = $operationMutex.WaitOne(0) } catch [Threading.AbandonedMutexException] { $operationLock = $true }
    if (-not $operationLock) { throw 'Another server operation is running. Wait for it to finish.' }
    $snapshot = @(Get-CimInstance Win32_Process)
    $listeners = @(Get-Listeners)
    foreach ($instance in $selected) { Assert-Instance $instance $snapshot $listeners }
    if ($Action -in @('Stop', 'Restart')) { foreach ($instance in $selected) { Stop-Instance $instance } }
    if ($Action -in @('Start', 'Restart')) {
        foreach ($instance in $selected) { Start-Instance $instance }
        if (-not $NoBrowser) { Open-Chrome $selected }
    }
} catch {
    Write-Note ('ERROR: ' + $_.Exception.Message)
    $resultCode = 1
} finally {
    if ($operationLock) {
        try { Save-Status | Format-Table Name, State, Url -AutoSize } catch { Write-Note $_.Exception.Message }
        $operationMutex.ReleaseMutex()
    }
    $operationMutex.Dispose()
}
exit $resultCode
