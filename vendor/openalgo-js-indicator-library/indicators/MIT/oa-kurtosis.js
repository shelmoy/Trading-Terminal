/**
 * Kurtosis, tailedness (KURTOSIS) - ported to openalgo-charts from Pine Script v6.
 *
 * Source: https://github.com/mihakralj/pinescript/blob/c4e91b962be09733d8fc76caa5191e9e586c5cee/indicators/statistics/kurtosis.pine
 * Repo:   mihakralj/pinescript
 * License: MIT
 * SPDX-FileCopyrightText: (c) mihakralj
 * SPDX-FileCopyrightText: (c) 2026 marketcalls (port to openalgo-charts)
 * SPDX-License-Identifier: MIT
 *
 * Excess kurtosis of the source over a rolling window: positive means fatter
 * tails and a sharper peak than a normal distribution, negative means thinner.
 */

export default function ({ registerIndicator, sourceValues, nulls }) {
  registerIndicator({
    id: 'oa-kurtosis',
    name: 'Kurtosis, tailedness (KURTOSIS)',
    category: 'Statistics',
    placement: 'pane',

    inputs: [
      {
        key: 'period',
        type: 'number',
        label: 'Period',
        default: 14,
        min: 4,
        max: 5000,
        step: 1,
        tooltip: 'At least four samples are needed before a kurtosis can be formed.',
      },
      { key: 'source', type: 'source', label: 'Source', default: 'close' },
    ],

    plots: [
      { key: 'kurtosis', type: 'line', title: 'Kurtosis', style: { color: '#ffeb3b', lineWidth: 2 } },
    ],

    calc(bars, settings) {
      // A cleared number field arrives as '', and Number('') is 0. Pine's input
      // carries minval=4 because kurtosis needs four samples.
      const len = Math.max(4, Math.floor(Number(settings.period) || 14))
      const src = sourceValues(bars, settings.source ?? 'close')

      const out = new Array(bars.length).fill(NaN)

      // Circular buffer plus running power sums, exactly as the source keeps them.
      const window = new Array(len).fill(NaN)
      let sumY = 0
      let sumY2 = 0
      let sumY3 = 0
      let sumY4 = 0
      let validCount = 0
      let head = 0
      let filled = false

      for (let i = 0; i < bars.length; i++) {
        const oldY = filled ? window[head] : NaN
        if (Number.isFinite(oldY)) {
          sumY -= oldY
          sumY2 -= oldY * oldY
          sumY3 -= oldY * oldY * oldY
          sumY4 -= oldY * oldY * oldY * oldY
          validCount -= 1
        }

        const currentY = src[i]
        window[head] = currentY
        if (Number.isFinite(currentY)) {
          sumY += currentY
          sumY2 += currentY * currentY
          sumY3 += currentY * currentY * currentY
          sumY4 += currentY * currentY * currentY * currentY
          validCount += 1
        }

        head = (head + 1) % len
        if (!filled && head === 0) filled = true

        // Warmup stays na until four samples are in the window.
        if (validCount < 4) continue

        const n = validCount
        const mean = sumY / n
        const m2 = sumY2 / n
        const m3 = sumY3 / n
        const m4 = sumY4 / n
        const variance = Math.max(m2 - mean * mean, 0)

        if (variance > 1e-10) {
          const moment4 =
            m4 - 4 * mean * m3 + 6 * mean * mean * m2 - 3 * mean * mean * mean * mean
          out[i] = moment4 / (variance * variance) - 3
        } else {
          // A flat or halted window has no dispersion to measure.
          out[i] = 0
        }
      }

      return { kurtosis: nulls(out) }
    },
  })
}
