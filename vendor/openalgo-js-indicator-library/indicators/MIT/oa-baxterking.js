/**
 * Baxter-King Band-Pass Filter (BAXTERKING) - ported to openalgo-charts from Pine Script v6.
 *
 * Source: https://github.com/mihakralj/pinescript/blob/c4e91b962be09733d8fc76caa5191e9e586c5cee/indicators/filters/baxterking.pine
 * Repo:   mihakralj/pinescript
 * License: MIT (c) mihakralj
 * SPDX-FileCopyrightText: (c) mihakralj
 * SPDX-FileCopyrightText: (c) 2026 marketcalls (port to openalgo-charts)
 * SPDX-License-Identifier: MIT
 *
 * A symmetric band-pass filter that keeps only the cycles whose period falls
 * between the two cutoffs. Its weights are normalised to sum to zero, so the
 * trend is removed and the output oscillates around zero, lagging the move it
 * describes by K bars because the window is centred.
 */

export default function ({ registerIndicator, nulls }) {
  registerIndicator({
    id: 'oa-baxterking',
    name: 'Baxter-King Band-Pass Filter (BAXTERKING)',
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
        tooltip: 'Shortest cycle to pass through (bars).',
      },
      {
        key: 'pHigh',
        type: 'number',
        label: 'Max Period (pHigh)',
        default: 32,
        min: 3,
        max: 5000,
        step: 1,
        tooltip: 'Longest cycle to pass through (bars).',
      },
      {
        key: 'k',
        type: 'number',
        label: 'Filter Half-Length (K)',
        default: 12,
        min: 1,
        max: 100,
        step: 1,
        tooltip:
          'Number of leads and lags. Larger is a better approximation but loses 2K bars. Baxter and King recommend 12 for quarterly data, 36 for monthly.',
      },
    ],

    plots: [
      { key: 'cycle', type: 'line', title: 'BK Cycle', style: { color: '#2962ff', lineWidth: 2 } },
    ],

    levels: () => [{ price: 0, title: 'Zero', color: '#808080', dashed: true }],

    calc(bars, settings) {
      // A cleared number field arrives as '', and Number('') is 0.
      const pLow = Math.max(2, Math.floor(Number(settings.pLow) || 6))
      // Pine raises a runtime error when pHigh <= pLow; here the pair is kept
      // ordered instead, because an indicator cannot stop the chart.
      const pHigh = Math.max(pLow + 1, Math.floor(Number(settings.pHigh) || 32))
      const k = Math.max(1, Math.floor(Number(settings.k) || 12))

      const n = bars.length
      const out = new Array(n).fill(NaN)

      // Angular frequencies of the passband edges.
      const a = (2 * Math.PI) / pHigh
      const b = (2 * Math.PI) / pLow

      // Ideal band-pass weights: B0 = (b - a) / pi, Bj = (sin(jb) - sin(ja)) / (pi j).
      const ideal = new Array(k + 1)
      ideal[0] = (b - a) / Math.PI
      let sumBj = 0
      for (let j = 1; j <= k; j++) {
        ideal[j] = (Math.sin(j * b) - Math.sin(j * a)) / (Math.PI * j)
        sumBj += ideal[j]
      }
      // Baxter-King normalisation: the 2K+1 weights are made to sum to zero, so
      // the filter also removes any linear trend.
      const theta = (ideal[0] + 2 * sumBj) / (2 * k + 1)
      const weight = new Array(k + 1)
      for (let j = 0; j <= k; j++) weight[j] = ideal[j] - theta

      const src = new Array(n)
      for (let i = 0; i < n; i++) src[i] = bars[i].close

      for (let i = 0; i < n; i++) {
        // Pine reads a missing bar through nz(), which makes the first 2K bars a
        // partial sum of a zero-sum filter: that is a price-level artifact many
        // times the size of the cycle, so those bars stay null here instead.
        if (i < 2 * k) continue
        const centre = i - k
        const mid = src[centre]
        let acc = weight[0] * (Number.isFinite(mid) ? mid : 0)
        for (let j = 1; j <= k; j++) {
          const lead = src[centre + j]
          const lag = src[centre - j]
          acc += weight[j] * ((Number.isFinite(lead) ? lead : 0) + (Number.isFinite(lag) ? lag : 0))
        }
        if (Number.isFinite(acc)) out[i] = acc
      }

      return { cycle: nulls(out) }
    },
  })
}
