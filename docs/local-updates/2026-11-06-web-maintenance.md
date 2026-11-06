# Web maintenance — 6 November 2026

Latest official upstream through `e2e31e91f217ca6d07dd260631aad1eb86cb12cc`
is integrated on `maintenance/web-20261106`, based on customized web main
`32c086a1f8873b327327e0b56378cd019ebd3293`. The tested source and matching build
are ready for normal GitHub synchronization; local activation is deferred below.

## Changes and preservation

- FYERS publishes full broker-provided quote fields with five/50-level depth,
  separates LTP/Quote callbacks, and drops unmapped topics. Preserved the local
  real selective-unsubscribe implementation; depth retains its quote-feed owner,
  final release clears quote/pending-depth caches.100 fake lifecycle cycles pass.
- Kotak publishes full quote/depth fields and real last-trade timestamps, supports
  aliases without starving NIFTY/NIFTY50, and avoids invented missing values.
  REST/stream MIDCPNIFTY candidate priority is aligned while keeping all aliases.
- Other official fixes cover Angel, Dhan, Upstox, Groww, Sahi, Shoonya history,
  Tradejini history/depth, Flattrade reconnect and Zerodha index packets.
- Historify requests older source history for derived intervals at session open.
- Scalper, custom Renko V2/V3/V4/icons, NIFTY history, Gaussian blue/maroon,
  indicators, chart defaults, P&L/margin/ExitAll, commodities and linked login
  remain intact. No order APIs, credentials, mode or network exposure changed.
  The cancelled app project and chart-trading redesign remain cancelled.

Installed and official application versions remain **2.0.3.2**; custom chart SDK
stays **2.6.9**. Official release: [v2.0.3.2](https://github.com/marketcalls/openalgo/releases/tag/openalgo-freeze-limits-muhurat-session).
No auth/security rewrite, dependency-lock or migration changes in these seven commits.

## Windows validation and recovery

-284 fake backend tests and102 frontend tests pass, including existing custom
 Renko/Scalper/watchlist/quote safeguards. Fixed an existing stale auth/market
 test mock (baseline failed identically); no product hook behavior changed.
- TypeScript and temporary Vite production build pass;407 canonical files.
 Existing compatible chunks retained; no upstream prebuilt UI replaces custom UI.
- Both frozen Python environment checks report223 packages and no changes;
76 direct npm packages match lock, existing workspace link preserved. The deliberate
 security filelock override remains; pip metadata alone flags LiteLLM's old cap.
- Scoped Ruff has no introduced findings against the parent baseline. Known
 pytest exit logging on a closed capture stream and fake-adapter teardown logs
 remain baseline; tests exit0 with no failures/skips. Canvas/chunk-size build
 notices do not establish physical browser or broker latency acceptance.
- Resource audit: caches/alias maps have unsubscribe/disconnect cleanup, no new
 client/socket/executor ownership;100 mocked FYERS cycles return maps to empty.
- Recovery branches on both installations and private uncommitted-work archives
 are in `C:/Users/ashut/.codex/backups/openalgo-web-update-20261106`.
 No migration or live database write; no database restore needed. No Linux,
 VM, emulator, real/sandbox diagnostic trade, cancellation or mode change.

## Local activation deferred

Both live roots remain at32c086a1f. Premarket read-only checks found Analyze mode,
no current-rollover broker sessions, no active flows/strategy engines and no open
Analyze positions/orders. Nonzero persistent strategy bookkeeping rows remain
(29 Kotak,3 FYERS); these are not claimed to be a verified current broker book.
No unrevoked auth row is treated as a valid session after daily expiry.

The identified controller unconditionally invokes its private-access helper,
which calls missing `C:/Program Files/Tailscale/tailscale.exe` on Start/Restart.
This dependency was already absent before this run. Avoid stopping working web
services until the obsolete optional launcher dependency is safely resolved;
shared FYERS callback/CSRF/relay/controller settings were not changed here.
Recheck actual session/strategy/book/market authority immediately before activation.
No restart or partial local code/build publication was attempted.
