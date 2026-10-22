/**
 * Variable Index Dynamic Average (VIDYA) - ported to openalgo-charts from Pine Script v6.
 *
 * Source: https://github.com/mihakralj/pinescript/blob/c4e91b962be09733d8fc76caa5191e9e586c5cee/indicators/trends_IIR/vidya.pine
 * Repo:   mihakralj/pinescript
 * License: MIT
 * SPDX-FileCopyrightText: (c) mihakralj
 * SPDX-FileCopyrightText: (c) 2026 marketcalls (port to openalgo-charts)
 * SPDX-License-Identifier: MIT
 *
 * An exponential average whose smoothing constant is scaled by a volatility
 * index: the 5-bar standard deviation divided by the longer-window one, so the
 * line speeds up when short-term dispersion expands.
 */

export default function ({ registerIndicator, sourceValues, nulls }) {
  registerIndicator({
    id: 'oa-vidya',
    name: 'Variable Index Dynamic Average (VIDYA)',
    category: 'Trends IIR',
    placement: 'onchart',

    inputs: [
      { key: 'period', type: 'number', label: 'Period', default: 10, min: 1, max: 5000, step: 1 },
      {
        key: 'stdPeriod',
        type: 'number',
        label: 'Std Dev Period (0=use Period)',
        default: 0,
        min: 0,
        max: 5000,
        step: 1,
        tooltip: 'Window for the slower standard deviation. Zero falls back to Period.',
      },
      { key: 'source', type: 'source', label: 'Source', default: 'close' },
    ],

    plots: [{ key: 'vidya', type: 'line', title: 'VIDYA', style: { color: '#ffeb3b', lineWidth: 2 } }],

    calc(bars, settings) {
      // A cleared number field arrives as '', and Number('') is 0.
      const period = Math.max(1, Math.floor(Number(settings.period) || 10))
      const stdPeriodInput = Math.max(0, Math.floor(Number(settings.stdPeriod) || 0))
      const src = sourceValues(bars, settings.source || 'close')

      const alpha = 2.0 / (period + 1.0)
      const p = stdPeriodInput > 0 ? stdPeriodInput : period
      const lookback = Math.max(p, 5)

      const out = new Array(bars.length).fill(NaN)
      let vidya = NaN

      for (let i = 0; i < bars.length; i++) {
        const value = src[i]
        if (Number.isFinite(value)) {
          let sumP = 0
          let sumSqP = 0
          let countP = 0
          let sum5 = 0
          let sumSq5 = 0
          let count5 = 0

          for (let k = 0; k < lookback; k++) {
            const idx = i - k
            if (idx < 0) continue // source[k] is na before the first bar
            const val = src[idx]
            if (!Number.isFinite(val)) continue
            if (k < p) {
              sumP += val
              sumSqP += val * val
              countP += 1
            }
            if (k < 5) {
              sum5 += val
              sumSq5 += val * val
              count5 += 1
            }
          }

          // Population standard deviation, exactly as the Pine source computes it.
          let std = 0
          if (countP > 0) {
            const meanP = sumP / countP
            std = Math.sqrt(Math.max(sumSqP / countP - meanP * meanP, 0.0))
          }
          let std5 = 0
          if (count5 > 0) {
            const mean5 = sum5 / count5
            std5 = Math.sqrt(Math.max(sumSq5 / count5 - mean5 * mean5, 0.0))
          }

          let volIdx = std > 0 ? std5 / std : 1.0
          if (!Number.isFinite(volIdx)) volIdx = 1.0
          volIdx = Math.min(Math.max(volIdx, 0.0), 1.0)

          const sc = alpha * volIdx
          vidya = Number.isFinite(vidya) ? value * sc + vidya * (1.0 - sc) : value
        }
        // A na source leaves the recursive value untouched, as in Pine.
        out[i] = vidya
      }

      return { vidya: nulls(out) }
    },
  })
}
