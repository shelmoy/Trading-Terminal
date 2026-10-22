/**
 * Ehlers 2-Pole Butterworth Filter (BUTTER2) - ported to openalgo-charts from Pine Script v6.
 *
 * Source: https://github.com/mihakralj/pinescript/blob/c4e91b962be09733d8fc76caa5191e9e586c5cee/indicators/filters/butter2.pine
 * Repo:   mihakralj/pinescript
 * License: MIT
 * SPDX-FileCopyrightText: (c) mihakralj
 * SPDX-FileCopyrightText: (c) 2026 marketcalls (port to openalgo-charts)
 * SPDX-License-Identifier: MIT
 *
 * A second-order Butterworth lowpass IIR filter: it smooths price with a
 * maximally flat passband, so cycles shorter than the cutoff period are damped
 * without the ripple a simple average leaves behind.
 */

export default function ({ registerIndicator, sourceValues, nulls }) {
  registerIndicator({
    id: 'oa-butter2',
    name: 'Ehlers 2-Pole Butterworth Filter (BUTTER2)',
    category: 'Filters',
    placement: 'onchart',

    inputs: [
      { key: 'length', type: 'number', label: 'Length', default: 20, min: 2, max: 5000, step: 1 },
      { key: 'source', type: 'source', label: 'Source', default: 'close' },
    ],

    plots: [
      { key: 'butter2', type: 'line', title: 'Butterworth 2-Pole', style: { color: '#ffeb3b', lineWidth: 2 } },
    ],

    calc(bars, settings) {
      // A cleared number field arrives as '', and Number('') is 0.
      const length = Math.max(2, Math.floor(Number(settings.length) || 20))
      const src = sourceValues(bars, settings.source ?? 'close')

      // Pine applies math.max(length, 2) again inside the function.
      const safeLength = Math.max(2, length)
      const omega = (2 * Math.PI) / safeLength
      const sinOmega = Math.sin(omega)
      const cosOmega = Math.cos(omega)
      const alpha = sinOmega / Math.SQRT2
      const a0 = 1 + alpha
      const a1 = -2 * cosOmega
      const a2 = 1 - alpha
      const b0 = (1 - cosOmega) / 2
      const b1 = 1 - cosOmega
      const b2 = (1 - cosOmega) / 2

      const out = new Array(bars.length).fill(NaN)
      if (!Number.isFinite(a0) || a0 === 0) return { butter2: nulls(out) }

      const fin = (v) => Number.isFinite(v)

      for (let i = 0; i < bars.length; i++) {
        if (i < 2) {
          // Pine: filt := nz(src, 0.0) for the first two bars.
          out[i] = fin(src[i]) ? src[i] : 0
          continue
        }
        // nz(x, fallback) chains: each term falls back to the previous one.
        const ssrc = fin(src[i]) ? src[i] : (fin(src[i - 1]) ? src[i - 1] : 0)
        const src1 = fin(src[i - 1]) ? src[i - 1] : ssrc
        const src2 = fin(src[i - 2]) ? src[i - 2] : src1
        const filt1 = fin(out[i - 1]) ? out[i - 1] : ssrc
        const filt2 = fin(out[i - 2]) ? out[i - 2] : filt1

        out[i] = (b0 * ssrc + b1 * src1 + b2 * src2 - a1 * filt1 - a2 * filt2) / a0
      }

      return { butter2: nulls(out) }
    },
  })
}
