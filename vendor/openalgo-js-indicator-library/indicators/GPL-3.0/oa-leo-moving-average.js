/**
 * leo_moving_average - ported to openalgo-charts from Pine Script v3.
 *
 * Source: https://github.com/everget/tradingview-pinescript-indicators/blob/60c93d3711d222b8f2db96160defe568429348e0/movings/leo_moving_average.pine
 * Repo:   everget/tradingview-pinescript-indicators
 * License: GPL-3.0, Copyright (c) 2018-present, Alex Orekhov (everget)
 * SPDX-FileCopyrightText: (c) 2018-present Alex Orekhov (everget)
 * SPDX-FileCopyrightText: (c) 2026 marketcalls (port to openalgo-charts)
 * SPDX-License-Identifier: GPL-3.0-only
 *
 * A blend of a weighted and a simple moving average, 2*WMA - SMA, which tracks
 * price more closely than either one on its own.
 */

export default function ({ registerIndicator, sourceValues, sma, wma, nulls }) {
  // Pine's color.green and color.red, plus the script's own flat colour.
  const UP_COLOR = '#4caf50'
  const DOWN_COLOR = '#ff5252'
  const FLAT_COLOR = '#6d1e7f'

  registerIndicator({
    id: 'oa-leo-moving-average',
    name: 'Leo Moving Average (LMA)',
    category: 'Moving Averages',
    placement: 'onchart',

    inputs: [
      { key: 'length', type: 'number', label: 'Length', default: 14, min: 1, max: 5000, step: 1 },
      { key: 'highlightMovements', type: 'boolean', label: 'Highlight Movements ?', default: true },
      { key: 'source', type: 'source', label: 'Source', default: 'close' },
    ],

    plots: [
      {
        key: 'lma',
        type: 'line',
        title: 'LMA',
        style: { color: FLAT_COLOR, lineWidth: 2 },
        colorBy({ index, values, settings }) {
          if (settings.highlightMovements === false) return FLAT_COLOR
          const cur = values.lma?.[index]
          const prev = index > 0 ? values.lma?.[index - 1] : null
          // Pine compares against na as false, so the first drawn bar is red.
          if (!Number.isFinite(cur) || !Number.isFinite(prev)) return DOWN_COLOR
          return cur > prev ? UP_COLOR : DOWN_COLOR
        },
      },
    ],

    calc(bars, settings) {
      // A cleared number field arrives as '', and Number('') is 0.
      const length = Math.max(1, Math.floor(Number(settings.length) || 14))
      const src = sourceValues(bars, settings.source ?? 'close')

      const fast = wma(src, length)
      const slow = sma(src, length)

      const out = new Array(bars.length).fill(NaN)
      for (let i = 0; i < bars.length; i++) {
        if (!Number.isFinite(fast[i]) || !Number.isFinite(slow[i])) continue
        out[i] = 2 * fast[i] - slow[i]
      }

      return { lma: nulls(out) }
    },
  })
}
