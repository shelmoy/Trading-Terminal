/**
 * Fractal Adaptive Moving Average (FRAMA) - ported to openalgo-charts from Pine Script v6.
 *
 * Source: https://github.com/mihakralj/pinescript/blob/c4e91b962be09733d8fc76caa5191e9e586c5cee/indicators/trends_IIR/frama.pine
 * Repo:   mihakralj/pinescript
 * License: MIT
 * SPDX-FileCopyrightText: (c) mihakralj
 * SPDX-FileCopyrightText: (c) 2026 marketcalls (port to openalgo-charts)
 * SPDX-License-Identifier: MIT
 *
 * An exponential average whose smoothing constant is driven by the fractal
 * dimension of the window, so it tracks a trending market closely and slows
 * down sharply when price turns choppy.
 */

export default function ({ registerIndicator, sourceValues, nulls }) {
  registerIndicator({
    id: 'oa-frama',
    name: 'Fractal Adaptive Moving Average (FRAMA)',
    category: 'Trends IIR',
    placement: 'onchart',

    inputs: [
      { key: 'period', type: 'number', label: 'Period', default: 16, min: 2, max: 1000, step: 1 },
      { key: 'source', type: 'source', label: 'Source', default: 'close' },
    ],

    plots: [
      { key: 'frama', type: 'line', title: 'FRAMA', style: { color: '#ffeb3b', lineWidth: 2 } },
    ],

    calc(bars, settings) {
      // A cleared number field arrives as '', and Number('') is 0.
      const period = Math.max(2, Math.floor(Number(settings.period) || 16))
      const src = sourceValues(bars, settings.source ?? 'close')
      const n = bars.length
      const out = new Array(n).fill(NaN)

      // Pine rounds the window up to the next even length so the two halves match.
      const p = Math.max(2, period)
      const pAdj = p % 2 === 0 ? p : p + 1
      const halfLen = Math.floor(pAdj / 2)
      const LOG2 = Math.log(2)

      // var float result: carried across every bar, including the ones the
      // function reports as na.
      let result = NaN

      for (let i = 0; i < n; i++) {
        const cur = src[i]
        const dataAvailable = i >= pAdj - 1 && Number.isFinite(src[i - (pAdj - 1)])

        let n1 = NaN
        let n2 = NaN
        let n3 = NaN

        if (dataAvailable) {
          // First half: the current bar back to halfLen - 1.
          let hh1 = cur
          let ll1 = cur
          for (let k = 1; k <= halfLen - 1; k++) {
            const val = src[i - k]
            if (Number.isFinite(val)) {
              hh1 = Math.max(hh1, val)
              ll1 = Math.min(ll1, val)
            }
          }

          // Second half: halfLen back to pAdj - 1, abandoned on the first gap.
          let hh2 = src[i - halfLen]
          let ll2 = src[i - halfLen]
          let secondHalfNa = !Number.isFinite(hh2)
          if (!secondHalfNa) {
            for (let k = halfLen + 1; k <= pAdj - 1; k++) {
              const val = src[i - k]
              if (Number.isFinite(val)) {
                hh2 = Math.max(hh2, val)
                ll2 = Math.min(ll2, val)
              } else {
                secondHalfNa = true
                break
              }
            }
          }

          // Whole window.
          let hh3 = cur
          let ll3 = cur
          for (let k = 1; k <= pAdj - 1; k++) {
            const val = src[i - k]
            if (Number.isFinite(val)) {
              hh3 = Math.max(hh3, val)
              ll3 = Math.min(ll3, val)
            }
          }

          if (Number.isFinite(hh1) && Number.isFinite(ll1) && halfLen > 0) n1 = (hh1 - ll1) / halfLen
          if (!secondHalfNa && halfLen > 0) n2 = (hh2 - ll2) / halfLen
          if (Number.isFinite(hh3) && Number.isFinite(ll3) && pAdj > 0) n3 = (hh3 - ll3) / pAdj
        }

        // NaN > 0 is false in JavaScript exactly as na > 0 is false in Pine,
        // so a flat or unavailable window leaves alpha at 1 (no smoothing).
        let alpha = 1
        if (n1 > 0 && n2 > 0 && n3 > 0) {
          const dimen = (Math.log(n1 + n2) - Math.log(n3)) / LOG2
          if (Number.isFinite(dimen)) {
            alpha = Math.exp(-4.6 * (dimen - 1))
            alpha = Math.max(0.01, Math.min(1, alpha))
          }
        }

        if (Number.isFinite(cur)) {
          const prevF = Number.isFinite(result) ? result : cur
          result = alpha * cur + (1 - alpha) * prevF
        } else {
          result = NaN
        }

        if (dataAvailable && Number.isFinite(result)) out[i] = result
      }

      return { frama: nulls(out) }
    },
  })
}
