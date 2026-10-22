/**
 * Wiener Filter (WIENER) - ported to openalgo-charts from Pine Script v6.
 *
 * Source: https://github.com/mihakralj/pinescript/blob/c4e91b962be09733d8fc76caa5191e9e586c5cee/indicators/filters/wiener.pine
 * Repo:   mihakralj/pinescript
 * License: MIT (c) mihakralj
 * SPDX-FileCopyrightText: (c) mihakralj
 * SPDX-FileCopyrightText: (c) 2026 marketcalls (port to openalgo-charts)
 * SPDX-License-Identifier: MIT
 *
 * Splits the recent range into an estimated signal variance and an estimated
 * noise variance, then blends price back toward its own mean in that proportion,
 * so a quiet market is smoothed hard and a trending one is barely touched.
 */

export default function ({ registerIndicator, sourceValues, sma, nulls }) {
  registerIndicator({
    id: 'oa-wiener',
    name: 'Wiener Filter (WIENER)',
    category: 'Filters',
    placement: 'onchart',

    inputs: [
      {
        key: 'length',
        type: 'number',
        label: 'Length',
        default: 20,
        min: 5,
        max: 500,
        step: 1,
        tooltip: 'Window used to estimate the noise variance from successive differences.',
      },
      {
        key: 'smooth',
        type: 'number',
        label: 'Smoothing',
        default: 10,
        min: 2,
        max: 100,
        step: 1,
        tooltip: 'Window used to estimate the signal power and the mean.',
      },
      { key: 'source', type: 'source', label: 'Source', default: 'close' },
    ],

    plots: [{ key: 'wiener', type: 'line', title: 'Wiener', style: { color: '#ffeb3b', lineWidth: 2 } }],

    calc(bars, settings) {
      // A cleared number field arrives as '', and Number('') is 0.
      const length = Math.min(500, Math.max(5, Math.floor(Number(settings.length) || 20)))
      const smooth = Math.min(100, Math.max(2, Math.floor(Number(settings.smooth) || 10)))
      const src = sourceValues(bars, settings.source || 'close')
      const n = bars.length

      // Noise variance from the mean squared successive difference. Pine pushes
      // length - 1 differences every bar and divides by twice that count, so on
      // an early bar the differences that reach back before the first bar are
      // absent from the sum while the divisor still counts them.
      const numDiffs = length - 1
      const noiseVar = new Array(n).fill(NaN)
      for (let i = 0; i < n; i++) {
        if (numDiffs <= 0) {
          noiseVar[i] = 0
          continue
        }
        let sumDiffs = 0
        for (let j = 0; j < numDiffs; j++) {
          const newer = src[i - j]
          const older = src[i - j - 1]
          if (!Number.isFinite(newer) || !Number.isFinite(older)) continue
          const diff = newer - older
          sumDiffs += diff * diff
        }
        noiseVar[i] = sumDiffs / (2 * numDiffs)
      }

      // mean is na for the first smooth - 1 bars, and the outer sma carries that
      // gap forward, so signalPlusNoise starts at 2 * smooth - 2. sma() here is
      // NaN-safe in the same sense Pine is: a window holding a gap stays na.
      const mean = sma(src, smooth)
      const squaredError = new Array(n).fill(NaN)
      for (let i = 0; i < n; i++) {
        if (!Number.isFinite(mean[i]) || !Number.isFinite(src[i])) continue
        const d = src[i] - mean[i]
        squaredError[i] = d * d
      }
      const signalPlusNoise = sma(squaredError, smooth)

      const out = new Array(n).fill(NaN)
      for (let i = 0; i < n; i++) {
        if (!Number.isFinite(mean[i]) || !Number.isFinite(signalPlusNoise[i])) continue
        if (!Number.isFinite(noiseVar[i]) || !Number.isFinite(src[i])) continue
        const signalVar = Math.max(signalPlusNoise[i] - noiseVar[i], 0)
        const total = signalVar + noiseVar[i]
        // A halted or perfectly flat instrument leaves both variances at zero.
        // The source divides 0 by 0 there; a gain of 0 gives the same answer,
        // because the mean and the source are equal on a flat series.
        const k = total > 0 ? signalVar / total : 0
        out[i] = mean[i] + k * (src[i] - mean[i])
      }

      return { wiener: nulls(out) }
    },
  })
}
