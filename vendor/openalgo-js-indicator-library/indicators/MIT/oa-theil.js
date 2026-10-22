/**
 * Theil Index (THEIL) - ported to openalgo-charts from Pine Script v6.
 *
 * Source: https://github.com/mihakralj/pinescript/blob/c4e91b962be09733d8fc76caa5191e9e586c5cee/indicators/statistics/theil.pine
 * Repo:   mihakralj/pinescript
 * License: MIT (c) mihakralj
 * SPDX-FileCopyrightText: (c) mihakralj
 * SPDX-FileCopyrightText: (c) 2026 marketcalls (port to openalgo-charts)
 * SPDX-License-Identifier: MIT
 *
 * Theil's T entropy measure of how unevenly the last N values of a positive
 * series are distributed: 0 when every value equals the window mean, rising as
 * the window becomes dominated by a few large readings.
 */

export default function ({ registerIndicator, sourceValues, nulls }) {
  registerIndicator({
    id: 'oa-theil',
    name: 'Theil Index (THEIL)',
    category: 'Statistics',
    placement: 'pane',

    inputs: [
      {
        key: 'source',
        type: 'source',
        label: 'Source (must be positive values)',
        default: 'close',
      },
      {
        key: 'length',
        type: 'number',
        label: 'Lookback Period',
        default: 14,
        min: 1,
        max: 5000,
        step: 1,
      },
    ],

    plots: [
      { key: 'theil', type: 'line', title: 'Theil T Index', style: { color: '#ffeb3b', lineWidth: 2 } },
    ],

    calc(bars, settings) {
      // A cleared number field arrives as '', and Number('') is 0.
      const length = Math.max(1, Math.floor(Number(settings.length) || 14))
      const src = sourceValues(bars, settings.source ?? 'close')
      const out = new Array(bars.length).fill(NaN)

      for (let i = 0; i < bars.length; i++) {
        // Pine reads src[0] .. src[length - 1], newest first; bars before the
        // first bar are na. Summing in that same order keeps the rounding equal.
        let sum = 0
        let nValid = 0
        const start = Math.max(0, i - length + 1)
        for (let k = i; k >= start; k--) {
          const v = src[k]
          if (!Number.isFinite(v) || v <= 0) continue
          sum += v
          nValid += 1
        }
        // The source writes these guards as bare na expressions, which Pine does
        // not treat as early returns, but na is what they mean and what the
        // arithmetic would otherwise produce.
        if (nValid === 0) continue
        const mean = sum / nValid
        if (!(mean > 0)) continue

        let theilSum = 0
        for (let k = i; k >= start; k--) {
          const v = src[k]
          if (!Number.isFinite(v) || v <= 0) continue
          const ratio = v / mean
          if (ratio > 0) theilSum += ratio * Math.log(ratio)
        }
        out[i] = theilSum / nValid
      }

      return { theil: nulls(out) }
    },
  })
}
