# Web maintenance — 6 November 2026

Latest official upstream through `e2e31e91f217ca6d07dd260631aad1eb86cb12cc`
is integrated on `maintenance/web-20261106`, based on customized web main
`32c086a1f8873b327327e0b56378cd019ebd3293`. The tested source and matching build
were pushed to origin/main and activated on both web instances as recorded below.

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

## Activated on both web instances

Initial HTTP checks found both instance ports offline, so this was a startup,
not disruption of an active web service. Premarket checks found Analyze mode,
no current-rollover broker session, no active flows/strategy engines, no running
hosted strategies and no open Analyze positions or orders. Stored strategy
bookkeeping quantities (29 Kotak,3 FYERS rows) were preserved and are not claimed
as a verified current broker book. Stale unrevoked rows were not treated as valid
broker authority after daily expiry.

Four consistent private SQLite backups passed quick_check before activation.
Both live roots fast-forwarded to application commit
`1d17a7c9c950a615ea4a235fd52d0e28444fda88`, with407 exact canonical build files,
older compatible chunks and all unknown static/docs/configuration intact.
No migration, restore, dependency change, order or execution-mode action occurred.

The existing local controller now skips the optional private-access helper when
Tailscale is not installed, allowing normal localhost Start/Stop/Restart to work.
Its original script is backed up privately. This changes no network exposure,
registered callback or broker credential. The separate OpenAlgo Desktop app again
owned port8765; closed only its verified executable/process identity using the
user's earlier explicit authorization. It was not uninstalled.

Owned controller startup completed: Kotak Ready08:47:54IST, FYERS Ready08:48:05IST.
Both pages opened as tabs in the existing Chrome window. Fourteen read-only HTTP
checks (including new and compatibility entries) and two WebSocket101 handshakes
pass. No authenticated subscriptions or diagnostic orders were sent. Both .env
fingerprints match their recovery records. No live broker delivery/fill latency
or interactive authentication acceptance is claimed.

Existing limitation: FYERS REDIRECT_URL still names the previously registered
private Tailscale8443 callback. Tailscale was already uninstalled/private DNS
unavailable before this run, so fresh FYERS OAuth return needs the provider and
server callback coordinated for web-only access. This update deliberately leaves
those existing settings/credentials unchanged; localhost HTTP readiness alone
does not prove that broker authentication flow. The cancelled Android project
was not recreated or maintained.
