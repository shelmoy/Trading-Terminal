# Upstream Agent compatibility update — 2 November 2026

Status: complete exact-source validation passed; guarded activation and normal GitHub synchronization are pending. The linked-login release was already completed separately.

## Scope and review

Base `1865959801bd170dce4dc6ea991345c07b1f97f4`; complete upstream target `89442ceec72a74c32f17a015b2258f79943ad2b7`, including `00314fb63`. The only merge conflict was the existing exact `follow-redirects` 1.16.2 override versus upstream's ^1.16.2 range. The tested exact pin and its lock were preserved. Python metadata changes are comments only: dependency requirements, lock, chart SDK and frontend source are unchanged.

The update serializes the first LiteLLM import through a shared loader and imports its root package before submodules, avoiding an import-lock cycle between the model catalogue and ChatGPT provider. Ordinary function-tool requests skip LiteLLM's unnecessary MCP gateway, which requires incompatible MCP 2.x names while OpenAlgo uses MCP 1.30. Explicit MCP tools still reach the original gateway; no server, credential, permission or network exposure was added. No actual agent model request or broker trade is performed by diagnostics.

All changed call sites were reviewed. Remaining type imports in the tool-argument streaming iterator run after the loader has completed; they are not a first-import entry point. This adapts application code only; no installed dependency or chart SDK source is patched.

## Resource audit

The loader owns one module-level lock and a Boolean installation marker. Its finished-module fast path avoids locking; imports that can still execute serialize under a context manager, releasing on success or exception. The lock is green under eventlet and a real lock under gthread/dev mode, matching import behavior. No executor, worker, subprocess, socket or DB connection is added to request paths. The compatibility wrapper retains a single original function, marks itself and installs once; repeated installation is idempotent. No symbol/account/request-keyed registry or unbounded cache is introduced. Fresh interpreter race tests exercise real threads and eventlet; gateway tests reproduce the original dependency failure and use fake tools/mock responses or closed loopback port9 rather than broker transports.

## Validation and rollout

Full Linux gthread and supplemental authentication/broker/Agent regression validation runs against a fresh Linux-filesystem copy without `.env`, account databases or actual credentials, in the retained approved Ubuntu VM. A temporary process-scoped awake request and clock monitor protect the run from the documented Modern Standby gap. Windows focused checks, Ruff, TypeScript and a temporary production build are separate gates. Final results and activation status are recorded below after collection.

No schema migration is required. Recovery branches `backup/before-agent-update-20261102` exist in both installations; private unknown-work archives and evidence are in `C:/Users/ashut/.codex/backups/openalgo-update-20261102-agent`. Platform remains2.0.3.2, chart SDK2.6.9 and Python client2.0.5. Scalper, custom Renko versions/icons/NIFTY recovery, Gaussian blue/maroon, indicators, chart defaults, routing/performance, P&L/margin/ExitAll, commodity fixes and the completed linked-login adapter are preserved. The cancelled chart-trading redesign stays cancelled.

## Collected validation results

- Linux: **1998 passed**, 4 skips, zero failures/errors; required gthread group 1478 passed. Supplemental authentication/broker/Agent group 520 passed. Fresh guest `/home/validator/openalgo-agent-20261102` verified 3926 exact source files. Clock continuity had no suspension gap (maximum interval 0.522s).
- Windows: **155 passed**, 9 documented skips, zero failures/errors. Eventlet-only behavior is exercised on Linux; the remaining skip covers an absent ignored tilde directory. The first Windows collection inherited unsupported `LOG_FORMAT=json`; the final harness sets the repository logging format. That collection failure is retained, no application change or weakened assertion was used.
- Ruff and TypeScript passed. The temporary production build at `tmp/agent-build-20261102` produced **403 canonical assets byte-identical to the already active authentication release**. All are already present in the source commit's parent, so no replacement or new asset chunk is required. Frontend source, themes, chart SDK and dependency lock are unchanged. The prior 55 frontend and four Chrome linked-auth fixtures remain applicable to that unchanged frontend; they were not counted as newly executed Agent checks.
- Real-thread/green-thread first-import race, original MCP dependency failure, gated function-tool requests, explicit MCP passthrough, idempotent installation, changed-signature refusal, model wiring, ChatGPT OAuth bookkeeping and streaming/tool-argument regressions are covered. Mock responses/closed loopback endpoints were used; no actual broker or agent account call was made.
- Existing closed-stream logging warnings occur after successful pytest exit; the gate uses JUnit failures/errors and exit status. The temporary awake requests were released. No Windows feature or permanent power setting changed.

Activation and remote refs are recorded below after health checks. The original linked-auth report continues to document that already completed release; this report covers the later Agent patch.
