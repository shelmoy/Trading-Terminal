/**
 * Ehlers Distance Coefficient Filter (EDCF) - ported to openalgo-charts from Pine Script v3.
 *
 * Source: https://github.com/everget/tradingview-pinescript-indicators/blob/60c93d3711d222b8f2db96160defe568429348e0/movings/ehlers_distance_coefficient_filter.pine
 * Repo:   everget/tradingview-pinescript-indicators
 * License: GPL-3.0, Copyright (c) 2018-present, Alex Orekhov (everget)
 * SPDX-FileCopyrightText: (c) 2018-present Alex Orekhov (everget)
 * SPDX-FileCopyrightText: (c) 2026 marketcalls (port to openalgo-charts)
 * SPDX-License-Identifier: GPL-3.0-only
 *
 * A weighted average whose weight for each bar in the window is the summed
 * squared distance between that bar and every other bar in the window, so
 * prices that stand apart from the rest of the window count for more.
 */

export default function ({ registerIndicator, sourceValues, nulls }) {
  registerIndicator({
    id: 'oa-ehlers-distance-coefficient-filter',
    name: 'Ehlers Distance Coefficient Filter (EDCF)',
    category: 'Moving Averages',
    placement: 'onchart',

    inputs: [
      {
        key: 'length',
        type: 'number',
        label: 'Length',
        default: 14,
        min: 2,
        max: 500,
        step: 1,
        tooltip: 'Window size. The filter needs twice this many bars less two before it can report a value.',
      },
      { key: 'source', type: 'source', label: 'Source', default: 'hl2' },
    ],

    plots: [{ key: 'dcf', type: 'line', title: 'EDCF', style: { color: '#6d1e7f', lineWidth: 2 } }],

    calc(bars, settings) {
      // A cleared number field arrives as '', and Number('') is 0. The floor of
      // 2 keeps the inner distance loop from collapsing to an empty sum.
      const length = Math.max(2, Math.min(500, Math.floor(Number(settings.length) || 14)))
      const src = sourceValues(bars, settings.source ?? 'hl2')
      const len = bars.length
      const out = new Array(len).fill(NaN)

      // The deepest reference is src[(length - 1) + (length - 1)], so nothing
      // can be computed until that many bars exist. In Pine those bars read as
      // na and the na propagates out of the sums.
      const warmup = 2 * (length - 1)

      for (let i = warmup; i < len; i++) {
        let srcSum = 0
        let coefSum = 0
        let ok = true

        for (let count = 0; count < length; count++) {
          const base = src[i - count]
          if (!Number.isFinite(base)) {
            ok = false
            break
          }
          let distance = 0
          for (let lookback = 1; lookback < length; lookback++) {
            const back = src[i - count - lookback]
            if (!Number.isFinite(back)) {
              ok = false
              break
            }
            const diff = base - back
            distance += diff * diff
          }
          if (!ok) break
          srcSum += distance * base
          coefSum += distance
        }

        if (!ok) continue
        // A perfectly flat window makes every distance zero. Pine substitutes
        // 0.0 there; on a price pane that would drag the scale to the axis, so
        // the bar is left as a gap instead.
        if (Number.isFinite(coefSum) && coefSum !== 0) out[i] = srcSum / coefSum
      }

      return { dcf: nulls(out) }
    },
  })
}
