/**
 * Bollinger %B - ported to openalgo-charts from Pine Script v6.
 *
 * Source: https://github.com/mihakralj/pinescript/blob/c4e91b962be09733d8fc76caa5191e9e586c5cee/indicators/oscillators/bbb.pine
 * Repo:   mihakralj/pinescript
 * License: MIT
 * SPDX-FileCopyrightText: (c) mihakralj
 * SPDX-FileCopyrightText: (c) 2026 marketcalls (port to openalgo-charts)
 * SPDX-License-Identifier: MIT
 *
 * Where price sits inside its own Bollinger Band, scaled so 0 is the lower band
 * and 1 the upper. It overshoots freely outside the band, which is the point.
 */

export default function ({ registerIndicator, sourceValues, nulls }) {
  registerIndicator({
    id: 'oa-bbb',
    name: 'Bollinger %B',
    category: 'Oscillators',
    placement: 'pane',

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
        tooltip: 'Band half-width as a multiple of the standard deviation of the source.',
      },
    ],

    plots: [{ key: 'bbb', type: 'line', title: 'Bollinger %B', style: { color: '#ffeb3b', lineWidth: 2 } }],

    levels: () => [
      { price: 1, title: 'Upper Band Level', color: '#787b86', dashed: true },
      { price: 0.8, title: 'Overbought', color: '#ef5350', dashed: true },
      { price: 0.5, title: 'Midline', color: '#787b86' },
      { price: 0.2, title: 'Oversold', color: '#26a69a', dashed: true },
      { price: 0, title: 'Lower Band Level', color: '#787b86', dashed: true },
    ],

    calc(bars, settings) {
      // A cleared number field arrives as '', and Number('') is 0.
      const period = Math.max(1, Math.floor(Number(settings.period) || 20))
      const multiplier = Math.max(0.001, Number(settings.multiplier) || 2)
      const src = sourceValues(bars, settings.source ?? 'close')
      const n = bars.length

      const out = new Array(n).fill(NaN)

      // Pine keeps a circular buffer seeded with na, so the window expands over
      // the first `period` bars and the mean divides by the count so far, not by
      // the period. That is why %B has no blank warmup here.
      const buffer = new Array(period).fill(NaN)
      let head = 0
      let count = 0
      let sum = 0
      let sumSq = 0

      for (let i = 0; i < n; i++) {
        const s = src[i]
        if (!Number.isFinite(s)) continue

        const oldest = buffer[head]
        if (Number.isFinite(oldest)) {
          sum -= oldest
          sumSq -= oldest * oldest
        } else {
          count += 1
        }

        sum += s
        sumSq += s * s
        buffer[head] = s
        head = (head + 1) % period

        const k = Math.max(1, count)
        const basis = sum / k
        const variance = Math.max(0, sumSq / k - basis * basis)
        const stddev = Math.sqrt(variance)
        const dev = multiplier * stddev

        const upper = basis + dev
        const lower = basis - dev
        const bandWidth = upper - lower

        // A flat window gives a zero-width band; Pine reports the midpoint.
        out[i] = bandWidth > 0 ? (s - lower) / bandWidth : 0.5
      }

      return { bbb: nulls(out) }
    },
  })
}
