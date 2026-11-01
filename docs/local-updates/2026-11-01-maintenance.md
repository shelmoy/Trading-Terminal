# Maintenance update â€” 1 November 2026

Status: the tested independent subset is installed and activated on both Kotak and FYERS. The upstream broker-auth rewrite is deferred because direct integration breaks the existing linked-instance login contract. This is a partial upstream integration, not a claim that all of upstream/main is installed.

## Versions and scope

Official release and local platform remain **2.0.3.2**, chart SDK **2.6.9**, Python client SDK **2.0.5**. Both origin and upstream were fetched in both live checkouts. Base: `df212f30aa46dd187afec64358122a6f66ea0a8e`; latest seen upstream: `da15d464127c363da0980cbd45c0a3f94e090e10`. Latest fully integrated upstream remains `a9370edf8c3aeb1a5f0d7af43e00726428f36933`.

Applied independent upstream changes:

- `d629f3d57`: OpenAlgo Desktop 1.0.5 download information.
- `b592e914f`: Chrome Plugin and Excel Add-in links and explainers.
- `da15d4641`: documentation matches the 20 tools in the registry.
- The `joserfc` 1.7.7 pin from the larger commit, across all Python manifests and the frozen lock.

The download page offers optional software. No desktop application, browser extension or Excel add-in was installed or launched by this run.

## Dependency finding and fix

The repository security audit found `follow-redirects` 1.16.1, affected by [GHSA-mrwp-f3q8-3g9p / CVE-2026-116689](https://github.com/advisories/GHSA-mrwp-f3q8-3g9p). The advisory concerns custom sensitive headers supplied in arrays from another JavaScript realm. It explicitly does not claim that Axios 1.20.0 reproduced the issue; this report does not claim an actual application credential leak.

The override is pinned to **1.16.2**, with only that package's version, resolved URL and integrity changed in the lock. A fresh private `npm ci --ignore-scripts` was used; no shared `node_modules` package was patched. The old isolated dependency junction was retained under ignored temporary output. The chart SDK is unchanged.

A two-server loopback fixture with a fake header reproduced disclosure against 1.16.1 and confirmed its removal with 1.16.2, while retaining an unrelated header. No broker connection, actual credential or order endpoint was involved. Final npm audit reports **zero advisories**. Python pip-audit scanned **223 packages with no known vulnerabilities**. The existing intentional filelock 4.2.4/LiteLLM metadata conflict remains; the security override was not downgraded.

## Why the broker-auth rewrite is held

Upstream `eec700046` changes broker-key storage, login initiation, callback state, session revocations and strategy broker/account binding. It adds broker-key/login/revocation tables and a strategy account column. None of those changes or migrations are in the activated subset.

The full preview is retained at `tmp/upstream-check-20261101`, branch `preview/upstream-20261101`, with conflicts in `app.py`, `blueprints/auth.py`, `blueprints/brlogin.py` and `frontend/src/pages/BrokerSelect.tsx`. Existing custom files and both live roots were preserved.

Isolated fake-data compatibility checks confirmed:

1. The existing FYERS launcher creates `fyers_oauth_state`/`fyers_oauth_started`, but the new callback requires a server-started `broker_login` record. `verify_broker_return` refuses the legacy state.
2. The existing secondary-instance bridge imports `user`/`login_authority`; the new session hook clears that pre-broker identity because it has no `auth_at`.

The next step is a tested linked-instance adapter that preserves the new CSRF-started login, callback-state and revocation checks while maintaining the separate Kotak/FYERS handoff. Do not disable those checks, restore browser-visible broker keys, or fast-forward a live checkout to the conflicted preview. No broker credential, execution mode or network exposure was changed to work around the conflict.

## Validation and audit limits

The final source is copied to a fresh Linux filesystem directory in the retained Ubuntu VM, with fake account data and mocked broker transports only. No real `.env`, credentials or account databases enter the VM. The final run passed 1,565 tests with three documentation skips: 1,478 required gthread checks and 87 focused auth/FYERS/Kotak checks, with zero failures/errors. The gate verifies all 3,898 copied source-file hashes after the npm lock update. Logs, JUnit and manifest hashes are retained privately.

Windows focused checks: **53 passed**. Frontend checks: **70 passed** after the patched npm install. TypeScript and a fresh temporary Vite production build passed. An existing whole-source architecture test exceeded Vitest's five-second default while scanning files on Windows; its explicit I/O budget is now 60 seconds, with the file scan and assertions unchanged. The initial failure and diagnostic evidence are retained. This test does not measure browser rendering latency.

Raw security-audit reports are retained privately. Its database-permission failure referred only to public tracked `db/readme.txt` in the credential-free preview, identical to the base; POSIX stat bits on Windows are not an assessment of live NTFS account-data ACLs. No ACL was changed. Existing whole-repository review candidates remain review items, not a security score or a blanket all-clear. The explicit changed-file secret scan used offline mode and found no candidates. A broader offline follow-up timed out and is not counted as passed. Broker-portal/static-IP and other authenticated manual audit items were not performed.

The fake compatibility fixture left one temporary scratch directory when its log handler held a Windows file open. Automatic approval review rejected a later cleanup command; the fake-data scratch was retained. No user file was removed or moved by that rejected command.

## Recovery, customization and activation

Private snapshots and records: `C:\Users\ashut\.codex\backups\openalgo-update-20261101` and `C:\Users\ashut\.codex\backups\openalgo-release-20261101`. Recovery branches, unknown work, source/assets, exact private environments and prior virtual environments were saved before integration. Ten consistent SQLite backups were taken with both services stopped, and each passed `PRAGMA quick_check`. This subset needed no database migration. The previous environments, assets and recovery branches remain available.

Preserved: Scalper915, Renko V2/V3/V4/icons, NIFTY Trading V4 recovery, Gaussian blue/maroon, indicators, chart defaults, broker P&L/margin/Exit All safeguards, FYERS routing and shared login, performance work and the October commodity fixes. The cancelled chart-trading redesign remains cancelled. Kotak MCX historical candles remain broker-rejected; quotes and the clear history refusal are retained.

Validated application/source-and-assets commit: `8fbd0e4351e6ea80c050e868cba488873910f7cb`. Both live checkouts have this exact source/build. Frozen `uv sync` and `npm ci --ignore-scripts` succeeded on each, with `joserfc` 1.7.7 and `follow-redirects` 1.16.2 verified in both installed environments.

A fresh activity check found both in Analyze mode, with no active strategies/workflows, working Analyze orders or open Analyze positions. Both identified services were stopped through the guarded controller. Kotak started at **18:23:13 IST**, reporting Ready at **18:23:44**; FYERS started at **18:24:08**, reporting Ready at **18:24:28**. A post-activation read-only check confirmed Analyze mode remained unchanged.

Both instances returned HTTP 200 for `/faq`, `/trading`, the new `index-Bp041jZq.js`, and five retained older compatibility entry chunks. The served HTML/JavaScript matched disk and all **400 canonical files per instance** matched the validated build. FYERS `/login` returned the expected 302 to `/auth/instance-login`; Kotak `/login` returned 200. All six bound web/WebSocket/ZMQ endpoints were independently verified as descendants of the expected controller processes, with the correct checkout working directories.

Windows continues to report null TCP states, so the controller's final status table can show Starting despite its Ready log and passing HTTP checks. This existing display limitation remains; neither healthy service was restarted again. Both private `.env` hashes and all **333 unknown primary docs/static files** are unchanged. Runtime caches were not committed. No diagnostic orders, cancellations, position closes, broker credential changes, execution-mode changes or exposure changes were performed.

Final normal-push and installed/origin-head verification is recorded in `C:\Users\ashut\.codex\backups\openalgo-release-20261101\completion-record.json`. The Ubuntu validation VM is retained and powered off. The full auth rewrite remains explicitly deferred; the previously cancelled chart-trading redesign remains cancelled.
