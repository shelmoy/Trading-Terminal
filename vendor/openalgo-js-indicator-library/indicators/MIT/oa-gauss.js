/**
 * Gaussian Filter (GAUSS) - ported to openalgo-charts from Pine Script v6.
 *
 * Source: https://github.com/mihakralj/pinescript/blob/c4e91b962be09733d8fc76caa5191e9e586c5cee/indicators/filters/gauss.pine
 * Repo:   mihakralj/pinescript
 * License: MIT (c) mihakralj
 * SPDX-FileCopyrightText: (c) mihakralj
 * SPDX-FileCopyrightText: (c) 2026 marketcalls (port to openalgo-charts)
 * SPDX-License-Identifier: MIT
 *
 * A true convolution of the source with a normalised Gaussian kernel whose
 * width follows sigma. The taps are renormalised over the bars that exist, so
 * the filter emits from the first bar instead of waiting for a full window.
 */

export default function ({ registerIndicator, sourceValues, nulls }) {
  registerIndicator({
    id: 'oa-gauss',
    name: 'Gaussian Filter (GAUSS)',
    category: 'Filters',
    placement: 'onchart',

    inputs: [
      {
        key: 'sigma',
        type: 'number',
        label: 'Sigma',
        default: 1,
        min: 0.1,
        max: 10,
        step: 0.1,
        tooltip: 'Standard deviation of the Gaussian kernel. The kernel spans 2 * ceil(3 * sigma) + 1 bars, so a larger sigma smooths harder and lags more.',
      },
      { key: 'source', type: 'source', label: 'Source', default: 'close' },
    ],

    plots: [
      { key: 'gauss', type: 'line', title: 'Gaussian', style: { color: '#ffeb3b', lineWidth: 2 } },
    ],

    calc(bars, settings) {
      // A cleared number field arrives as '', and Number('') is 0.
      const sigma = Math.min(10, Math.max(0.1, Number(settings.sigma) || 1))
      const src = sourceValues(bars, settings.source ?? 'close')

      // The kernel depends on sigma alone, so build it once per calc.
      const kernelSize = 2 * Math.ceil(3 * sigma) + 1
      const center = Math.floor(kernelSize / 2)
      const kernel = new Array(kernelSize)
      let kernelSum = 0
      for (let i = 0; i < kernelSize; i++) {
        const x = i - center
        const weight = Math.exp(-(x * x) / (2 * sigma * sigma))
        kernel[i] = weight
        kernelSum += weight
      }
      if (kernelSum !== 0) {
        const invSum = 1 / kernelSum
        for (let i = 0; i < kernelSize; i++) kernel[i] *= invSum
      }

      const out = new Array(bars.length).fill(NaN)
      for (let b = 0; b < bars.length; b++) {
        // Pine caps the tap count at bar_index + 1, so early bars use a
        // truncated kernel renormalised by the weight actually consumed.
        const taps = Math.min(b + 1, kernelSize)
        let sum = 0
        let weightSum = 0
        for (let i = 0; i < taps; i++) {
          const price = src[b - i]
          if (!Number.isFinite(price)) continue
          sum += price * kernel[i]
          weightSum += kernel[i]
        }
        const value = weightSum !== 0 ? sum / weightSum : NaN
        // Pine's nz(sum / weight_sum, src) falls back to the raw source.
        if (Number.isFinite(value)) out[b] = value
        else if (Number.isFinite(src[b])) out[b] = src[b]
      }

      return { gauss: nulls(out) }
    },
  })
}
