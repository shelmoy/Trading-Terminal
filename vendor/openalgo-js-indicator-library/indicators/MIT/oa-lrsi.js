/**
 * LRSI: Laguerre RSI - ported to openalgo-charts from Pine Script v6.
 *
 * Source: https://github.com/mihakralj/pinescript/blob/c4e91b962be09733d8fc76caa5191e9e586c5cee/indicators/oscillators/lrsi.pine
 * Repo:   mihakralj/pinescript
 * License: MIT (c) mihakralj
 * SPDX-FileCopyrightText: (c) mihakralj
 * SPDX-FileCopyrightText: (c) 2026 marketcalls (port to openalgo-charts)
 * SPDX-License-Identifier: MIT
 *
 * Four cascaded Laguerre all-pass stages replace the lookback window of an
 * ordinary RSI, so the oscillator reacts within a couple of bars while a single
 * damping factor controls how smooth it is.
 */

export default function ({ registerIndicator, nulls }) {
  registerIndicator({
    id: 'oa-lrsi',
    name: 'LRSI: Laguerre RSI',
    category: 'Oscillators',
    placement: 'pane',

    inputs: [
      {
        key: 'gamma',
        type: 'number',
        label: 'Gamma',
        default: 0.5,
        min: 0,
        max: 1,
        step: 0.01,
        tooltip: 'Damping factor [0,1]. Lower = more responsive; higher = smoother.',
      },
    ],

    plots: [{ key: 'lrsi', type: 'line', title: 'LRSI', style: { color: '#ffeb3b', lineWidth: 2 } }],

    levels() {
      return [
        { price: 0.8, title: 'Overbought', color: '#f23645' },
        { price: 0.5, title: 'Midline', color: '#787b86' },
        { price: 0.2, title: 'Oversold', color: '#089981' },
      ]
    },

    calc(bars, settings) {
      const n = bars.length
      // A cleared number field arrives as '' and Number('') is 0, which is a
      // legal gamma here (minval 0), so clamp rather than fall back.
      const raw = Number(settings.gamma)
      const gamma = Math.min(1, Math.max(0, Number.isFinite(raw) ? raw : 0.5))

      const out = new Array(n).fill(NaN)

      // var state carried across bars, seeded at 0 exactly as the source does.
      let l0 = 0
      let l1 = 0
      let l2 = 0
      let l3 = 0

      for (let i = 0; i < n; i++) {
        const close = Number.isFinite(bars[i].close) ? bars[i].close : 0
        const prevL0 = l0
        const prevL1 = l1
        const prevL2 = l2

        l0 = (1 - gamma) * close + gamma * prevL0
        l1 = -gamma * l0 + prevL0 + gamma * prevL1
        l2 = -gamma * l1 + prevL1 + gamma * prevL2
        l3 = -gamma * l2 + prevL2 + gamma * l3

        const cu =
          (l0 > l1 ? l0 - l1 : 0) + (l1 > l2 ? l1 - l2 : 0) + (l2 > l3 ? l2 - l3 : 0)
        const cd =
          (l0 < l1 ? l1 - l0 : 0) + (l1 < l2 ? l2 - l1 : 0) + (l2 < l3 ? l3 - l2 : 0)

        // cu + cd is zero only when every stage agrees, which is a flat market.
        const total = cu + cd
        out[i] = total !== 0 && Number.isFinite(total) ? cu / total : 0.5
      }

      return { lrsi: nulls(out) }
    },
  })
}
