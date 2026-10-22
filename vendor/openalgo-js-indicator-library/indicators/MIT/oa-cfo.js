/**
 * Chande Forecast Oscillator - ported to openalgo-charts from Pine Script v6.
 *
 * Source: https://github.com/mihakralj/pinescript/blob/c4e91b962be09733d8fc76caa5191e9e586c5cee/indicators/oscillators/cfo.pine
 * Repo:   mihakralj/pinescript
 * License: MIT (c) mihakralj
 * SPDX-FileCopyrightText: (c) mihakralj
 * SPDX-FileCopyrightText: (c) 2026 marketcalls (port to openalgo-charts)
 * SPDX-License-Identifier: MIT
 *
 * The percentage by which price sits away from the value a linear regression
 * over the last N bars forecasts for the current bar, so a reading near zero
 * means price is tracking its own trend line.
 */

export default function ({ registerIndicator, sourceValues, nulls }) {
  registerIndicator({
    id: 'oa-cfo',
    name: 'Chande Forecast Oscillator',
    category: 'Oscillators',
    placement: 'pane',

    inputs: [
      { key: 'period', type: 'number', label: 'Period', default: 14, min: 1, max: 5000, step: 1 },
      { key: 'source', type: 'source', label: 'Source', default: 'close' },
    ],

    plots: [{ key: 'cfo', type: 'line', title: 'CFO', style: { color: '#ffeb3b', lineWidth: 2 } }],

    levels: () => [{ price: 0, title: 'Zero Line', color: '#787b86', dashed: true }],

    calc(bars, settings) {
      // A cleared number field arrives as '', and Number('') is 0.
      const period = Math.max(1, Math.min(5000, Math.floor(Number(settings.period) || 14)))
      const src = sourceValues(bars, settings.source ?? 'close')
      const out = new Array(bars.length).fill(NaN)

      // Pine keeps sumY and sumXY incrementally over a circular buffer, with x
      // running 0 .. period-1 from the oldest bar in the window.
      const buffer = new Array(period).fill(NaN)
      let count = 0
      let head = 0
      let sumY = 0
      let sumXY = 0

      const sumX = (period * (period - 1)) / 2
      const sumX2 = (period * (period - 1) * (2 * period - 1)) / 6
      const denomX = period * sumX2 - sumX * sumX

      for (let i = 0; i < bars.length; i++) {
        const value = src[i]
        // Pine returns na for a na source and leaves the window untouched.
        if (!Number.isFinite(value)) continue

        const oldest = buffer[head]
        if (Number.isFinite(oldest)) {
          sumY -= oldest
          sumXY -= sumY
          sumXY += (period - 1) * value
        } else {
          sumXY += count * value
          count += 1
        }

        sumY += value
        buffer[head] = value
        head = (head + 1) % period

        // na until the window is full: the first value lands on bar period-1.
        if (count < period) continue
        // period 1 collapses the regression, so denomX is 0 and there is no slope.
        if (denomX === 0) continue

        const slope = (period * sumXY - sumX * sumY) / denomX
        const intercept = (sumY - slope * sumX) / period
        const tsf = intercept + slope * (period - 1)

        if (value === 0) continue
        out[i] = (100 * (value - tsf)) / value
      }

      return { cfo: nulls(out) }
    },
  })
}
