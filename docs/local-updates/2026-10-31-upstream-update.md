# OpenAlgo 2.0.3.2 integration â€” 31 October 2026

Status: 2.0.3.2 is activated on both installations; source, dependencies, migrated data and served assets are verified. GitHub synchronization follows this documentation checkpoint.

## Source and versions

- Both live roots and origin started at `9a665460190d40d6ae9404b7c576d87272152cad`; the last integrated upstream was `dd198ba99529fb13c20ef97fa1f58345fab170ea`.
- Upstream and origin were fetched in both roots. This run pins upstream `a9370edf8c3aeb1a5f0d7af43e00726428f36933`, official [2.0.3.2 release](https://github.com/marketcalls/openalgo/releases/tag/openalgo-freeze-limits-muhurat-session).
- Integration checkout: `tmp/upstream-check-20261031`, branch `preview/upstream-20261031`.
- Platform moves from 2.0.3.1 to 2.0.3.2. Chart SDK remains 2.6.9; Python client SDK remains 2.0.5. LiteLLM moves from 1.104.0 to 1.106.6, with boto3/botocore 1.43.122 in the frozen lock.
- The changelog conflict was resolved by retaining both the local 30 October fixes and upstream's full new release stanza. Generated frontend conflicts were replaced by a fresh production build from the merged custom sources.

## Relevant behavior

November NSE freeze defaults become NIFTY 1800, BANKNIFTY 900, FINNIFTY 1800, MIDCPNIFTY 2800, NIFTYNXT50 600 and NIFTYFPI 8500. They are effective 2 November. Existing order paths still round down to whole lots; NIFTY's 65-unit lot gives a maximum 27-lot/1755-unit piece. Only matching shipped/previous exchange values are migrated. Custom values and deliberate deletions are preserved. The superseded October migration is replaced to prevent it from raising the limits again.

The 8 November Muhurat calendar becomes 14:20â€“15:30 IST, with equity derivatives ending 15:40. NCO is added to the special session. Existing matching guessed sessions are corrected; custom entries remain. The holiday upgrade no longer clears and reseeds a curated calendar. The reviewed NSE [equity circular](https://nsearchives.nseindia.com/content/circulars/CMTR76941.pdf), [F&O circular](https://nsearchives.nseindia.com/content/circulars/FAOP76940.pdf), [currency circular](https://nsearchives.nseindia.com/content/circulars/CD76972.pdf), [commodity circular](https://nsearchives.nseindia.com/content/circulars/COM76978.pdf) and [MCX circular](https://www.mcxindia.com/docs/default-source/circulars/english/2026/october/circular-590-2026.pdf?sfvrsn=41cf74f3_1) support these normal-session times. The new freeze circular's direct NSE PDF timed out; its values were reviewed in upstream's release/code and matched the published circular transcription. No independent PDF-verification claim is made for that table.

WhatsApp file-backed session snapshots run in a bounded, waited subprocess so Python SQLite does not disturb the client's in-process WAL locks. Static resource review covered temporary descriptor closure, subprocess timeout/reaping and dump removal on success/error. Isolated WAL-copy tests cover the write visibility and cleanup paths. No WhatsApp message was sent. Agent model catalog entries are refreshed through the new LiteLLM pin; existing models remain configured as before. There is no new dedicated Kotak broker or P&L implementation in this upstream range. The Scalper source change is a freeze-limit comment; its execution safeguards remain intact.

## Preserved local work

Scalper915 and its bottom bar/books, Renko V2/V3/V4 and icons, NIFTY V4 Trading history/persistence recovery, Gaussian blue/maroon, all indicators, chart defaults, P&L/margin/Exit All safeguards, linked FYERS login/routing and market-data performance changes remain. The cancelled chart-trading redesign remains cancelled. The Oct30 Kotak optional-field/real-bid-ask quote fix and failed-symbol-switch history clearing remain unchanged. Unknown primary documentation/static files and runtime work were backed up and are not staged.

Kotak MCX quotes/trading support does not imply historical candle availability: the broker still rejects MCX history with HTTP422. The existing clear refusal and same-instrument cache behavior are retained; there is no fabricated or silent cross-broker history fallback.

## Recovery and migration rehearsal

Private records: `C:\Users\ashut\.codex\backups\openalgo-update-20261031` and `C:\Users\ashut\.codex\backups\openalgo-release-20261031`. Both roots have identifiable recovery branches, unknown-work/source/served-asset archives, private environment recovery and complete prior virtual environments. Credentials, account databases, runtime caches and backups stay outside Git and outside the Ubuntu VM.

The three reviewed migration scripts were rehearsed against consistent SQLite backup copies of each installation. Dry runs changed nothing. Application changed only six `qty_freeze` records and eight Muhurat exchange entries; schemas and all other tables remained identical. A second application was logically identical. Fresh consistent offline backups and another activity check were completed immediately before live application. Every SQLite backup passed `PRAGMA quick_check`.

## Validation

- Frozen Windows dependency synchronization passed. Frontend package/lock exactly match the prior isolated dependency tree; no package edits or SDK upgrade were required.
- 328 focused Windows backend tests passed, with seven platform-specific skips. Linux covers the required platform-specific gate separately.
- 95 frontend tests and final TypeScript check passed. An existing incomplete auth-store test mock and outdated direct-Dashboard-link assertion were repaired to test the preserved navigation fold/unfold behavior without remounting the chart. Application navigation was not changed.
- Fresh temporary Vite production build passed under Node 24.22.1, producing 400 canonical files. Old compatibility chunks are retained. Existing large-chunk/plugin/runtime-reference warnings remain.
- Full Linux validation passed: 1,952 passed, four skipped, zero failures/errors. Required gthread suite: 1,478 passed/three documentation skips; additional focused checks: 434 passed/one absent-tilde-fixture skip; isolated strategy tests: 40 passed. Fresh source: 3,898 hash-verified files in the retained Ubuntu VM, Linux 6.8/Python 3.12.3, no real credentials or account databases. The first combined invocation exposed global database-environment contamination from strategy-test collection and a timer-wakeup-count assumption. Strategy tests now run in a separate process; the heartbeat mock waits for observed progress under a bounded timeout while preserving the original assertions. The complete final groups passed sequentially. Failed diagnostic evidence is retained privately; it is not used as a release gate.
- Both live instances passed read-only `/faq` and `/trading` HTTP checks before deployment.
- `uv pip check` reports the existing intentional LiteLLM metadata/filelock conflict (`filelock>=3.16.1,<4` versus the pinned security override 4.2.4). Frozen resolution succeeded; the security override was not downgraded. Existing closed-stream test-shutdown logging warnings remain.
- GitHub CI is manual-dispatch-only and has no main-branch CI run. Older unrelated Dependabot workflow failures were recorded separately; they are not a passing Linux validation result.

## Activation record

Application merge commit: `67b1038c0f72aa68e00aafd386b94bdcbf51a49f` ([GitHub commit](https://github.com/shelmoy/Trading-Terminal/commit/67b1038c0f72aa68e00aafd386b94bdcbf51a49f)). Both installations fast-forwarded from the preserved recovery point after a fresh safe-window check: Analyze mode, no active strategy processes/workflows, no working orders or open Analyze positions. No execution mode was changed.

Both frozen dependency synchronizations succeeded. The holiday correction reported no change; each database received six freeze updates and eight Muhurat entries. All six final freeze values, eight special-session windows and live database integrity were checked read-only after activation.

Kotak restarted at 12:38:06 IST and FYERS at 12:38:33 IST on 31 October. Both serve `/faq` and `/trading` with HTTP200 and byte-identical canonical HTML/new entry `/assets/index-3CmmXKCC.js`. All400 canonical files match the validated manifest in each installation; four older entry chunks remain accessible with HTTP200 for already-open tabs. Kotak login is HTTP200; FYERS login correctly returns the shared-login HTTP302. Installed platform2.0.3.2, LiteLLM1.106.6 and SDK2.6.9/2.0.5 pins were verified. Exact environment hashes and all333 unknown primary documentation/static files are preserved.

The controller retains its pre-existing Windows readiness-display limitation: Windows sometimes reports no TCP listening state for genuinely bound endpoints, and the linked FYERS login redirect differs from its probe. FYERS's controller wait timed out while retaining the healthy process. No repeated restart was attempted. Public HTTP, served-byte checks and all six bound-port owners matched the controller's identified broker process IDs. Its shutdown PID-identity race also reported an error after workers had exited; all endpoints were independently proved free before installation. These diagnostics are retained privately and are not represented as a clean controller status result.

The retained Ubuntu VM was powered off after collecting its passing gate. No rollback was required. No diagnostic order, order cancellation, position close, credential change or network exposure change occurred. Normal GitHub push and final head verification are recorded in this automation's private last-run record.
