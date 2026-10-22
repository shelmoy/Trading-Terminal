/**
 * Chebyshev Type II Filter (CHEBY2) - ported to openalgo-charts from Pine Script v6.
 *
 * Source: https://github.com/mihakralj/pinescript/blob/c4e91b962be09733d8fc76caa5191e9e586c5cee/indicators/filters/cheby2.pine
 * Repo:   mihakralj/pinescript
 * License: MIT (c) mihakralj
 * SPDX-FileCopyrightText: (c) mihakralj
 * SPDX-FileCopyrightText: (c) 2026 marketcalls (port to openalgo-charts)
 * SPDX-License-Identifier: MIT
 *
 * A second order Chebyshev Type II lowpass filter. It keeps the passband flat
 * and pushes the ripple into the stopband, so the smoothed line tracks price
 * without the overshoot a Type I design leaves behind.
 */

export default function ({ registerIndicator, sourceValues, nulls }) {
  registerIndicator({
    id: 'oa-cheby2',
    name: 'Chebyshev Type II Filter (CHEBY2)',
    category: 'Filters',
    placement: 'onchart',

    inputs: [
      { key: 'length', type: 'number', label: 'Length', default: 10, min: 2, max: 5000, step: 1 },
      {
        key: 'attenuation',
        type: 'number',
        label: 'Stopband Attenuation (dB)',
        default: 5,
        min: 0.1,
        max: 200,
        step: 1,
        tooltip: 'How far the filter pushes down frequencies above the cutoff, in decibels.',
      },
      { key: 'source', type: 'source', label: 'Source', default: 'close' },
    ],

    plots: [{ key: 'cheby2', type: 'line', title: 'Cheby2', style: { color: '#ffeb3b', lineWidth: 2 } }],

    calc(bars, settings) {
      // A cleared number field arrives as '', and Number('') is 0.
      const length = Math.max(2, Math.floor(Number(settings.length) || 10))
      const attenuation = Math.max(0.1, Number(settings.attenuation) || 5)
      const src = sourceValues(bars, settings.source ?? 'close')

      const out = new Array(bars.length).fill(NaN)
      if (bars.length === 0) return { cheby2: nulls(out) }

      // Analogue prototype, bilinear-transformed to a biquad. The source applies
      // the same floors to length and attenuation before any of this runs.
      const pi = Math.PI
      const wc = (2 * pi) / length
      const Wc = 2 * Math.tan(wc / 2)
      const ripple = Math.pow(10, attenuation / 10) - 1
      const epsilon = ripple > 0 ? 1 / Math.sqrt(ripple) : NaN
      const asinhInvEps = Math.log(1 / epsilon + Math.sqrt(1 / (epsilon * epsilon) + 1))
      const mu = asinhInvEps / 2
      const sinhMu = (Math.exp(mu) - Math.exp(-mu)) / 2
      const coshMu = (Math.exp(mu) + Math.exp(-mu)) / 2
      const sqrt2 = Math.sqrt(2)
      const sigmaP = (-Wc * sinhMu) / sqrt2
      const omegaP = (Wc * coshMu) / sqrt2
      const omegaZ = Wc / Math.cos(pi / 4)
      const Kp = sigmaP * sigmaP + omegaP * omegaP
      const Kz = omegaZ * omegaZ
      const dcGain = Kp !== 0 ? Kz / Kp : NaN
      const a0z = 1 - 2 * sigmaP + Kp
      const a1z = 2 * Kp - 2
      const a2z = 1 + 2 * sigmaP + Kp
      const b0z = dcGain * (1 + Kz)
      const b1z = dcGain * (2 * Kz - 2)
      const b2z = dcGain * (1 + Kz)

      if (!Number.isFinite(a0z) || a0z === 0) return { cheby2: nulls(out) }

      let B0 = b0z / a0z
      let B1 = b1z / a0z
      let B2 = b2z / a0z
      const A1 = a1z / a0z
      const A2 = a2z / a0z

      // Renormalise so the filter has unity gain at DC.
      const sumB = B0 + B1 + B2
      const sumA = 1 + A1 + A2
      const norm = sumB !== 0 ? sumA / sumB : NaN
      B0 *= norm
      B1 *= norm
      B2 *= norm

      const coeffs = [B0, B1, B2, A1, A2]
      if (coeffs.some((c) => !Number.isFinite(c))) return { cheby2: nulls(out) }

      // var float filt, carried across bars. Pine seeds the first two bars with
      // the raw source, so the line starts at bar 0 with no warmup gap.
      let prev1 = NaN
      let prev2 = NaN

      for (let i = 0; i < bars.length; i++) {
        const s0 = Number.isFinite(src[i]) ? src[i] : 0
        let filt
        if (i < 2) {
          filt = s0
        } else {
          const s1 = Number.isFinite(src[i - 1]) ? src[i - 1] : s0
          const s2 = Number.isFinite(src[i - 2]) ? src[i - 2] : s1
          const f1 = Number.isFinite(prev1) ? prev1 : s0
          const f2 = Number.isFinite(prev2) ? prev2 : f1
          filt = B0 * s0 + B1 * s1 + B2 * s2 - A1 * f1 - A2 * f2
        }
        prev2 = prev1
        prev1 = filt
        if (Number.isFinite(filt)) out[i] = filt
      }

      return { cheby2: nulls(out) }
    },
  })
}
