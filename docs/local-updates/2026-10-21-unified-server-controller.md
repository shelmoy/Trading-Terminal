# Unified Kotak / FYERS server controller — 21 October 2026

## Desktop use

Open **Trading Servers** on the desktop. Select **Kotak**, **FYERS**, or both; both are selected initially.

- **Start** starts the selected instances, reusing an already running matching server. Once the selected servers pass their HTTP readiness checks, both URLs open as tabs in the existing Chrome window. If Chrome is closed, it opens normally. The launcher does not request a separate window.
- **Stop** stops the selected local server processes and their verified Python workers. It does not submit cancellations or any other broker orders, and it leaves Chrome open.
- **Restart** stops and starts the selected instances, then opens their pages as tabs using the same Chrome window behaviour after readiness checks succeed.

Closing the controller leaves the broker services running. The controller shows each instance's status and the current action's log, while operations run in background helper processes.

The existing broker installations remain independent: **Kotak at http://127.0.0.1:5000**, **FYERS at http://127.0.0.1:5001**. Their credentials, database files, cookies, WebSocket ports and ZMQ ports retain their existing configuration. The controller does not require a new OpenAlgo setup.

## Installation and source

- Source: `scripts/windows/BrokerServers.ps1`, `BrokerServers.UI.ps1`, `New-TradingServersIcon.ps1`, `run_broker_instance.py`, and `Install-BrokerServers.ps1`.
- Installed controller and local logs: `%LOCALAPPDATA%\OpenAlgo\ServerControl`.
- Reinstall/update the desktop utility from a checkout with:

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File scripts/windows/Install-BrokerServers.ps1
```

Example command-line actions from PowerShell:

```powershell
& "$env:LOCALAPPDATA\OpenAlgo\ServerControl\BrokerServers.ps1" -Action Start -Broker All
& "$env:LOCALAPPDATA\OpenAlgo\ServerControl\BrokerServers.ps1" -Action Stop -Broker All
& "$env:LOCALAPPDATA\OpenAlgo\ServerControl\BrokerServers.ps1" -Action Restart -Broker Fyers
& "$env:LOCALAPPDATA\OpenAlgo\ServerControl\BrokerServers.ps1" -Action Status
```

Use `-NoBrowser` for maintenance that should not open Chrome. For recurring maintenance, continue to check active strategies, positions/orders and market sessions before disruptive activation; the GUI's manual Stop/Restart actions execute the user's selected operation directly.

## Process and recovery behaviour

The old three OpenAlgo desktop shortcuts and their batch launchers are retired. The old Stop batch file used a global `app.py`/Python termination pattern. The replacement validates absolute application path, expected venv/base interpreter and process creation identity, and only includes Python descendants of verified parents. Occupied ports belonging to an unrecognized process cause a refusal. All selected instances are checked before a Stop/Restart begins. Concurrent actions are prevented by an operation mutex. A successful Start requires HTTP readiness, rather than a fixed sleep followed by a success message.

Each instance starts in its own working folder through its own venv. The runner clears inherited OpenAlgo configuration keys in that child and loads the chosen instance's `.env`; no environment file is edited. Server output goes to separate timestamped per-broker logs. Existing PID-file locations are maintained for compatibility with maintenance tools.

Startup failure leaves an already working other broker running. A timeout retains its process and logs for diagnosis. Stop does not guess at an unknown port owner. Desktop shortcuts and prior launchers have local recovery copies under the controller's `backups` folder. The separate FYERS credential configuration helper is retained.

Recovery branch: `backup/before-universal-server-controller-2026-10-21`. Controller source is synchronized to both checkouts and GitHub. No frontend rebuild, dependency update, database migration, credentials change or network-exposure change is required.

## Checks

PowerShell parsing and Python syntax/lint checks passed. Operational activation uses Start with both instances and read-only HTTP checks; no automated test suite, broker orders or stop/restart exercise against a trading session is performed. HTTP availability confirms the local app is ready, not that daily broker authentication is complete. Existing broker login flows still apply.

## Glass desktop refresh

The controller now uses WPF with a pale frosted surface, rounded broker cards, blue gradient Start action, compact activity panel and macOS-inspired window controls. It requests the Windows desktop acrylic backdrop and rounded corners on supported Windows versions; its own tinted surface remains readable when those effects are unavailable. Windows accessibility and transparency settings can affect the backdrop.

The desktop shortcut uses a new blue glass server icon containing 16, 24, 32, 48, 64, 128 and 256 pixel PNG frames in an ICO container. The icon has a new filename so Explorer can replace its previously cached blank icon. The installer checks the user, public and OneDrive desktop locations for known retired launcher targets, preserves unknown shortcuts, and sends shell refresh notifications without restarting Explorer.

At this refresh, the old OpenAlgo shortcut files were already absent from the checked desktop folders; only Trading Servers remained. Shell delete/directory/icon notifications were sent to remove stale desktop entries. The new controller was opened successfully and reported responsive with no startup errors. Its presentation was updated without stopping or restarting either broker service. Start and Restart retain the existing-window Chrome tab behaviour. The prior controller, icon and shortcuts remain in the installer's private recovery folder.
