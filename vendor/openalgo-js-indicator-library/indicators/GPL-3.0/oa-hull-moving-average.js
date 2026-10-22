/**
 * Hull Moving Average (HMA) - ported to openalgo-charts from Pine Script v3.
 *
 * Source: https://github.com/everget/tradingview-pinescript-indicators/blob/60c93d3711d222b8f2db96160defe568429348e0/movings/hull_moving_average.pine
 * Repo:   everget/tradingview-pinescript-indicators
 * License: GPL-3.0, Copyright (c) 2018-present, Alex Orekhov (everget)
 * SPDX-FileCopyrightText: (c) 2018-present Alex Orekhov (everget)
 * SPDX-FileCopyrightText: (c) 2026 marketcalls (port to openalgo-charts)
 * SPDX-License-Identifier: GPL-3.0-only
 *
 * Two weighted moving averages are differenced to cancel most of the lag, then
 * smoothed again over the square root of the length, giving a fast average that
 * still turns cleanly.
 */

export default function ({ registerIndicator, sourceValues, wma, nulls }) {
  registerIndicator({
    id: 'oa-hull-moving-average',
    name: 'Hull Moving Average (HMA)',
    category: 'Moving Averages',
    placement: 'onchart',

    inputs: [
      { key: 'length', type: 'number', label: 'Length', default: 14, min: 1, max: 5000, step: 1 },
      { key: 'source', type: 'source', label: 'Source', default: 'close' },
    ],

    plots: [{ key: 'hma', type: 'line', title: 'HMA', style: { color: '#6d1e7f', lineWidth: 2 } }],

    calc(bars, settings) {
      // A cleared number field arrives as '', and Number('') is 0.
      const length = Math.max(1, Math.floor(Number(settings.length) || 14))
      const src = sourceValues(bars, settings.source ?? 'close')

      // Pine's `length / 2` is integer division on an int input, and the final
      // smoothing length is round(sqrt(length)).
      const half = Math.max(1, Math.floor(length / 2))
      const root = Math.max(1, Math.round(Math.sqrt(length)))

      const fast = wma(src, half)
      const slow = wma(src, length)

      // NaN in the difference keeps the warmup gap, so the final wma starts at
      // (length - 1) + (root - 1) exactly as the Pine plot does.
      const raw = new Array(bars.length).fill(NaN)
      for (let i = 0; i < bars.length; i++) {
        if (!Number.isFinite(fast[i]) || !Number.isFinite(slow[i])) continue
        raw[i] = 2 * fast[i] - slow[i]
      }

      return { hma: nulls(wma(raw, root)) }
    },
  })
}
