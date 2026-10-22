/**
 * Acceleration Bands (ACCBANDS) - ported to openalgo-charts from Pine Script v6.
 *
 * Source: https://github.com/mihakralj/pinescript/blob/c4e91b962be09733d8fc76caa5191e9e586c5cee/indicators/channels/accbands.pine
 * Repo:   mihakralj/pinescript
 * License: MIT (c) mihakralj
 * SPDX-FileCopyrightText: (c) mihakralj
 * SPDX-FileCopyrightText: (c) 2026 marketcalls (port to openalgo-charts)
 * SPDX-License-Identifier: MIT
 *
 * A close average with bands pushed a multiple of the averaged high-to-low
 * spread beyond the averaged high and low, so the channel widens with the
 * typical bar range rather than with closing variance.
 */

export default function ({ registerIndicator, nulls }) {
  registerIndicator({
    id: 'oa-accbands',
    name: 'Acceleration Bands (ACCBANDS)',
    category: 'Channels',
    placement: 'onchart',

    inputs: [
      { key: 'period', type: 'number', label: 'Period', default: 20, min: 1, max: 5000, step: 1 },
      { key: 'factor', type: 'number', label: 'Factor', default: 2, min: 0.001, max: 100, step: 0.1 },
    ],

    plots: [
      { key: 'middle', type: 'line', title: 'Middle', style: { color: '#ffeb3b', lineWidth: 2 } },
      { key: 'upper', type: 'line', title: 'Upper', style: { color: '#ffeb3b', lineWidth: 2 } },
      { key: 'lower', type: 'line', title: 'Lower', style: { color: '#ffeb3b', lineWidth: 2 } },
    ],

    fills: [{ between: ['upper', 'lower'], colorUp: '#2962ff', colorDown: '#2962ff', opacity: 0.1 }],

    calc(bars, settings) {
      // A cleared number field arrives as '', and Number('') is 0.
      const period = Math.max(1, Math.floor(Number(settings.period) || 20))
      const factor = Math.max(0.001, Number(settings.factor) || 2)

      const n = bars.length
      const middle = new Array(n).fill(NaN)
      const upper = new Array(n).fill(NaN)
      const lower = new Array(n).fill(NaN)

      // The source runs three circular buffers seeded with na and divides by a
      // live count, so the first `period` bars carry an expanding-window mean
      // rather than a warmup gap, and the rolling mean only starts once the
      // buffer has wrapped. Reproduced exactly.
      const bufHigh = new Array(period).fill(NaN)
      const bufLow = new Array(period).fill(NaN)
      const bufClose = new Array(period).fill(NaN)
      let head = 0
      let count = 0
      let sumHigh = 0
      let sumLow = 0
      let sumClose = 0

      for (let i = 0; i < n; i++) {
        const oldestHigh = bufHigh[head]
        if (Number.isFinite(oldestHigh)) {
          sumHigh -= oldestHigh
          sumLow -= bufLow[head]
          sumClose -= bufClose[head]
          count -= 1
        }

        const b = bars[i]
        // nz(high) / nz(low) / nz(close): a missing price counts as zero here.
        const currentHigh = Number.isFinite(b.high) ? Number(b.high) : 0
        const currentLow = Number.isFinite(b.low) ? Number(b.low) : 0
        const currentClose = Number.isFinite(b.close) ? Number(b.close) : 0

        sumHigh += currentHigh
        sumLow += currentLow
        sumClose += currentClose
        count += 1

        bufHigh[head] = currentHigh
        bufLow[head] = currentLow
        bufClose[head] = currentClose
        head = (head + 1) % period

        if (count <= 0) continue
        const smaHigh = sumHigh / count
        const smaLow = sumLow / count
        const smaClose = sumClose / count
        if (!Number.isFinite(smaHigh) || !Number.isFinite(smaLow) || !Number.isFinite(smaClose)) continue

        const bandWidth = (smaHigh - smaLow) * factor
        middle[i] = smaClose
        upper[i] = smaHigh + bandWidth
        lower[i] = smaLow - bandWidth
      }

      return { middle: nulls(middle), upper: nulls(upper), lower: nulls(lower) }
    },
  })
}
