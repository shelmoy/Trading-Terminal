/**
 * Acceleration (Slope of Slope) (ACCEL) - ported to openalgo-charts from Pine Script v6.
 *
 * Source: https://github.com/mihakralj/pinescript/blob/c4e91b962be09733d8fc76caa5191e9e586c5cee/indicators/numerics/accel.pine
 * Repo:   mihakralj/pinescript
 * License: MIT (c) mihakralj
 * SPDX-FileCopyrightText: (c) mihakralj
 * SPDX-FileCopyrightText: (c) 2026 marketcalls (port to openalgo-charts)
 * SPDX-License-Identifier: MIT
 *
 * A least squares line is fitted to the source over the lookback to give a
 * slope, then a second line is fitted to that slope series. The result is the
 * rate at which the trend itself is speeding up or slowing down.
 */

export default function ({ registerIndicator, sourceValues, nulls }) {
  // A direct port of the Pine rolling regression: a circular buffer of the last
  // `len` (x, y) pairs plus running sums, where x is the bar counter rather than
  // a window offset. A slot whose y was na is never added to the sums and never
  // subtracted from them, which is why validCount is tracked separately.
  const rollingSlope = (values, len) => {
    const n = values.length
    const out = new Array(n).fill(NaN)
    const xBuf = new Array(len).fill(NaN)
    const yBuf = new Array(len).fill(NaN)
    let sumX = 0
    let sumY = 0
    let sumXY = 0
    let sumX2 = 0
    let validCount = 0
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
          validCount -= 1
        }
      }

      const curX = counter
      const curY = Number.isFinite(values[i]) ? values[i] : NaN
      xBuf[head] = curX
      yBuf[head] = curY
      if (Number.isFinite(curY)) {
        sumX += curX
        sumY += curY
        sumXY += curX * curY
        sumX2 += curX * curX
        validCount += 1
      }
      head = (head + 1) % len
      counter += 1

      if (validCount >= 2) {
        const divisor = validCount * sumX2 - sumX * sumX
        if (divisor !== 0) {
          const slope = (validCount * sumXY - sumX * sumY) / divisor
          if (Number.isFinite(slope)) out[i] = slope
        }
      }
    }
    return out
  }

  registerIndicator({
    id: 'oa-accel',
    name: 'Acceleration (Slope of Slope) (ACCEL)',
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
        tooltip: 'Lookback used for both regressions. Pine refuses a length of 1 or less.',
      },
      { key: 'source', type: 'source', label: 'Source', default: 'close' },
    ],

    plots: [
      { key: 'accel', type: 'line', title: 'Accel', style: { color: '#ffeb3b', lineWidth: 2 } },
    ],

    calc(bars, settings) {
      // A cleared number field arrives as '', and Number('') is 0.
      const period = Math.max(2, Math.floor(Number(settings.period) || 14))
      const src = sourceValues(bars, settings.source ?? 'close')

      // First pass: slope of the source. Second pass: slope of that slope.
      // The second pass sees na for the first bar, so acceleration needs two
      // valid slope points and starts one bar later than the slope does.
      const slope = rollingSlope(src, period)
      const accel = rollingSlope(slope, period)

      return { accel: nulls(accel) }
    },
  })
}
