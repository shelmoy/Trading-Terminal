/**
 * Correlation Trend Indicator (CTI) - ported to openalgo-charts from Pine Script v6.
 *
 * Source: https://github.com/mihakralj/pinescript/blob/c4e91b962be09733d8fc76caa5191e9e586c5cee/indicators/oscillators/cti.pine
 * Repo:   mihakralj/pinescript
 * License: MIT
 * SPDX-FileCopyrightText: (c) mihakralj
 * SPDX-FileCopyrightText: (c) 2026 marketcalls (port to openalgo-charts)
 * SPDX-License-Identifier: MIT
 *
 * Pearson correlation between the source and a straight time index over the
 * lookback window, so +1 is a perfectly straight rise, -1 a perfectly straight
 * fall and 0 no linear trend at all.
 */

export default function ({ registerIndicator, sourceValues, nulls }) {
  registerIndicator({
    id: 'oa-cti',
    name: 'Correlation Trend Indicator (CTI)',
    category: 'Oscillators',
    placement: 'pane',

    inputs: [
      { key: 'source', type: 'source', label: 'Source', default: 'close' },
      { key: 'period', type: 'number', label: 'Period', default: 20, min: 2, max: 5000, step: 1 },
    ],

    plots: [{ key: 'cti', type: 'line', title: 'CTI', style: { color: '#ffeb3b', lineWidth: 2 } }],

    levels: () => [
      { price: 0.5, title: 'Upper', color: '#787b86', dashed: true },
      { price: 0, title: 'Zero', color: '#787b86', dashed: true },
      { price: -0.5, title: 'Lower', color: '#787b86', dashed: true },
    ],

    range: () => ({ min: -1.05, max: 1.05 }),

    calc(bars, settings) {
      // A cleared number field arrives as '', and Number('') is 0.
      const period = Math.min(5000, Math.max(2, Math.floor(Number(settings.period) || 20)))
      const src = sourceValues(bars, settings.source ?? 'close')

      const out = new Array(bars.length).fill(NaN)
      // The source keeps running sums over a circular buffer, so the port keeps
      // them too: the incremental form is what the plot is made of.
      const buffer = new Array(period).fill(NaN)
      let count = 0
      let head = 0
      let sumY = 0
      let sumY2 = 0
      let sumXY = 0

      for (let i = 0; i < bars.length; i++) {
        const value = src[i]
        // Pine returns na for a missing source and leaves every running sum
        // untouched, so that bar does not consume a buffer slot.
        if (!Number.isFinite(value)) continue

        const oldest = buffer[head]
        if (Number.isFinite(oldest)) {
          // Drop the oldest sample, shift every remaining x index down by one,
          // then place the new sample at index period - 1.
          sumY -= oldest
          sumY2 -= oldest * oldest
          sumXY -= sumY
          sumXY += (period - 1) * value
        } else {
          // Filling phase: the window is still growing, x runs 0 .. count.
          sumXY += count * value
          count += 1
        }

        sumY += value
        sumY2 += value * value
        buffer[head] = value
        head = (head + 1) % period

        if (count < 2) continue

        const n = count
        const sumX = (n * (n - 1)) / 2
        const sumX2 = (n * (n - 1) * (2 * n - 1)) / 6
        const denomX = n * sumX2 - sumX * sumX
        const denomY = n * sumY2 - sumY * sumY
        const denom = denomX * denomY
        if (denom <= 0) {
          // A flat window has no dispersion to correlate against.
          out[i] = 0
          continue
        }
        const r = (n * sumXY - sumX * sumY) / Math.sqrt(denom)
        out[i] = Math.max(-1, Math.min(1, r))
      }

      return { cti: nulls(out) }
    },
  })
}
