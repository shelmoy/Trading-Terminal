# Windows maintenance — 3 November 2026

The latest upstream changes are integrated and validated in the isolated
`maintenance/upstream-20261103` checkout. Local activation remains deferred while
the user's working web login and separate mobile/FYERS provider setup are being
coordinated. Neither live checkout, configuration, database nor service changed.
The cancelled chart-trading redesign remains cancelled.

## Versions and scope

- Installed and official source version: **2.0.3.2**; chart SDK **2.6.9**;
  Python client **2.0.5**. The latest release ID remains **429438295**,
  [freeze-limits/Muhurat release](https://github.com/marketcalls/openalgo/releases/tag/openalgo-freeze-limits-muhurat-session).
- Previous prepared upstream `89442ceec72a74c32f17a015b2258f79943ad2b7` advances
  to `f5805220b8790b84fbfb4ec8fa4cd592498b1155`, two commits. The merge starts
  from tested/pushed main `fd12560d6fc3fefc11a7173787064c707e4f127c` and has no
  source conflicts. Exact merge/push SHAs are stored in automation `last-run.json`.
- Groww subscribes indices on the index topic, retains the OpenAlgo index
  exchange in dispatch and refuses unsupported commodity/currency streaming.
- Tradejini handles the new ETF master group, preserves index exchange
  identity, repairs invalid candle wicks/missing values, merges L1 price fields
  into depth, prunes removed subscriptions and closes sockets across connection
  and handshake races. A stale duplicate streaming implementation is removed;
  the shared API implementation remains the one used by the adapter.
- New optional Python-strategy skill/helper sources are included. They were
  parsed statically; no strategy, rehearsal, actual broker call or order engine
  was run by this update. They are not imported into normal application startup.
- No new Kotak, FYERS, Scalper, chart, P&L, margin or shared authentication change
  is present in these two commits. All local Renko versions/icons, NIFTY date and
  formation fixes, Gaussian blue/maroon, indicators, native themes, Exit All,
  commodity/performance fixes and linked-login behavior remain preserved.

## Windows verification and resources

- Focused broker/linked-auth regressions: **294 passed, one existing Linux-only
  skip**. Additional Groww topic/dispatch/exchange and Tradejini ETF/index
  regressions: **10 passed**. All use fake data/transports or disposable databases.
  No Linux suite, VM, Ubuntu, WSL, container or virtualization feature was used.
- The initial two added mapping assertions treated a DataFrame as a list; they
  were corrected to use `.iloc[0]`. This was a test-authoring error, not an
  application failure or a weakened expectation. Initial output is retained.
- Ruff reports **20 findings on both the unchanged parent and merged source**,
  with no introduced findings. Baseline comparison is saved privately. No lint
  suppression or unrelated rewrite was applied. Existing closed-log warnings
  occur after successful pytest termination; JUnit has zero failures/errors.
- Seven new optional Python helper sources parse successfully. No runtime
  compatibility claim is made for invoking those strategy tools on Windows.
- Dependency manifests/locks, migrations and frontend sources are unchanged.
  No installation or schema migration is necessary. The prior successful
  temporary production build's **403 canonical assets** match both running
  installations and the prepared source exactly. Git checkout line-ending
  conversion in the isolated copy was corrected from verified canonical bytes;
  no generated content was edited or rebuilt unnecessarily. Older chunks stay.
- Resource audit: Groww adds no socket or worker and retains existing
  subscription cleanup. Tradejini uses the existing stream owner, a connection
  lock/stopped guard, closes late opens and handshakes, and prunes quote/depth
  caches on unsubscribe/disconnect. Mock lifecycle tests exercise these paths.
  Actual long-duration broker streaming and execution latency were not measured.

## Recovery, health and activation

Recovery branches `backup/before-maintenance-20261103` exist on both live
installations. Unknown files are privately archived and fingerprinted under
`C:/Users/ashut/.codex/backups/openalgo-update-20261103`; original configurations
are fingerprinted but never committed. No live database write or migration
occurred, so no maintenance database restore was needed. Existing recovery
snapshots, mobile preparation backups and compatibility assets remain intact.

Both live heads remain `1865959801bd170dce4dc6ea991345c07b1f97f4`, running linked
auth application `564afedef7e020248539ec528042115da7131ff5`, integrated through
upstream `da15d464127c363da0980cbd45c0a3f94e090e10`. The earlier Agent update is
still prepared/pushed, not activated. Read-only Trading, Scalper, FAQ and exact
current entry-asset HTTP checks all returned **200** on both ports.

The 09:35 IST read-only activity check found Analyze mode, no active
flows/strategy modules, no open Analyze positions or working Analyze orders,
and no browser login after the daily rollover. The unrevoked auth rows are
**expired**, not current-session evidence: Kotak expired 2 November 18:30 UTC,
FYERS 3 November 00:30 UTC. The previous "current FYERS session" reason is now
historical and must not be repeated as current. Broker-website books and a new
interactive cutover were not verified. The user is coordinating a provider
callback change and explicitly preserving the working web setup during market
hours, so no disruptive activation was attempted in this run.

Next: coordinate the pending FYERS callback save and mobile cutover separately;
recheck actual activity/authority and broker state immediately before any stop.
Use matching tested code/assets, fresh consistent backups and only the owned
controller services. Do not blindly pull either mobile or maintenance branches
into a running checkout. The APK still requires private Serve activation and
physical OnePlus acceptance; this maintenance does not imply those are complete.
