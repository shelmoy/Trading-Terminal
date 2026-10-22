/**
 * Hampel Filter (HF) - ported to openalgo-charts from Pine Script v4.
 *
 * Source: https://github.com/everget/tradingview-pinescript-indicators/blob/60c93d3711d222b8f2db96160defe568429348e0/movings/hampel_filter.pine
 * Repo:   everget/tradingview-pinescript-indicators
 * License: GPL-3.0 (c) 2018-present, Alex Orekhov (everget)
 * SPDX-FileCopyrightText: (c) 2018-present Alex Orekhov (everget)
 * SPDX-FileCopyrightText: (c) 2026 marketcalls (port to openalgo-charts)
 * SPDX-License-Identifier: GPL-3.0-only
 *
 * Replaces any sample that sits further than a set multiple of the median
 * absolute deviation from the rolling median with that median, then averages the
 * cleaned series, so a single spike is discarded instead of being smoothed in.
 */

export default function ({ registerIndicator, sourceValues, percentileNearestRank, nulls }) {
  // Pine's ta.ema: the seed is the simple average of the first `period` values
  // that are not na, and from there alpha = 2 / (period + 1). The shared
  // smaSeededEma() seeds from the first `period` slots whatever they hold, so it
  // cannot be used on the filtered series, which begins na while the rolling
  // median is still warming up.
  const seededEma = (values, period) => {
    const n = values.length
    const out = new Array(n).fill(NaN)
    const alpha = 2 / (period + 1)
    let seedSum = 0
    let seedCount = 0
    let prev = NaN
    for (let i = 0; i < n; i++) {
      const v = values[i]
      if (!Number.isFinite(v)) continue
      if (!Number.isFinite(prev)) {
        seedSum += v
        seedCount += 1
        if (seedCount >= period) {
          prev = seedSum / period
          out[i] = prev
        }
        continue
      }
      prev = v * alpha + prev * (1 - alpha)
      out[i] = prev
    }
    return out
  }

  registerIndicator({
    id: 'oa-hampel-filter',
    name: 'Hampel Filter (HF)',
    category: 'Moving Averages',
    placement: 'onchart',

    inputs: [
      { key: 'length', type: 'number', label: 'Length', default: 14, min: 1, max: 5000, step: 1 },
      {
        key: 'scalingFactor',
        type: 'number',
        label: 'Scaling Factor',
        default: 3,
        min: 0.1,
        max: 100,
        step: 0.1,
        tooltip: 'How many median absolute deviations a sample may sit from the median before it is replaced by it.',
      },
      { key: 'source', type: 'source', label: 'Source', default: 'close' },
    ],

    plots: [{ key: 'hf', type: 'line', title: 'HF', style: { color: '#6d1e7f', lineWidth: 2 } }],

    calc(bars, settings) {
      // A cleared number field arrives as '', and Number('') is 0.
      const length = Math.max(1, Math.floor(Number(settings.length) || 14))
      const scalingFactor = Math.max(0.1, Number(settings.scalingFactor) || 3)
      const src = sourceValues(bars, settings.source || 'close')
      const n = bars.length

      // Pine's _median is percentile_nearest_rank at 50.
      const median = percentileNearestRank(src, length, 50)

      const absDeviation = new Array(n).fill(NaN)
      for (let i = 0; i < n; i++) {
        if (!Number.isFinite(src[i]) || !Number.isFinite(median[i])) continue
        absDeviation[i] = Math.abs(src[i] - median[i])
      }
      const mad = percentileNearestRank(absDeviation, length, 50)

      // Pine compares against na as false, so a bar whose median absolute
      // deviation is not available yet keeps the median rather than the sample.
      const filtered = new Array(n).fill(NaN)
      for (let i = 0; i < n; i++) {
        if (!Number.isFinite(median[i])) continue
        const deviation = Number.isFinite(absDeviation[i]) ? absDeviation[i] : NaN
        const inside = Number.isFinite(deviation) && Number.isFinite(mad[i]) && deviation <= scalingFactor * mad[i]
        filtered[i] = inside ? src[i] : median[i]
      }

      return { hf: nulls(seededEma(filtered, length)) }
    },
  })
}
