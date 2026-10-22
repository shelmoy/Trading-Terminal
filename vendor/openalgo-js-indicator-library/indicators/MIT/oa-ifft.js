/**
 * Inverse Fast Fourier Transform (IFFT) - ported to openalgo-charts from Pine Script v6.
 *
 * Source: https://github.com/mihakralj/pinescript/blob/c4e91b962be09733d8fc76caa5191e9e586c5cee/indicators/numerics/ifft.pine
 * Repo:   mihakralj/pinescript
 * License: MIT (c) mihakralj
 * SPDX-FileCopyrightText: (c) mihakralj
 * SPDX-FileCopyrightText: (c) 2026 marketcalls (port to openalgo-charts)
 * SPDX-License-Identifier: MIT
 *
 * Takes a Hann-windowed transform of the last N bars, throws away everything
 * above the requested harmonic, and rebuilds the series from what is left, so
 * the line follows the slow components of price and ignores the fast ones.
 */

export default function ({ registerIndicator, sourceValues, nulls }) {
  registerIndicator({
    id: 'oa-ifft',
    name: 'Inverse Fast Fourier Transform (IFFT)',
    category: 'Numerics',
    placement: 'onchart',

    inputs: [
      { key: 'source', type: 'source', label: 'Source', default: 'close' },
      {
        key: 'window',
        type: 'select',
        label: 'Window Size',
        default: 64,
        options: [
          { label: '32', value: 32 },
          { label: '64', value: 64 },
          { label: '128', value: 128 },
        ],
        tooltip: 'DFT window; larger = finer frequency resolution',
      },
      {
        key: 'harmonics',
        type: 'number',
        label: 'Harmonics',
        default: 5,
        min: 1,
        max: 32,
        step: 1,
        tooltip: 'Number of lowest-frequency components to keep; fewer = smoother',
      },
    ],

    plots: [{ key: 'ifft', type: 'line', title: 'IFFT', style: { color: '#ffeb3b', lineWidth: 2 } }],

    calc(bars, settings) {
      const len = bars.length
      const out = new Array(len).fill(NaN)

      // A cleared field arrives as '', and Number('') is 0. The select can only
      // hand back one of the three sizes, but coerce it anyway.
      let windowSize = Math.floor(Number(settings.window) || 64)
      if (windowSize !== 32 && windowSize !== 64 && windowSize !== 128) windowSize = 64
      const harmonics = Math.max(1, Math.min(32, Math.floor(Number(settings.harmonics) || 5)))

      const src = sourceValues(bars, settings.source ?? 'close')

      const N = windowSize
      const halfN = N / 2
      const H = Math.min(harmonics, halfN)
      const twoPiOverN = (2 * Math.PI) / N

      // The source runs a forward transform over the window and then sums the
      // kept bins back, which is the DC term plus 2*Re(X_k) for k = 1..H. Both
      // sums run over the same windowed samples, so the k loop collapses into a
      // per-lag coefficient that is the same on every bar:
      //
      //   out[i] = (1/N) * sum_n src[i-n] * w(n) * (1 + 2*sum_k cos(2*pi*k*n/N))
      //
      // Identical arithmetic, O(N) per bar instead of O(N*H).
      const coef = new Float64Array(N)
      for (let n = 0; n < N; n++) {
        const w = 0.5 - 0.5 * Math.cos(twoPiOverN * n)
        let gain = 1
        for (let k = 1; k <= H; k++) gain += 2 * Math.cos(twoPiOverN * k * n)
        coef[n] = (w * gain) / N
      }

      // Pine reads the window through nz(), so a bar before the first one
      // counts as 0. It therefore emits from bar 0 with a zero-padded window,
      // and the line only becomes meaningful once N bars of history exist.
      for (let i = 0; i < len; i++) {
        let sum = 0
        for (let n = 0; n < N; n++) {
          const j = i - n
          if (j < 0) continue
          const v = src[j]
          if (!Number.isFinite(v)) continue
          sum += v * coef[n]
        }
        out[i] = sum
      }

      return { ifft: nulls(out) }
    },
  })
}
