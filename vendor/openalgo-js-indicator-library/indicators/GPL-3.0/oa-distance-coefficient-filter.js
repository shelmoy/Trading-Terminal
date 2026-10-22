/**
 * Ehlers Distance Coefficient Filter (EDCF) - ported to openalgo-charts from Pine Script v3.
 *
 * Source: https://github.com/everget/tradingview-pinescript-indicators/blob/60c93d3711d222b8f2db96160defe568429348e0/movings/distance_coefficient_filter.pine
 * Repo:   everget/tradingview-pinescript-indicators
 * License: GPL-3.0
 * SPDX-FileCopyrightText: (c) 2018-present Alex Orekhov (everget)
 * SPDX-FileCopyrightText: (c) 2026 marketcalls (port to openalgo-charts)
 * SPDX-License-Identifier: GPL-3.0-only
 * Copyright (c) 2018-present, Alex Orekhov (everget)
 *
 * Each bar in the window is weighted by how far it sits from every other bar in
 * the window, so prices that stand apart from the crowd pull the average
 * towards themselves and a quiet cluster is smoothed away.
 */

export default function ({ registerIndicator, sourceValues, nulls }) {
  registerIndicator({
    id: 'oa-distance-coefficient-filter',
    name: 'Distance Coefficient Filter (EDCF)',
    category: 'Moving Averages',
    placement: 'onchart',

    inputs: [
      { key: 'length', type: 'number', label: 'Length', default: 14, min: 2, max: 500, step: 1 },
      { key: 'source', type: 'source', label: 'Source', default: 'hl2' },
    ],

    plots: [{ key: 'dcf', type: 'line', title: 'EDCF', style: { color: '#6d1e7f', lineWidth: 2 } }],

    calc(bars, settings) {
      // A cleared number field arrives as '', and Number('') is 0. The floor is
      // 2 because at length 1 the Pine inner loop counts downwards instead of
      // not running, which is a quirk of the language rather than the filter.
      const length = Math.max(2, Math.floor(Number(settings.length) || 14))
      const src = sourceValues(bars, settings.source ?? 'hl2')
      const n = bars.length

      // distance[j] is the squared distance from bar j to the length-1 bars
      // below it. It depends only on j, so it is computed once rather than
      // once per (bar, offset) pair as the nested Pine loops do.
      const distance = new Array(n).fill(NaN)
      for (let j = length - 1; j < n; j++) {
        let sum = 0
        let ok = Number.isFinite(src[j])
        for (let lookback = 1; ok && lookback <= length - 1; lookback++) {
          const other = src[j - lookback]
          if (!Number.isFinite(other)) {
            ok = false
            break
          }
          const diff = src[j] - other
          sum += diff * diff
        }
        if (ok) distance[j] = sum
      }

      const out = new Array(n).fill(NaN)
      // The deepest lookback is count + lookback = (length-1) + (length-1), so
      // nothing is defined before bar 2*length-2. Pine leaves those bars na and
      // its ternary then plots a literal 0.0; on a price overlay that is a line
      // dropped to the axis, so they stay empty here.
      for (let i = 2 * length - 2; i < n; i++) {
        let srcSum = 0
        let coefSum = 0
        let ok = true
        for (let count = 0; count < length; count++) {
          const j = i - count
          const d = distance[j]
          const v = src[j]
          if (!Number.isFinite(d) || !Number.isFinite(v)) {
            ok = false
            break
          }
          srcSum += d * v
          coefSum += d
        }
        if (!ok) continue
        // A perfectly flat window makes every distance zero. Pine returns 0.0
        // there; a gap is left instead for the same reason as the warmup.
        if (coefSum === 0) continue
        out[i] = srcSum / coefSum
      }

      return { dcf: nulls(out) }
    },
  })
}
