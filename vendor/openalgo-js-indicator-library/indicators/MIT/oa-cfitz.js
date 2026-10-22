/**
 * Christiano-Fitzgerald Band-Pass Filter (CFITZ) - ported to openalgo-charts from Pine Script v6.
 *
 * Source: https://github.com/mihakralj/pinescript/blob/c4e91b962be09733d8fc76caa5191e9e586c5cee/indicators/filters/cfitz.pine
 * Repo:   mihakralj/pinescript
 * License: MIT
 * SPDX-FileCopyrightText: (c) mihakralj
 * SPDX-FileCopyrightText: (c) 2026 marketcalls (port to openalgo-charts)
 * SPDX-License-Identifier: MIT
 *
 * An asymmetric band-pass filter that is optimal under a random-walk
 * assumption. It uses every available bar and applies an endpoint correction
 * that forces the weight sum to zero, so the output is a detrended cyclical
 * component oscillating around zero.
 */

export default function ({ registerIndicator, nulls }) {
  registerIndicator({
    id: 'oa-cfitz',
    name: 'Christiano-Fitzgerald Band-Pass Filter (CFITZ)',
    category: 'Filters',
    placement: 'pane',

    inputs: [
      {
        key: 'pLow',
        type: 'number',
        label: 'Min Period (pLow)',
        default: 6,
        min: 2,
        max: 5000,
        step: 1,
        tooltip: 'Shortest cycle to pass through (bars)',
      },
      {
        key: 'pHigh',
        type: 'number',
        label: 'Max Period (pHigh)',
        default: 32,
        min: 3,
        max: 5000,
        step: 1,
        tooltip: 'Longest cycle to pass through (bars)',
      },
      {
        key: 'maxLookback',
        type: 'number',
        label: 'Max Lookback',
        default: 500,
        min: 10,
        max: 5000,
        step: 1,
        tooltip:
          'Maximum bars of history to use. Larger = better frequency resolution but slower. Zero-sum property is always maintained.',
      },
    ],

    plots: [{ key: 'cycle', type: 'line', title: 'CF Cycle', style: { color: '#00897b', lineWidth: 2 } }],

    levels: () => [{ price: 0, title: 'Zero', color: '#787b86', dashed: true }],

    calc(bars, settings) {
      // A cleared number field arrives as '', and Number('') is 0.
      // Pine raises on pLow < 2 or pHigh <= pLow; here the same conditions are
      // clamped so the study keeps drawing instead of stopping the chart.
      const pLow = Math.max(2, Math.floor(Number(settings.pLow) || 6))
      const pHighRaw = Math.max(3, Math.floor(Number(settings.pHigh) || 32))
      const pHigh = Math.max(pLow + 1, pHighRaw)
      const maxLookback = Math.max(10, Math.min(5000, Math.floor(Number(settings.maxLookback) || 500)))

      const n = bars.length
      const cycle = new Array(n).fill(NaN)
      if (n === 0) return { cycle: nulls(cycle) }

      const src = bars.map((b) => b.close)
      const nz = (x) => (Number.isFinite(x) ? x : 0)

      // Angular frequencies for the passband edges.
      const wl = (2 * Math.PI) / pHigh
      const wh = (2 * Math.PI) / pLow
      const b0 = (wh - wl) / Math.PI

      // Ideal band-pass weights B_j, plus their running sum, both of which
      // depend only on j. maxJ mirrors Pine's `loopBound = maxLookback - 1`.
      const maxJ = maxLookback - 1
      const bj = new Array(maxJ + 1).fill(0)
      const bjPrefix = new Array(maxJ + 1).fill(0)
      for (let j = 1; j <= maxJ; j++) {
        bj[j] = (Math.sin(j * wh) - Math.sin(j * wl)) / (Math.PI * j)
        bjPrefix[j] = bjPrefix[j - 1] + bj[j]
      }

      for (let i = 0; i < n; i++) {
        if (i < 1) {
          // Only one bar: no filtering possible, Pine outputs a real zero here.
          cycle[i] = 0
          continue
        }
        if (i < 2) {
          // Two bars: btilde = -0.5*B_0, so c = 0.5*B_0*(y_T - y_1).
          cycle[i] = 0.5 * b0 * (nz(src[i]) - nz(src[i - 1]))
          continue
        }

        let weightedSum = 0.5 * b0 * nz(src[i])
        const jMax = Math.min(maxJ, i - 1)
        for (let j = 1; j <= jMax; j++) weightedSum += bj[j] * nz(src[i - j])
        const sumBj = bjPrefix[jMax]

        // Endpoint correction: force the total weight to zero.
        const btilde = -0.5 * b0 - sumBj
        const depth = Math.min(i, maxLookback)
        weightedSum += btilde * nz(src[i - depth])

        cycle[i] = weightedSum
      }

      return { cycle: nulls(cycle) }
    },
  })
}
