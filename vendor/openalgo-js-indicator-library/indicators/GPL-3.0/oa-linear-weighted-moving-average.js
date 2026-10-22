/**
 * Linear Weighted Moving Average (LWMA) - ported to openalgo-charts from Pine Script v3.
 *
 * Source: https://github.com/everget/tradingview-pinescript-indicators/blob/60c93d3711d222b8f2db96160defe568429348e0/movings/linear_weighted_moving_average.pine
 * Repo:   everget/tradingview-pinescript-indicators
 * License: GPL-3.0 (c) 2018-present, Alex Orekhov (everget)
 * SPDX-FileCopyrightText: (c) 2018-present Alex Orekhov (everget)
 * SPDX-FileCopyrightText: (c) 2026 marketcalls (port to openalgo-charts)
 * SPDX-License-Identifier: GPL-3.0-only
 *
 * A moving average whose weights fall off linearly from the current bar back
 * to the oldest bar in the window, so recent prices dominate and the average
 * turns sooner than a simple one.
 */

export default function ({ registerIndicator, sourceValues, nulls }) {
  registerIndicator({
    id: 'oa-linear-weighted-moving-average',
    name: 'Linear Weighted Moving Average (LWMA)',
    category: 'Moving Averages',
    placement: 'onchart',

    inputs: [
      { key: 'length', type: 'number', label: 'Length', default: 14, min: 1, max: 1000, step: 1 },
      { key: 'source', type: 'source', label: 'Source', default: 'close' },
    ],

    plots: [
      { key: 'lwma', type: 'line', title: 'LWMA', style: { color: '#e69138', lineWidth: 2 } },
    ],

    calc(bars, settings) {
      // A cleared number field arrives as '', and Number('') is 0.
      const length = Math.max(1, Math.floor(Number(settings.length) || 14))
      const src = sourceValues(bars, settings.source ?? 'close')

      const out = new Array(bars.length).fill(NaN)
      for (let i = 0; i < bars.length; i++) {
        let weightSum = 0
        let sum = 0
        for (let k = 0; k < length; k++) {
          const weight = length - k
          weightSum += weight
          // The source wraps the lookback in nz(), so a bar before the start of
          // history contributes 0 rather than dropping the whole average. That
          // is why this emits from bar 0 instead of waiting out a warmup, and
          // why it is not simply ta.wma: the first length bars ramp up from a
          // fraction of price. The source's own output, kept rather than
          // blanked.
          const j = i - k
          const value = j >= 0 && Number.isFinite(src[j]) ? src[j] : 0
          sum += value * weight
        }
        out[i] = weightSum > 0 ? sum / weightSum : NaN
      }

      return { lwma: nulls(out) }
    },
  })
}
