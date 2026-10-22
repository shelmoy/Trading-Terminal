/**
 * Continuous Wavelet Transform (CWT) - ported to openalgo-charts from Pine Script v6.
 *
 * Source: https://github.com/mihakralj/pinescript/blob/c4e91b962be09733d8fc76caa5191e9e586c5cee/indicators/numerics/cwt.pine
 * Repo:   mihakralj/pinescript
 * License: MIT (c) mihakralj
 * SPDX-FileCopyrightText: (c) mihakralj
 * SPDX-FileCopyrightText: (c) 2026 marketcalls (port to openalgo-charts)
 * SPDX-License-Identifier: MIT
 *
 * Convolves the source with a Morlet wavelet at one scale and plots the
 * magnitude, measuring how much of the cycle that scale represents is present.
 */

export default function ({ registerIndicator, sourceValues, nulls }) {
  registerIndicator({
    id: 'oa-cwt',
    name: 'Continuous Wavelet Transform (CWT)',
    category: 'Numerics',
    placement: 'pane',

    inputs: [
      { key: 'source', type: 'source', label: 'Source', default: 'close' },
      {
        key: 'scale',
        type: 'number',
        label: 'Scale',
        default: 10,
        min: 0.5,
        max: 200,
        step: 0.5,
        tooltip: 'Wavelet scale: higher values capture lower frequencies.',
      },
      {
        key: 'omega',
        type: 'number',
        label: 'Omega (Central Frequency)',
        default: 6,
        min: 1,
        max: 20,
        step: 0.5,
        tooltip: 'Morlet central frequency. The standard value is 6.0.',
      },
    ],

    plots: [{ key: 'cwt', type: 'line', title: 'CWT', style: { color: '#ffeb3b', lineWidth: 2 } }],

    calc(bars, settings) {
      // A cleared number field arrives as '', and Number('') is 0.
      const scale = Math.min(200, Math.max(0.5, Number(settings.scale) || 10))
      const omega = Math.min(20, Math.max(1, Number(settings.omega) || 6))

      const halfWin = Math.max(1, Math.trunc(Math.round(3.0 * scale)))
      const invScale = 1.0 / scale
      const normFactor = 1.0 / Math.sqrt(scale)

      // The kernel depends only on the settings, so build it once. Tap j holds
      // k = j - halfWin, and reads the bar halfWin - k = 2*halfWin - j back.
      const taps = 2 * halfWin + 1
      const kernelRe = new Array(taps)
      const kernelIm = new Array(taps)
      for (let j = 0; j < taps; j++) {
        const k = j - halfWin
        const t = k * invScale
        const gauss = Math.exp(-0.5 * t * t)
        const angle = omega * t
        kernelRe[j] = gauss * Math.cos(angle)
        kernelIm[j] = gauss * Math.sin(angle)
      }

      const src = sourceValues(bars, settings.source ?? 'close')
      const out = new Array(bars.length).fill(NaN)

      for (let i = 0; i < bars.length; i++) {
        let realSum = 0.0
        let imagSum = 0.0
        for (let j = 0; j < taps; j++) {
          const idx = i - (2 * halfWin - j)
          // nz(source[n]): history the chart does not have reads as 0.
          const srcVal = idx >= 0 && Number.isFinite(src[idx]) ? src[idx] : 0
          if (srcVal === 0) continue
          realSum += srcVal * kernelRe[j]
          imagSum += srcVal * kernelIm[j]
        }
        out[i] = Math.sqrt(realSum * realSum + imagSum * imagSum) * normFactor
      }

      return { cwt: nulls(out) }
    },
  })
}
