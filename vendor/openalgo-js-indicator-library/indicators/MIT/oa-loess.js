/**
 * LOESS Filter - ported to openalgo-charts from Pine Script v6.
 *
 * Source: https://github.com/mihakralj/pinescript/blob/c4e91b962be09733d8fc76caa5191e9e586c5cee/indicators/filters/loess.pine
 * Repo:   mihakralj/pinescript
 * License: MIT (c) mihakralj
 * SPDX-FileCopyrightText: (c) mihakralj
 * SPDX-FileCopyrightText: (c) 2026 marketcalls (port to openalgo-charts)
 * SPDX-License-Identifier: MIT
 *
 * Fits a straight line through the window by weighted least squares, with
 * tricube weights that fade to nothing at the edges, and plots the fit at the
 * centre of the window.
 */

export default function ({ registerIndicator, sourceValues, nulls }) {
  registerIndicator({
    id: 'oa-loess',
    name: 'LOESS Filter',
    category: 'Filters',
    placement: 'onchart',

    inputs: [
      {
        key: 'length',
        type: 'number',
        label: 'Length',
        default: 7,
        min: 3,
        max: 1000,
        step: 1,
        tooltip: 'Window size, rounded down to the nearest odd number.',
      },
      { key: 'source', type: 'source', label: 'Source', default: 'close' },
    ],

    plots: [
      { key: 'loess', type: 'line', title: 'LOESS', style: { color: '#ffeb3b', lineWidth: 2 } },
    ],

    calc(bars, settings) {
      // A cleared number field arrives as '', and Number('') is 0.
      const length = Math.min(1000, Math.max(3, Math.floor(Number(settings.length) || 7)))
      const src = sourceValues(bars, settings.source ?? 'close')

      const adjLength = Math.max(3, length % 2 === 0 ? length - 1 : length)
      const halfWindow = Math.trunc(adjLength / 2)

      // Tricube kernel: w = (1 - |x|^3)^3 with x scaled to 1 at the window edge,
      // so the outermost tap always weighs exactly zero.
      const weights = new Array(adjLength)
      for (let i = -halfWindow; i <= halfWindow; i++) {
        const x = Math.abs(i) / halfWindow
        weights[i + halfWindow] = Math.pow(1 - Math.pow(x, 3), 3)
      }

      const out = new Array(bars.length).fill(NaN)
      for (let b = 0; b < bars.length; b++) {
        let xSum = 0
        let xySum = 0
        let x2Sum = 0
        let sum = 0
        let weightSum = 0

        // Tap i reads src[i] bars back and sits at x = i - halfWindow, so x
        // grows with age and the fit is read off at the window centre.
        for (let i = 0; i < adjLength; i++) {
          const idx = b - i
          if (idx < 0) continue
          const price = src[idx]
          if (!Number.isFinite(price)) continue
          const w = weights[i]
          const x = i - halfWindow
          xSum += x * w
          xySum += x * price * w
          x2Sum += x * x * w
          sum += price * w
          weightSum += w
        }

        if (weightSum === 0) {
          out[b] = Number.isFinite(src[b]) ? src[b] : NaN
          continue
        }

        const xMean = xSum / weightSum
        const yMean = sum / weightSum
        // The source computes a slope it never uses and returns the intercept,
        // which is the weighted least-squares fit evaluated at x = 0.
        const denom = x2Sum - xMean * xSum
        // Too few weighted taps leaves the normal equations singular. Pine's
        // division by zero yields na, so the line simply has no value there.
        if (denom === 0) continue
        const intercept = (yMean * x2Sum - xMean * xySum) / denom
        out[b] = Number.isFinite(intercept) ? intercept : NaN
      }

      return { loess: nulls(out) }
    },
  })
}
