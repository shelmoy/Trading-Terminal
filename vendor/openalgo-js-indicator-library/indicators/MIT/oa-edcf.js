/**
 * EDCF: Ehlers Distance Coefficient Filter - ported to openalgo-charts from Pine Script v6.
 *
 * Source: https://github.com/mihakralj/pinescript/blob/c4e91b962be09733d8fc76caa5191e9e586c5cee/indicators/filters/edcf.pine
 * Repo:   mihakralj/pinescript
 * License: MIT (c) mihakralj
 * SPDX-FileCopyrightText: (c) mihakralj
 * SPDX-FileCopyrightText: (c) 2026 marketcalls (port to openalgo-charts)
 * SPDX-License-Identifier: MIT
 *
 * A finite impulse response filter whose weights are each sample's summed
 * squared distance from every other sample in the window. Flat stretches weight
 * evenly and degenerate to an SMA, while a sharp move gives the bars around it
 * far more weight, so the filter turns quickly and then settles.
 */

export default function ({ registerIndicator, sourceValues, nulls }) {
  registerIndicator({
    id: 'oa-edcf',
    name: 'EDCF: Ehlers Distance Coefficient Filter',
    category: 'Filters',
    placement: 'onchart',

    inputs: [
      {
        key: 'length',
        type: 'number',
        label: 'Length',
        default: 15,
        min: 2,
        max: 50,
        step: 1,
        tooltip: 'Filter window length. Larger = smoother but more lag.',
      },
      // The source's input.string listed Close, HL2, HLC3, OHLC4, Open, High
      // and Low: the chart's own source control offers exactly those, so the
      // hand-rolled selector is not needed.
      { key: 'source', type: 'source', label: 'Source', default: 'hl2' },
    ],

    plots: [{ key: 'edcf', type: 'line', title: 'EDCF', style: { color: '#ffeb3b', lineWidth: 2 } }],

    calc(bars, settings) {
      // A cleared number field arrives as '', and Number('') is 0.
      const length = Math.min(50, Math.max(2, Math.floor(Number(settings.length) || 15)))
      const src = sourceValues(bars, settings.source || 'hl2')
      const n = bars.length

      // The inner sum reaches back (length - 1) + (length - 1) bars. Before that
      // Pine's history reads are na, the coefficient sum is na, and the guard
      // `sumCoef != 0.0` is false, so the source plots the raw price. The port
      // keeps that fallback rather than inventing a different warmup.
      const maxBack = 2 * (length - 1)
      const out = new Array(n).fill(NaN)

      for (let i = 0; i < n; i++) {
        const price = src[i]
        if (i < maxBack) {
          out[i] = price
          continue
        }

        let sumCoef = 0
        let num = 0
        let usable = true
        for (let count = 0; count < length && usable; count++) {
          const p0 = src[i - count]
          if (!Number.isFinite(p0)) {
            usable = false
            break
          }
          let dist2 = 0
          for (let lookBack = 1; lookBack < length; lookBack++) {
            const back = src[i - count - lookBack]
            if (!Number.isFinite(back)) {
              usable = false
              break
            }
            const diff = p0 - back
            dist2 += diff * diff
          }
          if (!usable) break
          // The distance-squared value is itself the coefficient.
          sumCoef += dist2
          num += dist2 * p0
        }

        // A flat window makes every distance zero: fall back to the price, as
        // the source does, rather than dividing by zero.
        out[i] = usable && sumCoef !== 0 ? num / sumCoef : price
      }

      return { edcf: nulls(out) }
    },
  })
}
