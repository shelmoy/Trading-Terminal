/**
 * High-Low Volatility (HLV) - ported to openalgo-charts from Pine Script v6.
 *
 * Source: https://github.com/mihakralj/pinescript/blob/c4e91b962be09733d8fc76caa5191e9e586c5cee/indicators/volatility/hlv.pine
 * Repo:   mihakralj/pinescript
 * License: MIT (c) mihakralj
 * SPDX-FileCopyrightText: (c) mihakralj
 * SPDX-FileCopyrightText: (c) 2026 marketcalls (port to openalgo-charts)
 * SPDX-License-Identifier: MIT
 *
 * Volatility from the Parkinson estimator, which reads the log high-low range
 * of each bar instead of close-to-close returns, Wilder-smoothed over the
 * lookback and optionally scaled to an annual figure.
 */

export default function ({ registerIndicator, nulls }) {
  registerIndicator({
    id: 'oa-hlv',
    name: 'High-Low Volatility (HLV)',
    category: 'Volatility',
    placement: 'pane',

    inputs: [
      {
        key: 'length',
        type: 'number',
        label: 'Length',
        default: 20,
        min: 1,
        max: 5000,
        step: 1,
        tooltip: 'Period for smoothing the Parkinson estimator.',
      },
      {
        key: 'annualize',
        type: 'boolean',
        label: 'Annualize Volatility',
        default: true,
        tooltip: 'Annualize the volatility output.',
      },
      {
        key: 'annualPeriods',
        type: 'number',
        label: 'Annual Periods',
        default: 252,
        min: 1,
        max: 100000,
        step: 1,
        tooltip: 'Number of periods in a year for annualization (252 for daily, 52 for weekly).',
      },
    ],

    plots: [
      { key: 'hlv', type: 'line', title: 'HLV', style: { color: '#ffeb3b', lineWidth: 2 } },
    ],

    calc(bars, settings) {
      // A cleared number field arrives as '', and Number('') is 0.
      const length = Math.max(1, Math.floor(Number(settings.length) || 20))
      const annualize = settings.annualize !== false
      const annualPeriods = Math.max(1, Math.floor(Number(settings.annualPeriods) || 252))

      const EPSILON = 1e-10
      // 1.0 / (4.0 * log(2.0)), the Parkinson constant, verbatim from the source.
      const C_4LN2_INV = 0.3606737602
      const rmaAlpha = 1 / length

      const out = new Array(bars.length).fill(NaN)

      // Pine var state. The [1] history is na on the first bar, which is what
      // seeds the RMA with the first estimator value rather than with zero.
      let rawRma = 0
      let eRma = 1
      let prevRawRma = NaN
      let prevERma = NaN

      for (let i = 0; i < bars.length; i++) {
        const high = Number(bars[i].high)
        const low = Number(bars[i].low)
        const lnH = Math.log(high)
        const lnL = Math.log(low)
        const diff = lnH - lnL
        const parkinson = C_4LN2_INV * diff * diff
        const parkinsonOk = Number.isFinite(parkinson)

        // Pine: if not na(parkinsonEstimator). A non-positive or missing price
        // leaves both accumulators holding their previous bar's value.
        if (parkinsonOk) {
          rawRma = !Number.isFinite(prevRawRma)
            ? parkinson
            : (prevRawRma * (length - 1) + parkinson) / length
          eRma = !Number.isFinite(prevERma) ? 1 - rmaAlpha : (1 - rmaAlpha) * prevERma
        }

        // Exponential warmup compensator: divide out the weight never applied.
        // eRma is still exactly 1 only while every bar so far was unusable, and
        // then rawRma is still 0: 0 / 0 is NaN, which is the na the source
        // produces there. Do not special-case it to 0, that would plot a zero.
        const corrected =
          eRma > EPSILON && Number.isFinite(rawRma) ? rawRma / (1 - eRma) : rawRma
        const smoothed = Number.isFinite(corrected) ? corrected : parkinson
        const volatility = Number.isFinite(smoothed) && smoothed >= 0 ? Math.sqrt(smoothed) : NaN

        out[i] =
          annualize && Number.isFinite(volatility)
            ? volatility * Math.sqrt(annualPeriods)
            : volatility

        prevRawRma = rawRma
        prevERma = eRma
      }

      return { hlv: nulls(out) }
    },
  })
}
