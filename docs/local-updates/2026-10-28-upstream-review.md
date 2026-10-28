# 28 October 2026 upstream update — validated, activation pending

Official and local platform version: **2.0.2.9**. This release integrates official commits through **6d77bcbb45c674f9caa14a443641e3edeb014d46**, with **openalgo-charts 2.6.9** (previously 2.6.7). Deployment, dependency synchronization and HTTP activation results will be recorded after the safe maintenance step.

## Included changes

- Native Renko/range/line-break/point-and-figure volume studies; confirmed higher-timeframe history improvements around holidays/weekends; OHLC/high-low widths follow zoom. The custom V4 transform keeps its existing mathematics and the deployed NIFTY Trading/Scalper history/persistence recovery.
- Sector Rotation relative-strength/momentum tool, using broker or Historify history. Chart/theme migrations for upstream `/scalping`, P&L Tracker, IV, Straddle and Health; the custom `/scalper`915 workspace is preserved. Broker P&L arithmetic is unchanged by these chart migrations.
- Shared broker transport retries selected failed reads once. Writes are never automatically retried. Lost order replies explicitly warn that delivery is uncertain and require checking the order book; the custom valid-broker-ID/rejection checks remain intact.
- Prior pending security/dependency changes are included after review: GitPython submodule-hook protection, certifi2026.10.19, Pillow13, aiohttp3.14.5/yarl1.25.1, Vite8.1.6/Vitest4.1.12, follow-redirects1.16.1, setuptools84.1.0, filelock4.2.4 and nested zod4.6.6. A remaining upstream braces advisory concerns development tooling; certifi does not replace Windows certificate-store updates.
- Sandbox IDs use a locked monotonic daily sequence with stored-ID checks; margin reservation and order creation commit atomically. This prevents new collisions/orphaned reservations, without rewriting existing account history or repairing old reservations.
- FYERS master-symbol normalization, Dhan index/history corrections, RMoney position matching and Zerodha lost-response handling are retained. No new Kotak-specific API is introduced.

[Official release](https://github.com/marketcalls/openalgo/releases/tag/openalgo-custom-timeframe-charts), [official changes](https://github.com/marketcalls/openalgo/compare/79fe4cf187dfc85b4d5503b9912cf5d3fad8d6ad...6d77bcbb45c674f9caa14a443641e3edeb014d46), [lost broker replies](https://github.com/marketcalls/openalgo/pull/2305), [dependency updates](https://github.com/marketcalls/openalgo/pull/2294).

## Linux gate and defects resolved

The user's authorized virtual Linux environment runs Ubuntu24.04.5 in a local QEMU VM on ext4, using the already-present Windows hypervisor. No Windows optional features, WSL installation, firewall or LAN exposure changed. SSH binds only to127.0.0.1. The VM receives source and fake test fixtures, without live credentials or account databases. Its disk and reproducible setup are retained privately for later validation.

**Complete required Linux suite: 1475 passed, 3 existing skips, zero failures/errors.** It uses Python3.12.3, real gunicorn25.3.0 and eventlet0.41.2. All79 changed non-document/source files were byte-verified against the tested VM. Private JUnit/log evidence and source hashes are in the release recovery record.

Failures were diagnosed and fixed rather than skipped or re-run without changes:

- The custom three-pane history burst previously added sustained capacity and admitted a fourth request early. Virtual350ms tickets now permit only the bounded three-pane burst with30ms admission spacing; background work cannot borrow and refusals reserve no clocks.
- The history prewarmer now copies auth values inside session cleanup and releases scoped sessions before idle waits and on every error/cycle exit. Isolated real SQLite tests exercise100 iterations each on success and failure, with matched checkouts/checkins and empty scoped-session registries.
- Limiter fixtures distinguish foreground bursts from steady background pacing, and FYERS data budget from account/order budget. Option-chain busy fixtures supply broker-listed symbols and clear shared caches.
- Master-contract fixture threads are joined before claim-state monkeypatch teardown; no production single-flight guard was relaxed.
- The Python-config stress reader validates every observed JSON snapshot with a scalar counter, instead of retaining an unbounded list that exhausted the small VM. The initial OOM and failed-run evidence are retained. No production config-writer change or test assertion removal.
- The fork's CI contract file is restored as manual-only, contents-read-only; no push/PR automatic runs, write credentials, publishing or Docker pushes. The actual gate ran locally in the VM, not via an unverified upstream green run.

## Other verification and preservation

- 89 frontend checks across14 files; 41 Sector Rotation backend checks; TypeScript and the temporary production build passed. Canonical build manifest:400 files, with old compatibility chunks retained.
- 115 targeted Windows checks passed with2 platform skips; a final110-check targeted run also passed. These sets overlap and must not be added as unique counts. Placement/transport checks use mocked broker responses only.
- 16 isolated real Chrome fixtures passed using the actual SDK: native/custom RenkoV2/V3/V4, light/dark themes,420/820px panes, incoming updates, zoom and inverted axes. V4 light/dark screenshots were visually checked. All browser network access was blocked in these fixtures.
- Ruff passed on newly changed history/test code. Existing place_order_service typing-import warnings and Vite large-chunk/plugin timing warnings remain baseline. Existing Python-strategy atexit logging may emit closed-stream warnings after successful pytest termination.
- Resource audit: prewarmer session lifecycle is measured over repeated isolated calls; queue state is two scalar clocks; Sector Rotation cache is bounded256/300seconds and max40 instruments. HTTP pools remain shared/bounded and watch state restores in finally; chart effects destroy charts and remove listeners. No long-duration live leak or zero-latency claim.
- RenkoV2/V3/V4/settings/icons, Gaussian blue/maroon styling, indicators, charts/history dates, broker routing, P&L, margin, Exit All safeguards and unknown local files are preserved. The cancelled chart-trading implementation remains cancelled and absent.
- Private recovery includes both original Git heads/branches, all uncommitted source and served assets, exact environment hashes and Python environments. Consistent SQLite snapshots are required during the stopped maintenance phase. No schema migration is required by the reviewed changes; no account-data repair is planned.
- No real or sandbox diagnostic orders, cancellations, closes, credential changes or execution-mode changes. Authenticated broker execution, delivery and fill latency are not established by mocked tests or public HTTP checks. FYERS' existing logged-out broker state requires normal broker login.

## Activation record

Validated merge is ready for the authorized maintenance step. Recheck Analyze mode, strategies and working orders before stopping identified services; back up consistent databases; synchronize frozen dependencies; publish matching assets; restart and verify both instances; synchronize GitHub without rewriting existing history. Record final status and commits here after completion.
