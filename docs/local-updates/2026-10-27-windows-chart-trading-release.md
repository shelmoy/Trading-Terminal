# Windows chart-trading release candidate — 27 October 2026

Status: Windows verification complete. On 27 October the user explicitly authorized
deployment and GitHub push using the passed Windows checks as a scoped exception
to the earlier Linux-before-commit requirement. This exception applies to this
chart-trading release only. Linux is not installed locally; a temporary GitHub
Actions Ubuntu runner will attempt the real Linux suite separately. No Linux
pass is claimed until that run completes successfully.

The isolated checkout is `release/chart-trading-windows-20261027`, based on
`627603308981cd382706afb14f293d890fc8becd`. Both live installations currently
have the identical tracked source tree
`142310ef66c617f387ee34a5763bfec3c09f6991`, despite different local commit IDs.
All 47 saved feature files were verified against the private stage-three ZIP
before copying. Existing source files were identical between the prepared and
both live baselines. No live files, databases or running services were changed.

The separate pending upstream security/sandbox/dependency update is excluded.
In particular, this candidate preserves the live `pyproject.toml`, `uv.lock`,
requirements, frontend package/lock files, `.nvmrc` and `sandbox/order_manager.py`.
It keeps chart SDK 2.6.7 and all existing customizations. Do not blindly merge
the prepared security branch into either running installation.

## Verification

- An independent Windows virtual environment was created in this checkout using
  the existing locked dependencies. `uv sync --locked --check --no-install-project`
  reports no changes required (222 installed packages checked).
- `npm ci` installed the live frontend lockfile into this isolated checkout.
  Neither live instance's dependency environment was modified.
- 155 backend tests passed with isolated SQLite and mocked broker transports.
- 61 frontend unit tests passed; TypeScript and feature-module Ruff checks passed.
- 26 actual headless Chrome fixtures passed, including both themes, narrow
  panes, native Renko and versions 2/3/4, exact SL/TP axis labels, drag release,
  Escape, inversion, zoom and moved primary panes. Non-fixture origins were
  blocked, and every order request was mocked.
- Production build passed into `tmp/windows-production-build`; source and
  generated assets are retained for activation and recovery.
- Existing Vite chunk/plugin timing and dependency deprecation warnings remain.
  The unrelated baseline terminalHistory failures remain documented in the
  original handoff; this is not a full-suite all-clear.
- No real or sandbox orders, cancellations or position exits were performed.
  Live execution/fill timing and Linux Gunicorn compatibility remain unverified.

## Activation preparation

Read-only preflight found both instances in Analyze mode, zero active workflows,
zero pending/running workflow executions, zero saved running Python strategies,
zero running strategy modules and zero Python strategy child processes. Recheck
these facts and the market window immediately before any restart; do not rely
on a stale preflight result. Preserve Analyze mode and all broker credentials.

After an explicit Windows-only exception: preserve recoverable source/build
snapshots, make consistent database backups, apply the non-destructive three-table
chart-command migration, activate matching source/assets and retain old
compatibility chunks. Restart only the controller-identified services during
an established safe window, then run read-only HTTP/schema/asset checks. Roll
back activation on failure. Do not place diagnostic orders.

Origin/main already contains the separately pending security update. Preserve
those remote commits; never force push or undo them. Publish coherent source
and builds for the appropriate baseline, keeping the Windows-only installed
release branch identifiable. The Linux requirement remains unfulfilled unless
the user explicitly grants a scoped exception; do not silently rewrite CLAUDE.md.

For feature behavior, limitations, exact native FYERS/Kotak capabilities and
recovery rules, read the stage-three section of
`2026-10-26-chart-trading-handoff.md`. The one-time continuation remains deleted;
this manual resumption does not create another automation.

## Approved release scope

The user authorized this Windows-only chart-trading release explicitly after
being informed of the outstanding Linux gate. This does not waive that gate for
unrelated security/dependency/upstream maintenance. Both installed instances
retain their existing dependency baseline; origin/main retains its already
committed security baseline. Publish matching canonical assets for each baseline.
Temporary Linux verification runs without installation on the laptop, broker
credentials, application secrets, or access to either local database.
