# Web maintenance — 7 November 2026

## Prepared release

The two installed web instances were on `d637fbd563` (OpenAlgo 2.0.3.2).
This merge integrates official upstream `a1b9e32506bce21403a8614dddeed0ab61fd519a`,
six commits after `e2e31e91f`, and moves the platform to **2.0.3.3**.
The chart SDK remains **2.6.9**; Python SDK remains **2.0.5**.

- Kotak holdings resolve the exchange identifier to the correct OpenAlgo symbol.
  Margin failures retain the broker's reason. Position averages use reported
  precision. Carried NSE/BSE cash positions use holdings cost where available;
  uploaded cost retains priority, and unavailable F&O cost stays explicitly
  identified as carry-forward valuation.
- Definedge, mStock, Tradejini, Samco, 5paisa and HDFC Sky receive quote/depth,
  exchange-routing, timestamp and subscription/reconnect corrections.
- Official release notes and documentation were reconciled with local notes.
  The release's earlier authentication/security/dependency changes were already
  integrated in previous maintenance; this delta adds no authentication rewrite,
  schema migration, security permission or broker credential change.

References: [official release](https://github.com/marketcalls/openalgo/releases/tag/openalgo-broker-keys-live-data),
[upstream delta](https://github.com/marketcalls/openalgo/compare/e2e31e91f217ca6d07dd260631aad1eb86cb12cc...a1b9e32506bce21403a8614dddeed0ab61fd519a),
[Kotak holdings contract](https://github.com/Kotak-Neo/kotak-neo-python/blob/main/docs/functions/portfolio/holdings.md).

## Preservation and validation

Recovery branch `recovery/before-web-update-20261107` and private uncommitted-work
archives were saved for both installations. Evidence is outside Git in
`C:\Users\ashut\.codex\backups\openalgo-web-update-20261107`.
Unknown documents/static assets/runtime cache and both `.env` files are preserved.

Trading/Scalper, all Renko versions/icons, NIFTY history, Gaussian blue/maroon,
615 studies, FYERS routing/linked login, chart defaults, P&L/margin and Exit All
safeguards remain intact. Neither cancelled application project is resumed.

Windows validation: **225 backend checks**, additional Kotak P&L/LTP regression
checks, **48 frontend checks**, TypeScript and temporary production build passed.
All **407** newly built files are byte-identical to the existing canonical build:
there is no frontend source change, no UI replacement and no asset churn.
Older compatibility chunks remain available. Python lock changes only project
version metadata; no third-party dependency versions change. Focused fatal-error
Ruff checks pass.

The initial combined broker-test run exposed fixture-only ZeroMQ teardown:
`__new__` fixtures had never acquired a base adapter instance but decremented its
shared ownership counter. Fixtures now mark that bypass and real-base fixtures
explicitly release their sockets. The bounded full rerun passes in about ten
seconds. Runtime base-adapter code is unchanged. Existing pytest exit logging
against a closed capture stream and a Kotak mock's missing reconnect-timer warning
remain baseline diagnostics, not test failures.

Resource audit: Kotak's new cache is bounded to eight sessions with a five-minute
TTL; failures are not cached. Existing pooled HTTP ownership is retained. Changed
stream snapshots are subscription-scoped and removed on unsubscribe/reconnect;
HDFC desired subscriptions retain their existing instrument cap and stop event.
Lifecycle and routing assertions use fake transports. No live broker order,
cancel, close, mode switch or Linux/VM test was performed. Live delivery/execution
and long-duration memory/latency behavior are not claimed verified.

## Activation

Prepared and tested; activation/push result will be recorded after verification.
Read-only preflight found both instances in Analyze mode, no active workflows,
strategies/scalping protection, current daily browser sessions, working Analyze
orders or open Analyze positions. Historical strategy bookkeeping is preserved;
stale unrevoked auth rows are not treated as valid current sessions.

The previously reported FYERS private-callback dependency remains unchanged;
this update does not alter callback URLs, credentials, Tailscale/Serve or exposure.

