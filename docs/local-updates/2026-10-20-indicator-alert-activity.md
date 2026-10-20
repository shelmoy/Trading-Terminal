# Indicator alert activity — 20 October 2026

## Cause and changes

The SDK's eye toggle controls drawing visibility. Indicator signal calculations can continue while plots are hidden, and the terminal previously delivered every indicator alert without checking its owning instance.

- Before any new pop-up, sound, desktop notification or log entry, indicator alerts must resolve to a currently attached, visible study on that exact chart. Removed, hidden, unknown and stale-chart sources are rejected.
- SDK indicator signals use their instance ID. OpenScript bar-close signals carry a transient reference to the emitting instance's current values, allowing exact matching even with duplicate copies of the same script. This reference stays on the local event bus and is never stored or transmitted.
- Saved study alerts and drawing alerts using study inputs receive no readings while their owner is hidden. Their definitions and plot identities remain available, so restoring a workspace does not delete them and a once-only alert is not consumed while hidden.
- The Alerts panel explains when an indicator is hidden and updates after visibility changes. Showing the study resumes normal evaluation from the chart's current state. Independent price alerts keep their own enabled state.
- Delayed delivery-failure pop-ups are suppressed if their source has since been hidden, removed or disabled. A legitimate firing already delivered while active keeps its history; existing log rows are not deleted.
- Indicator firings are recorded as indicator events. The symbol, exchange and interval are captured when the event fires, preventing a delayed channel response from logging against a newly selected instrument.

## Validation and deployment

- Focused lint passed for all five changed source modules. Production TypeScript/Vite build passed in ignored `tmp/indicator-alert-build-20261020` before deployment. The existing large-chunk warning remains.
- No automated tests or order/trading actions were run. HTTP checks cover current frontend pages and affected JS assets; they do not prove full authenticated signal behaviour.
- No dependencies, database schema, credentials or indicator formulas changed. No service restart or migration required.
- Recovery branch in each checkout: `backup/before-indicator-alert-guard-2026-10-20`. Previous frontend files are retained under ignored `tmp/frontend-dist-before-indicator-alert-20261020`.
- Changes apply to shared Trading and Scalper terminal code in both Kotak and FYERS installations. Refresh every open Trading/Scalper tab so an older tab cannot keep running the previous notification code.
