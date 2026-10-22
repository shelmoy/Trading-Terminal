/**
 * Percentage Change (CHANGE) - ported to openalgo-charts from Pine Script v6.
 *
 * Source: https://github.com/mihakralj/pinescript/blob/c4e91b962be09733d8fc76caa5191e9e586c5cee/indicators/numerics/change.pine
 * Repo:   mihakralj/pinescript
 * License: MIT
 * SPDX-FileCopyrightText: (c) mihakralj
 * SPDX-FileCopyrightText: (c) 2026 marketcalls (port to openalgo-charts)
 * SPDX-License-Identifier: MIT
 *
 * Ratio of the source to its own value a fixed number of bars back, minus one,
 * so an unchanged series reads zero and a doubling reads one.
 */

export default function ({ registerIndicator, sourceValues, nulls }) {
  registerIndicator({
    id: 'oa-change',
    name: 'Percentage Change (CHANGE)',
    category: 'Numerics',
    placement: 'pane',

    inputs: [
      { key: 'source', type: 'source', label: 'Source', default: 'close' },
      { key: 'length', type: 'number', label: 'Length', default: 1, min: 1, max: 5000, step: 1 },
    ],

    plots: [
      { key: 'change', type: 'line', title: 'Change %', style: { color: '#ffeb3b', lineWidth: 2 } },
    ],

    calc(bars, settings) {
      // A cleared number field arrives as '', and Number('') is 0.
      const length = Math.max(1, Math.floor(Number(settings.length) || 1))
      const src = sourceValues(bars, settings.source ?? 'close')

      const out = new Array(bars.length).fill(NaN)
      for (let i = length; i < bars.length; i++) {
        const oldValue = src[i - length]
        const current = src[i]
        // Pine returns na when the historical value is na or zero.
        if (!Number.isFinite(oldValue) || oldValue === 0) continue
        if (!Number.isFinite(current)) continue
        out[i] = current / oldValue - 1
      }

      return { change: nulls(out) }
    },
  })
}
