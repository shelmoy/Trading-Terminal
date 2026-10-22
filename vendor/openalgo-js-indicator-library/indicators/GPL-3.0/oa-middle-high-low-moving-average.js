/**
 * Middle-High-Low Moving Average (MHLMA) - ported to openalgo-charts from Pine Script v3.
 *
 * Source: https://github.com/everget/tradingview-pinescript-indicators/blob/60c93d3711d222b8f2db96160defe568429348e0/movings/middle_high_low_moving_average.pine
 * Repo:   everget/tradingview-pinescript-indicators
 * License: GPL-3.0
 * SPDX-FileCopyrightText: (c) 2018-present Alex Orekhov (everget)
 * SPDX-FileCopyrightText: (c) 2026 marketcalls (port to openalgo-charts)
 * SPDX-License-Identifier: GPL-3.0-only
 * Copyright (c) 2018-present, Alex Orekhov (everget)
 *
 * Averages the rolling high and the rolling low into a channel midline, then
 * smooths that midline, so the result tracks the centre of the recent range
 * instead of the centre of the closes.
 */

export default function ({ registerIndicator, highest, lowest, sma, smaSeededEma, nulls }) {
  registerIndicator({
    id: 'oa-middle-high-low-moving-average',
    name: 'Middle-High-Low Moving Average (MHLMA)',
    category: 'Moving Averages',
    placement: 'onchart',

    inputs: [
      { key: 'length', type: 'number', label: 'Length', default: 14, min: 1, max: 5000, step: 1 },
      { key: 'mhlRange', type: 'number', label: 'High-Low Range', default: 10, min: 1, max: 5000, step: 1 },
      {
        key: 'maType',
        type: 'select',
        label: 'MA Type',
        default: 'EMA',
        options: [
          { label: 'EMA', value: 'EMA' },
          { label: 'SMA', value: 'SMA' },
        ],
      },
      { key: 'highlightMovements', type: 'boolean', label: 'Highlight Movements', default: true },
    ],

    plots: [
      {
        key: 'mhlma',
        type: 'line',
        title: 'MHLMA',
        style: { color: '#6d1e7f', lineWidth: 2 },
        colorBy({ index, values, settings }) {
          if (settings.highlightMovements === false) return '#6d1e7f'
          const series = values.mhlma
          const cur = series[index]
          const prev = index > 0 ? series[index - 1] : null
          // Pine compares against na on the first bar, which is false, so the
          // colour falls to the down side there rather than to the up side.
          if (!Number.isFinite(cur) || !Number.isFinite(prev)) return '#ff5252'
          return cur > prev ? '#4caf50' : '#ff5252'
        },
      },
    ],

    calc(bars, settings) {
      // A cleared number field arrives as '', and Number('') is 0.
      const length = Math.max(1, Math.floor(Number(settings.length) || 14))
      const mhlRange = Math.max(1, Math.floor(Number(settings.mhlRange) || 10))
      const n = bars.length

      const high = bars.map((b) => b.high)
      const low = bars.map((b) => b.low)
      const hi = highest(high, mhlRange)
      const lo = lowest(low, mhlRange)

      const mhl = new Array(n).fill(NaN)
      for (let i = 0; i < n; i++) {
        if (!Number.isFinite(hi[i]) || !Number.isFinite(lo[i])) continue
        mhl[i] = (hi[i] + lo[i]) / 2
      }

      // Pine's sma and ema both return na while their window still overlaps the
      // warmup gap left by highest/lowest, so the average is taken over the
      // gap-free tail and written back at its original offsets.
      const start = Math.min(mhlRange - 1, n)
      const tail = mhl.slice(start)
      const smoothed = settings.maType === 'SMA' ? sma(tail, length) : smaSeededEma(tail, length)

      const out = new Array(n).fill(NaN)
      for (let j = 0; j < tail.length; j++) {
        const v = smoothed[j]
        if (Number.isFinite(v)) out[start + j] = v
      }

      return { mhlma: nulls(out) }
    },
  })
}
