/**
 * Standardization (Z-score) - ported to openalgo-charts from Pine Script v6.
 *
 * Source: https://github.com/mihakralj/pinescript/blob/c4e91b962be09733d8fc76caa5191e9e586c5cee/indicators/numerics/standardize.pine
 * Repo:   mihakralj/pinescript
 * License: MIT
 * SPDX-FileCopyrightText: (c) mihakralj
 * SPDX-FileCopyrightText: (c) 2026 marketcalls (port to openalgo-charts)
 * SPDX-License-Identifier: MIT
 *
 * Expresses the current value as the number of sample standard deviations it
 * sits away from its own rolling mean, so series on different scales become
 * directly comparable.
 */

export default function ({ registerIndicator, sourceValues, nulls }) {
  registerIndicator({
    id: 'oa-standardize',
    name: 'Standardization (Z-score)',
    category: 'Numerics',
    placement: 'pane',

    inputs: [
      { key: 'source', type: 'source', label: 'Source', default: 'close' },
      {
        key: 'length',
        type: 'number',
        label: 'Lookback Period',
        default: 20,
        min: 2,
        max: 5000,
        step: 1,
        tooltip: 'Period for mean and standard deviation. Must be at least 2 for stdev.',
      },
    ],

    plots: [
      { key: 'zscore', type: 'line', title: 'Z-score', style: { color: '#ffeb3b', lineWidth: 2 } },
    ],

    levels: () => [{ price: 0, title: 'Zero Line', color: '#787b86', dashed: true }],

    calc(bars, settings) {
      // A cleared number field arrives as '', and Number('') is 0.
      const len = Math.max(2, Math.floor(Number(settings.length) || 20))
      const src = sourceValues(bars, settings.source ?? 'close')
      const n = bars.length
      const out = new Array(n).fill(NaN)

      // Rolling sums over a window of at most len entries, exactly as the Pine
      // version maintains S1, S2 and N alongside its two parallel arrays.
      let s1 = 0
      let s2 = 0
      let count = 0
      const windowVals = []
      const windowIsNa = []

      for (let i = 0; i < n; i++) {
        const x = src[i]
        const xIsNa = !Number.isFinite(x)

        if (windowVals.length === len) {
          const oldVal = windowVals.shift()
          const oldWasNa = windowIsNa.shift()
          if (!oldWasNa) {
            s1 -= oldVal
            s2 -= oldVal * oldVal
            count -= 1
          }
        }

        windowVals.push(xIsNa ? 0 : x)
        windowIsNa.push(xIsNa)
        if (!xIsNa) {
          s1 += x
          s2 += x * x
          count += 1
        }

        // Fewer than two real observations leaves the sample stdev undefined.
        if (count < 2) continue

        const mean = s1 / count
        let variancePop = s2 / count - mean * mean
        if (!(variancePop >= 1e-10)) variancePop = 0
        const varianceSample = (variancePop * count) / (count - 1)
        const stdev = Math.sqrt(varianceSample)

        if (xIsNa) continue
        if (stdev > 1e-10) {
          const z = (x - mean) / stdev
          if (Number.isFinite(z)) out[i] = z
        } else if (Math.abs(x - mean) < 1e-10) {
          // A dead-flat window: the value sits exactly on its own mean.
          out[i] = 0
        }
      }

      return { zscore: nulls(out) }
    },
  })
}
