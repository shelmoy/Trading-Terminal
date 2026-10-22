/**
 * RAVI: Chande Range Action Verification Index - ported to openalgo-charts from Pine Script v6.
 *
 * Source: https://github.com/mihakralj/pinescript/blob/c4e91b962be09733d8fc76caa5191e9e586c5cee/indicators/dynamics/ravi.pine
 * Repo:   mihakralj/pinescript
 * License: MIT
 * SPDX-FileCopyrightText: (c) mihakralj
 * SPDX-FileCopyrightText: (c) 2026 marketcalls (port to openalgo-charts)
 * SPDX-License-Identifier: MIT
 *
 * The absolute percentage divergence between a fast and a slow simple moving
 * average of close: above the threshold the market is trending, below it the
 * market is ranging.
 */

export default function ({ registerIndicator, sma, nulls }) {
  registerIndicator({
    id: 'oa-ravi',
    name: 'RAVI: Chande Range Action Verification Index',
    category: 'Dynamics',
    placement: 'pane',

    inputs: [
      {
        key: 'shortPeriod',
        type: 'number',
        label: 'Short Period',
        default: 7,
        min: 1,
        max: 100,
        step: 1,
        tooltip: 'Fast SMA period (~10% of long period; Chande default: 7)',
      },
      {
        key: 'longPeriod',
        type: 'number',
        label: 'Long Period',
        default: 65,
        min: 2,
        max: 500,
        step: 1,
        tooltip: 'Slow SMA period (~13 weeks daily; Chande default: 65)',
      },
      {
        key: 'threshold',
        type: 'number',
        label: 'Threshold',
        default: 3.0,
        min: 0,
        max: 20,
        step: 0.5,
        tooltip: 'Trend/range classification level (Chande default: 3%)',
      },
    ],

    plots: [{ key: 'ravi', type: 'line', title: 'RAVI', style: { color: '#ffeb3b', lineWidth: 2 } }],

    levels(ctx) {
      const settings = ctx?.settings ?? ctx ?? {}
      const threshold = Math.min(20, Math.max(0, Number(settings.threshold) || 0))
      return [
        { price: threshold, title: 'Threshold', color: '#ff5252', lineStyle: 'dashed' },
        { price: 0, title: 'Zero Line', color: '#787b86', lineStyle: 'dotted' },
      ]
    },

    calc(bars, settings) {
      // A cleared number field arrives as '', and Number('') is 0.
      const shortPeriod = Math.max(1, Math.floor(Number(settings.shortPeriod) || 7))
      const longPeriod = Math.max(2, Math.floor(Number(settings.longPeriod) || 65))

      const n = bars.length
      const out = new Array(n).fill(NaN)

      // Pine raises runtime.error when the short period is not shorter than the
      // long one, so the study produces nothing at all in that case.
      if (shortPeriod >= longPeriod) return { ravi: nulls(out) }

      const close = bars.map((b) => b.close)
      const smaShort = sma(close, shortPeriod)
      const smaLong = sma(close, longPeriod)

      for (let i = 0; i < n; i++) {
        // Pine waits for both circular buffers to fill before emitting.
        if (!Number.isFinite(smaShort[i]) || !Number.isFinite(smaLong[i])) continue
        const slow = smaLong[i]
        if (Math.abs(slow) <= 1e-10) continue
        out[i] = (Math.abs(smaShort[i] - slow) / Math.abs(slow)) * 100.0
      }

      return { ravi: nulls(out) }
    },
  })
}
