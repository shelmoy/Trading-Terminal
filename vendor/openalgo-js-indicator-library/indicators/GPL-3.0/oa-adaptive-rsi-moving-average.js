/**
 * Adaptive RSI Moving Average (ARSIMA) - ported to openalgo-charts from Pine Script v4.
 *
 * Source: https://github.com/everget/tradingview-pinescript-indicators/blob/60c93d3711d222b8f2db96160defe568429348e0/movings/adaptive_rsi_moving_average.pine
 * Repo:   everget/tradingview-pinescript-indicators
 * License: GPL-3.0, Copyright (c) 2018-present, Alex Orekhov (everget)
 * SPDX-FileCopyrightText: (c) 2018-present Alex Orekhov (everget)
 * SPDX-FileCopyrightText: (c) 2026 marketcalls (port to openalgo-charts)
 * SPDX-License-Identifier: GPL-3.0-only
 *
 * An exponential average whose smoothing constant is how far the RSI sits from
 * 50, so it tracks price closely while momentum is one-sided and flattens out
 * while the RSI hovers around the midline.
 */

export default function ({ registerIndicator, sourceValues, rsi, nulls }) {
  const UP = '#26a69a'
  const DOWN = '#ef5350'
  const FLAT = '#6d1e7f'

  registerIndicator({
    id: 'oa-adaptive-rsi-moving-average',
    name: 'Adaptive RSI Moving Average (ARSIMA)',
    category: 'Moving Averages',
    placement: 'onchart',

    inputs: [
      { key: 'length', type: 'number', label: 'Length', default: 14, min: 1, max: 5000, step: 1 },
      { key: 'source', type: 'source', label: 'Source', default: 'close' },
      { key: 'highlight', type: 'boolean', label: 'Highlight ?', default: true },
    ],

    plots: [
      {
        key: 'arsima',
        type: 'line',
        title: 'ARSIMA',
        style: { color: FLAT, lineWidth: 2 },
        colorBy({ index, values, settings }) {
          if (settings.highlight === false) return FLAT
          const col = values.arsima
          const cur = col ? col[index] : NaN
          const prev = col && index > 0 ? col[index - 1] : NaN
          // Pine compares against na on the first bar, which reads as false.
          if (!Number.isFinite(cur) || !Number.isFinite(prev)) return DOWN
          return cur > prev ? UP : DOWN
        },
      },
    ],

    calc(bars, settings) {
      // A cleared number field arrives as '', and Number('') is 0.
      const length = Math.max(1, Math.floor(Number(settings.length) || 14))
      const src = sourceValues(bars, settings.source ?? 'close')
      const rsiValues = rsi(src, length)

      const n = bars.length
      const out = new Array(n).fill(NaN)
      // nz(arsima[1]): a bar whose own value is na leaves the next bar seeding
      // the recursion from zero again, which is why this resets rather than
      // carrying the last finite value across a gap.
      let prev = 0

      for (let i = 0; i < n; i++) {
        const r = rsiValues[i]
        const s = src[i]
        if (!Number.isFinite(r) || !Number.isFinite(s)) {
          prev = 0
          continue
        }
        const alpha = 2 * Math.abs(r / 100 - 0.5)
        const value = alpha * s + (1 - alpha) * prev
        out[i] = value
        prev = value
      }

      return { arsima: nulls(out) }
    },
  })
}
