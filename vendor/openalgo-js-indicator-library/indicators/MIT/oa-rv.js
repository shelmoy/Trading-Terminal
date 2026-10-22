/**
 * Realized Volatility (RV) - ported to openalgo-charts from Pine Script v6.
 *
 * Source: https://github.com/mihakralj/pinescript/blob/c4e91b962be09733d8fc76caa5191e9e586c5cee/indicators/volatility/rv.pine
 * Repo:   mihakralj/pinescript
 * License: MIT (c) mihakralj
 * SPDX-FileCopyrightText: (c) mihakralj
 * SPDX-FileCopyrightText: (c) 2026 marketcalls (port to openalgo-charts)
 * SPDX-License-Identifier: MIT
 *
 * Realized volatility built from squared log returns: each bar contributes its
 * realized variance, the square root of that is the bar's volatility, a simple
 * moving average smooths it and an optional annualisation scales it by the
 * square root of the number of periods in a year.
 *
 * GAP: the Pine version samples a LOWER timeframe with
 * request.security_lower_tf(syminfo.tickerid, intradayTimeframe, close) and
 * sums the squared log returns of those intrabar closes to get each bar's
 * realized variance. The chart engine has no lower-timeframe feed and no such
 * call, so the "Intraday Timeframe" input is not portable and is omitted rather
 * than declared and ignored. Each bar's realized variance is therefore built
 * from the single close-to-close log return the chart does have, which makes
 * the per-bar estimate noisier than an intrabar sum; the smoothing length and
 * the annualisation behave exactly as in the source.
 */

export default function ({ registerIndicator, sma, nulls }) {
  registerIndicator({
    id: 'oa-rv',
    name: 'Realized Volatility (RV)',
    category: 'Volatility',
    placement: 'pane',

    inputs: [
      {
        key: 'length',
        type: 'number',
        label: 'Smoothing Length',
        default: 20,
        min: 1,
        max: 5000,
        step: 1,
        tooltip: 'Lookback period for smoothing the period realized volatilities (e.g., daily RVs).',
      },
      {
        key: 'annualize',
        type: 'boolean',
        label: 'Annualize Volatility',
        default: true,
        tooltip: 'Annualize the Realized Volatility output.',
      },
      {
        key: 'annualPeriods',
        type: 'number',
        label: 'Annual Periods',
        default: 252,
        min: 1,
        max: 100000,
        step: 1,
        tooltip: 'Number of main chart periods in a year for annualization (e.g., 252 for Daily chart, 52 for Weekly).',
      },
    ],

    plots: [{ key: 'rv', type: 'line', title: 'RV', style: { color: '#ffeb3b', lineWidth: 2 } }],

    calc(bars, settings) {
      // A cleared number field arrives as '', and Number('') is 0.
      const length = Math.max(1, Math.floor(Number(settings.length) || 20))
      const annualize = settings.annualize !== false
      const annualPeriods = Math.max(1, Math.floor(Number(settings.annualPeriods) || 252))

      const n = bars.length
      // volatility_this_period = sqrt(sum of squared log returns in the period).
      const vol = new Array(n).fill(NaN)
      for (let i = 1; i < n; i++) {
        const prevClose = bars[i - 1].close
        const currClose = bars[i].close
        // The source skips any pair that is na or non-positive; a log of a
        // non-positive price is not defined.
        if (!Number.isFinite(prevClose) || !Number.isFinite(currClose)) continue
        if (prevClose <= 0 || currClose <= 0) continue
        const logReturn = Math.log(currClose / prevClose)
        const realizedVariance = logReturn * logReturn
        // realized_variance >= 0 always holds for a square, and the source only
        // takes the root when it does.
        vol[i] = Math.sqrt(realizedVariance)
      }

      // ta.sma over the per-period volatilities: na anywhere in the window
      // leaves the window na, which is what sma() does here too.
      const smoothed = sma(vol, length)

      const scale = annualize ? Math.sqrt(annualPeriods) : 1
      const out = new Array(n).fill(NaN)
      for (let i = 0; i < n; i++) {
        if (!Number.isFinite(smoothed[i])) continue
        out[i] = smoothed[i] * scale
      }

      return { rv: nulls(out) }
    },
  })
}
