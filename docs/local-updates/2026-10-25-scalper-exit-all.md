# Scalper Exit all — 25 October 2026

Exit all no longer starts cancellation and square-off concurrently or reports
an unconditional success. It uses the existing authenticated broker endpoints
in the current instance and current Live/Analyze mode.

The flow sends one cancellation request, checks the account order book until
working orders settle, reads current positions, and sends at most one bulk
close request. It then checks both orders and positions. Only a successful
read showing zero nonzero positions and zero working orders produces an
"Exit confirmed" message. A rejection, partial failure, unreadable book or
timeout produces an error or pending message with instructions to check the
books. An accepted request is not a confirmed fill.

Only read-only verification is repeated: up to five reads per phase, spaced
one second apart after the first read, with existing broker pacing retained.
Requests to cancel or close are never automatically retried. Closing is not
sent while cancellation is failed or unsettled. There is no second bulk
cancellation after closing, so a new exit cannot be cancelled by this flow.

A synchronous lock blocks repeated clicks before React rerenders. Quick
Scalper orders and the mode toggle are disabled during Exit all; pending quick
order responses block starting Exit all. The flow checks account/session scope,
checks server mode before each mutation stage, rejects books for another
mode, aborts read requests/timers on unmount, and suppresses obsolete toasts.
External terminals/strategies can still change the account concurrently.

Scope is the connected broker account's regular working orders and positions,
including those opened outside Scalper. It does not cancel GTT triggers or
liquidate holdings. The tooltip now states this scope.

Backend corrections:

- The UI route preserves partial-close details and Analyze mode metadata.
  Total/partial cancellation failures return an error rather than success/info.
- The close service recognizes error bodies inside HTTP 200 and preserves
  failed-position details. Successful replies describe acceptance, not fills.
- FYERS/Kotak bulk cancellation checks body success as well as HTTP status.
  Failed book reads are no longer interpreted as empty books. Kotak's explicit
  5203 / No Data empty-book response remains supported.
- Kotak validates the initial position read and each exit acknowledgement,
  returns accepted IDs and rejected/unconfirmed legs, preserves BUY/SELL
  quantities/products and invalidates its position cache. No exit is retried.

Verification: 182 frontend tests across 11 files and 43 isolated backend tests
passed (225 total). These include rejection/partial failure/timeout, delayed
cancellation and fills, unknown working statuses, malformed books, double
click, account/mode changes and timer/read cleanup. The older ChartPane
test double now mirrors addCustomInterval's setInterval call. A pre-existing
dialog accessibility warning remains. Tests mock broker operations; no real or
sandbox order/cancel/close action was performed.

Production TypeScript/Vite build is staged in a temporary directory before
publication; existing build reference/large-chunk warnings are unchanged.
Recovery branches before-scalper-exit-all-20261025 (and prepared suffix) are
retained. Both instances receive the same sources and complete canonical
assets, with old hashed chunks retained for already-open pages.

No credentials, trading mode, SDK (2.6.7), schema or dependencies are changed.
No migrations are required. The separately pending upstream security
activation is not part of this update. Live fills, slippage and order execution
latency cannot be established by the mocked tests or read-only health checks.
Refresh both Scalper pages after deployment.

Resource audit: one operation lock/controller per mounted hook, one bounded
verification timer at a time, and finite per-call result lists. Timer listeners
and read requests are released on completion/error/unmount; the cleanup test
asserts zero remaining verification timers. Existing shared broker HTTP clients
are retained. No new pools, sockets, threads, caches or database sessions are
introduced. Review is static plus mocked lifecycle tests, not a sustained
production memory profile.
