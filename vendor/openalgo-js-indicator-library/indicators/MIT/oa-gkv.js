/**
 * Garman-Klass Volatility (GKV) - ported to openalgo-charts from Pine Script v6.
 *
 * Source: https://github.com/mihakralj/pinescript/blob/c4e91b962be09733d8fc76caa5191e9e586c5cee/indicators/volatility/gkv.pine
 * Repo:   mihakralj/pinescript
 * License: MIT (c) mihakralj
 * SPDX-FileCopyrightText: (c) mihakralj
 * SPDX-FileCopyrightText: (c) 2026 marketcalls (port to openalgo-charts)
 * SPDX-License-Identifier: MIT
 *
 * Estimates volatility from the whole bar rather than from closes alone: the
 * log high-low range carries most of the weight and the log open-close move is
 * subtracted, which makes it far more efficient per bar than a close-to-close
 * standard deviation.
 */

export default function ({ registerIndicator, nulls }) {
  registerIndicator({
    id: 'oa-gkv',
    name: 'Garman-Klass Volatility (GKV)',
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
        tooltip: 'Period for smoothing the Garman-Klass estimator.',
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

    plots: [{ key: 'gkv', type: 'line', title: 'GKV', style: { color: '#ffeb3b', lineWidth: 2 } }],

    calc(bars, settings) {
      // A cleared number field arrives as '', and Number('') is 0.
      const length = Math.max(1, Math.floor(Number(settings.length) || 20))
      const annualize = settings.annualize !== false
      const annualPeriods = Math.max(1, Math.floor(Number(settings.annualPeriods) || 252))

      // 2 * ln(2) - 1, spelled out as the source does.
      const C_2LN2_1 = 0.3862941611
      const EPSILON = 1e-10
      const rmaAlpha = 1 / length
      const annualFactor = Math.sqrt(annualPeriods)

      // Pine reads raw_rma_gk[1] and e_rma[1], which are na on the first bar,
      // so the recursion seeds from the first estimator itself rather than from
      // the declared 0.0. NaN here stands for "no previous bar".
      let rawRma = NaN
      let eRma = NaN

      const out = new Array(bars.length).fill(NaN)

      for (let i = 0; i < bars.length; i++) {
        const bar = bars[i]
        const high = bar.high
        const low = bar.low
        const open = bar.open
        const close = bar.close

        let gkEstimator = NaN
        if (high > 0 && low > 0 && open > 0 && close > 0) {
          const lnH = Math.log(high)
          const lnL = Math.log(low)
          const lnO = Math.log(open)
          const lnC = Math.log(close)
          const term1 = 0.5 * Math.pow(lnH - lnL, 2)
          const term2 = C_2LN2_1 * Math.pow(lnC - lnO, 2)
          gkEstimator = term1 - term2
        }

        if (Number.isFinite(gkEstimator)) {
          rawRma = !Number.isFinite(rawRma)
            ? gkEstimator
            : (rawRma * (length - 1) + gkEstimator) / length
          eRma = !Number.isFinite(eRma) ? 1 - rmaAlpha : (1 - rmaAlpha) * eRma
        }

        // The compensator removes the Wilder start-up bias. At length 1 eRma is
        // 0, which fails the epsilon test and leaves the raw value alone, so
        // there is no divide by zero.
        const corrected =
          Number.isFinite(eRma) && eRma > EPSILON && Number.isFinite(rawRma)
            ? rawRma / (1 - eRma)
            : rawRma

        const smoothed = Number.isFinite(corrected) ? corrected : gkEstimator

        // The estimator can go negative on a bar whose body exceeds its range
        // contribution; Pine returns na there rather than a complex root.
        if (!Number.isFinite(smoothed) || smoothed < 0) continue

        const volatility = Math.sqrt(smoothed)
        out[i] = annualize ? volatility * annualFactor : volatility
      }

      return { gkv: nulls(out) }
    },
  })
}
