/**
 * Chebyshev Type I Filter (CHEBY1) - ported to openalgo-charts from Pine Script v6.
 *
 * Source: https://github.com/mihakralj/pinescript/blob/c4e91b962be09733d8fc76caa5191e9e586c5cee/indicators/filters/cheby1.pine
 * Repo:   mihakralj/pinescript
 * License: MIT (c) mihakralj
 * SPDX-FileCopyrightText: (c) mihakralj
 * SPDX-FileCopyrightText: (c) 2026 marketcalls (port to openalgo-charts)
 * SPDX-License-Identifier: MIT
 *
 * A second order Chebyshev Type I lowpass, designed by bilinear transform from
 * the cutoff period and a passband ripple in decibels: more ripple in the
 * passband buys a steeper roll-off past the cutoff.
 */

export default function ({ registerIndicator, sourceValues, nulls }) {
  registerIndicator({
    id: 'oa-cheby1',
    name: 'Chebyshev Type I Filter (CHEBY1)',
    category: 'Filters',
    placement: 'onchart',

    inputs: [
      { key: 'source', type: 'source', label: 'Source', default: 'close' },
      { key: 'length', type: 'number', label: 'Length', default: 20, min: 2, max: 5000, step: 1,
        tooltip: 'Cutoff period: the filter passes cycles longer than this.' },
      { key: 'ripple', type: 'number', label: 'Passband Ripple (dB)', default: 1, min: 0.01, max: 20, step: 0.1 },
    ],

    plots: [{ key: 'cheby1', type: 'line', title: 'Cheby1', style: { color: '#ffeb3b', lineWidth: 2 } }],

    calc(bars, settings) {
      // A cleared number field arrives as '', and Number('') is 0.
      const length = Math.max(2, Math.floor(Number(settings.length) || 20))
      const ripple = Math.max(0.01, Number(settings.ripple) || 1)
      const src = sourceValues(bars, settings.source ?? 'close')

      // Analogue prototype pole, pre-warped and mapped by the bilinear transform.
      const wc = (2 * Math.PI) / length
      const wcTan = Math.tan(wc / 2)
      const epsilon = Math.sqrt(Math.pow(10, ripple / 10) - 1)
      const asinhInvEps = Math.log(1 / epsilon + Math.sqrt(1 / (epsilon * epsilon) + 1))
      const mu = asinhInvEps / 2
      const sinhMu = (Math.exp(mu) - Math.exp(-mu)) / 2
      const coshMu = (Math.exp(mu) + Math.exp(-mu)) / 2
      const sigma = -sinhMu * wcTan
      const omegaD = coshMu * wcTan
      const k = sigma * sigma + omegaD * omegaD
      const a0z = 1 - 2 * sigma + k
      const a1z = 2 * k - 2
      const a2z = 1 + 2 * sigma + k
      const b0z = k
      const b1z = 2 * k
      const b2z = k

      const out = new Array(bars.length).fill(NaN)
      // sigma is negative and k is positive, so a0z is never below 1, but a
      // degenerate input must not be allowed to divide by zero regardless.
      if (!Number.isFinite(a0z) || a0z === 0) return { cheby1: nulls(out) }

      const b0 = b0z / a0z
      const b1 = b1z / a0z
      const b2 = b2z / a0z
      const a1 = a1z / a0z
      const a2 = a2z / a0z

      for (let i = 0; i < bars.length; i++) {
        if (i < 2) {
          // Pine seeds the first two bars with nz(src, 0.0).
          out[i] = Number.isFinite(src[i]) ? src[i] : 0
          continue
        }
        // Each nz() below falls back to the nearest value already resolved.
        let ssrc = src[i]
        if (!Number.isFinite(ssrc)) ssrc = Number.isFinite(src[i - 1]) ? src[i - 1] : 0
        const src1 = Number.isFinite(src[i - 1]) ? src[i - 1] : ssrc
        const src2 = Number.isFinite(src[i - 2]) ? src[i - 2] : src1
        const filt1 = Number.isFinite(out[i - 1]) ? out[i - 1] : ssrc
        const filt2 = Number.isFinite(out[i - 2]) ? out[i - 2] : filt1

        const value = b0 * ssrc + b1 * src1 + b2 * src2 - a1 * filt1 - a2 * filt2
        out[i] = Number.isFinite(value) ? value : NaN
      }

      return { cheby1: nulls(out) }
    },
  })
}
