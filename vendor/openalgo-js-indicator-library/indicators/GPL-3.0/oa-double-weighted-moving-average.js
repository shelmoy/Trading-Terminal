/**
 * Double Weighted Moving Average (DWMA) - ported to openalgo-charts from Pine Script v3.
 *
 * Source: https://github.com/everget/tradingview-pinescript-indicators/blob/60c93d3711d222b8f2db96160defe568429348e0/movings/double_weighted_moving_average.pine
 * Repo:   everget/tradingview-pinescript-indicators
 * License: GPL-3.0 (c) 2019-present, Alex Orekhov (everget)
 * SPDX-FileCopyrightText: (c) 2018-present Alex Orekhov (everget)
 * SPDX-FileCopyrightText: (c) 2026 marketcalls (port to openalgo-charts)
 * SPDX-License-Identifier: GPL-3.0-only
 *
 * A weighted moving average run twice over the same length, which keeps the
 * front-loaded weighting of a WMA while removing most of its stair-stepping.
 */

export default function ({ registerIndicator, sourceValues, wma, nulls }) {
  // Pine v3 legacy colour constants.
  const UP = '#008000'
  const DOWN = '#ff0000'
  const FLAT = '#6d1e7f'

  registerIndicator({
    id: 'oa-double-weighted-moving-average',
    name: 'Double Weighted Moving Average (DWMA)',
    category: 'Moving Averages',
    placement: 'onchart',

    inputs: [
      { key: 'length', type: 'number', label: 'Length', default: 10, min: 1, max: 5000, step: 1 },
      { key: 'highlightMovements', type: 'boolean', label: 'Highlight Movements ?', default: true },
      { key: 'source', type: 'source', label: 'Source', default: 'close' },
    ],

    plots: [
      {
        key: 'dwma',
        type: 'line',
        title: 'DWMA',
        style: { color: FLAT, lineWidth: 2 },
        // dwma > dwma[1] ? green : red, exactly as the source colours the plot.
        colorBy({ index, values, settings }) {
          if (settings.highlightMovements === false) return undefined
          const series = values.dwma
          if (!series || index < 1) return undefined
          const cur = series[index]
          const prev = series[index - 1]
          if (!Number.isFinite(cur) || !Number.isFinite(prev)) return undefined
          return cur > prev ? UP : DOWN
        },
      },
    ],

    calc(bars, settings) {
      // A cleared number field arrives as '', and Number('') is 0.
      const length = Math.max(1, Math.floor(Number(settings.length) || 10))
      const src = sourceValues(bars, settings.source ?? 'close')

      // wma(wma(src, length), length): the inner warmup gap propagates, so the
      // first finite value lands at index 2 * length - 2, as it does in Pine.
      const inner = wma(src, length)
      const outer = wma(inner, length)

      const out = new Array(bars.length).fill(NaN)
      for (let i = 0; i < bars.length; i++) {
        if (Number.isFinite(outer[i])) out[i] = outer[i]
      }
      return { dwma: nulls(out) }
    },
  })
}
