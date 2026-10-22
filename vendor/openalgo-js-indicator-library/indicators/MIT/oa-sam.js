/**
 * SAM: Smoothed Adaptive Momentum - ported to openalgo-charts from Pine Script v6.
 *
 * Source: https://github.com/mihakralj/pinescript/blob/c4e91b962be09733d8fc76caa5191e9e586c5cee/indicators/momentum/sam.pine
 * Repo:   mihakralj/pinescript
 * License: MIT
 * SPDX-FileCopyrightText: (c) mihakralj
 * SPDX-FileCopyrightText: (c) 2026 marketcalls (port to openalgo-charts)
 * SPDX-License-Identifier: MIT
 *
 * Ehlers measures the dominant cycle period with a homodyne discriminator, takes
 * momentum over exactly one of those cycles, then runs the result through a
 * 2-pole Super Smoother so the oscillator adapts its lookback to the market.
 */

export default function ({ registerIndicator, sourceValues, nulls }) {
  registerIndicator({
    id: 'oa-sam',
    name: 'SAM: Smoothed Adaptive Momentum',
    category: 'Momentum',
    placement: 'pane',

    inputs: [
      {
        key: 'alpha',
        type: 'number',
        label: 'Alpha',
        default: 0.07,
        min: 0.01,
        max: 1,
        step: 0.01,
        tooltip: 'Smoothing factor applied to the cycle measurement stage.',
      },
      {
        key: 'cutoff',
        type: 'number',
        label: 'Cutoff',
        default: 8,
        min: 2,
        max: 500,
        step: 1,
        tooltip: 'Super Smoother cutoff period applied to the adaptive momentum.',
      },
    ],

    plots: [{ key: 'sam', type: 'line', title: 'SAM', style: { color: '#ffeb3b', lineWidth: 2 } }],

    levels: () => [{ price: 0, title: 'Zero', color: '#787b86', dashed: true }],

    calc(bars, settings) {
      // A cleared number field arrives as '', and Number('') is 0.
      const alpha = Math.min(1, Math.max(0.01, Number(settings.alpha) || 0.07))
      const cutoff = Math.max(2, Math.floor(Number(settings.cutoff) || 8))
      const n = bars.length
      const src = sourceValues(bars, 'close')

      // Pine's nz(x[k]): a bar before the start of history reads as 0.
      const at = (arr, i) => (i >= 0 && Number.isFinite(arr[i]) ? arr[i] : 0)

      const smooth = new Array(n).fill(0)
      const detrend = new Array(n).fill(0)
      const q1 = new Array(n).fill(0)
      const i1 = new Array(n).fill(0)
      const ji = new Array(n).fill(0)
      const jq = new Array(n).fill(0)
      const i2 = new Array(n).fill(0)
      const q2 = new Array(n).fill(0)
      const re = new Array(n).fill(0)
      const im = new Array(n).fill(0)
      const instPeriod = new Array(n).fill(0)
      const dcPeriod = new Array(n).fill(0)
      const momentum = new Array(n).fill(0)
      const filt = new Array(n).fill(0)

      // 2-pole Super Smoother coefficients, constant for the whole series.
      const root2pi = Math.sqrt(2) * Math.PI
      const a1 = Math.exp(-root2pi / cutoff)
      const b1 = 2 * a1 * Math.cos(root2pi / cutoff)
      const c2 = b1
      const c3 = -a1 * a1
      const c1 = 1 - c2 - c3

      for (let i = 0; i < n; i++) {
        // 4-bar FIR smoother.
        smooth[i] = (at(src, i) + 2 * at(src, i - 1) + 2 * at(src, i - 2) + at(src, i - 3)) / 6

        // Hilbert transform: detrender, then quadrature.
        detrend[i] =
          (0.0962 * smooth[i] + 0.5769 * at(smooth, i - 2) - 0.5769 * at(smooth, i - 4) - 0.0962 * at(smooth, i - 6)) *
          (0.075 * at(detrend, i - 1) + 0.54)

        q1[i] =
          (0.0962 * detrend[i] +
            0.5769 * at(detrend, i - 2) -
            0.5769 * at(detrend, i - 4) -
            0.0962 * at(detrend, i - 6)) *
          (0.075 * at(q1, i - 1) + 0.54)
        i1[i] = at(detrend, i - 3)

        // Advance the phase by 90 degrees.
        ji[i] =
          (0.0962 * i1[i] + 0.5769 * at(i1, i - 2) - 0.5769 * at(i1, i - 4) - 0.0962 * at(i1, i - 6)) *
          (0.075 * at(ji, i - 1) + 0.54)
        jq[i] =
          (0.0962 * q1[i] + 0.5769 * at(q1, i - 2) - 0.5769 * at(q1, i - 4) - 0.0962 * at(q1, i - 6)) *
          (0.075 * at(jq, i - 1) + 0.54)

        // Phasor addition, then smoothing of the homodyne components.
        i2[i] = alpha * (i1[i] - jq[i]) + (1 - alpha) * at(i2, i - 1)
        q2[i] = alpha * (q1[i] + ji[i]) + (1 - alpha) * at(q2, i - 1)

        const rawRe = i2[i] * at(i2, i - 1) + q2[i] * at(q2, i - 1)
        const rawIm = i2[i] * at(q2, i - 1) - q2[i] * at(i2, i - 1)
        re[i] = alpha * rawRe + (1 - alpha) * at(re, i - 1)
        im[i] = alpha * rawIm + (1 - alpha) * at(im, i - 1)

        // Homodyne discriminator for the dominant cycle period.
        let period = 0
        if (im[i] !== 0 && re[i] !== 0 && Number.isFinite(im[i]) && Number.isFinite(re[i])) {
          const angle = Math.atan(im[i] / re[i])
          period = angle !== 0 ? (2 * Math.PI) / angle : 0
        }
        period = Math.max(Math.min(period, 50), 6)

        instPeriod[i] = 0.33 * period + 0.67 * at(instPeriod, i - 1)
        dcPeriod[i] = 0.15 * instPeriod[i] + 0.85 * at(dcPeriod, i - 1)

        // Adaptive momentum: one dominant-cycle lookback.
        const dcLen = Math.max(Math.trunc(dcPeriod[i]), 1)
        momentum[i] = at(src, i) - at(src, i - dcLen)

        filt[i] = (c1 * (momentum[i] + at(momentum, i - 1))) / 2 + c2 * at(filt, i - 1) + c3 * at(filt, i - 2)
      }

      return { sam: nulls(filt) }
    },
  })
}
