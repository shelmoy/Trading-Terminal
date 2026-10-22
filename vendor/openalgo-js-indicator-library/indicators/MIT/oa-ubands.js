/**
 * Ehlers Ultimate Bands (UBANDS) - ported to openalgo-charts from Pine Script v6.
 *
 * Source: https://github.com/mihakralj/pinescript/blob/c4e91b962be09733d8fc76caa5191e9e586c5cee/indicators/channels/ubands.pine
 * Repo:   mihakralj/pinescript
 * License: MIT (c) mihakralj
 * SPDX-FileCopyrightText: (c) mihakralj
 * SPDX-FileCopyrightText: (c) 2026 marketcalls (port to openalgo-charts)
 * SPDX-License-Identifier: MIT
 *
 * Ehlers' Ultrasmooth Filter gives the centre line, and the band width is a
 * multiple of the root mean square of the filter residuals, so the channel
 * reacts to how badly the smoother is tracking price rather than to variance.
 */

export default function ({ registerIndicator, sourceValues, nulls }) {
  registerIndicator({
    id: 'oa-ubands',
    name: 'Ehlers Ultimate Bands (UBANDS)',
    category: 'Channels',
    placement: 'onchart',

    inputs: [
      { key: 'source', type: 'source', label: 'Source', default: 'close' },
      { key: 'length', type: 'number', label: 'Length', default: 20, min: 1, max: 5000, step: 1, tooltip: 'Lookback period for smoothing and RMS calculation.' },
      { key: 'mult', type: 'number', label: 'RMS Multiplier', default: 1, min: 0.01, max: 100, step: 0.1, tooltip: 'Band width as multiple of RMS value.' },
    ],

    plots: [
      { key: 'middle', type: 'line', title: 'Middle Band', style: { color: '#ffeb3b', lineWidth: 2 } },
      { key: 'upper', type: 'line', title: 'Upper Band', style: { color: '#ffeb3b', lineWidth: 2 } },
      { key: 'lower', type: 'line', title: 'Lower Band', style: { color: '#ffeb3b', lineWidth: 2 } },
    ],

    fills: [{ between: ['upper', 'lower'], colorUp: '#2962ff', colorDown: '#2962ff', opacity: 0.1 }],

    calc(bars, settings) {
      // A cleared number field arrives as '', and Number('') is 0.
      const length = Math.max(1, Math.floor(Number(settings.length) || 20))
      const mult = Math.max(0.01, Number(settings.mult) || 1)
      const src = sourceValues(bars, settings.source ?? 'close')

      // Ultrasmooth Filter coefficients.
      const arg = (Math.SQRT2 * Math.PI) / Math.max(1, length)
      const expArg = Math.exp(-arg)
      const c2 = 2 * expArg * Math.cos(arg)
      const c3 = -expArg * expArg
      const c1 = (1 + c2 - c3) / 4

      const n = bars.length
      const smooth = new Array(n).fill(NaN)
      const residuals = new Array(n).fill(NaN)

      for (let i = 0; i < n; i++) {
        // Pine: s = nz(src, src[1]), s1 = nz(src[1], s), s2 = nz(src[2], s1).
        const cur = src[i]
        const back1 = i > 0 ? src[i - 1] : NaN
        const back2 = i > 1 ? src[i - 2] : NaN
        const s = Number.isFinite(cur) ? cur : Number.isFinite(back1) ? back1 : NaN
        if (!Number.isFinite(s)) continue
        const s1 = Number.isFinite(back1) ? back1 : s
        const s2 = Number.isFinite(back2) ? back2 : s1

        // The filter needs two settled outputs behind it; before that it
        // passes the source straight through, exactly as the Pine na check does.
        if (i < 2 || !Number.isFinite(smooth[i - 1]) || !Number.isFinite(smooth[i - 2])) {
          smooth[i] = s
        } else {
          smooth[i] = (1 - c1) * s + (2 * c1 - c2) * s1 - (c1 + c3) * s2 + c2 * smooth[i - 1] + c3 * smooth[i - 2]
        }

        if (Number.isFinite(cur)) residuals[i] = cur - smooth[i]
      }

      const upper = new Array(n).fill(NaN)
      const middle = new Array(n).fill(NaN)
      const lower = new Array(n).fill(NaN)

      for (let i = 0; i < n; i++) {
        if (!Number.isFinite(smooth[i])) continue
        let sumSq = 0
        let count = 0
        for (let k = 0; k < length; k++) {
          const idx = i - k
          if (idx < 0) break
          const r = residuals[idx]
          if (!Number.isFinite(r)) continue
          sumSq += r * r
          count += 1
        }
        const rms = count > 0 ? Math.sqrt(sumSq / count) : 0
        middle[i] = smooth[i]
        upper[i] = smooth[i] + mult * rms
        lower[i] = smooth[i] - mult * rms
      }

      return { middle: nulls(middle), upper: nulls(upper), lower: nulls(lower) }
    },
  })
}
