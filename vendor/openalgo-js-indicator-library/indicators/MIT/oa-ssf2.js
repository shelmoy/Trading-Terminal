/**
 * Ehlers 2-Pole Super Smoother Filter (SSF2) - ported to openalgo-charts from Pine Script v6.
 *
 * Source: https://github.com/mihakralj/pinescript/blob/c4e91b962be09733d8fc76caa5191e9e586c5cee/indicators/filters/ssf2.pine
 * Repo:   mihakralj/pinescript
 * License: MIT (c) mihakralj
 * SPDX-FileCopyrightText: (c) mihakralj
 * SPDX-FileCopyrightText: (c) 2026 marketcalls (port to openalgo-charts)
 * SPDX-License-Identifier: MIT
 *
 * A two-pole Butterworth-style lowpass filter: it removes the high-frequency
 * wiggle a moving average of the same length would still pass, at far less lag
 * than the average costs.
 */

export default function ({ registerIndicator, sourceValues, nulls }) {
  registerIndicator({
    id: 'oa-ssf2',
    name: 'Ehlers 2-Pole Super Smoother Filter (SSF2)',
    category: 'Filters',
    placement: 'onchart',

    inputs: [
      { key: 'length', type: 'number', label: 'Length', default: 20, min: 1, max: 5000, step: 1 },
      { key: 'source', type: 'source', label: 'Source', default: 'close' },
    ],

    plots: [{ key: 'ssf2', type: 'line', title: 'SSF2', style: { color: '#ffeb3b', lineWidth: 2 } }],

    calc(bars, settings) {
      // A cleared number field arrives as '', and Number('') is 0.
      const length = Math.max(1, Math.floor(Number(settings.length) || 20))
      const src = sourceValues(bars, settings.source ?? 'close')

      const SQRT2_PI = Math.sqrt(2) * Math.PI
      const arg = SQRT2_PI / length
      const expArg = Math.exp(-arg)
      const c2 = 2 * expArg * Math.cos(arg)
      const c3 = -expArg * expArg
      const c1 = 1 - c2 - c3

      const n = bars.length
      const out = new Array(n).fill(NaN)

      // The source substitutes the nearest available sample for every missing
      // history term, so on bar 0 every term collapses to src[0] and the filter
      // returns c1 + c2 + c3 = 1 times src[0]. It emits from the first bar with
      // no NaN warmup, and the two-pole recursion then settles from there.
      let prev1 = NaN
      let prev2 = NaN
      for (let i = 0; i < n; i++) {
        const raw = src[i]
        const back1 = i >= 1 ? src[i - 1] : NaN
        const back2 = i >= 2 ? src[i - 2] : NaN

        const ssrc = Number.isFinite(raw) ? raw : back1
        if (!Number.isFinite(ssrc)) continue
        const src1 = Number.isFinite(back1) ? back1 : ssrc
        const src2 = Number.isFinite(back2) ? back2 : src1

        const hist1 = Number.isFinite(prev1) ? prev1 : src1
        const hist2 = Number.isFinite(prev2) ? prev2 : src2

        const value = c1 * ssrc + c2 * hist1 + c3 * hist2
        out[i] = value
        prev2 = prev1
        prev1 = value
      }

      return { ssf2: nulls(out) }
    },
  })
}
