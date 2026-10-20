# Quantitative Glass Trend Engine — 20 October 2026

Added the user's supplied Pine v5 study to the runtime indicator catalogue:

- Picker name: **Quantitative Glass Trend Engine - Anti-Fakeout [v6]**.
- Stable ID: `oa-quantitative-glass-trend-v6`, category **Trend**.
- Module: `strategies/indicators/quantitative_glass_trend_v6.js`.
- Original supplied source: `strategies/indicators/quantitative_glass_trend_v6.pine`.
- Available to Trading and Scalper on Kotak and FYERS. Open **Indicators**, search **Quantitative Glass**, and add it to the desired chart. It is not added to every saved chart automatically.

## Port behaviour

Preserves the seven source inputs: regression period 21, Z-score threshold 1.5, ATR multiplier 2, channel toggle, channel multiplier 2, label toggle and dashboard toggle. The SDK's endpoint linear regression is computed in local window coordinates to avoid large bar-index subtraction. Slope comes from the difference between regression offsets 0 and 1.

Standard error is the population deviation of the rolling endpoint-residual series, as in the source. It is not replaced with the residual error of one fitted window. Zero deviation is replaced with 0.0001. ATR uses Wilder smoothing over 14 bars; the trailing filter retains the source's initialization and `nz`/missing-value behaviour. Warmup values stay unavailable instead of becoming false signals.

Trend changes require the source's Z-score, slope and structural-stop conditions on a confirmed bar. The forming bar can update the lines and Z-score without producing a confirmed BUY/SELL label. No future bars are read. Historical labels are capped at the newest 500, matching the supplied label limit.

Includes the green/red/neutral trend line, translucent regression channels and fills, structural trail, glass BUY/SELL labels and two-row TREND/STRENGTH panel. Text and panel colours adapt for readable light and dark themes. The supplied source contains no alert rules; the port adds no automatic notification rules or order actions. User-created plot alerts use the terminal's existing active-indicator guard.

## Checks and installation

- JavaScript syntax check passed. The real installed chart SDK 2.6.7 accepted registration, and the existing loader's descriptor checks reported no errors (7 inputs, 4 plots).
- No automated calculation tests or synthetic fixture suite was run. Numerical equivalence against TradingView and authenticated visual behaviour are not independently verified.
- This is a runtime-loaded module. No frontend rebuild, dependency change, database migration or broker restart is required. Reopening Indicators refreshes the catalogue.
- Installed in both broker checkouts and included in the user's GitHub synchronization. Existing indicators and chart defaults are preserved.
- Recovery branch: `backup/before-glass-trend-indicator-2026-10-20`.
