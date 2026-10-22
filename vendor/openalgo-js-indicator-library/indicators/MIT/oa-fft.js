/**
 * FFT Dominant Cycle (Radix-2 FFT) - ported to openalgo-charts from Pine Script v6.
 *
 * Source: https://github.com/mihakralj/pinescript/blob/c4e91b962be09733d8fc76caa5191e9e586c5cee/indicators/numerics/fft.pine
 * Repo:   mihakralj/pinescript
 * License: MIT
 * SPDX-FileCopyrightText: (c) mihakralj
 * SPDX-FileCopyrightText: (c) 2026 marketcalls (port to openalgo-charts)
 * SPDX-License-Identifier: MIT
 *
 * Runs a Hanning-windowed radix-2 FFT over the last N bars, picks the highest
 * magnitude bin inside the requested period band, and refines that bin with
 * parabolic interpolation to report the dominant cycle length in bars.
 */

export default function ({ registerIndicator, sourceValues, nulls }) {
  registerIndicator({
    id: 'oa-fft',
    name: 'FFT Dominant Cycle (Radix-2 FFT)',
    category: 'Numerics',
    placement: 'pane',

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
        tooltip: 'Bars fed to the transform. Must be a power of two, and the longest period it can resolve is half of it.',
      },
      { key: 'minPeriod', type: 'number', label: 'Min Period', default: 4, min: 2, max: 64, step: 1 },
      {
        key: 'maxPeriod',
        type: 'number',
        label: 'Max Period',
        default: 32,
        min: 4,
        max: 64,
        step: 1,
        tooltip: 'Capped at half the window size, which is the longest cycle the transform can resolve.',
      },
    ],

    plots: [
      { key: 'period', type: 'line', title: 'Dominant Period', style: { color: '#ffeb3b', lineWidth: 2 } },
    ],

    levels: () => [
      { price: 8, title: 'Fast Cycle', color: '#4caf50', dashed: true },
      { price: 20, title: 'Slow Cycle', color: '#ff5252', dashed: true },
    ],

    calc(bars, settings) {
      const len = bars.length
      const out = new Array(len).fill(NaN)

      // A cleared number field arrives as '', and Number('') is 0. The select
      // can only hand back one of the three sizes, but coerce it anyway.
      let n = Math.floor(Number(settings.window) || 64)
      if (n !== 32 && n !== 64 && n !== 128) n = 64
      let minPeriod = Math.max(2, Math.min(64, Math.floor(Number(settings.minPeriod) || 4)))
      let maxPeriod = Math.max(4, Math.min(64, Math.floor(Number(settings.maxPeriod) || 32)))
      // Pine refuses a Max Period above half the window with a runtime error.
      // There is no equivalent escape here, so clamp into the resolvable band.
      maxPeriod = Math.min(maxPeriod, Math.floor(n / 2))
      minPeriod = Math.min(minPeriod, maxPeriod)

      // Pine guards with bar_index >= windowSize, so the first N bars are na.
      if (len <= n) return { period: nulls(out) }

      const src = sourceValues(bars, settings.source ?? 'close')

      // Pine's bin bounds use integer division on both sides.
      const halfN = n / 2
      const minBin = Math.max(1, Math.floor(n / maxPeriod))
      const maxBin = Math.min(halfN, Math.floor(n / minPeriod))
      if (maxBin < minBin) return { period: nulls(out) }

      // Hanning window, rebuilt whenever the window size changes.
      const win = new Float64Array(n)
      const twoPiOverN = (2 * Math.PI) / n
      for (let k = 0; k < n; k++) win[k] = 0.5 - 0.5 * Math.cos(twoPiOverN * k)

      // Bit-reversal permutation table. Writing the input straight into the
      // reversed slot is the same array Pine builds with its pairwise swaps,
      // because bit reversal is its own inverse.
      let bits = 0
      for (let x = n; x > 1; x >>= 1) bits += 1
      const rev = new Int32Array(n)
      for (let i = 0; i < n; i++) {
        let r = 0
        let x = i
        for (let b = 0; b < bits; b++) {
          r = (r << 1) | (x & 1)
          x >>= 1
        }
        rev[i] = r
      }

      // Twiddle factors, one table per Cooley-Tukey stage.
      const stages = []
      for (let size = 2; size <= n; size *= 2) {
        const half = size / 2
        const angStep = (-2 * Math.PI) / size
        const wr = new Float64Array(half)
        const wi = new Float64Array(half)
        for (let k = 0; k < half; k++) {
          wr[k] = Math.cos(angStep * k)
          wi[k] = Math.sin(angStep * k)
        }
        stages.push({ size, half, wr, wi })
      }

      const re = new Float64Array(n)
      const im = new Float64Array(n)

      for (let i = n; i < len; i++) {
        // Window laid out oldest to newest, imaginary part zero. nz() means a
        // missing sample counts as 0.
        for (let k = 0; k < n; k++) {
          const v = src[i - n + 1 + k]
          re[rev[k]] = (Number.isFinite(v) ? v : 0) * win[k]
          im[rev[k]] = 0
        }

        for (let s = 0; s < stages.length; s++) {
          const stage = stages[s]
          const half = stage.half
          const wr = stage.wr
          const wi = stage.wi
          for (let start = 0; start < n; start += stage.size) {
            for (let k = 0; k < half; k++) {
              const i0 = start + k
              const i1 = i0 + half
              const ur = re[i0]
              const ui = im[i0]
              const vr = re[i1]
              const vi = im[i1]
              const tr = vr * wr[k] - vi * wi[k]
              const ti = vr * wi[k] + vi * wr[k]
              re[i0] = ur + tr
              im[i0] = ui + ti
              re[i1] = ur - tr
              im[i1] = ui - ti
            }
          }
        }

        // Peak power inside the requested bin range.
        let bestMag = NaN
        let bestK = minBin
        for (let k = minBin; k <= maxBin; k++) {
          const mag = re[k] * re[k] + im[k] * im[k]
          if (!Number.isFinite(bestMag) || mag > bestMag) {
            bestMag = mag
            bestK = k
          }
        }
        if (!Number.isFinite(bestMag)) continue

        // Neighbour powers for the interpolation, mirrored at the edges.
        const b = bestMag
        let a = b
        let c = b
        if (bestK > minBin) a = re[bestK - 1] * re[bestK - 1] + im[bestK - 1] * im[bestK - 1]
        if (bestK < maxBin) c = re[bestK + 1] * re[bestK + 1] + im[bestK + 1] * im[bestK + 1]

        const denom = a - 2 * b + c
        const shift = Math.abs(denom) > 0 ? (0.5 * (a - c)) / denom : 0
        const divisor = bestK + shift
        if (!Number.isFinite(divisor) || divisor === 0) continue

        const period = n / divisor
        if (!Number.isFinite(period)) continue
        out[i] = Math.max(minPeriod, Math.min(maxPeriod, period))
      }

      return { period: nulls(out) }
    },
  })
}
