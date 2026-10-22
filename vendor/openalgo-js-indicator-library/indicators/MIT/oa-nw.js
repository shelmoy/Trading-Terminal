/**
 * NW - Nadaraya-Watson Kernel Regression - ported to openalgo-charts from Pine Script v6.
 *
 * Source: https://github.com/mihakralj/pinescript/blob/c4e91b962be09733d8fc76caa5191e9e586c5cee/indicators/filters/nw.pine
 * Repo:   mihakralj/pinescript
 * License: MIT
 * SPDX-FileCopyrightText: (c) mihakralj
 * SPDX-FileCopyrightText: (c) 2026 marketcalls (port to openalgo-charts)
 * SPDX-License-Identifier: MIT
 *
 * A backward-looking Nadaraya-Watson estimator: each bar is the Gaussian
 * kernel weighted average of the last `period` values, with the bandwidth h
 * setting how fast the weight of older bars decays.
 */

export default function ({ registerIndicator, sourceValues, nulls }) {
  registerIndicator({
    id: 'oa-nw',
    name: 'NW - Nadaraya-Watson Kernel Regression',
    category: 'Filters',
    placement: 'onchart',

    inputs: [
      { key: 'period', type: 'number', label: 'Period', default: 64, min: 1, max: 5000, step: 1 },
      {
        key: 'bandwidth',
        type: 'number',
        label: 'Bandwidth (h)',
        default: 8,
        min: 0.1,
        max: 1000,
        step: 0.5,
        tooltip: 'Gaussian kernel width. Small h tracks price closely, large h smooths heavily.',
      },
      { key: 'source', type: 'source', label: 'Source', default: 'close' },
    ],

    plots: [{ key: 'nw', type: 'line', title: 'NW', style: { color: '#ffeb3b', lineWidth: 2 } }],

    calc(bars, settings) {
      // A cleared number field arrives as '', and Number('') is 0.
      const period = Math.max(1, Math.floor(Number(settings.period) || 64))
      const bandwidth = Math.max(0.1, Number(settings.bandwidth) || 8)
      const src = sourceValues(bars, settings.source ?? 'close')

      // K(u) = exp(-u^2 / 2) with u = i / h, so the weight of a bar i back
      // depends only on i and can be precomputed once for the whole window.
      const h2x2 = 2 * bandwidth * bandwidth
      const weights = new Array(period)
      for (let i = 0; i < period; i++) weights[i] = Math.exp(-(i * i) / h2x2)

      const out = new Array(bars.length).fill(NaN)
      for (let t = 0; t < bars.length; t++) {
        // Pine uses bars = min(bar_index + 1, period), so the window grows
        // with the data and the filter emits from the very first bar.
        const count = Math.min(t + 1, period)
        let num = 0
        let den = 0
        for (let i = 0; i < count; i++) {
          const w = weights[i]
          // Pine reads nz(source[i]): a missing value counts as 0 in the
          // numerator while still carrying its full weight in the denominator.
          const raw = src[t - i]
          const val = Number.isFinite(raw) ? raw : 0
          num += w * val
          den += w
        }
        const here = Number.isFinite(src[t]) ? src[t] : 0
        out[t] = den > 0 ? num / den : here
      }

      return { nw: nulls(out) }
    },
  })
}
