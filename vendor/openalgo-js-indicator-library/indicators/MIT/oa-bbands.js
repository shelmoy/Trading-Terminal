/**
 * Bollinger Bands (BBANDS) - ported to openalgo-charts from Pine Script v6.
 *
 * Source: https://github.com/mihakralj/pinescript/blob/c4e91b962be09733d8fc76caa5191e9e586c5cee/indicators/channels/bbands.pine
 * Repo:   mihakralj/pinescript
 * License: MIT (c) mihakralj
 * SPDX-FileCopyrightText: (c) mihakralj
 * SPDX-FileCopyrightText: (c) 2026 marketcalls (port to openalgo-charts)
 * SPDX-License-Identifier: MIT
 *
 * A simple moving average with bands a multiple of the population standard
 * deviation away, so the channel breathes with the dispersion of the source.
 */

export default function ({ registerIndicator, sourceValues, nulls }) {
  registerIndicator({
    id: 'oa-bbands',
    name: 'Bollinger Bands (BBANDS)',
    category: 'Channels',
    placement: 'onchart',

    inputs: [
      { key: 'period', type: 'number', label: 'Period', default: 20, min: 1, max: 5000, step: 1 },
      { key: 'source', type: 'source', label: 'Source', default: 'close' },
      {
        key: 'multiplier',
        type: 'number',
        label: 'StdDev Multiplier',
        default: 2,
        min: 0.001,
        max: 100,
        step: 0.1,
      },
    ],

    plots: [
      { key: 'basis', type: 'line', title: 'Basis', style: { color: '#ffeb3b', lineWidth: 2 } },
      { key: 'upper', type: 'line', title: 'Upper', style: { color: '#ffeb3b', lineWidth: 2 } },
      { key: 'lower', type: 'line', title: 'Lower', style: { color: '#ffeb3b', lineWidth: 2 } },
    ],

    fills: [{ between: ['upper', 'lower'], colorUp: '#2962ff', colorDown: '#2962ff', opacity: 0.1 }],

    calc(bars, settings) {
      // A cleared number field arrives as '', and Number('') is 0.
      const period = Math.max(1, Math.floor(Number(settings.period) || 20))
      const multiplier = Math.max(0.001, Number(settings.multiplier) || 2)
      const src = sourceValues(bars, settings.source ?? 'close')

      const basis = new Array(bars.length).fill(NaN)
      const upper = new Array(bars.length).fill(NaN)
      const lower = new Array(bars.length).fill(NaN)

      // Pine fills a circular buffer with running sums, so the average and the
      // deviation are taken over however many values exist. There is no warmup
      // gap: bar 0 plots the source itself with a zero-width band, and the
      // window only reaches its full length after `period` bars.
      const buffer = new Array(period).fill(NaN)
      let head = 0
      let count = 0
      let sum = 0
      let sumSq = 0

      for (let i = 0; i < bars.length; i++) {
        const oldest = buffer[head]
        if (Number.isFinite(oldest)) {
          sum -= oldest
          sumSq -= oldest * oldest
          count -= 1
        }
        // nz(source): a non-finite source reads as 0.
        const value = Number.isFinite(src[i]) ? src[i] : 0
        sum += value
        sumSq += value * value
        count += 1
        buffer[head] = value
        head = (head + 1) % period

        let mid = count > 0 ? sum / count : NaN
        if (!Number.isFinite(mid)) mid = Number.isFinite(src[i]) ? src[i] : NaN
        if (!Number.isFinite(mid)) continue

        // Population variance, floored at zero: the subtraction can go slightly
        // negative on a flat series.
        const dev = count > 1 ? multiplier * Math.sqrt(Math.max(0, sumSq / count - mid * mid)) : 0

        basis[i] = mid
        upper[i] = mid + dev
        lower[i] = mid - dev
      }

      return { basis: nulls(basis), upper: nulls(upper), lower: nulls(lower) }
    },
  })
}
