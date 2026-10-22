/**
 * Fisher Transform - ported to openalgo-charts from Pine Script v6.
 *
 * Source: https://github.com/mihakralj/pinescript/blob/c4e91b962be09733d8fc76caa5191e9e586c5cee/indicators/oscillators/fisher.pine
 * Repo:   mihakralj/pinescript
 * License: MIT (c) mihakralj
 * SPDX-FileCopyrightText: (c) mihakralj
 * SPDX-FileCopyrightText: (c) 2026 marketcalls (port to openalgo-charts)
 * SPDX-License-Identifier: MIT
 *
 * Normalises price into a bounded range, smooths it, then applies the inverse
 * hyperbolic tangent so that ordinary swings turn into sharp, near-Gaussian
 * turning points.
 */

export default function ({ registerIndicator, sourceValues, highest, lowest, nulls }) {
  registerIndicator({
    id: 'oa-fisher',
    name: 'Fisher Transform',
    category: 'Oscillators',
    placement: 'pane',

    inputs: [
      { key: 'period', type: 'number', label: 'Period', default: 10, min: 1, max: 500, step: 1 },
      { key: 'source', type: 'source', label: 'Source', default: 'hl2' },
    ],

    plots: [
      { key: 'fisher', type: 'line', title: 'Fisher', style: { color: '#ffeb3b', lineWidth: 2 } },
      { key: 'signal', type: 'line', title: 'Signal', style: { color: '#ff9800', lineWidth: 1 } },
    ],

    levels: () => [
      { price: 2, title: 'Overbought', color: '#ff5252', dashed: true },
      { price: 0, title: 'Zero', color: '#787b86', dashed: true },
      { price: -2, title: 'Oversold', color: '#4caf50', dashed: true },
    ],

    calc(bars, settings) {
      // A cleared number field arrives as '', and Number('') is 0.
      const period = Math.min(500, Math.max(1, Math.floor(Number(settings.period) || 10)))
      const src = sourceValues(bars, settings.source ?? 'hl2')

      const hh = highest(src, period)
      const ll = lowest(src, period)

      const alpha = 0.33
      // var floats, all seeded at 0 and carried forward across bars.
      let value = 0
      let fisherState = 0
      let signalState = 0

      const fisherOut = new Array(bars.length).fill(NaN)
      const signalOut = new Array(bars.length).fill(NaN)

      for (let i = 0; i < bars.length; i++) {
        const h = hh[i]
        const l = ll[i]
        const s = src[i]

        // Pine: price_range > 0 is false while the window is still filling,
        // so normalized falls back to 0.5 and the recursion still advances.
        let normalized = 0.5
        if (Number.isFinite(h) && Number.isFinite(l) && Number.isFinite(s)) {
          const priceRange = h - l
          if (priceRange > 0) normalized = (s - l) / priceRange
        }
        normalized = 2 * normalized - 1

        value = alpha * normalized + (1 - alpha) * value
        value = Math.max(-0.999, Math.min(0.999, value))

        fisherState = 0.5 * Math.log((1 + value) / (1 - value))
        signalState = alpha * fisherState + (1 - alpha) * signalState

        fisherOut[i] = fisherState
        signalOut[i] = signalState
      }

      return { fisher: nulls(fisherOut), signal: nulls(signalOut) }
    },
  })
}
