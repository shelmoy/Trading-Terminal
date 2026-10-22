/**
 * Absolute Price Oscillator (APO) - ported to openalgo-charts from Pine Script v6.
 *
 * Source: https://github.com/mihakralj/pinescript/blob/c4e91b962be09733d8fc76caa5191e9e586c5cee/indicators/oscillators/apo.pine
 * Repo:   mihakralj/pinescript
 * License: MIT (c) mihakralj
 * SPDX-FileCopyrightText: (c) mihakralj
 * SPDX-FileCopyrightText: (c) 2026 marketcalls (port to openalgo-charts)
 * SPDX-License-Identifier: MIT
 *
 * The gap between a fast and a slow exponential average, in price units, with
 * a bias correction applied while the slow average is still filling so the
 * early bars are not dragged toward the seed value.
 */

export default function ({ registerIndicator, sourceValues, nulls }) {
  registerIndicator({
    id: 'oa-apo',
    name: 'Absolute Price Oscillator (APO)',
    category: 'Oscillators',
    placement: 'pane',

    inputs: [
      { key: 'source', type: 'source', label: 'Source', default: 'close' },
      { key: 'fastLength', type: 'number', label: 'Fast Length', default: 12, min: 1, max: 5000, step: 1 },
      { key: 'slowLength', type: 'number', label: 'Slow Length', default: 26, min: 1, max: 5000, step: 1 },
    ],

    plots: [{ key: 'apo', type: 'line', title: 'APO', style: { color: '#ffeb3b', lineWidth: 2 } }],

    calc(bars, settings) {
      // A cleared number field arrives as '', and Number('') is 0.
      const fastLength = Math.max(1, Math.floor(Number(settings.fastLength) || 12))
      const slowLength = Math.max(1, Math.floor(Number(settings.slowLength) || 26))
      const src = sourceValues(bars, settings.source ?? 'close')

      const alphaFast = 2 / (fastLength + 1)
      const alphaSlow = 2 / (slowLength + 1)

      const out = new Array(bars.length).fill(NaN)
      let emaFast = NaN
      let emaSlow = NaN
      let e = 1
      let warmup = true
      // result is a var in Pine: it holds its last value across an na bar.
      let result = NaN

      for (let i = 0; i < bars.length; i++) {
        const value = src[i]
        if (Number.isFinite(value)) {
          if (!Number.isFinite(emaFast)) {
            emaFast = value
            emaSlow = value
            result = 0
          } else {
            emaFast = alphaFast * (value - emaFast) + emaFast
            emaSlow = alphaSlow * (value - emaSlow) + emaSlow
            if (warmup) {
              // Compensate both averages by the same slow-decay factor until
              // the seed bias has decayed away.
              e *= 1 - alphaSlow
              const c = e > 1e-10 ? 1 / (1 - e) : 1
              result = emaFast * c - emaSlow * c
              if (e <= 1e-10) warmup = false
            } else {
              result = emaFast - emaSlow
            }
          }
        }
        out[i] = result
      }

      return { apo: nulls(out) }
    },
  })
}
