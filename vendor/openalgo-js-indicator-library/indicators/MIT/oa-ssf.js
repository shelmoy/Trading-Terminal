/**
 * Supersmooth Filter (SSF) - ported to openalgo-charts from Pine Script v6.
 *
 * Source: https://github.com/mihakralj/pinescript/blob/c4e91b962be09733d8fc76caa5191e9e586c5cee/indicators/filters/ssf.pine
 * Repo:   mihakralj/pinescript
 * License: MIT
 * SPDX-FileCopyrightText: (c) mihakralj
 * SPDX-FileCopyrightText: (c) 2026 marketcalls (port to openalgo-charts)
 * SPDX-License-Identifier: MIT
 *
 * Ehlers' two-pole Butterworth-style lowpass filter. It strips the high
 * frequency chop with far less lag than a moving average of the same length,
 * at the cost of a small overshoot after a sharp move.
 */

export default function ({ registerIndicator, sourceValues, nulls }) {
  registerIndicator({
    id: 'oa-ssf',
    name: 'Supersmooth Filter (SSF)',
    category: 'Filters',
    placement: 'onchart',

    inputs: [
      { key: 'source', type: 'source', label: 'Source', default: 'close' },
      { key: 'length', type: 'number', label: 'Length', default: 20, min: 1, max: 5000, step: 1 },
    ],

    plots: [{ key: 'ssf', type: 'line', title: 'SSF', style: { color: '#ffeb3b', lineWidth: 2 } }],

    calc(bars, settings) {
      // A cleared number field arrives as '', and Number('') is 0.
      const length = Math.max(1, Math.floor(Number(settings.length) || 20))
      const src = sourceValues(bars, settings.source ?? 'close')
      const len = bars.length
      const out = new Array(len).fill(NaN)

      // arg is in radians, matching Pine's math.cos.
      const arg = (Math.SQRT2 * Math.PI) / length
      const expArg = Math.exp(-arg)
      const c2 = 2 * expArg * Math.cos(arg)
      const c3 = -expArg * expArg
      const c1 = 1 - c2 - c3

      // The two previous filter outputs, na before they exist.
      let prev1 = NaN
      let prev2 = NaN

      for (let i = 0; i < len; i++) {
        const cur = src[i]
        const p1 = i >= 1 ? src[i - 1] : NaN
        const p2 = i >= 2 ? src[i - 2] : NaN

        // Pine: ssrc = nz(src, src[1]); src1 = nz(src[1], ssrc); src2 = nz(src[2], src1)
        const ssrc = Number.isFinite(cur) ? cur : p1
        const src1 = Number.isFinite(p1) ? p1 : ssrc
        const src2 = Number.isFinite(p2) ? p2 : src1
        // Pine: nz(ssf[1], src1) and nz(ssf[2], src2), so the filter starts
        // from the price and the first bar reproduces it exactly (c1+c2+c3 = 1).
        const s1 = Number.isFinite(prev1) ? prev1 : src1
        const s2 = Number.isFinite(prev2) ? prev2 : src2

        let value = NaN
        if (Number.isFinite(ssrc) && Number.isFinite(s1) && Number.isFinite(s2)) {
          value = c1 * ssrc + c2 * s1 + c3 * s2
        }
        out[i] = Number.isFinite(value) ? value : NaN

        prev2 = prev1
        prev1 = out[i]
      }

      return { ssf: nulls(out) }
    },
  })
}
