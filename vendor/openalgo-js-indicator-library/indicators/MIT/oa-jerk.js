/**
 * Acceleration, Slope of Slope (JERK) - ported to openalgo-charts from Pine Script v6.
 *
 * Source: https://github.com/mihakralj/pinescript/blob/c4e91b962be09733d8fc76caa5191e9e586c5cee/indicators/numerics/jerk.pine
 * Repo:   mihakralj/pinescript
 * License: MIT (c) mihakralj
 * SPDX-FileCopyrightText: (c) mihakralj
 * SPDX-FileCopyrightText: (c) 2026 marketcalls (port to openalgo-charts)
 * SPDX-License-Identifier: MIT
 *
 * Three rolling least squares regressions chained together: the slope of the
 * source, then the slope of that slope (acceleration), then the slope of the
 * acceleration (jerk). It measures how fast a trend's rate of change is itself
 * changing.
 */

export default function ({ registerIndicator, sourceValues, nulls }) {
  // A faithful copy of the Pine circular-buffer regression: x is the running bar
  // counter, y is whatever series is fed in, and only non-na y values take part
  // in the sums. The counter advances on every bar, so a na y still consumes a
  // slot in the window.
  const rollingSlope = (values, len) => {
    const n = values.length
    const out = new Array(n).fill(NaN)
    const xBuf = new Array(len).fill(NaN)
    const yBuf = new Array(len).fill(NaN)
    let sumX = 0
    let sumY = 0
    let sumXY = 0
    let sumX2 = 0
    let valid = 0
    let head = 0
    let counter = 0

    for (let i = 0; i < n; i++) {
      if (counter >= len) {
        const oldX = xBuf[head]
        const oldY = yBuf[head]
        if (Number.isFinite(oldY)) {
          sumX -= oldX
          sumY -= oldY
          sumXY -= oldX * oldY
          sumX2 -= oldX * oldX
          valid -= 1
        }
      }

      const curX = counter
      const curY = values[i]
      xBuf[head] = curX
      yBuf[head] = curY
      if (Number.isFinite(curY)) {
        sumX += curX
        sumY += curY
        sumXY += curX * curY
        sumX2 += curX * curX
        valid += 1
      }
      head = (head + 1) % len
      counter += 1

      if (valid >= 2) {
        const divisor = valid * sumX2 - sumX * sumX
        if (divisor !== 0) out[i] = (valid * sumXY - sumX * sumY) / divisor
      }
    }
    return out
  }

  registerIndicator({
    id: 'oa-jerk',
    name: 'Acceleration, Slope of Slope (JERK)',
    category: 'Numerics',
    placement: 'pane',

    inputs: [
      { key: 'period', type: 'number', label: 'Period', default: 14, min: 2, max: 5000, step: 1 },
      { key: 'source', type: 'source', label: 'Source', default: 'close' },
    ],

    plots: [{ key: 'jerk', type: 'line', title: 'jerk', style: { color: '#ffeb3b', lineWidth: 2 } }],

    calc(bars, settings) {
      // A cleared number field arrives as '', and Number('') is 0. Pine refuses a
      // length of 1 or less for the first slope, so the floor is 2.
      const period = Math.max(2, Math.floor(Number(settings.period) || 14))
      const src = sourceValues(bars, settings.source ?? 'close')

      const slope = rollingSlope(src, period)
      const accel = rollingSlope(slope, period)
      const jerk = rollingSlope(accel, period)

      return { jerk: nulls(jerk) }
    },
  })
}
