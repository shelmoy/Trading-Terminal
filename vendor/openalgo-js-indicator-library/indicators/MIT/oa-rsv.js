/**
 * Rogers-Satchell Volatility (RSV) - ported to openalgo-charts from Pine Script v6.
 *
 * Source: https://github.com/mihakralj/pinescript/blob/c4e91b962be09733d8fc76caa5191e9e586c5cee/indicators/volatility/rsv.pine
 * Repo:   mihakralj/pinescript
 * License: MIT
 * SPDX-FileCopyrightText: (c) mihakralj
 * SPDX-FileCopyrightText: (c) 2026 marketcalls (port to openalgo-charts)
 * SPDX-License-Identifier: MIT
 *
 * A drift-independent volatility estimator built from the open, high, low and
 * close of each bar, averaged over a lookback and optionally annualised.
 */

export default function ({ registerIndicator, sma, nulls }) {
  registerIndicator({
    id: 'oa-rsv',
    name: 'Rogers-Satchell Volatility (RSV)',
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
        tooltip: 'Lookback period for SMA smoothing of the Rogers-Satchell variance.',
      },
      {
        key: 'annualize',
        type: 'boolean',
        label: 'Annualize Volatility',
        default: true,
        tooltip: 'Scale the output to an annual figure.',
      },
      {
        key: 'annualPeriods',
        type: 'number',
        label: 'Annual Periods',
        default: 252,
        min: 1,
        max: 100000,
        step: 1,
        tooltip: 'Number of periods in a year (252 for daily, 52 for weekly).',
      },
    ],

    plots: [{ key: 'rsv', type: 'line', title: 'RSV', style: { color: '#ffeb3b', lineWidth: 2 } }],

    calc(bars, settings) {
      // A cleared number field arrives as '', and Number('') is 0.
      const length = Math.max(1, Math.floor(Number(settings.length) || 20))
      const annualize = settings.annualize !== false
      const annualPeriods = Math.max(1, Math.floor(Number(settings.annualPeriods) || 252))
      const n = bars.length

      // The source floors every price at 0.0000001 so the logarithms stay defined.
      const FLOOR = 0.0000001
      const variance = new Array(n).fill(NaN)
      for (let i = 0; i < n; i++) {
        const bar = bars[i]
        const h = Math.max(Number.isFinite(bar.high) ? bar.high : 0, FLOOR)
        const l = Math.max(Number.isFinite(bar.low) ? bar.low : 0, FLOOR)
        const o = Math.max(Number.isFinite(bar.open) ? bar.open : 0, FLOOR)
        const c = Math.max(Number.isFinite(bar.close) ? bar.close : 0, FLOOR)
        const term1 = Math.log(h / o)
        const term2 = Math.log(h / c)
        const term3 = Math.log(l / o)
        const term4 = Math.log(l / c)
        variance[i] = term1 * term2 + term3 * term4
      }

      // ta.sma is na for the first length - 1 bars, and so is the volatility.
      const smoothed = sma(variance, length)
      const scale = annualize ? Math.sqrt(annualPeriods) : 1

      const out = new Array(n).fill(NaN)
      for (let i = 0; i < n; i++) {
        if (!Number.isFinite(smoothed[i])) continue
        out[i] = Math.sqrt(Math.max(0, smoothed[i])) * scale
      }

      return { rsv: nulls(out) }
    },
  })
}
