# Restore native OpenAlgo Logs and monitoring

Official source checked: `marketcalls/openalgo` main at `2b52f466124c863185a0fb6931fe5e1d16d825d0`, fetched on 21 October 2026. This was already integrated; no broader upstream merge was required.

The Logs landing page (`/logs`), Live Logs (`/logs/live`), Sandbox Logs, Traffic, Security and Health page sources already matched upstream. The customized Latency Monitor (`/logs/latency`) and its backend statistics were restored byte-for-byte to the official version:

- `frontend/src/pages/monitoring/LatencyDashboard.tsx`
- `blueprints/latency.py`
- `database/latency_db.py`

This restores the standard monitor layout, tables, detail dialog, export, thirty-second refresh and official statistics scope. The custom session-only toggle, cache reset endpoint/button and custom latency classifications were removed. Existing database rows and exports were not cleared; the model schema did not change and no migration was required. Shared application themes, the Scalper, broker integrations, charts, indicators, watchlists and desktop controller remain as configured.

## Build, deployment and recovery

- Production TypeScript/Vite build passed in a temporary output directory before replacing served assets. Vite reported the existing unresolved asset reference and large-chunk warnings; the build completed successfully.
- Biome lint passed for the Logs landing, Live Logs and restored Latency Monitor pages. The restored Python files parsed successfully without opening a database. No automated tests or trading actions were run.
- Recovery branch: `backup/before-native-logs-2026-10-21`. Previous generated assets are retained under timestamped `tmp/before-native-logs-*` folders in each installation. The deployment path record is local-only at `tmp/native-logs-deployment.json` in the primary checkout.
- Sources and rebuilt production assets are synchronized to the primary Kotak checkout, the FYERS checkout and GitHub. No credentials, account data, database files or compressed runtime assets are committed.
- Both local servers were stopped when checked. They are left stopped; the restored backend and frontend load on the next normal Start in Trading Servers. Live HTTP and authenticated Logs checks could not be performed while the servers were stopped. Existing browser tabs should be refreshed after startup.
