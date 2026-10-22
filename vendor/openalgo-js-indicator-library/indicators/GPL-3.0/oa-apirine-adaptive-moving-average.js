/**
 * Apirine Adaptive Moving Average (AAMA) - ported to openalgo-charts from Pine Script v4.
 *
 * Source: https://github.com/everget/tradingview-pinescript-indicators/blob/60c93d3711d222b8f2db96160defe568429348e0/movings/apirine_adaptive_moving_average.pine
 * Repo:   everget/tradingview-pinescript-indicators
 * License: GPL-3.0 (c) 2018-present, Alex Orekhov (everget)
 * SPDX-FileCopyrightText: (c) 2018-present Alex Orekhov (everget)
 * SPDX-FileCopyrightText: (c) 2026 marketcalls (port to openalgo-charts)
 * SPDX-License-Identifier: GPL-3.0-only
 *
 * Vitali Apirine's average slides its smoothing constant between a fast and a
 * slow EMA according to where price sits inside its recent range, so it tracks
 * a breakout closely and flattens out inside congestion.
 */

export default function ({ registerIndicator, sourceValues, highest, lowest, nulls }) {
  registerIndicator({
    id: 'oa-apirine-adaptive-moving-average',
    name: 'Apirine Adaptive Moving Average (AAMA)',
    category: 'Moving Averages',
    placement: 'onchart',

    inputs: [
      { key: 'length', type: 'number', label: 'Length', default: 14, min: 1, max: 5000, step: 1 },
      { key: 'fastLength', type: 'number', label: 'Fast EMA Length', default: 2, min: 1, max: 5000, step: 1 },
      { key: 'slowLength', type: 'number', label: 'Slow EMA Length', default: 30, min: 1, max: 5000, step: 1 },
      { key: 'source', type: 'source', label: 'Source', default: 'close' },
      {
        key: 'highlight',
        type: 'boolean',
        label: 'Highlight ?',
        default: true,
        tooltip: 'Colour the line by its own slope instead of using a single colour.',
      },
    ],

    plots: [
      {
        key: 'aama',
        type: 'line',
        title: 'AAMA',
        style: { color: '#6d1e7f', lineWidth: 2 },
        colorBy({ index, values, settings }) {
          if (settings.highlight === false) return '#6d1e7f'
          const col = values.aama
          const cur = col[index]
          const prev = index > 0 ? col[index - 1] : null
          // Pine compares against na on the first plotted bar, which is false,
          // so that bar is drawn in the down colour.
          return Number.isFinite(cur) && Number.isFinite(prev) && cur > prev ? '#4caf50' : '#ff5252'
        },
      },
    ],

    calc(bars, settings) {
      // A cleared number field arrives as '', and Number('') is 0.
      const length = Math.max(1, Math.floor(Number(settings.length) || 14))
      const fastLength = Math.max(1, Math.floor(Number(settings.fastLength) || 2))
      const slowLength = Math.max(1, Math.floor(Number(settings.slowLength) || 30))
      const src = sourceValues(bars, settings.source ?? 'close')
      const n = bars.length

      const fastAlpha = 2 / (fastLength + 1)
      const slowAlpha = 2 / (slowLength + 1)

      // Pine's one-argument highest()/lowest() default to high and low.
      const hh = highest(sourceValues(bars, 'high'), length + 1)
      const ll = lowest(sourceValues(bars, 'low'), length + 1)

      const out = new Array(n).fill(NaN)
      let prev = NaN

      for (let i = 0; i < n; i++) {
        if (!Number.isFinite(hh[i]) || !Number.isFinite(ll[i]) || !Number.isFinite(src[i])) continue
        const range = hh[i] - ll[i]
        const mltp = range !== 0 ? Math.abs(2 * src[i] - ll[i] - hh[i]) / range : 0
        const ssc = mltp * (fastAlpha - slowAlpha) + slowAlpha
        // nz(aama[1], src): the first value out of warmup seeds on the source.
        const base = Number.isFinite(prev) ? prev : src[i]
        const value = base + ssc * ssc * (src[i] - base)
        out[i] = value
        prev = value
      }

      return { aama: nulls(out) }
    },
  })
}
