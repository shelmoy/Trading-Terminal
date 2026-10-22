/**
 * Savitzky-Golay Filter (SGF) - ported to openalgo-charts from Pine Script v6.
 *
 * Source: https://github.com/mihakralj/pinescript/blob/c4e91b962be09733d8fc76caa5191e9e586c5cee/indicators/filters/sgf.pine
 * Repo:   mihakralj/pinescript
 * License: MIT (c) mihakralj
 * SPDX-FileCopyrightText: (c) mihakralj
 * SPDX-FileCopyrightText: (c) 2026 marketcalls (port to openalgo-charts)
 * SPDX-License-Identifier: MIT
 *
 * Fits a low-order polynomial across a sliding window by convolution, which
 * smooths the series while preserving the height and width of a swing far
 * better than a moving average of the same length.
 */

export default function ({ registerIndicator, sourceValues, nulls }) {
  registerIndicator({
    id: 'oa-sgf',
    name: 'Savitzky-Golay Filter (SGF)',
    category: 'Filters',
    placement: 'onchart',

    inputs: [
      {
        key: 'window',
        type: 'number',
        label: 'Window Size',
        default: 21,
        min: 1,
        max: 1000,
        step: 2,
        tooltip: 'Rounded down to the nearest odd number.',
      },
      {
        key: 'order',
        type: 'number',
        label: 'Polynomial Order',
        default: 2,
        min: 2,
        max: 4,
        step: 2,
      },
      { key: 'source', type: 'source', label: 'Source', default: 'close' },
    ],

    plots: [
      { key: 'sgf', type: 'line', title: 'SGF', style: { color: '#ffeb3b', lineWidth: 2 } },
    ],

    calc(bars, settings) {
      // A cleared number field arrives as '', and Number('') is 0.
      const windowSize = Math.min(1000, Math.max(1, Math.floor(Number(settings.window) || 21)))
      const polyOrder = Math.min(4, Math.max(2, Math.floor(Number(settings.order) || 2)))
      const src = sourceValues(bars, settings.source ?? 'close')

      const adjSize = Math.max(1, windowSize % 2 === 0 ? windowSize - 1 : windowSize)
      const out = new Array(bars.length).fill(NaN)

      // Pine raises runtime.error here and the study stops drawing. A thrown
      // error would take the whole chart down, so the series stays blank
      // instead, which is the same outcome the user sees on TradingView.
      if (polyOrder >= adjSize) return { sgf: nulls(out) }

      const halfWindow = Math.trunc(adjSize / 2)
      const coeffs = []
      let sumDenom = 0
      for (let i = -halfWindow; i <= halfWindow; i++) {
        let weight
        if (polyOrder === 2) {
          weight = 3 * (3 * adjSize * adjSize - 7 - 20 * i * i)
        } else if (polyOrder === 4) {
          const i2 = i * i
          weight = 15 + i2 * (-20 + i2 * 6)
        } else {
          // Reachable only for an order the dialog's step skips, e.g. 3.
          weight = halfWindow !== 0 ? 1 - Math.abs(i) / halfWindow : 1
        }
        coeffs.push(weight)
        sumDenom += weight
      }
      if (sumDenom !== 0) {
        for (let i = 0; i < adjSize; i++) coeffs[i] /= sumDenom
      }

      for (let b = 0; b < bars.length; b++) {
        let sum = 0
        let weightSum = 0
        // Tap i reads src[i] bars back. Taps before the first bar are na in
        // Pine and are skipped there too, so the kernel renormalises over the
        // taps that exist and the filter emits from bar 0.
        for (let i = 0; i < adjSize; i++) {
          const idx = b - i
          if (idx < 0) continue
          const price = src[idx]
          if (!Number.isFinite(price)) continue
          const w = coeffs[i]
          sum += price * w
          weightSum += w
        }
        const value = weightSum !== 0 ? sum / weightSum : NaN
        // nz(sum / weight_sum, src): a zero weight sum falls back to the source.
        out[b] = Number.isFinite(value) ? value : (Number.isFinite(src[b]) ? src[b] : NaN)
      }

      return { sgf: nulls(out) }
    },
  })
}
