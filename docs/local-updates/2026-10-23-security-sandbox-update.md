# Security and sandbox update — 23 October 2026

## Versions and source

Latest official release remains **OpenAlgo 2.0.2.9**, published 17 October 2026.
The six newer upstream commits through
[`91ced6f77`](https://github.com/marketcalls/openalgo/commit/91ced6f77)
are unreleased fixes, integrated into this prepared update. Chart SDK stays
**openalgo-charts 2.6.7**; OpenScript stays 0.8.1.

Official details: [upstream changelog](https://github.com/marketcalls/openalgo/blob/91ced6f77/docs/CHANGELOG.md),
[release](https://github.com/marketcalls/openalgo/releases/tag/openalgo-custom-timeframe-charts).

## What changes

- Sandbox order IDs now use a process-wide locked, monotonic daily sequence and
  check stored IDs, preventing collisions with earlier orders and across restarts.
- Sandbox margin reservation and the order row now commit together. Failed
  placement rolls both back, preventing new orphaned reservations. Existing
  historical reservations are not repaired by this update.
- Production dependency targets: certifi 2026.10.19, Pillow 13.0.0,
  aiohttp 3.14.5 and yarl 1.25.1. The optional analysis group also raises its
  Streamlit floor for Pillow 13 compatibility.
- Frontend lockfile targets: Vite 8.1.6, Vitest 4.1.12 and
  follow-redirects 1.16.1. Node engines exclude unpatched versions.
- Upstream notes a remaining unpatched `braces` advisory confined to frontend
  test tooling. It also notes that broker feed TLS uses the operating system's
  certificate store: updating certifi alone does not replace Windows certificate
  updates. No Windows settings or trust-store policies were changed here.

## Effect on custom features

No new Kotak/FYERS broker API, Scalper, chart or live broker P&L behaviour is
introduced. Sandbox/Analyze available margin benefits from the transaction fix
after activation; this is not a repair of live broker funds.

Scalper, Renko versions/settings/icons, chart defaults, custom indicators and
the pinned 497-study library are preserved. Native Logs/Latency, shared FYERS
app login, broker watchlists/option chains and the desktop controller remain
unchanged. The original application source files were compared to the previous
local head. The one non-generated merge conflict was the upstream CI workflow:
this fork intentionally deleted workflows in commit `74a467603`, so that deletion
is preserved. Generated frontend conflicts were resolved by a fresh local build.

## Verification

- Successful production build: TypeScript plus Vite 8.1.6, in a fresh temporary
  output directory, using **Node 24.22.1**. The official Windows archive SHA-256
  and the node.exe OpenJS Authenticode signature were verified. The global
  Node installation was not replaced.
- Installed staging dependency versions checked explicitly against the lockfile.
  An initial build with an older staging toolchain was discarded; only the
  subsequent build with patched dependencies is committed.
- Existing build warnings remain: an unresolved runtime reference and large
  chunks. npm also reported existing deprecated Recharts and two unapproved
  optional install scripts; no extra script permissions were granted.
- Python source syntax parsed without importing the application. The resource
  audit was static: a single lock plus two scalar counters is bounded, `with`
  releases the lock, and order transaction errors roll back the existing scoped
  DB session. No new executor, connection pool, socket or retained collection
  is introduced. No order path or automated test was executed.
- Read-only HTTP `/faq` returned **200** on ports 5000 and 5001 for the existing
  running installation. This does not validate the prepared backend activation.

## Deployment deferred to protect the running session

Both instances were initially stopped. They became active while the isolated
build was running: Kotak PID 18736 and FYERS PID 4912, each bound to its existing
loopback ports. The dependency installer checked the controller operation mutex
and live listeners and stopped before changing either environment.

**The running checkouts, served frontend, Python dependencies and broker sessions
remain on `d0d2a206838a0651813ae9448dbc39ad3b9c9419`.** The successfully built
integration is saved to GitHub; it has not been activated on either broker.
Current Python versions are certifi 2026.7.22, Pillow 12.3.0, aiohttp 3.14.3 and
yarl 1.24.5. Their security patches are therefore still pending locally.

At the next safe maintenance check, synchronize the pinned Python dependencies
and frontend development dependencies, verify them, fast-forward both checkouts
to this integration, and publish the fresh build while retaining old hashed
assets. Recheck active strategies and market sessions before any restart; retain
stopped services as stopped unless a restart is appropriate. Keep this deployment
pending until actual dependency and HTTP activation checks succeed. Do not treat
zero new upstream commits as proof this pending deployment is finished.

## Recovery and data

Recovery branch: `backup/before-upstream-security-2026-10-23`, at the original
local head `d0d2a206838a0651813ae9448dbc39ad3b9c9419`. Private recovery root in the
primary checkout: `tmp/daily-update-20261023/`.

The recovery root holds original frontend/indicator snapshots for both instances,
the primary's 334 untracked files and tracked diff, package inventories, and
consistent SQLite backups (seven primary, five FYERS) made with SQLite's backup
API. Credentials, databases and recovery contents are excluded from Git.
No schema migration, account-data repair, service restart or trading action was
performed. Unknown local work is preserved. The isolated integration checkout is
`tmp/upstream-security-20261023/`, branch `update/daily-security-20261023`.
