/**
 * Center of Gravity (CG) - ported to openalgo-charts from Pine Script v6.
 *
 * Source: https://github.com/mihakralj/pinescript/blob/c4e91b962be09733d8fc76caa5191e9e586c5cee/indicators/cycles/cg.pine
 * Repo:   mihakralj/pinescript
 * License: MIT (c) mihakralj
 * SPDX-FileCopyrightText: (c) mihakralj
 * SPDX-FileCopyrightText: (c) 2026 marketcalls (port to openalgo-charts)
 * SPDX-License-Identifier: MIT
 *
 * Ehlers' centre of gravity: where the weighted balance point of the last N
 * prices sits relative to the middle of the window, which turns at cycle highs
 * and lows with almost no lag.
 */

export default function ({ registerIndicator, sourceValues, nulls }) {
  registerIndicator({
    id: 'oa-cg',
    name: 'Center of Gravity (CG)',
    category: 'Cycles',
    placement: 'pane',

    inputs: [
      {
        key: 'length',
        type: 'number',
        label: 'Length',
        default: 10,
        min: 1,
        max: 2000,
        step: 1,
        tooltip: 'Period for Center of Gravity calculation',
      },
      { key: 'source', type: 'source', label: 'Source', default: 'close' },
    ],

    plots: [{ key: 'cg', type: 'line', title: 'CG', style: { color: '#ffeb3b', lineWidth: 2 } }],

    levels: () => [{ price: 0, title: 'Zero Line', color: '#9598a1', dashed: true }],

    calc(bars, settings) {
      // A cleared number field arrives as '', and Number('') is 0.
      const length = Math.max(1, Math.floor(Number(settings.length) || 10))
      const src = sourceValues(bars, settings.source ?? 'close')

      const centre = (length + 1) / 2
      const out = new Array(bars.length).fill(NaN)

      // Pine wraps each lookback in nz(), so bars before the chart starts count
      // as zero and the series emits from bar 0 rather than warming up.
      for (let i = 0; i < bars.length; i++) {
        let num = 0
        let den = 0
        for (let count = 1; count <= length; count++) {
          const j = i - (count - 1)
          const price = j >= 0 && Number.isFinite(src[j]) ? src[j] : 0
          num += count * price
          den += price
        }
        const result = den !== 0 ? num / den : centre
        const value = result - centre
        if (Number.isFinite(value)) out[i] = value
      }

      return { cg: nulls(out) }
    },
  })
}
