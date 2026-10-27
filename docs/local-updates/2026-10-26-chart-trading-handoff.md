# Clean chart trading — isolated implementation checkpoint

## Activation status

This is unfinished application work, not an activated release. `CHART_TRADING_V2`
defaults to false. Both live installations, their credentials, execution modes,
databases, served assets and processes were left unchanged. No real or sandbox
orders, cancels or closes were used for diagnostics.

Working checkout: `C:\Users\ashut\.gemini\antigravity\scratch\openalgo\tmp\upstream-security-20261023`.
Branch: `feat/chart-trading-20261026`, based on
`8121e6e26a4fbe29a26c27a02048ff79c295e99a`.
Recovery ref: `backup/before-chart-trading-20261026` at that same base.
No feature commit or push yet. The prepared base includes a separately pending
security/sandbox/dependency update. Do not fast-forward either live installation
to this checkout or activate the unrelated update while deploying this feature.

## Implemented in this checkpoint

- Internal session-authorized capability, state, command and status endpoints;
  existing public order APIs remain the broker execution pipe. New endpoints
  retain CSRF/session protection and existing request pacing.
- Durable SQLAlchemy command and per-instrument/product claims. Concurrent
  releases cannot double-dispatch, IDs cannot be reused with changed payloads,
  and uncertain delivery is never automatically retried. Configured-account
  claims survive daily token renewal while draft generations change on login.
  Only contract fields are persisted; no raw credentials or whole book objects.
- Expected broker versions, working-order checks, actual close quantities,
  decimal tick/lot/freeze validation, cash/derivative product checks, fresh quote
  fetch limit and stop-side validation. Ambiguous results are distinct from
  acceptance, and acceptance requires a valid broker identifier.
- Explicit non-destructive migration CLI with consistent SQLite backup and
  integrity verification before schema creation. It has only run on disposable
  test databases. Capabilities refuse activation when schema is absent.
- Original native-theme compact canvas controls, entry/order chips and exact
  formatted axis values with leaders and collision spacing. Native SDK package
  remains 2.6.7; node_modules was not modified.
- Explicit priced draft arming, release-to-place and release-to-modify paths;
  Escape/pointer cancel, mode/lock/symbol changes and teardown disarm gestures.
  Drafts are removed before async submit, preventing a second release.
- Existing drag previews survive unchanged books. Broker events invalidate
  older in-flight snapshots and schedule a coalesced trailing refresh. A fill
  or executable state change invalidates the captured drag version.
- Compact chart composer, right-axis plus action affordance and shared terminal
  route for Scalper bottom-bar buttons when the staged feature is enabled.
  Existing One-Click and Exit All paths remain available behind the disabled
  feature switch. Bid/ask are not substituted with LTP or Renko brick prices.

## Validation so far

Final checkpoint at 16:40 IST: 61 backend tests, 42 frontend tests and
TypeScript compilation passed. Vite production output was generated from the
current application sources under `tmp/chart-trading-build-20261026`.
Read-only /faq checks returned HTTP 200 on both ports (5000 PID 4912;
5001 PID 25296). No process was restarted. `git diff --check` passed.

Backend coverage includes concurrent duplicates, crash/restart ambiguity,
confirmed book reconciliation, exchange/product isolation, renewals, broker
rejections/invalid IDs, partial-fill version changes, freeze/quote refusals,
unsupported protection refusals and migration preservation. Resource checks
drive 100 rejected commands and require every SQLAlchemy checkout to check in.

Frontend fixtures cover duplicate releases, no-trade panning, Escape/pointer
cancel, replay/lock/mode refusal, partial fills during drag, stale book responses,
bid/ask separation, axis-label collisions and teardown. The repeated
100-cycle attach/detach and axis-action tests passed in the final rerun.
All transports are mocks; none of these tests prove live execution/fill timing.

The build retains baseline large-chunk and unresolved-reference warnings.
Previously established `terminalHistory` baseline failures remain unrelated.
No manual browser profiling or visual acceptance has been completed for this
new UI. No zero-latency or broker-site-equivalence claim is made.

## Release blockers and remaining implementation

1. `CLAUDE.md:87` explicitly requires the Linux gthread suite before every
   commit/PR. WSL is not installed, Docker/Podman are unavailable and no Linux
   runner was established here. Do not treat Windows green tests as this check.
2. Native broker protection is unfinished and capability-gated off. No local
   price-trigger exits or synthetic OCO exists. FYERS Single/OCO eligibility,
   stable position-to-trigger associations, edits/cancels, fill/quantity changes
   and close handling need implementation and lifecycle tests. Kotak linked
   brackets and entry-attached brackets stay disabled until a verified contract
   exists. Keep unrelated broker orders untouched.
3. Unknown-delivery requests with no broker ID intentionally retain their
   durable resource claim. A user-visible read-only resolution/reconciliation
   workflow is needed; never infer an association from matching prices.
4. Complete backend margin preflight, broker-specific order-type capability
   checks and explicit working/partial/filled/rejected UI status presentation.
5. Validate full account identity: current durable scope uses the two local
   instances' own configured FYERS app / Kotak UCC plus local user/mode. Do not
   generalize it to shared third-party app credentials or multiple client
   accounts without an authoritative broker account identifier.
6. Browser acceptance must cover both themes, narrow Scalper panes, crowded
   labels/overflow, zoom/inversion, moved panes, context changes and all custom
   Renko versions. Review missing-depth freshness and dense-axis affordances.
7. After all critical/high defects are resolved and required checks pass,
   isolate feature-only changes from the pending security update, rebuild to a
   temporary directory, back up each relevant live database consistently,
   migrate explicitly and publish matching canonical assets with old chunks
   retained. Activate only in an established safe restart window. Then commit
   coherent source/assets and push without force. Current output is staging
   output and must not be deployed as if release acceptance were complete.

Exact next step: restore/reuse this preserved working checkout; do not redo
the completed stage-one tests without a source change. Continue with the
unknown-delivery resolution and broker protection contract/lifecycle stage,
then browser fixtures. Keep Linux validation as a required release gate.

## Earlier history activation correction

Kotak history backend activation was completed on 26 October at 10:04:24 IST.
NIFTY and SENSEX native Renko were visually verified on 26 October dates with
live prices; FYERS was already repaired. Report commit `8121e6e26` is on the
prepared/origin history; live checkouts may lack only that documentation commit.
Do not repeat the completed restart because an older automation record says
activation is pending. The separate security update and broader performance
acceptance remain pending.

Official FYERS protection reference:
https://fyers.in/api-docs/v3/api/trading/order-placement/gtt-orders/gtt-oco-order/
describes one broker-held OCO with two opposite-side triggers, eligible products
CNC/MARGIN/MTF, and code 201 as transit rather than proof of a working order.


## Stage two checkpoint — paused on user instruction

This section supersedes the incomplete items/status of the earlier stage-one
record above. At the safe pause boundary on 26 October, no implementation or
test process remained running. No new work should start before the usage reset
at 20:15:39 IST; a coordinating chat is arranging a one-time continuation after
that reset. Do not schedule an earlier resume. Preserve this checkout unchanged.

Completed since stage one:

- Added explicit, local-only reconciliation for an uncertain request. A user
  selects the exact broker order ID; fresh book identity, side, quantity and
  version are checked. The journal changes atomically. No order is resent;
  matching prices or absence of an order never proves delivery/non-delivery.
  Still-submitting requests remain blocked because the original handler might
  complete. A native-theme review panel in the compact ticket displays request
  details and the selected broker ID.
- Added live broker margin preflight, with finite required/available values;
  the sandbox retains its own RMS. FYERS portfolio total is preserved while
  separate order-only and available estimates are exposed for preflight.
  Both margin transports now have explicit five-second timeouts. Closes do not
  require extra entry margin. Quotes and state are checked again after slow
  preflight, including fills and changed position quantities.
- Fixed FYERS GTT book mapping: trigger sorting now carries the corresponding
  limit/quantity leg; explicit history requests retain terminal/unknown states.
  FYERS closes refuse existing active or unknown native GTT exits without
  guessing/cancelling an association. Unknown regular order states also block
  a close. These are refusal guards, not completed SL/TP management.
- Both REST broker mappers now retain their real filled-quantity fields. Public
  status vocabulary stays unchanged; the new internal chart state derives
  partial status and versions from actual fills. Missing fills or zero
  remaining quantity refuse modification. Remaining quantity is shown on lines.
- Malformed/unavailable books no longer become empty books. Numeric values and
  identity are normalized/validated; canonical UUIDs and primitive contract
  payloads are required before persistence. Unresolved claims are capped at128
  per account atomically and are not expired just to permit a retry. Added
  broker/exchange and master-contract expiry refusals.
- Browser inspection found and fixed label vertical reordering, overlap with
  trade controls/LTP, dense-level overflow and repeated layout calculation.
  Labels retain exact prices, reserve controls and LTP, keep vertical order,
  and disclose overflow. Escape is captured on the document so a draft also
  disarms when focus leaves the canvas. New lines follow the primary price pane
  after it moves below a study. SDK/node_modules remain unchanged.

Final validation after source formatting:

- 97 backend tests passed (chart contracts/dispatch, real mapper fixtures,
  native GTT/margin mappings, history and FYERS snapshot regressions).
- 46 frontend tests passed; TypeScript passed; Ruff checks passed on the new
  Python modules. Biome formatted only new frontend files using an isolated
  temporary config; repository formatter configurations were not changed.
- 15 headless Chrome browser fixtures passed using SDK2.6.7 and intercepted
  mock transports: both themes, Candles/Renko/V2/V3/V4, narrow panes, crowded
  labels, real drag/release, no-trade panning/Escape outside the chart, zoom,
  inversion and moved primary panes. Network routing refuses non-fixture
  origins. No real or sandbox order API was called.
- Final synthetic60-update fixture: processing p50 0.2ms/p95 0.3ms; own primitive
  draw completion p50 6.5ms/p95 7.0ms. These exclude broker delivery, network,
  execution/fills and compositor/screen presentation, and are not live latency
  guarantees.
- Matching temporary Vite build: tmp/chart-trading-build-20261026-stage2.
  Browser artifacts/logs: tmp/chart-trading-browser-20261026 and
  tmp/chart-trading-browser-20261026-stage2.log. Known large-chunk warnings
  remain. git diff --check passed.
- Last read-only checks: /faq HTTP200 on both5000 and5001; listener PIDs remained
  4912(Kotak) and25296(FYERS). No application services were restarted. The
  fixture-only Vite/Chrome processes exited through the test runner.

Still incomplete / exact next step after the pause:

1. Implement verified native protection associations and lifecycle in the
   existing feature branch, with isolated tests first. No protection store,
   SL/TP composer, associated cancellation/close transaction journal or
   protection drag wiring exists yet. brokerHeldOco remains false and dispatch
   deliberately refuses all unverified protection commands. Implement supported
   individual Kotak exits without pretending they are OCO. Keep entry-attached
   brackets disabled. Preserve global Exit All safeguards.
2. FYERS GTT history/leg mappings are now usable, but the documented GTT book
   does not provide a child-order ID. Never infer the fired child from matching
   prices. Decide safe capability refusals and explicit-ID reconciliation for
   triggered protection; do not silently simulate OCO or leave orphan exits
   after a close/partial quantity change. Use only broker-held eligible products
   and never introduce a local price-trigger engine.
3. Extend uncertainty/status review to protection requests and interrupted
   still-submitting handlers without unlocking a request which might finish.
   Validate actual broker account identity before generalizing the current
   configured-app/UCC scopes to shared third-party apps or multiple clients.
4. Re-run only appropriate checks after new changes. Mandatory Linux gthread
   validation is still unavailable and is required before any commit/PR. No
   WSL/Docker runner was installed or security exposure changed. Do not bypass
   this gate. No feature commit/push/activation has occurred.
5. After every critical/high issue and required test gate is resolved, integrate
   feature-only source onto each live baseline, excluding the separately
   pending security/sandbox/dependency changes. Rebuild there; do not publish
   this prepared-base bundle blindly. Back up databases consistently before
   explicit migrations, retain compatibility chunks, establish a safe restart
   window, activate and push coherent source/canonical assets without force.

All source changes remain uncommitted in feat/chart-trading-20261026 based on
8121e6e26. Both live checkouts, broker credentials, execution modes, databases
and assets were untouched. Kotak's earlier history activation at10:04:24IST is
already complete and must not be repeated.

Primary references checked during this stage:
- https://fyers.in/api-docs/v3/api/trading/order-placement/gtt-orders/gtt-oco-order/
- https://fyers.in/api-docs/v3/api/trading/order-placement/gtt-orders/gtt-order-book/
- https://fyers.in/api-docs/v3/api/calculators/multi-order-margin-calculator/
- https://github.com/Kotak-Neo/kotak-neo-python
- https://github.com/Kotak-Neo/Kotak-Neo/blob/main/docs/trading-apis.md


## Stage three checkpoint — source implementation complete; Linux release gate outstanding

This section supersedes stage-two pause instructions and earlier counts. Work
resumed after the authorized usage reset on 26 October 2026. Current branch is
feat/chart-trading-20261026, still based on 8121e6e26; all feature changes remain
uncommitted and disabled (CHART_TRADING_V2 defaults false). The one-time
continuation is retired at this checkpoint. Do not schedule unchanged polling.

Completed in this continuation:
- Added explicit position-to-broker-ID bindings, persisted atomically with the
  accepted command receipt. A colliding ID cannot overwrite another instrument
  or product binding. Authoritative order/protection preflight is journaled
  before sending. Local receipt failures remain uncertain and never resend.
- Added verified FYERS native Single/OCO contracts with semantic long/short SL
  and TP roles mapped to the documented high/low broker legs. Explicit trigger
  and limit prices stay separate. Current conservative eligibility is Live
  NSE/BSE CNC and NFO/BFO NRML. MCX/CDS GTT eligibility is not established and
  remains disabled. MIS/MTF and entry-attached brackets are not exposed here.
- Added Kotak Live individual SL or target exits through the existing regular
  order services. No linked bracket, simulated OCO, or second independent exit
  pretending to be OCO. Protection is disabled in Analyze for both brokers;
  this feature does not create a local protection price engine.
- Added native exit edits/cancels, flat-position cancellation, position-size
  and direction guards, partial-fill refusals, exact-version checks, margin,
  tick/lot/freeze checks and fresh real-instrument quote preflight. Rejected
  modifications retain confirmed levels. Pending accepted edits never render
  requested prices as confirmed prices.
- Added explicit-ID reconciliation for uncertain native and individual exits.
  FYERS trigger books do not provide a reliable child-order link. A triggered
  exit requires human verification and selection of its child ID; there is no
  price-based association. Confirmed terminal child receipts survive daily
  order-book rollover while their parent trigger remains in native history.
- Added worker birth-time ownership to new commands. A submitting claim becomes
  uncertain only after its owner is proven dead (including PID reuse). Live,
  inaccessible or legacy owners cannot be unlocked by age. Claims remain held;
  no mutation is automatically retried. Requests without usable broker IDs or
  authoritative metadata remain blocked for explicit investigation.
- Added compact native-theme position SL/TP management, exact red stop/green
  target axis levels, offset-preserving one-release edits, and child-ID review.
  Existing-price drag and keyboard/pointer/context cancellation share one owner.
  Chart context close/reduce/cancel and Scalper bottom-bar orders share the
  coordinator; reverse tickets wait for a confirmed flat position. A position
  changed since menu opening is refused. Standalone broker-website orders remain
  visible and product-separated.
- Close and partial exits refuse while associated exits can still execute.
  Explicit cancellation and authoritative confirmation precede closing; unknown
  or unrelated broker orders/triggers are never silently cancelled. Exit All
  checks native protection before its cancellation stage and again before the
  close stage. Existing One-Click and Exit All safeguards remain in place.
- Fixed shared GTT services incorrectly acknowledging broker business errors
  carried in HTTP200 responses. Added regression coverage for place/edit/cancel.
  Also fixed premature close-claim release when an external exit flattened the
  position but the app's own close order was still working.

Validation on the final source:
- 155 backend tests passed: test_chart_protection, test_chart_commands,
  test_chart_command_dispatch, test_chart_gtt_contract,
  test_chart_gtt_service_ack, test_history_cache_ranges and
  test_fyers_index_snapshot_frames. Isolated SQLite and mocked transports only.
- 61 frontend unit tests passed in eight targeted files, including new
  protection composer, native-ID review, gesture isolation and Exit All guards.
- TypeScript and Ruff passed on the new/changed feature modules. Modified
  blueprint/shared-service Python files compile. git diff --check passed.
- 26 actual Chrome fixtures passed: light/dark, Candles and all native/custom
  Renko variants, narrow panes, dense labels, zoom/inversion, moved primary
  pane, real canvas order/protection drags, panning and Escape. All mutation
  HTTP requests were mocked; non-fixture origins were aborted.
- Final production build: tmp/chart-trading-build-20261026-stage3 (397 canonical
  files). Source is the prepared base, which includes the separate pending
  security/sandbox/dependency update; do not deploy this bundle blindly.
- Synthetic local timing, 60 samples: processing p50 0.1ms/p95 0.2ms; own
  primitive draw completion p50 6.4ms/p95 6.9ms. Excludes broker delivery,
  network, fills, execution and compositor. No live latency/equivalence claim.
- Resource audit: existing engine factory/NullPool, context-managed connections,
  no new clients/sockets/threads/watchers. Forty full protection lifecycles left
  zero checked-out connections, claims or active bindings. One bounded layout
  cache and <=128 unresolved per-account bindings/claims; primitive/DOM cleanup
  remains covered by 100 attach/detach cycles. Terminal parent receipts are
  retained safely while native history needs them, within the same bound.
- Both live /faq HTTP checks returned200. Fixture port5178 was released. No
  application service restart, migration, mode change, broker mutation or
  credential change occurred. Actual execution/fill timing is unverified.
- Existing unrelated terminalHistory baseline failures (19) and known Vite
  chunk/reference warnings remain; this is not a full-suite all-clear.

Material limits:
- Native GTT is broker-held but is not a reduce-only position attachment.
  External broker trades can change a position while its trigger remains live.
  The app shows quantity/direction review states and blocks unsafe app exits;
  it cannot guarantee an external broker action atomically cancels a trigger.
  No local automatic price-trigger exits or guessed child associations exist.
- The current durable identity assumes these local instances' own FYERS App
  and Kotak UCC. Validate authoritative broker account identity before expanding
  this to shared third-party apps or multiple broker clients.
- Requests with missing IDs, unresolved still-live handlers, or unavailable
  native books remain blocked; absence from a book is not proof of non-delivery.

Release blocker and exact next step:
CLAUDE.md:87 requires the Linux gthread suite before every commit/PR. At this
checkpoint wsl --list --quiet confirms WSL is not installed; Docker/Podman and
an established Linux runner are unavailable. Windows skips do not satisfy it.
No Windows feature was installed and no security exposure was changed.

On an approved existing Linux runner/copy on the Linux filesystem, run:
  uv sync
  uv pip install "gunicorn>=25.0,<26" "eventlet==0.41.2"
  .venv/bin/python -m pytest test/test_gthread_*.py -o addopts="" --timeout=120 -rs

After that gate: integrate only feature hunks onto recoverable isolated release
checkouts based on each live baseline, preserving unknown work and excluding
the unrelated pending security/sandbox/dependency update. Re-run appropriate
checks and the Linux gate on the final integration; generate matching assets
there. Before activation, consistently back up databases and run the explicit
non-destructive three-table migration, retain old compatibility chunks, establish
a safe strategy/market restart window, then commit and push coherent source and
canonical assets to origin without force. No feature commit/push is present yet.

Preserved live baselines: Kotak627603308981cd382706afb14f293d890fc8becd,
FYERS1759006d161938b5cccaabc5ee44c8be87b1b160. Kotak's unknown db cache,
docs/ANTIGRAVITY_UPDATES.md and static/ remain untouched. SDK2.6.7, Renko versions
and icons, Gaussian blue/maroon, indicators, routing, P&L, margin and history/date
fixes remain intact. Kotak history activation at10:04:24IST is already complete;
do not repeat it. The separate upstream security update is still pending.

Primary sources checked for this stage:
- https://fyers.in/api-docs/v3/api/trading/order-placement/gtt-orders/gtt-oco-order/
- https://fyers.in/api-docs/v3/api/trading/order-placement/gtt-orders/gtt-order-book/
- https://support.fyers.in/portal/en/kb/articles/how-long-are-orders-valid-in-fyers-day-ioc-gtt-smart-orders
- https://support.fyers.in/portal/en/kb/articles/how-to-place-a-gtt-order-in-fyers
