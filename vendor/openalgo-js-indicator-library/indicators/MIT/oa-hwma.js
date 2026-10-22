/**
 * Holt-Winters Moving Average (HWMA) - ported to openalgo-charts from Pine Script v6.
 *
 * Source: https://github.com/mihakralj/pinescript/blob/c4e91b962be09733d8fc76caa5191e9e586c5cee/indicators/trends_IIR/hwma.pine
 * Repo:   mihakralj/pinescript
 * License: MIT (c) mihakralj
 * SPDX-FileCopyrightText: (c) mihakralj
 * SPDX-FileCopyrightText: (c) 2026 marketcalls (port to openalgo-charts)
 * SPDX-License-Identifier: MIT
 *
 * Triple exponential smoothing that carries a level, a velocity and an
 * acceleration, so the line keeps moving through a turn instead of flattening
 * the way a single smoothed average does.
 */

export default function ({ registerIndicator, sourceValues, nulls }) {
  registerIndicator({
    id: 'oa-hwma',
    name: 'Holt-Winters Moving Average (HWMA)',
    category: 'Trends IIR',
    placement: 'onchart',

    inputs: [
      { key: 'period', type: 'number', label: 'Period', default: 10, min: 1, max: 5000, step: 1 },
      { key: 'source', type: 'source', label: 'Source', default: 'close' },
    ],

    plots: [{ key: 'hwma', type: 'line', title: 'HWMA', style: { color: '#ffeb3b', lineWidth: 2 } }],

    calc(bars, settings) {
      // A cleared number field arrives as '', and Number('') is 0.
      const period = Math.max(1, Math.floor(Number(settings.period) || 10))
      const src = sourceValues(bars, settings.source ?? 'close')

      // Pine derives all three factors from the period when one is supplied.
      const a = 2 / (period + 1)
      const b = 1 / period
      const g = 1 / period

      const out = new Array(bars.length).fill(NaN)

      // var state carried across bars: level, velocity, acceleration.
      let F = NaN
      let V = 0
      let A = 0

      for (let i = 0; i < bars.length; i++) {
        const value = src[i]

        if (!Number.isFinite(value)) {
          // A gap in the source coasts the state forward and decays the
          // acceleration, exactly as the source does.
          if (!Number.isFinite(F)) continue
          const prevF = F
          const prevV = V
          const prevA = A
          F = prevF + prevV + 0.5 * prevA
          V = prevV + prevA
          A = 0.9 * prevA
          out[i] = F
          continue
        }

        if (!Number.isFinite(F)) {
          // The first usable bar seeds the level and returns it unadjusted.
          F = value
          out[i] = F
          continue
        }

        const prevF = F
        const prevV = V
        const prevA = A
        F = a * value + (1 - a) * (prevF + prevV + 0.5 * prevA)
        V = b * (F - prevF) + (1 - b) * (prevV + prevA)
        A = g * (V - prevV) + (1 - g) * prevA
        out[i] = F + V + 0.5 * A
      }

      return { hwma: nulls(out) }
    },
  })
}
