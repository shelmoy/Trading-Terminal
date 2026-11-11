# Web maintenance, 11 November 2026

The prepared web update integrates upstream `5ebaa75b5d6ca22cf8660939872a40137e93d630`.
The platform version remains **2.0.3.3**. The prepared chart SDK moves from
**2.6.9** to **2.7.0**, including revised drawing-tool icons. The two local
installations still serve the previous SDK while activation is pending.

After a successful in-app broker login, the frontend fetches the current API
key, capabilities and app mode before navigating. This includes Kotak's TOTP
flow. The chart order dialog uses its supplied order route when present, while
the direct API route still requires an API key. Mocked tests cover both routes.
The FYERS linked handoff, callback URLs, CSRF and session revocation contracts
are preserved. There are no backend code, schema, Python dependency, credential
or network changes in this update.

The merge retained the local changelog entries and regenerated assets from the
combined source. The build contains 407 canonical files. All staged canonical
blobs match the build byte for byte, and all 1,211 previously tracked asset
paths were retained for compatibility with open tabs. Custom Renko versions
and icons, NIFTY defaults and history behavior, Gaussian styling, indicators,
Scalper, P&L, margin, Exit All and commodity changes are preserved.

- Windows TypeScript and production build passed using the exact npm lock.
  Both drawing-icon generators matched, and chart-indicator coverage passed
  with all 438 SDK exports documented.
- The broader frontend run passed 1,335 tests. Its 30 failures all reproduced
  against the prior release, whose seven affected suites recorded 31 failures.
- 37 Windows backend authentication and expiry checks passed. The known
  pytest exit-logging warning remains.
- Seven local headless Chrome chart checks passed with fake HTTP and WebSocket
  transports. They covered the NIFTY default, navigation, depth, all three
  custom Renko versions, indicator reload and Scalper. Four mocked FYERS
  handoff and CSRF cases passed on the production bundle.
- The broader SDK browser harness assumes an upstream BHEL default. The
  isolated test copy verified the local NIFTY default and then selected BHEL.
  Its history-volume reconciliation assertion failed identically on SDK
  2.6.9 and 2.7.0. The broader harness did not complete.
- Eight read-only HTTP checks passed against the running prior release.
  No live broker orders, cancels, closes or execution-mode changes were made.

Recovery refs `recovery/before-web-update-20261111` and private archives of
both web checkouts' uncommitted files are retained. The temporary build,
manifest, test logs and archived upstream generated files are under
`C:\Users\ashut\.codex\backups\openalgo-web-update-20261111`. No migration
or database backup was needed for preparation.

Local activation is pending. The preflight found a current-day Kotak browser
session entry and could not establish a safe window. Both running installations
were left on their prior commits and assets. Recheck activity and session
authority before advancing the local checkouts. Verify the pinned frontend
environment and staged asset hashes before serving the bundle, then run
read-only version, HTTP and WebSocket checks. Keep the previous build and
recovery refs available until activation is verified.

[OpenAlgo upstream changes](https://github.com/marketcalls/openalgo/compare/a1b9e3250...5ebaa75b5)
and [chart SDK v2.7.0](https://github.com/marketcalls/openalgo-charts/tree/v2.7.0).
