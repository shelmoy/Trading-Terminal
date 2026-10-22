/**
 * Hodrick-Prescott Filter (HP) - ported to openalgo-charts from Pine Script v6.
 *
 * Source: https://github.com/mihakralj/pinescript/blob/c4e91b962be09733d8fc76caa5191e9e586c5cee/indicators/filters/hp.pine
 * Repo:   mihakralj/pinescript
 * License: MIT (c) mihakralj
 * SPDX-FileCopyrightText: (c) mihakralj
 * SPDX-FileCopyrightText: (c) 2026 marketcalls (port to openalgo-charts)
 * SPDX-License-Identifier: MIT
 *
 * A causal, one-pass approximation of the Hodrick-Prescott trend: lambda sets
 * how hard the trend is pulled toward a straight line, and the cycle is what is
 * left of the source once that trend is removed.
 */

export default function ({ registerIndicator, sourceValues, nulls }) {
  registerIndicator({
    id: 'oa-hp',
    name: 'Hodrick-Prescott Filter (HP)',
    category: 'Filters',
    // The script declares overlay = false and force_overlay = true on the trend
    // only, so the study owns a pane for the cycle and sends the trend to price.
    placement: 'pane',

    inputs: [
      { key: 'source', type: 'source', label: 'Source', default: 'close' },
      {
        key: 'lambda',
        type: 'number',
        label: 'Lambda (Smoothing)',
        default: 677,
        min: 0.1,
        max: 1000000,
        step: 10,
        tooltip: 'Higher lambda gives a stiffer trend and pushes more of the move into the cycle.',
      },
    ],

    plots: [
      { key: 'trend', type: 'line', title: 'HP Trend', style: { color: '#ffeb3b', lineWidth: 2 }, overlay: true },
      { key: 'cycle', type: 'line', title: 'HP Cycle', style: { color: '#2962ff', lineWidth: 2 } },
    ],

    calc(bars, settings) {
      // A cleared number field arrives as '', and Number('') is 0.
      const lambda = Math.max(0.1, Number(settings.lambda) || 677)
      const src = sourceValues(bars, settings.source ?? 'close')

      const root = Math.sqrt(lambda) * 0.5
      let alpha = (root - 1) / (root + 1)
      alpha = Math.max(alpha, 0.0001)
      alpha = Math.min(alpha, 0.9999)

      const trend = new Array(bars.length).fill(NaN)
      const cycle = new Array(bars.length).fill(NaN)

      for (let i = 0; i < bars.length; i++) {
        // Pine reads nz(src, 0.0) into price.
        const price = Number.isFinite(src[i]) ? src[i] : 0

        if (i === 0) {
          trend[i] = price
        } else {
          // nz(hp_trend[1], price) and nz(hp_trend[2], prev_trend): on bar 1 the
          // second-order term is zero because hp_trend[2] does not exist yet.
          const prevTrend = Number.isFinite(trend[i - 1]) ? trend[i - 1] : price
          const prevTrend2 = i >= 2 && Number.isFinite(trend[i - 2]) ? trend[i - 2] : prevTrend
          trend[i] = (1 - alpha) * price + alpha * prevTrend + 0.5 * alpha * (prevTrend - prevTrend2)
        }

        if (Number.isFinite(src[i]) && Number.isFinite(trend[i])) cycle[i] = src[i] - trend[i]
      }

      return { trend: nulls(trend), cycle: nulls(cycle) }
    },
  })
}
