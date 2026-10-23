# Gaussian line distinction — 23 October 2026

Gaussian's plotted trend line now defaults to green bullish segments and golden
yellow bearish segments, 4 px wide and dashed. HalfTrend keeps its solid blue/red
style. Medium triangles remain outside candles. Price values, calculations,
parameters, plot identities and alert conditions are unchanged.

Saved layouts contain explicit plot style settings that override descriptor
defaults. Each Gaussian instance is upgraded once when the terminal synchronizes
its studies, including layout, workspace and template restores. This resets only
Gaussian's plot appearance and records `__oaGaussianStyleVersion: 2` in its
settings. Later user style edits remain respected. Other indicators are untouched.
The normal indicator Defaults action now includes generated style defaults as
well as calculation inputs, so it really restores plot appearance.

Recovery: `backup/before-gaussian-line-20261023` and local files under
`tmp/gaussian-line-20261023`. Old hashed assets remain available for existing
tabs. Refresh Trading once to load the new terminal code and apply the migration.
The separately prepared security/sandbox backend update remains pending safe
activation. This visual deployment does not restart broker services or install
the pending Python dependencies. No trading actions or automated tests are run.
