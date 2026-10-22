/**
 * Distance Weighted Moving Average (DWMA) - ported to openalgo-charts from Pine Script v3.
 *
 * Source: https://github.com/everget/tradingview-pinescript-indicators/blob/60c93d3711d222b8f2db96160defe568429348e0/movings/distance_weighted_moving_average.pine
 * Repo:   everget/tradingview-pinescript-indicators
 * License: GPL-3.0 (c) 2019-present Alex Orekhov (everget)
 * SPDX-FileCopyrightText: (c) 2018-present Alex Orekhov (everget)
 * SPDX-FileCopyrightText: (c) 2026 marketcalls (port to openalgo-charts)
 * SPDX-License-Identifier: GPL-3.0-only
 *
 * Each bar in the window is weighted by the inverse of its total distance to
 * every other bar in the window, so prices clustered together dominate the
 * average and an isolated spike is weighted almost out of it.
 */

export default function ({ registerIndicator, sourceValues, nulls }) {
  const GREEN = '#4CAF50'
  const RED = '#FF5252'
  const PLAIN = '#6d1e7f'

  registerIndicator({
    id: 'oa-distance-weighted-moving-average',
    name: 'Distance Weighted Moving Average (DWMA)',
    category: 'Moving Averages',
    placement: 'onchart',

    inputs: [
      { key: 'length', type: 'number', label: 'Length', default: 14, min: 1, max: 1000, step: 1 },
      {
        key: 'highlightMovements',
        type: 'boolean',
        label: 'Highlight Movements ?',
        default: true,
        tooltip: 'Colour the line green while it rises and red while it falls instead of a single colour.',
      },
      { key: 'source', type: 'source', label: 'Source', default: 'close' },
    ],

    plots: [
      {
        key: 'dwma',
        type: 'line',
        title: 'DWMA',
        style: { color: PLAIN, lineWidth: 2 },
        colorBy: ({ index, values, settings }) => {
          if (settings.highlightMovements === false) return PLAIN
          const cur = values.dwma[index]
          const prev = index > 0 ? values.dwma[index - 1] : undefined
          if (!Number.isFinite(cur) || !Number.isFinite(prev)) return RED
          return cur > prev ? GREEN : RED
        },
      },
    ],

    calc(bars, settings) {
      // A cleared number field arrives as '', and Number('') is 0.
      const length = Math.max(1, Math.floor(Number(settings.length) || 14))
      const src = sourceValues(bars, settings.source ?? 'close')

      const n = bars.length
      const out = new Array(n).fill(NaN)

      // The window is sorted once per bar so the sum of absolute distances from
      // each member to every other member falls out of a prefix sum, which turns
      // the source's O(length^2) double loop into O(length log length) per bar
      // without changing a single weight.
      const window = new Array(length)
      const prefix = new Array(length + 1)

      for (let i = 0; i < n; i++) {
        // Pine's nz() reads the bars before the first one as zero, which drags
        // the average to a small fraction of price until the window is full.
        // Those bars are a warmup gap here instead: see the recorded gap.
        if (i < length - 1) continue

        let usable = true
        for (let k = 0; k < length; k++) {
          const v = src[i - k]
          if (!Number.isFinite(v)) { usable = false; break }
          window[k] = v
        }
        if (!usable) continue

        window.sort((a, b) => a - b)

        // Every distance is zero when the whole window is one value, and 1/0 is
        // the divide the flat series would blow up on. The average of a constant
        // window is that constant, which is the limit the weights approach.
        if (window[0] === window[length - 1]) {
          out[i] = window[0]
          continue
        }

        prefix[0] = 0
        for (let p = 0; p < length; p++) prefix[p + 1] = prefix[p] + window[p]
        const total = prefix[length]

        let weightedSum = 0
        let weightSum = 0
        for (let p = 0; p < length; p++) {
          const v = window[p]
          // Distance to everything below plus distance to everything above.
          const distanceSum = (p * v - prefix[p]) + (total - prefix[p + 1] - (length - 1 - p) * v)
          if (!(distanceSum > 0)) continue
          const weight = 1 / distanceSum
          weightedSum += v * weight
          weightSum += weight
        }

        if (weightSum > 0 && Number.isFinite(weightedSum)) out[i] = weightedSum / weightSum
      }

      return { dwma: nulls(out) }
    },
  })
}
