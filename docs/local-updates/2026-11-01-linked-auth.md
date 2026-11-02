# Linked broker authentication — 1–2 November 2026

Status: installed, restarted and independently verified on both Kotak and FYERS on 2 November. Tested application commit `564afedef7e020248539ec528042115da7131ff5` is pushed and verified on origin/main. The former linked-login incompatibility is resolved for this release.

## Scope and behavior

Integrated authentication target: upstream `da15d464127c363da0980cbd45c0a3f94e090e10`, including the broker-auth rewrite `eec700046`. Base is the already deployed `e5d2dd0ee028ab8c209ef8b6438eb0741900c762`. The separate feature checkout is `tmp/linked-auth-20261101` on `feat/linked-auth-20261101`; the original conflicted preview and every recovery snapshot were retained.

The adapter maintains two independent instances: Kotak on 5000 and FYERS on 5001. The server's signed-in broker list supplies strictly configured loopback routing metadata, without returning full broker keys. A linked entry opens the other instance instead of switching the current server's broker, invoking its strategy switch guard, or replacing its keys. Key editing for a linked broker stays in that broker's own instance.

The secondary verifies the primary cookie signature, completed password/TOTP identity, active device when applicable, proof time, daily boundary, and durable revocation records through a read-only SQLite connection. Its local sign-in time and the original authority proof are kept separately. Original proof is rechecked on subsequent browser requests and at the final token commit after the broker responds; a primary sign-out during the exchange refuses storage. A fresh explicit SSO login after a local sign-out can reuse valid primary identity, while an older local cookie remains revoked.

`GET /auth/instance-login` imports only app identity and opens the native broker selection page. **Login with Fyers** starts the new CSRF-protected `POST /auth/broker/login`, generating the durable one-time pending state. The old FYERS GET launcher no longer creates its own incompatible state. Invalid, missing, expired or replayed callback state is refused by the common upstream checks. Kotak's form login uses the same started-login contract and retains its normal CSRF-checked form submission. Callback, login-slot, key-version, account-match, session-revocation and strategy-binding checks were preserved.

The primary Login page now reads masked broker-list metadata for its return to FYERS, instead of depending on the removed API-key response. This also preserves the cross-port return after a password/TOTP sign-in. It validates the destination as a configured loopback `/auth/instance-login` URL.

## Versions and preserved customizations

Platform/official release **2.0.3.2**, chart SDK **2.6.9**, Python client SDK **2.0.5**. Pinned `joserfc` 1.7.7 and `follow-redirects` 1.16.2 remain. NPM manifests are semantically identical to the installed locked dependency tree; no SDK package or `node_modules` source was patched. A new temporary production build contains **403 canonical files**; prior compatibility chunks are retained.

Preserved: Scalper915, Renko V2/V3/V4/icons and the NIFTY Trading recovery, Gaussian blue/maroon styling, all indicators, chart defaults, FYERS routing/performance, broker P&L, margin, order APIs and Exit All safeguards, the October commodity fixes and unknown local work. The cancelled chart-trading redesign remains cancelled. No automatic broker switch, diagnostic order, cancellation, close-position or execution-mode action was used.

## Validation

- Linux: **1,478 required gthread checks passed**, three existing documentation skips; **348 supplemental auth/broker checks passed**, no skips. Total **1,826 passed**, three skips, zero failures/errors.
- Windows: **243 auth/backend checks passed**, one Linux-only skip, including all **28 linked-auth checks**. These sets overlap and are not added together.
- Frontend: **55 checks passed**, including linked navigation without a Kotak switch, primary login return without an API key, remote key isolation and the chart SDK architecture checks. TypeScript and the temporary production build passed.
- Four disposable headless Chrome fixtures passed: light/dark and wide/narrow. Each opens the linked instance, issues its own CSRF-protected start and reaches a mocked FYERS portal. The actual theme class and absence of horizontal overflow were checked. No real broker HTTP request, user browser profile, order or account data was used.
- A runtime-only mutation bypassing the final authority check made the intended sign-out-during-exchange test fail at its security assertion. The unmodified implementation passes; no application source was changed for the mutation probe.
- Resource audit: no new worker, socket, cache or subscription registry. The primary identity connection is read-only, has an explicit two-second timeout, and closes through `contextlib.closing` on every exit. Repeated success/refusal tests verified 200 owned connections opened and 200 closed. Upstream DB sessions, login-slot teardown, bounded pending-state storage and request-local key cleanup use their shared lifecycle helpers.

The final Linux gate verifies **3,922 source files** from one fresh Linux-filesystem copy, including the complete gthread suite and supplemental group after the last source/fixture change. No test assertion or timeout was weakened. The earlier portable-import collision with Linux's standard-library `test` package was corrected in the test fixture. A later lifetime fixture now uses the same simulated clock for sign-in and revocation; its old mixed clocks failed reproducibly before the morning fake timestamp. These failures and superseded gates remain in private evidence.

Windows Modern Standby from 20:43:18 to 20:58:19 IST on 1 November caused a matching 15-minute guest scheduler gap and a Windows subprocess timeout. The final runs used a temporary process-scoped system-awake request, released in `finally`, without changing permanent power settings or Windows features. The guest continuity monitor recorded no suspension gap (maximum sample interval **0.531 seconds**). Both final test processes exited zero and released their requests. Existing shutdown closed-stream logging warnings occurred after successful pytest exit.

The linked pre-broker proof follows the native daily session boundary and durable revocation checks. The obsolete 15-minute source-cookie heuristic is removed, so a valid secondary login is not dropped after fifteen minutes. The upstream pending OAuth callback remains bounded and single-use.

Offline changed-source secret scanning reviewed 93 candidates: placeholders, field/path names, fake masked fixtures, public denylist constants and one unchanged upstream bootstrap literal already in the base. No new operator credential was found in the changed source. Actual signing keys were compared in memory to the public denylist and did not match; neither credentials nor account databases were staged. This is a changed-scope review, not a blanket whole-tree security clearance.

## Migrations, recovery and release

Both migrations were rehearsed twice on fresh consistent private **local** copies of each database. All existing rows and original columns remained identical, integrity checks passed, and the second run changed nothing. They add only `broker_keys`, `broker_login_states`, `session_revocations` and nullable `sm_strategy_run.broker_account`. No historical account association is guessed. Real account data and `.env` files never entered the Linux VM.

Recovery branch in both live repositories: `backup/before-linked-auth-20261101`. Private base source/assets archive, unknown-work snapshots, configuration recovery copies, rehearsals, screenshots, hashes, logs and gates are in `C:/Users/ashut/.codex/backups/openalgo-linked-auth-20261101`. Immediately before the live additive migrations, five databases per instance were backed up consistently and checked (ten snapshots total). The live migrations added exactly the three tables and nullable strategy column listed above; all existing rows and original columns remained unchanged and integrity checks passed. Credentials and network exposure are unchanged.

Actual interactive broker authentication remains the user's normal login step; it was verified here with mocked broker transports, not real account login or execution. Refresh both tabs and sign in normally if prompted; linked FYERS opens its own broker sign-in flow on port 5001.

## Other observations

The later fetched upstream head `89442ceec` includes an unrelated LiteLLM agent/MCP change (`00314fb63`) outside this authentication task. Its redirect dependency fix is already present locally. Do not claim this release includes that separate agent change. The known Windows null TCP-state controller display issue, Kotak's broker-rejected MCX history (422), and the intentional filelock/LiteLLM metadata warning remain unchanged.

## Activation and GitHub results — 2 November

- Fresh activity check at **10:04:07 IST** found both instances in Analyze mode, no current-day browser/broker sessions, no open Analyze positions or working orders, and no running workflows, strategies or strategy processes. Both identified services stopped through their controller; no unrelated application was stopped.
- Frozen dependencies synchronized without package-source patches. Ten offline consistent SQLite snapshots were verified before the additive migrations; private `.env` hashes remained exact. Both installed heads match application merge `564afedef7e020248539ec528042115da7131ff5`, whose parents preserve the prior live commit and full upstream target `da15d464127c363da0980cbd45c0a3f94e090e10`.
- Kotak started **10:06:34 IST**, controller Ready **10:07:34**; FYERS started **10:07:56**, Ready **10:08:17**. Read-only checks passed for `/faq`, `/trading`, the new `/assets/index-v6Lm39dV.js`, and six previous entry chunks. Served HTML and all **403 canonical files per instance** match the reviewed build. The guest broker list refuses unauthenticated access (401); FYERS `/login` uses the expected shared-login redirect. Additive schema/integrity, pinned package versions, all six endpoint owners and correct process roots passed.
- All **333 unknown primary docs/static files** were byte-identical after deployment; runtime caches were preserved and remain untracked. Old compatibility assets are retained for previously opened tabs. Credentials and network exposure are unchanged.
- Normal push succeeded; `git ls-remote` verified application commit [564afedef](https://github.com/shelmoy/Trading-Terminal/commit/564afedef7e020248539ec528042115da7131ff5) on origin/main. This activation report is a documentation-only follow-up; final local/remote refs are recorded in automation `last-run.json` and the private completion record.
- The approved Ubuntu VM is retained and powered off. Temporary validation awake requests were released. No orders, diagnostic cancellations, position closes, execution-mode changes or actual broker account logins occurred.

The existing controller table may still display “Starting / unavailable” because Windows reports null TCP states despite Ready logs. Independent HTTP, exact served assets and six owned endpoints all passed; healthy services were not repeatedly restarted to chase that display label. The later agent/MCP patch remains a separate upstream item, rather than a claim of full integration through fetched head `89442ceec`.
