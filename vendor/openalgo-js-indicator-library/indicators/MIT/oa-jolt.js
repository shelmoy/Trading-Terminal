/**
 * Acceleration, Slope of Slope (JOLT) - ported to openalgo-charts from Pine Script v6.
 *
 * Source: https://github.com/mihakralj/pinescript/blob/c4e91b962be09733d8fc76caa5191e9e586c5cee/indicators/numerics/jolt.pine
 * Repo:   mihakralj/pinescript
 * License: MIT (c) mihakralj
 * SPDX-FileCopyrightText: (c) mihakralj
 * SPDX-FileCopyrightText: (c) 2026 marketcalls (port to openalgo-charts)
 * SPDX-License-Identifier: MIT
 *
 * Three nested rolling least squares fits: the slope of the source, the slope of
 * that slope (acceleration) and the slope of the acceleration (jolt), so the line
 * measures how fast the trend's curvature itself is changing.
 */

export default function ({ registerIndicator, sourceValues, nulls }) {
  // One pass of the Pine helper. Pine keeps a circular buffer of the last `len`
  // (x, y) pairs, where x is a counter that starts at 0 on the first bar and so
  // equals the bar index. na values of y are stored but kept out of the running
  // sums, and a slope needs at least two valid pairs plus a non-zero divisor.
  const rollingSlope = (values, len) => {
    const n = values.length
    const out = new Array(n).fill(NaN)
    let sumX = 0
    let sumY = 0
    let sumXY = 0
    let sumX2 = 0
    let count = 0
    for (let i = 0; i < n; i++) {
      if (i >= len) {
        const oldX = i - len
        const oldY = values[oldX]
        if (Number.isFinite(oldY)) {
          sumX -= oldX
          sumY -= oldY
          sumXY -= oldX * oldY
          sumX2 -= oldX * oldX
          count -= 1
        }
      }
      const y = values[i]
      if (Number.isFinite(y)) {
        sumX += i
        sumY += y
        sumXY += i * y
        sumX2 += i * i
        count += 1
      }
      if (count < 2) continue
      const divisor = count * sumX2 - sumX * sumX
      if (divisor === 0) continue
      out[i] = (count * sumXY - sumX * sumY) / divisor
    }
    return out
  }

  registerIndicator({
    id: 'oa-jolt',
    name: 'Acceleration, Slope of Slope (JOLT)',
    category: 'Numerics',
    placement: 'pane',

    inputs: [
      {
        key: 'period',
        type: 'number',
        label: 'Period',
        default: 14,
        min: 2,
        max: 5000,
        step: 1,
        tooltip: 'Lookback used by each of the three least squares slope passes.',
      },
      { key: 'source', type: 'source', label: 'Source', default: 'close' },
    ],

    plots: [{ key: 'jolt', type: 'line', title: 'Jolt', style: { color: '#ffeb3b', lineWidth: 2 } }],

    calc(bars, settings) {
      // A cleared number field arrives as '', and Number('') is 0. Pine raises
      // a runtime error below 2, so the floor is 2.
      const period = Math.max(2, Math.floor(Number(settings.period) || 14))
      const src = sourceValues(bars, settings.source || 'close')

      const slope = rollingSlope(src, period)
      const accel = rollingSlope(slope, period)
      const jolt = rollingSlope(accel, period)

      return { jolt: nulls(jolt) }
    },
  })
}
