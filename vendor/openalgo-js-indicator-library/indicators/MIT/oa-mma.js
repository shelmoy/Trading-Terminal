/**
 * Modified Moving Average (MMA) - ported to openalgo-charts from Pine Script v6.
 *
 * Source: https://github.com/mihakralj/pinescript/blob/c4e91b962be09733d8fc76caa5191e9e586c5cee/indicators/trends_IIR/mma.pine
 * Repo:   mihakralj/pinescript
 * License: MIT (c) mihakralj
 * SPDX-FileCopyrightText: (c) mihakralj
 * SPDX-FileCopyrightText: (c) 2026 marketcalls (port to openalgo-charts)
 * SPDX-License-Identifier: MIT
 *
 * A simple moving average plus a linear end-point correction built from the
 * same window, which removes most of the lag of the plain mean while keeping
 * its smoothness.
 */

export default function ({ registerIndicator, sourceValues, nulls }) {
  registerIndicator({
    id: 'oa-mma',
    name: 'Modified Moving Average (MMA)',
    category: 'Trends IIR',
    placement: 'onchart',

    inputs: [
      { key: 'period', type: 'number', label: 'Period', default: 10, min: 2, max: 4000, step: 1 },
      { key: 'source', type: 'source', label: 'Source', default: 'close' },
    ],

    plots: [{ key: 'mma', type: 'line', title: 'MMA', style: { color: '#ffeb3b', lineWidth: 2 } }],

    calc(bars, settings) {
      // A cleared number field arrives as '', and Number('') is 0.
      const period = Math.max(2, Math.floor(Number(settings.period) || 10))
      // Pine sizes the circular buffer math.min(math.max(2, period), 4000).
      const size = Math.min(Math.max(2, period), 4000)
      const src = sourceValues(bars, settings.source ?? 'close')

      const buffer = new Array(size).fill(NaN)
      const out = new Array(bars.length).fill(NaN)
      let head = 0
      let sum = 0
      let validCount = 0

      for (let i = 0; i < bars.length; i++) {
        const value = src[i]
        const oldest = buffer[head]
        sum = sum + (Number.isFinite(value) ? value : 0) - (Number.isFinite(oldest) ? oldest : 0)
        validCount =
          validCount + (Number.isFinite(value) ? 1 : 0) - (Number.isFinite(oldest) ? 1 : 0)
        buffer[head] = value
        head = (head + 1) % size

        // Before anything valid is in the window Pine returns the raw source,
        // so the line starts on the first bar rather than after a warmup gap.
        if (validCount <= 0) {
          out[i] = value
          continue
        }

        const mean = sum / validCount
        let weightedSum = 0
        let count = 0
        // Walk the window newest first, which is the order the weights assume.
        for (let k = 0; k < size; k++) {
          const val = buffer[(head - 1 - k + size) % size]
          if (!Number.isFinite(val)) continue
          weightedSum += (validCount - (2 * count + 1)) * 0.5 * val
          count += 1
        }

        const denominator = (validCount + 1) * validCount
        out[i] = denominator === 0 ? mean : mean + (weightedSum * 6) / denominator
      }

      return { mma: nulls(out) }
    },
  })
}
