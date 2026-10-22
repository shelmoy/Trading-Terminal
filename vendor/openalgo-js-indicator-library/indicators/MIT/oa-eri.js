/**
 * Elder Ray Index (ERI) - ported to openalgo-charts from Pine Script v6.
 *
 * Source: https://github.com/mihakralj/pinescript/blob/c4e91b962be09733d8fc76caa5191e9e586c5cee/indicators/oscillators/eri.pine
 * Repo:   mihakralj/pinescript
 * License: MIT
 * SPDX-FileCopyrightText: (c) mihakralj
 * SPDX-FileCopyrightText: (c) 2026 marketcalls (port to openalgo-charts)
 * SPDX-License-Identifier: MIT
 *
 * Bull Power is the distance from the bar high to an exponential centerline and
 * Bear Power the distance from the bar low, so the pair shows how far buyers
 * and sellers pushed price away from its average during the bar.
 */

export default function ({ registerIndicator, nulls }) {
  registerIndicator({
    id: 'oa-eri',
    name: 'Elder Ray Index (ERI)',
    category: 'Oscillators',
    placement: 'pane',

    inputs: [{ key: 'period', type: 'number', label: 'Period', default: 13, min: 1, max: 500, step: 1 }],

    plots: [
      { key: 'bull', type: 'line', title: 'Bull Power', style: { color: '#4caf50', lineWidth: 2 } },
      { key: 'bear', type: 'line', title: 'Bear Power', style: { color: '#ff5252', lineWidth: 2 } },
    ],

    levels: () => [{ price: 0, title: 'Zero', color: '#9598a1', dashed: true }],

    calc(bars, settings) {
      // A cleared number field arrives as '', and Number('') is 0.
      const period = Math.min(500, Math.max(1, Math.floor(Number(settings.period) || 13)))

      const alpha = 2 / (period + 1)
      const beta = 1 - alpha

      // Pine var state. The source seeds the recursion with the first close and
      // still applies the zero-seed bias correction 1 / (1 - beta^n), so the
      // earliest bars of the centerline run well above price and both lines
      // start with a large negative excursion. Reproduced as written.
      let emaState = 0
      let e = 1
      let warmup = true
      let first = true

      const bull = new Array(bars.length).fill(NaN)
      const bear = new Array(bars.length).fill(NaN)

      for (let i = 0; i < bars.length; i++) {
        const close = bars[i].close
        const src = Number.isFinite(close) ? close : 0

        if (first) {
          emaState = src
          first = false
        } else {
          emaState = alpha * src + beta * emaState
        }

        let emaVal
        if (warmup) {
          e *= beta
          const correction = e > 1e-10 ? 1 / (1 - e) : 1
          emaVal = emaState * correction
          if (e <= 1e-10) warmup = false
        } else {
          emaVal = emaState
        }

        const high = bars[i].high
        const low = bars[i].low
        if (Number.isFinite(high)) bull[i] = high - emaVal
        if (Number.isFinite(low)) bear[i] = low - emaVal
      }

      return { bull: nulls(bull), bear: nulls(bear) }
    },
  })
}
