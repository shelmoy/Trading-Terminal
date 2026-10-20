# Renko settings and Trading navigation — 20 October 2026

## Changes

- Renko V2, V3 and V4 now show the same settings shortcut beside the selected chart type as standard Renko. The shared ChartPane applies this to Trading and Scalper, including multiple chart panes.
- Each version's dialog reads its existing Price settings schema: V2/V3 use their own `renkov2.*` / `renkov3.*` keys, and V4 uses its registered transform settings and confirmed trend visibility. Brick colours are available alongside sizing controls.
- Apply uses the terminal's existing settings/persistence path. Reset covers only the controls displayed in this shortcut. Cancel leaves the chart unchanged. Switching chart type closes the dialog, and a stale request or submit cannot apply to a different type. Live renders preserve pending edits.
- Custom version icons use rounded stair-step bricks and a separate numeral badge, matching the toolbar's monochrome colours in light and dark themes.
- Trading's Dashboard control now reveals/hides the full OpenAlgo navigation, following Scalper. It starts collapsed. The charts stay mounted; use Dashboard in the expanded navigation to visit the dashboard page.

## Validation and deployment

- Production TypeScript/Vite build completed in a temporary output directory before asset replacement. Existing large-chunk warning remains.
- Focused lint passed for the modified settings, icon and Trading files. ChartPane has two pre-existing warnings (initial volume effect dependency and optional chaining); no automatic fix was applied because remounting a live terminal would change existing behaviour.
- No automated tests or trading actions were run. No calculation engine, broker credentials, dependencies, or database schema changed. No service restart or migration is required.
- Recovery branch: `backup/before-renko-header-2026-10-20`; the previous served frontend is retained under ignored `tmp/frontend-dist-before-renko-20261020` before deployment.
- Source and built assets are synchronized to the Kotak and FYERS installations, with read-only HTTP/asset availability checks. Refresh the browser to activate the new UI in an existing tab.

The HTTP check confirms the updated frontend is served; it does not establish full authenticated interaction or trading behaviour.
