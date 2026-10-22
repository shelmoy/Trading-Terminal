/**
 * Ultrasmooth Filter (USF) - ported to openalgo-charts from Pine Script v6.
 *
 * Source: https://github.com/mihakralj/pinescript/blob/c4e91b962be09733d8fc76caa5191e9e586c5cee/indicators/filters/usf.pine
 * Repo:   mihakralj/pinescript
 * License: MIT
 * SPDX-FileCopyrightText: (c) mihakralj
 * SPDX-FileCopyrightText: (c) 2026 marketcalls (port to openalgo-charts)
 * SPDX-License-Identifier: MIT
 *
 * A two-pole recursive filter with a momentum term: the price feed is combined
 * with its own two previous inputs and outputs, giving a very smooth line with
 * far less lag than a moving average of the same length.
 */

export default function ({ registerIndicator, sourceValues, nulls }) {
  registerIndicator({
    id: 'oa-usf',
    name: 'Ultrasmooth Filter (USF)',
    category: 'Filters',
    placement: 'onchart',

    inputs: [
      { key: 'length', type: 'number', label: 'Length', default: 20, min: 1, max: 5000, step: 1 },
      { key: 'source', type: 'source', label: 'Source', default: 'close' },
    ],

    plots: [{ key: 'usf', type: 'line', title: 'UltraSmooth', style: { color: '#ffeb3b', lineWidth: 2 } }],

    calc(bars, settings) {
      // A cleared number field arrives as '', and Number('') is 0.
      const length = Math.max(1, Math.floor(Number(settings.length) || 20))
      const src = sourceValues(bars, settings.source || 'close')

      const SQRT2_PI = Math.sqrt(2.0) * Math.PI
      const arg = SQRT2_PI / length
      const expArg = Math.exp(-arg)
      const c2 = 2.0 * expArg * Math.cos(arg)
      const c3 = -expArg * expArg
      const c1 = (1.0 + c2 - c3) / 4.0

      const out = new Array(bars.length).fill(NaN)

      for (let i = 0; i < bars.length; i++) {
        const raw = src[i]
        const raw1 = i > 0 ? src[i - 1] : NaN
        const raw2 = i > 1 ? src[i - 2] : NaN

        // nz(src, src[1]), nz(src[1], ssrc), nz(src[2], src1)
        const ssrc = Number.isFinite(raw) ? raw : raw1
        const src1 = Number.isFinite(raw1) ? raw1 : ssrc
        const src2 = Number.isFinite(raw2) ? raw2 : src1

        // nz(usf[1], src1), nz(usf[2], src2)
        const prev1 = i > 0 ? out[i - 1] : NaN
        const prev2 = i > 1 ? out[i - 2] : NaN
        const us1 = Number.isFinite(prev1) ? prev1 : src1
        const us2 = Number.isFinite(prev2) ? prev2 : src2

        out[i] =
          (1.0 - c1) * ssrc +
          (2.0 * c1 - c2) * src1 -
          (c1 + c3) * src2 +
          c2 * us1 +
          c3 * us2
      }

      return { usf: nulls(out) }
    },
  })
}
