/**
 * Entropy (ENTROPY) - ported to openalgo-charts from Pine Script v6.
 *
 * Source: https://github.com/mihakralj/pinescript/blob/c4e91b962be09733d8fc76caa5191e9e586c5cee/indicators/statistics/entropy.pine
 * Repo:   mihakralj/pinescript
 * License: MIT
 * SPDX-FileCopyrightText: (c) mihakralj
 * SPDX-FileCopyrightText: (c) 2026 marketcalls (port to openalgo-charts)
 * SPDX-License-Identifier: MIT
 *
 * Shannon entropy of the lookback window, normalised by the entropy of a flat
 * distribution so the reading sits between 0 and 1. The window's values are
 * dropped into bins and the spread of the bin counts is measured: a window
 * whose values all sit in one bin reads near 0, one that fills every bin
 * evenly reads near 1.
 */

export default function ({ registerIndicator, sourceValues, nulls }) {
  registerIndicator({
    id: 'oa-entropy',
    name: 'Entropy (ENTROPY)',
    category: 'Statistics',
    placement: 'pane',

    inputs: [
      { key: 'source', type: 'source', label: 'Source', default: 'close' },
      { key: 'length', type: 'number', label: 'Length', default: 14, min: 1, max: 1000, step: 1 },
    ],

    plots: [{ key: 'entropy', type: 'line', title: 'Entropy', style: { color: '#ffeb3b', lineWidth: 2 } }],

    calc(bars, settings) {
      // A cleared number field arrives as '', and Number('') is 0.
      const length = Math.max(1, Math.floor(Number(settings.length) || 14))
      const src = sourceValues(bars, settings.source ?? 'close')
      const n = bars.length
      const out = new Array(n).fill(NaN)

      // validMin, validMax, validCount and normalizedEntropy are declared `var`
      // inside the Pine function, so they are initialised once and then carried
      // from bar to bar rather than reset per window. That is reproduced here
      // deliberately: the running extremes become the all time range of the
      // source and validCount accumulates the whole scan, which saturates the
      // bin count at its ceiling of 100 within the first few dozen bars. The
      // reading is therefore the spread of the recent window measured against
      // everything seen so far, which is what the source plots.
      let validMin = NaN
      let validMax = NaN
      let validCount = 0
      let normalizedEntropy = NaN

      for (let b = 0; b < n; b++) {
        for (let i = 0; i < length; i++) {
          const index = b - i
          const value = index >= 0 ? src[index] : NaN
          if (!Number.isFinite(value)) continue
          if (!Number.isFinite(validMin)) {
            validMin = value
            validMax = value
          } else {
            validMin = Math.min(validMin, value)
            validMax = Math.max(validMax, value)
          }
          validCount += 1
        }

        if (validCount < 2) {
          normalizedEntropy = NaN
        } else {
          const valueRange = validMax - validMin
          if (valueRange <= 1e-10) {
            normalizedEntropy = 0
          } else {
            const bins = Math.min(Math.max(validCount, 2), 100)
            const freq = new Array(bins).fill(0)
            let sumOfValidPoints = 0
            for (let i = 0; i < length; i++) {
              const index = b - i
              const value = index >= 0 ? src[index] : NaN
              if (!Number.isFinite(value)) continue
              const normalised = (value - validMin) / valueRange
              const bucket = Math.floor(Math.min(Math.max(normalised, 0), 1 - 1e-10) * bins)
              const safeBucket = Math.max(0, Math.min(bucket, bins - 1))
              freq[safeBucket] += 1
              sumOfValidPoints += 1
            }
            // Pine leaves normalizedEntropy at its carried value when the
            // window holds nothing at all, which is why this branch is guarded
            // rather than defaulted to zero.
            if (sumOfValidPoints > 0) {
              let entropySumComponent = 0
              for (let i = 0; i < bins; i++) {
                const count = freq[i]
                if (count > 0) {
                  const p = count / sumOfValidPoints
                  entropySumComponent += -p * Math.log(p)
                }
              }
              const maxEntropy = Math.log(bins)
              normalizedEntropy = maxEntropy > 1e-10 ? entropySumComponent / maxEntropy : 0
            }
          }
        }

        out[b] = normalizedEntropy
      }

      return { entropy: nulls(out) }
    },
  })
}
