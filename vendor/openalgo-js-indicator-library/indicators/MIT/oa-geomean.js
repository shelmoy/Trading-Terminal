/**
 * Geometric Mean (GEOMEAN) - ported to openalgo-charts from Pine Script v6.
 *
 * Source: https://github.com/mihakralj/pinescript/blob/c4e91b962be09733d8fc76caa5191e9e586c5cee/indicators/statistics/geomean.pine
 * Repo:   mihakralj/pinescript
 * License: MIT (c) mihakralj
 * SPDX-FileCopyrightText: (c) mihakralj
 * SPDX-FileCopyrightText: (c) 2026 marketcalls (port to openalgo-charts)
 * SPDX-License-Identifier: MIT
 *
 * The exponential of the mean log of the lookback window: a central tendency that
 * compounds multiplicatively, so it sits below the arithmetic mean and is pulled
 * less by a single spike. Non-positive values are skipped rather than plotted.
 */

export default function ({ registerIndicator, sourceValues, nulls }) {
  registerIndicator({
    id: 'oa-geomean',
    name: 'Geometric Mean (GEOMEAN)',
    category: 'Statistics',
    placement: 'onchart',

    inputs: [
      {
        key: 'source',
        type: 'source',
        label: 'Source (must be positive values)',
        default: 'close',
        tooltip: 'Bars whose source value is zero or negative are left out of the window.',
      },
      { key: 'length', type: 'number', label: 'Lookback Period', default: 14, min: 1, max: 5000, step: 1 },
    ],

    plots: [{ key: 'geomean', type: 'line', title: 'GEOMEAN', style: { color: '#ffeb3b', lineWidth: 2 } }],

    calc(bars, settings) {
      const n = bars.length
      // A cleared number field arrives as '', and Number('') is 0.
      const length = Math.max(1, Math.floor(Number(settings.length) || 14))
      const src = sourceValues(bars, settings.source ?? 'close')

      const out = new Array(n).fill(NaN)
      const buffer = new Array(length).fill(NaN)
      let sumLog = 0
      let validCount = 0
      let index = 0

      for (let i = 0; i < n; i++) {
        const value = src[i]
        const valid = Number.isFinite(value) && value > 0

        // Drop the entry leaving the window, exactly as the source's ring buffer does.
        const old = buffer[index]
        if (Number.isFinite(old) && old > 0) {
          sumLog -= Math.log(old)
          validCount -= 1
        }

        if (valid) {
          sumLog += Math.log(value)
          validCount += 1
          buffer[index] = value
        } else {
          buffer[index] = NaN
        }
        index = (index + 1) % length

        // Count-based warmup: bar 0 already emits, on a window of one.
        if (validCount > 0) out[i] = Math.exp(sumLog / validCount)
      }

      return { geomean: nulls(out) }
    },
  })
}
