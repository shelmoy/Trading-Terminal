# Gaussian trend styling — 23 October 2026

Gaussian Filter Trend now uses green (`#22c55e`) for bullish segments and
golden yellow (`#facc15`) for bearish segments, with 4 px trend lines.
Trend-change triangles are medium-sized and placed explicitly outside the
corresponding candle, with a small range-relative gap. This separates their
placement and palette from HalfTrend's blue/red line and labels.

The calculations, presets, inputs, alert conditions, plot identities and
HalfTrend source are unchanged. Coincident mathematical trend values are not
artificially shifted. The same module is installed in Kotak and FYERS.

The repository's unmodified chart-indicator validator passed on chart SDK 2.6.7
in both checkouts with zero errors and zero warnings. No application tests or
trading actions were run. This is a runtime-loaded module, so no frontend build
or service restart is required. Reopen Indicators or refresh the chart to load
the new module. If a saved layout contains explicit old plot styles, reset only
Gaussian's Style controls to its new defaults or re-add Gaussian.

Recovery: `backup/before-gaussian-style-2026-10-23`, and each checkout's original
module in `tmp/gaussian-style-20261023/gaussian-before.js`. The previously prepared
security/sandbox backend update remains pending safe activation; this visual
change does not install those dependencies or restart either broker service.
