/**
 * Quantile (QUANTILE) - ported to openalgo-charts from Pine Script v6.
 *
 * Source: https://github.com/mihakralj/pinescript/blob/c4e91b962be09733d8fc76caa5191e9e586c5cee/indicators/statistics/quantile.pine
 * Repo:   mihakralj/pinescript
 * License: MIT (c) mihakralj
 * SPDX-FileCopyrightText: (c) mihakralj
 * SPDX-FileCopyrightText: (c) 2026 marketcalls (port to openalgo-charts)
 * SPDX-License-Identifier: MIT
 *
 * The requested quantile of the source over the lookback window, taken from
 * the sorted window with linear interpolation between the two neighbouring
 * ranks. Level 0.5 is the rolling median, 0 the window low and 1 the high.
 */

export default function ({ registerIndicator, sourceValues, nulls }) {
  registerIndicator({
    id: 'oa-quantile',
    name: 'Quantile (QUANTILE)',
    category: 'Statistics',
    placement: 'onchart',

    inputs: [
      { key: 'source', type: 'source', label: 'Source', default: 'close' },
      { key: 'length', type: 'number', label: 'Period', default: 14, min: 1, max: 1000, step: 1 },
      {
        key: 'quantileLevel',
        type: 'number',
        label: 'Quantile Level (0.0-1.0)',
        default: 0.25,
        min: 0,
        max: 1,
        step: 0.01,
        tooltip: 'Rank within the sorted window: 0 is the lowest value, 0.5 the median, 1 the highest.',
      },
    ],

    plots: [
      { key: 'quantile', type: 'line', title: 'Quantile', style: { color: '#ffeb3b', lineWidth: 2 } },
    ],

    calc(bars, settings) {
      // A cleared number field arrives as '', and Number('') is 0. Zero is a
      // legal quantile level, so an empty field is told apart from a typed 0.
      const length = Math.max(1, Math.floor(Number(settings.length) || 14))
      const rawLevel = settings.quantileLevel
      const parsedLevel = Number(rawLevel)
      const qLevel =
        rawLevel === '' || rawLevel == null || !Number.isFinite(parsedLevel)
          ? 0.25
          : Math.min(1, Math.max(0, parsedLevel))

      const src = sourceValues(bars, settings.source ?? 'close')

      const out = new Array(bars.length).fill(NaN)
      const window = []
      for (let i = 0; i < bars.length; i++) {
        // Pine skips every na tap, so a partial window at the left edge of the
        // chart is ranked over the bars that exist rather than left blank.
        window.length = 0
        const from = Math.max(0, i - length + 1)
        for (let j = from; j <= i; j++) {
          if (Number.isFinite(src[j])) window.push(src[j])
        }

        const n = window.length
        if (n === 0) continue
        if (n === 1) {
          out[i] = window[0]
          continue
        }

        window.sort((a, b) => a - b)
        if (qLevel === 0) {
          out[i] = window[0]
          continue
        }
        if (qLevel === 1) {
          out[i] = window[n - 1]
          continue
        }

        const rank = qLevel * (n - 1)
        const kFloor = Math.floor(rank)
        const kCeil = Math.ceil(rank)
        if (kFloor === kCeil) {
          out[i] = window[kFloor]
          continue
        }
        const valFloor = window[kFloor]
        const valCeil = window[kCeil]
        out[i] = valFloor + (rank - kFloor) * (valCeil - valFloor)
      }

      return { quantile: nulls(out) }
    },
  })
}
