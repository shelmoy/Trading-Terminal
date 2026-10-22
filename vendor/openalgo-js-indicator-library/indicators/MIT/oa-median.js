/**
 * Median - ported to openalgo-charts from Pine Script v6.
 *
 * Source: https://github.com/mihakralj/pinescript/blob/c4e91b962be09733d8fc76caa5191e9e586c5cee/indicators/statistics/median.pine
 * Repo:   mihakralj/pinescript
 * License: MIT (c) mihakralj
 * SPDX-FileCopyrightText: (c) mihakralj
 * SPDX-FileCopyrightText: (c) 2026 marketcalls (port to openalgo-charts)
 * SPDX-License-Identifier: MIT
 *
 * The middle value of the lookback window, which unlike a mean is unmoved by a
 * single outlier bar.
 */

export default function ({ registerIndicator, sourceValues, nulls }) {
  registerIndicator({
    id: 'oa-median',
    name: 'Median',
    category: 'Statistics',
    placement: 'pane',

    inputs: [
      { key: 'source', type: 'source', label: 'Source', default: 'close' },
      { key: 'length', type: 'number', label: 'Period', default: 14, min: 1, max: 5000, step: 1 },
    ],

    plots: [{ key: 'median', type: 'line', title: 'Median', style: { color: '#ff9800', lineWidth: 2 } }],

    calc(bars, settings) {
      // A cleared number field arrives as '', and Number('') is 0.
      const length = Math.max(1, Math.floor(Number(settings.length) || 14))
      const src = sourceValues(bars, settings.source ?? 'close')

      const out = new Array(bars.length).fill(NaN)
      const window = []

      for (let i = 0; i < bars.length; i++) {
        // The source collects src[0 .. len-1] and skips every na, so a window
        // that reaches past the first bar simply holds fewer values and still
        // produces a median.
        window.length = 0
        const from = Math.max(0, i - length + 1)
        for (let j = i; j >= from; j--) {
          const val = src[j]
          if (Number.isFinite(val)) window.push(val)
        }
        const n = window.length
        if (n === 0) continue
        window.sort((a, b) => a - b)
        const mid = Math.floor(n / 2)
        out[i] = n % 2 === 1 ? window[mid] : (window[mid - 1] + window[mid]) / 2.0
      }

      return { median: nulls(out) }
    },
  })
}
