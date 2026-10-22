/**
 * Elliptic 2nd Order Filter (ELLIPTIC) - ported to openalgo-charts from Pine Script v6.
 *
 * Source: https://github.com/mihakralj/pinescript/blob/c4e91b962be09733d8fc76caa5191e9e586c5cee/indicators/filters/elliptic.pine
 * Repo:   mihakralj/pinescript
 * License: MIT (c) mihakralj
 * SPDX-FileCopyrightText: (c) mihakralj
 * SPDX-FileCopyrightText: (c) 2026 marketcalls (port to openalgo-charts)
 * SPDX-License-Identifier: MIT
 *
 * A two-pole, two-zero elliptic lowpass (1 dB passband ripple, 40 dB stopband)
 * applied to price as a biquad. The zeros put a notch just past the cutoff, so
 * it sheds high-frequency noise faster than a Butterworth of the same order.
 */

export default function ({ registerIndicator, sourceValues, nulls }) {
  registerIndicator({
    id: 'oa-elliptic',
    name: 'Elliptic 2nd Order Filter (ELLIPTIC)',
    category: 'Filters',
    placement: 'onchart',

    inputs: [
      { key: 'length', type: 'number', label: 'Length', default: 20, min: 2, max: 5000, step: 1 },
      { key: 'source', type: 'source', label: 'Source', default: 'close' },
    ],

    plots: [
      {
        key: 'elliptic',
        type: 'line',
        title: 'Elliptic (Rp=1, Rs=40)',
        style: { color: '#ffeb3b', lineWidth: 2 },
      },
    ],

    calc(bars, settings) {
      // A cleared number field arrives as '', and Number('') is 0.
      const length = Math.max(2, Math.floor(Number(settings.length) || 20))
      const src = sourceValues(bars, settings.source ?? 'close')

      // Normalised prototype constants from the source. It also declares
      // C_omega_d = 0.90436, which its difference equation never uses.
      const C_WZ = 2.15499
      const C_SIGMA = -0.31323
      const C_KP_NORM = 0.91598
      const C_K = 0.14735

      // Bilinear pre-warp of the cutoff.
      let wc = Math.tan(Math.PI / length)
      if (wc < 1e-9) wc = 1e-9

      const omegaZScaled = C_WZ * wc
      const sigmaScaled = C_SIGMA * wc
      const kpScaled = C_KP_NORM * wc * wc

      let a0Denom = 1 - 2 * sigmaScaled + kpScaled
      if (Math.abs(a0Denom) < 1e-9) a0Denom = 1e-9

      const normFactor = C_KP_NORM / (C_K * C_WZ * C_WZ)
      const b0 = (normFactor * C_K * (1 + omegaZScaled * omegaZScaled)) / a0Denom
      const b1 = (normFactor * C_K * (2 * omegaZScaled * omegaZScaled - 2)) / a0Denom
      const b2 = b0
      const a1 = (2 * kpScaled - 2) / a0Denom
      const a2 = (1 + 2 * sigmaScaled + kpScaled) / a0Denom

      const n = bars.length
      const filt = new Array(n).fill(NaN)
      for (let i = 0; i < n; i++) {
        // Pine: nz(src, 0.0).
        const s0 = Number.isFinite(src[i]) ? src[i] : 0
        // The first two bars seed the recursion with the price itself.
        if (i < 2) {
          filt[i] = s0
          continue
        }
        const s1 = Number.isFinite(src[i - 1]) ? src[i - 1] : s0
        const s2 = Number.isFinite(src[i - 2]) ? src[i - 2] : s1
        const f1 = Number.isFinite(filt[i - 1]) ? filt[i - 1] : s0
        const f2 = Number.isFinite(filt[i - 2]) ? filt[i - 2] : f1
        filt[i] = b0 * s0 + b1 * s1 + b2 * s2 - a1 * f1 - a2 * f2
      }

      return { elliptic: nulls(filt) }
    },
  })
}
