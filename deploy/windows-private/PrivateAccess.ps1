[CmdletBinding()]
param(
    [ValidateSet('Start', 'Stop', 'Status')][string]$Action = 'Status',
    [Parameter(Mandatory=$true)][string]$ConfigDirectory,
    [string]$CaddyExe = "$env:USERPROFILE\.codex\runtimes\trading-private-windows-20261103\caddy.exe",
    [string]$TailscaleExe = 'C:\Program Files\Tailscale\tailscale.exe'
)
$ErrorActionPreference = 'Stop'
$config = (Resolve-Path -LiteralPath (Join-Path $ConfigDirectory 'caddy.json')).Path
$pidFile = Join-Path $ConfigDirectory 'proxy.pid'
$recordFile = Join-Path $ConfigDirectory 'serve-owned.json'
$caddyPath = (Resolve-Path -LiteralPath $CaddyExe).Path

function Get-OwnedProxy {
    if (-not (Test-Path -LiteralPath $pidFile)) { return $null }
    $proxyId = 0
    if (-not [int]::TryParse(([IO.File]::ReadAllText($pidFile)).Trim(), [ref]$proxyId)) { throw 'Invalid proxy PID record' }
    $process = Get-CimInstance Win32_Process -Filter "ProcessId=$proxyId"
    if (-not $process) { return $null }
    if ($process.ExecutablePath -ne $caddyPath -or $process.CommandLine -notlike "*$config*") {
        throw 'PID is owned by another program; it will not be stopped.'
    }
    return $process
}

function Assert-OwnedServePort($Serve, [string]$Hostname, [int]$Port) {
    $tcp = $null; $web = $null
    if ($Serve.TCP) { $tcp = $Serve.TCP.PSObject.Properties[[string]$Port].Value }
    if ($Serve.Web) { $web = $Serve.Web.PSObject.Properties[($Hostname+':'+$Port)].Value }
    if (-not $tcp -and -not $web) { return }
    $backendPort = if ($Port -eq 443) { 15000 } else { 15001 }
    $handlers = @($web.Handlers.PSObject.Properties)
    if (-not $tcp.HTTPS -or $handlers.Count -ne 1 -or $handlers[0].Name -ne '/' -or
        $handlers[0].Value.Proxy -ne "http://127.0.0.1:$backendPort") {
        throw "Serve port $Port changed or belongs to another app; preserve it for review."
    }
}

$state = (& $TailscaleExe status --json | ConvertFrom-Json)
if ($Action -eq 'Status') {
    [pscustomobject]@{ Tailscale = $state.BackendState; ProxyRunning = [bool](Get-OwnedProxy) }
    exit
}
if ($Action -eq 'Stop') {
    # Remove only port handlers recorded by this controller; never reset Serve.
    if (Test-Path -LiteralPath $recordFile) {
        $owned = Get-Content -LiteralPath $recordFile -Raw | ConvertFrom-Json
        $current = (& $TailscaleExe serve status --json | ConvertFrom-Json)
        if ($LASTEXITCODE -ne 0) { throw 'Could not inspect current Serve ownership.' }
        foreach ($port in $owned.ports) {
            if ($port -notin @(443,8443)) { throw 'Unexpected owned Serve port' }
            Assert-OwnedServePort $current $owned.hostname $port
            & $TailscaleExe serve --https=$port off
            if ($LASTEXITCODE -ne 0) { throw 'Could not disable the owned Serve port' }
        }
        Remove-Item -LiteralPath $recordFile
    }
    $proxy = Get-OwnedProxy
    if ($proxy) { Stop-Process -Id $proxy.ProcessId }
    if (Test-Path -LiteralPath $pidFile) { Remove-Item -LiteralPath $pidFile }
    exit
}
if ($state.BackendState -ne 'Running') { throw 'Sign in to Tailscale before starting private access.' }
$hostname = $state.Self.DNSName.TrimEnd('.')
$settings = Get-Content -LiteralPath (Join-Path $ConfigDirectory 'kotak.settings.json') -Raw | ConvertFrom-Json
if ($settings.PUBLIC_ORIGIN -ne "https://$hostname") { throw 'Config does not match this laptop tailnet hostname.' }
$serve = (& $TailscaleExe serve status --json | ConvertFrom-Json)
if ($LASTEXITCODE -ne 0) { throw 'Could not inspect existing Serve configuration.' }
if (($serve.TCP -or $serve.Web) -and -not (Test-Path -LiteralPath $recordFile)) {
    throw 'Existing Tailscale Serve configuration is not owned by this app; preserve and review it first.'
}
if (Test-Path -LiteralPath $recordFile) {
    $owned = Get-Content -LiteralPath $recordFile -Raw | ConvertFrom-Json
    if ($owned.hostname -ne $hostname) { throw 'The recorded Serve owner hostname changed.' }
    Assert-OwnedServePort $serve $hostname 443
    Assert-OwnedServePort $serve $hostname 8443
}
& $CaddyExe validate --config $config
if ($LASTEXITCODE -ne 0) { throw 'Invalid private proxy configuration.' }
if (-not (Get-OwnedProxy)) {
    $proxy = Start-Process -FilePath $CaddyExe -ArgumentList @('run','--config',('"'+$config+'"')) -WindowStyle Hidden -PassThru `
        -RedirectStandardOutput (Join-Path $ConfigDirectory 'proxy.stdout.log') `
        -RedirectStandardError (Join-Path $ConfigDirectory 'proxy.stderr.log')
    [IO.File]::WriteAllText($pidFile, [string]$proxy.Id)
}
# Keep a recovery record before enabling either handler. No Funnel or exit node.
[IO.File]::WriteAllText($recordFile, (@{ ports = @(443,8443); hostname = $hostname } | ConvertTo-Json))
& $TailscaleExe serve --bg --https=443 http://127.0.0.1:15000
if ($LASTEXITCODE -ne 0) { throw 'Could not enable private Kotak HTTPS.' }
& $TailscaleExe serve --bg --https=8443 http://127.0.0.1:15001
if ($LASTEXITCODE -ne 0) { throw 'Could not enable private FYERS HTTPS.' }
Write-Output 'Private HTTPS enabled for this tailnet only.'
