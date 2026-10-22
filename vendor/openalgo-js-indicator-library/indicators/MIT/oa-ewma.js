/**
 * Exponential Weighted MA Volatility - ported to openalgo-charts from Pine Script v6.
 *
 * Source: https://github.com/mihakralj/pinescript/blob/c4e91b962be09733d8fc76caa5191e9e586c5cee/indicators/volatility/ewma.pine
 * Repo:   mihakralj/pinescript
 * License: MIT (c) mihakralj
 * SPDX-FileCopyrightText: (c) mihakralj
 * SPDX-FileCopyrightText: (c) 2026 marketcalls (port to openalgo-charts)
 * SPDX-License-Identifier: MIT
 *
 * Wilder-smoothed mean of squared log returns, bias-corrected for the warmup so
 * the reading is usable from the first bars, then optionally annualised. It
 * reacts faster than a rolling standard deviation because every past return
 * keeps a decaying weight instead of dropping out of a window.
 */

export default function ({ registerIndicator, sourceValues, nulls }) {
  const EPSILON = 1e-10

  registerIndicator({
    id: 'oa-ewma',
    name: 'Exponential Weighted MA Volatility',
    category: 'Volatility',
    placement: 'pane',

    inputs: [
      { key: 'source', type: 'source', label: 'Source', default: 'close' },
      {
        key: 'length',
        type: 'number',
        label: 'Length',
        default: 20,
        min: 1,
        max: 5000,
        step: 1,
        tooltip: 'Period for the EWMA calculation.',
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
        tooltip: 'Number of periods in a year for annualization: 252 for daily, 52 for weekly.',
      },
    ],

    plots: [{ key: 'volty', type: 'line', title: 'EWMA Volty', style: { color: '#ffeb3b', lineWidth: 2 } }],

    calc(bars, settings) {
      // A cleared number field arrives as '', and Number('') is 0.
      const length = Math.max(1, Math.floor(Number(settings.length) || 20))
      const annualPeriods = Math.max(1, Math.floor(Number(settings.annualPeriods) || 252))
      const annualize = settings.annualize !== false
      const src = sourceValues(bars, settings.source ?? 'close')

      const n = bars.length
      const out = new Array(n).fill(NaN)
      const rmaAlpha = 1 / length
      const annualFactor = Math.sqrt(annualPeriods)

      // Both are `var` in the source, so the [1] reference is na on the first
      // bar and the branch below seeds them there rather than smoothing.
      let rawRmaSqRet = NaN
      let eRma = NaN
      let seeded = false

      for (let i = 0; i < n; i++) {
        // nz(math.log(src / src[1]), 0.0). A missing, zero or negative ratio
        // gives na in Pine, which nz turns into a zero return.
        let logReturn = 0
        const prev = i >= 1 ? src[i - 1] : NaN
        if (Number.isFinite(src[i]) && Number.isFinite(prev) && src[i] > 0 && prev > 0) {
          const r = Math.log(src[i] / prev)
          if (Number.isFinite(r)) logReturn = r
        }
        const squaredReturn = logReturn * logReturn

        // Wilder smoothing of the squared returns, seeded with the first value.
        rawRmaSqRet = seeded ? (rawRmaSqRet * (length - 1) + squaredReturn) / length : squaredReturn
        // The weight the seed still carries: (1 - 1/length) ^ bars so far.
        eRma = seeded ? (1 - rmaAlpha) * eRma : 1 - rmaAlpha
        seeded = true

        // Bias correction: divide out the weight that has not accumulated yet.
        const denom = 1 - eRma
        const corrected =
          eRma > EPSILON && Number.isFinite(rawRmaSqRet) && denom > EPSILON ? rawRmaSqRet / denom : rawRmaSqRet
        const current = Number.isFinite(corrected) ? corrected : squaredReturn

        if (!Number.isFinite(current) || current < 0) continue
        const volatility = Math.sqrt(current)
        out[i] = annualize ? volatility * annualFactor : volatility
      }

      return { volty: nulls(out) }
    },
  })
}
