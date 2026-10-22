/**
 * Adaptive Price Zone (APZ) - ported to openalgo-charts from Pine Script v6.
 *
 * Source: https://github.com/mihakralj/pinescript/blob/c4e91b962be09733d8fc76caa5191e9e586c5cee/indicators/channels/apz.pine
 * Repo:   mihakralj/pinescript
 * License: MIT (c) mihakralj
 * SPDX-FileCopyrightText: (c) mihakralj
 * SPDX-FileCopyrightText: (c) 2026 marketcalls (port to openalgo-charts)
 * SPDX-License-Identifier: MIT
 *
 * A double smoothed exponential average of price carries a band whose width is
 * the same double smoothing applied to the bar range, so the zone widens on
 * expansion and contracts in quiet trade.
 */

export default function ({ registerIndicator, sourceValues, nulls }) {
  registerIndicator({
    id: 'oa-apz',
    name: 'Adaptive Price Zone',
    category: 'Channels',
    placement: 'onchart',

    inputs: [
      { key: 'period', type: 'number', label: 'Period', default: 20, min: 1, max: 5000, step: 1 },
      {
        key: 'bandPct',
        type: 'number',
        label: 'Band Multiplier',
        default: 2,
        min: 0.001,
        max: 100,
        step: 0.1,
        tooltip: 'Band distance as a multiple of the double smoothed bar range.',
      },
      { key: 'source', type: 'source', label: 'Source', default: 'close' },
    ],

    plots: [
      { key: 'middle', type: 'line', title: 'Middle', style: { color: '#ffeb3b', lineWidth: 2 } },
      { key: 'upper', type: 'line', title: 'Upper', style: { color: '#ffeb3b', lineWidth: 1 } },
      { key: 'lower', type: 'line', title: 'Lower', style: { color: '#ffeb3b', lineWidth: 1 } },
    ],

    fills: [{ between: ['upper', 'lower'], colorUp: '#ffeb3b', colorDown: '#ffeb3b', opacity: 0.1 }],

    calc(bars, settings) {
      // A cleared number field arrives as '', and Number('') is 0.
      const period = Math.min(5000, Math.max(1, Math.floor(Number(settings.period) || 20)))
      const bandPct = Math.max(0.001, Number(settings.bandPct) || 2)
      const src = sourceValues(bars, settings.source ?? 'close')

      // Pine applies the square root to the period, then the standard EMA alpha.
      const smoothPeriod = Math.sqrt(period)
      const alpha = 2 / (smoothPeriod + 1)
      const beta = 1 - alpha

      const middle = new Array(bars.length).fill(NaN)
      const upper = new Array(bars.length).fill(NaN)
      const lower = new Array(bars.length).fill(NaN)

      // All four exponential stages start at zero and the compensator below
      // undoes the resulting warmup bias, exactly as the source does, so a
      // value is emitted from the first bar.
      let ema1Price = 0
      let ema2Price = 0
      let ema1Range = 0
      let ema2Range = 0
      let e = 1
      let warmup = true

      for (let i = 0; i < bars.length; i++) {
        const bar = bars[i]
        const price = Number.isFinite(src[i]) ? src[i] : 0
        const rawRange = bar.high - bar.low
        const barRange = Number.isFinite(rawRange) ? rawRange : 0

        ema1Price = alpha * price + beta * ema1Price
        ema2Price = alpha * ema1Price + beta * ema2Price

        ema1Range = alpha * barRange + beta * ema1Range
        ema2Range = alpha * ema1Range + beta * ema2Range

        let mid = ema2Price
        let adaptiveRange = ema2Range

        if (warmup) {
          // Compound compensation for the two nested exponential stages.
          e *= beta * beta
          const compensator = 1 - e !== 0 ? 1 / (1 - e) : 1
          mid = compensator * ema2Price
          adaptiveRange = compensator * ema2Range
          warmup = e > 1e-10
        }

        const width = bandPct * adaptiveRange
        middle[i] = mid
        upper[i] = mid + width
        lower[i] = mid - width
      }

      return { middle: nulls(middle), upper: nulls(upper), lower: nulls(lower) }
    },
  })
}
