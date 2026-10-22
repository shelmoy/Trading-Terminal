/**
 * Parkinson Volatility (PV) - ported to openalgo-charts from Pine Script v6.
 *
 * Source: https://github.com/mihakralj/pinescript/blob/c4e91b962be09733d8fc76caa5191e9e586c5cee/indicators/volatility/pv.pine
 * Repo:   mihakralj/pinescript
 * License: MIT
 * SPDX-FileCopyrightText: (c) mihakralj
 * SPDX-FileCopyrightText: (c) 2026 marketcalls (port to openalgo-charts)
 * SPDX-License-Identifier: MIT
 *
 * Estimates volatility from the high-low range instead of the close-to-close
 * return: the squared log range is Wilder-smoothed, scaled by 1 / (4 * ln 2) and
 * optionally annualised.
 */

export default function ({ registerIndicator, rma, nulls }) {
  registerIndicator({
    id: 'oa-pv',
    name: 'Parkinson Volatility (PV)',
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
        tooltip: 'Lookback period for RMA smoothing of High/Low squared log returns.',
      },
      {
        key: 'annualize',
        type: 'boolean',
        label: 'Annualize Volatility',
        default: true,
        tooltip: 'Annualize the Parkinson Volatility output.',
      },
      {
        key: 'annualPeriods',
        type: 'number',
        label: 'Annual Periods',
        default: 252,
        min: 1,
        max: 100000,
        step: 1,
        tooltip: 'Number of periods in a year for annualization (e.g. 252 for daily, 52 for weekly).',
      },
    ],

    plots: [{ key: 'pv', type: 'line', title: 'PV', style: { color: '#ffeb3b', lineWidth: 2 } }],

    calc(bars, settings) {
      // A cleared number field arrives as '', and Number('') is 0.
      const length = Math.max(1, Math.floor(Number(settings.length) || 20))
      const annualize = settings.annualize !== false
      const annualPeriods = Math.max(1, Math.floor(Number(settings.annualPeriods) || 252))

      const squared = new Array(bars.length).fill(0)
      for (let i = 0; i < bars.length; i++) {
        const high = bars[i].high
        const low = bars[i].low
        let term = 0
        if (Number.isFinite(high) && Number.isFinite(low) && high !== low) {
          const ratio = high / low
          // Guard the divide and the log: a non-positive ratio has no log.
          if (Number.isFinite(ratio) && ratio > 0) term = Math.log(ratio)
        }
        squared[i] = term * term
      }

      const smoothed = rma(squared, length)
      const denom = 4.0 * Math.LN2
      const scale = annualize ? Math.sqrt(annualPeriods) : 1.0

      const out = new Array(bars.length).fill(NaN)
      for (let i = 0; i < bars.length; i++) {
        const value = smoothed[i]
        if (!Number.isFinite(value) || value < 0) continue
        out[i] = Math.sqrt(value / denom) * scale
      }

      return { pv: nulls(out) }
    },
  })
}
