/**
 * Variance, Dispersion or Spread (VARIANCE) - ported to openalgo-charts from Pine Script v6.
 *
 * Source: https://github.com/mihakralj/pinescript/blob/c4e91b962be09733d8fc76caa5191e9e586c5cee/indicators/statistics/variance.pine
 * Repo:   mihakralj/pinescript
 * License: MIT (c) mihakralj
 * SPDX-FileCopyrightText: (c) mihakralj
 * SPDX-FileCopyrightText: (c) 2026 marketcalls (port to openalgo-charts)
 * SPDX-License-Identifier: MIT
 *
 * The population variance of the source over the lookback, computed from a
 * running sum and sum of squares, so it reports how widely price has been
 * spread around its own mean rather than which way it moved.
 */

export default function ({ registerIndicator, sourceValues, nulls }) {
  registerIndicator({
    id: 'oa-variance',
    name: 'Variance, Dispersion or Spread (VARIANCE)',
    category: 'Statistics',
    placement: 'pane',

    inputs: [
      { key: 'period', type: 'number', label: 'Period', default: 14, min: 1, max: 5000, step: 1 },
      { key: 'source', type: 'source', label: 'Source', default: 'close' },
    ],

    plots: [{ key: 'variance', type: 'line', title: 'Var', style: { color: '#ffeb3b', lineWidth: 2 } }],

    calc(bars, settings) {
      // A cleared number field arrives as '', and Number('') is 0.
      const period = Math.max(1, Math.floor(Number(settings.period) || 14))
      const src = sourceValues(bars, settings.source ?? 'close')

      const n = bars.length
      const out = new Array(n).fill(NaN)

      // Pine keeps a circular buffer of exactly p slots, all na to begin with,
      // and a count that grows as the window fills. The average is therefore
      // taken over however many samples have arrived, and a single sample
      // reports 0 rather than an undefined variance.
      const p = Math.max(1, period)
      const buffer = new Array(p).fill(NaN)
      let head = 0
      let count = 0
      let sum = 0
      let sumSq = 0

      for (let i = 0; i < n; i++) {
        const oldest = buffer[head]
        if (Number.isFinite(oldest)) {
          sum -= oldest
          sumSq -= oldest * oldest
          count -= 1
        }
        // nz(src): a missing source counts as 0 and still fills a slot.
        const value = Number.isFinite(src[i]) ? src[i] : 0
        sum += value
        sumSq += value * value
        count += 1
        buffer[head] = value
        head = (head + 1) % p

        // The naive sum-of-squares form can go slightly negative on a flat
        // window, which is why the source clamps it at zero.
        const mean = sum / count
        out[i] = count > 1 ? Math.max(0, sumSq / count - mean * mean) : 0
      }

      return { variance: nulls(out) }
    },
  })
}
