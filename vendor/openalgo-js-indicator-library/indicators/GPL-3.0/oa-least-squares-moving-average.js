/**
 * Least Squares Moving Average (LSMA) - ported to openalgo-charts from Pine Script v3.
 *
 * Source: https://github.com/everget/tradingview-pinescript-indicators/blob/60c93d3711d222b8f2db96160defe568429348e0/movings/least_squares_moving_average.pine
 * Repo:   everget/tradingview-pinescript-indicators
 * License: GPL-3.0 (c) 2018-present, Alex Orekhov (everget)
 * SPDX-FileCopyrightText: (c) 2018-present Alex Orekhov (everget)
 * SPDX-FileCopyrightText: (c) 2026 marketcalls (port to openalgo-charts)
 * SPDX-License-Identifier: GPL-3.0-only
 *
 * The endpoint of a least squares straight line fitted through the last N
 * values, so it tracks price with less lag than an average of the same length.
 */

export default function ({ registerIndicator, sourceValues, linreg, nulls }) {
  registerIndicator({
    id: 'oa-least-squares-moving-average',
    name: 'Least Squares Moving Average (LSMA)',
    category: 'Moving Averages',
    placement: 'onchart',

    inputs: [
      { key: 'length', type: 'number', label: 'Length', default: 14, min: 1, max: 5000, step: 1 },
      {
        key: 'offset',
        type: 'number',
        label: 'Offset',
        default: 0,
        min: -5000,
        max: 5000,
        step: 1,
        tooltip: 'Bars back along the fitted line to read the value from. 0 is the line endpoint.',
      },
      { key: 'source', type: 'source', label: 'Source', default: 'close' },
    ],

    plots: [
      { key: 'lsma', type: 'line', title: 'LSMA', style: { color: '#6d1e7f', lineWidth: 2 } },
    ],

    calc(bars, settings) {
      // A cleared number field arrives as '', and Number('') is 0. Zero is a
      // legitimate offset, so it is floored rather than defaulted away.
      const length = Math.max(1, Math.floor(Number(settings.length) || 14))
      const rawOffset = Number(settings.offset)
      const offset = Number.isFinite(rawOffset) ? Math.floor(rawOffset) : 0
      const src = sourceValues(bars, settings.source ?? 'close')

      // linreg carries the same offset convention as Pine: the value is read
      // `offset` bars back along the fitted line, and the first length-1 bars
      // have no fit at all.
      return { lsma: nulls(linreg(src, length, offset)) }
    },
  })
}
