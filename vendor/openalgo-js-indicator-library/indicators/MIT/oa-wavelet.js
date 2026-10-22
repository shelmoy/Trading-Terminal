/**
 * Wavelet Denoising Filter (WAVELET) - ported to openalgo-charts from Pine Script v6.
 *
 * Source: https://github.com/mihakralj/pinescript/blob/c4e91b962be09733d8fc76caa5191e9e586c5cee/indicators/filters/wavelet.pine
 * Repo:   mihakralj/pinescript
 * License: MIT
 * SPDX-FileCopyrightText: (c) mihakralj
 * SPDX-FileCopyrightText: (c) 2026 marketcalls (port to openalgo-charts)
 * SPDX-License-Identifier: MIT
 *
 * A causal a trous (stationary, undecimated) Haar wavelet transform splits the
 * source into a coarse approximation plus detail coefficients at each level,
 * soft-thresholds the details against a universal noise threshold, then sums
 * them back, so short-lived noise is shrunk away while the trend survives.
 */

export default function ({ registerIndicator, sourceValues, nulls }) {
  // soft(d, thresh) = sign(d) * max(0, |d| - thresh)
  const soft = (d, thresh) => {
    const absD = Math.abs(d)
    return absD > thresh ? Math.sign(d) * (absD - thresh) : 0
  }

  registerIndicator({
    id: 'oa-wavelet',
    name: 'Wavelet Denoising Filter (WAVELET)',
    category: 'Filters',
    placement: 'onchart',

    inputs: [
      {
        key: 'levels',
        type: 'number',
        label: 'Decomposition Levels',
        default: 4,
        min: 1,
        max: 8,
        step: 1,
        tooltip:
          'Number of wavelet decomposition levels. Each level doubles the effective smoothing window. Lookback = 2^levels bars.',
      },
      {
        key: 'threshold',
        type: 'number',
        label: 'Threshold Multiplier',
        default: 1,
        min: 0,
        max: 5,
        step: 0.1,
        tooltip:
          'Scales the universal noise threshold. 0 = no denoising (passthrough). Higher = more aggressive smoothing.',
      },
      { key: 'source', type: 'source', label: 'Source', default: 'close' },
    ],

    plots: [{ key: 'wavelet', type: 'line', title: 'Wavelet', style: { color: '#ffeb3b', lineWidth: 2 } }],

    calc(bars, settings) {
      // A cleared number field arrives as '', and Number('') is 0. Pine raises a
      // runtime error outside 1..8 and 0..5; clamping is the equivalent here.
      const rawLevels = Math.floor(Number(settings.levels) || 4)
      const levels = Math.min(8, Math.max(1, rawLevels))
      const threshMult = Math.min(5, Math.max(0, Number(settings.threshold) || 0))
      const src = sourceValues(bars, settings.source ?? 'close')
      const n = bars.length

      const out = new Array(n).fill(NaN)
      if (n === 0) return { wavelet: nulls(out) }

      // Level 1 runs always; levels 2..8 pass the approximation straight
      // through when the setting does not reach them, exactly as Pine does.
      const c = [new Array(n).fill(0)] // c[0] is c0
      for (let j = 1; j <= 8; j++) c.push(new Array(n).fill(0))
      const d = []
      for (let j = 0; j <= 8; j++) d.push(new Array(n).fill(0))

      for (let i = 0; i < n; i++) {
        // float c0 = nz(src, 0.0)
        const c0 = Number.isFinite(src[i]) ? src[i] : 0
        c[0][i] = c0

        // float c1 = (c0 + nz(src[1], c0)) * 0.5
        const prevSrc = i >= 1 && Number.isFinite(src[i - 1]) ? src[i - 1] : c0
        const c1 = (c0 + prevSrc) * 0.5
        c[1][i] = c1
        d[1][i] = c0 - c1

        // Levels 2..8: step doubles each time (2, 4, 8, 16, 32, 64, 128).
        for (let j = 2; j <= 8; j++) {
          const step = 1 << (j - 1)
          const prev = c[j - 1][i]
          if (levels >= j) {
            const back = i - step >= 0 ? c[j - 1][i - step] : prev
            const cj = (prev + (Number.isFinite(back) ? back : prev)) * 0.5
            c[j][i] = cj
            d[j][i] = prev - cj
          } else {
            c[j][i] = prev
            d[j][i] = 0
          }
        }
      }

      // Robust noise estimate: running mean of |d1| over 2^levels bars, with
      // nz() turning missing history into zero.
      const madLen = Math.pow(2, levels)
      const logMadLen = Math.log(madLen)

      // Rolling window sum: out-of-range history contributes zero, which is what
      // nz(d1[i], 0.0) gives on the early bars.
      let sumAbsD1 = 0
      for (let i = 0; i < n; i++) {
        const cur = d[1][i]
        sumAbsD1 += Math.abs(Number.isFinite(cur) ? cur : 0)
        if (i - madLen >= 0) {
          const drop = d[1][i - madLen]
          sumAbsD1 -= Math.abs(Number.isFinite(drop) ? drop : 0)
        }
        const mad = sumAbsD1 / madLen
        const sigma = mad / 0.6745
        const T = sigma * Math.sqrt(2 * logMadLen) * threshMult

        let sum = c[levels][i]
        for (let j = 1; j <= 8; j++) sum += soft(d[j][i], T)
        out[i] = Number.isFinite(sum) ? sum : NaN
      }

      return { wavelet: nulls(out) }
    },
  })
}
