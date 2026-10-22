/**
 * Elastic Volume Weighted Moving Average (EVWMA) - ported to openalgo-charts from Pine Script v4.
 *
 * Source: https://github.com/everget/tradingview-pinescript-indicators/blob/60c93d3711d222b8f2db96160defe568429348e0/movings/elastic_volume_weighted_moving_average.pine
 * Repo:   everget/tradingview-pinescript-indicators
 * License: GPL-3.0
 * SPDX-FileCopyrightText: (c) 2018-present Alex Orekhov (everget)
 * SPDX-FileCopyrightText: (c) 2026 marketcalls (port to openalgo-charts)
 * SPDX-License-Identifier: GPL-3.0-only
 * Copyright (c) 2018-present, Alex Orekhov (everget)
 *
 * A running average whose smoothing constant is the bar's share of the volume
 * traded over the lookback, so heavy bars pull the line toward price and quiet
 * bars barely move it at all.
 */

export default function ({ registerIndicator, sourceValues, rollingSum, nulls }) {
  // TradingView's own palette, so the highlight matches the source script.
  const UP = '#4CAF50'
  const DOWN = '#FF5252'
  const FLAT = '#6d1e7f'

  registerIndicator({
    id: 'oa-elastic-volume-weighted-moving-average',
    name: 'Elastic Volume Weighted Moving Average (EVWMA)',
    category: 'Moving Averages',
    placement: 'onchart',

    inputs: [
      { key: 'length', type: 'number', label: 'Length', default: 14, min: 1, max: 5000, step: 1 },
      { key: 'source', type: 'source', label: 'Source', default: 'close' },
      { key: 'highlight', type: 'boolean', label: 'Highlight ?', default: true },
    ],

    plots: [
      {
        key: 'evwma',
        type: 'line',
        title: 'EVWMA',
        style: { color: FLAT, lineWidth: 2 },
        colorBy({ value, index, values, settings }) {
          if (settings?.highlight === false) return FLAT
          const series = values?.evwma
          const prev = index > 0 && series ? series[index - 1] : null
          // Pine compares against na on the first valid bar, which is false, so
          // that bar takes the down colour.
          if (!Number.isFinite(prev)) return DOWN
          return value > prev ? UP : DOWN
        },
      },
    ],

    calc(bars, settings) {
      // A cleared number field arrives as '', and Number('') is 0.
      const length = Math.max(1, Math.floor(Number(settings.length) || 14))
      const src = sourceValues(bars, settings.source ?? 'close')
      const n = bars.length

      // Index series carry no volume at all, so guard rather than divide blind.
      const volume = new Array(n)
      for (let i = 0; i < n; i++) {
        const v = bars[i].volume
        volume[i] = Number.isFinite(v) ? v : NaN
      }
      const volumeSum = rollingSum(volume, length)

      const out = new Array(n).fill(NaN)
      let prev = NaN
      for (let i = 0; i < n; i++) {
        const total = volumeSum[i]
        const vol = volume[i]
        const price = src[i]
        if (!Number.isFinite(total) || total === 0 || !Number.isFinite(vol) || !Number.isFinite(price)) {
          // Pine assigns na here, so the next bar's nz(evwma[1]) reads 0.
          prev = NaN
          continue
        }
        const carried = Number.isFinite(prev) ? prev : 0
        const value = ((total - vol) * carried + vol * price) / total
        out[i] = Number.isFinite(value) ? value : NaN
        prev = out[i]
      }

      return { evwma: nulls(out) }
    },
  })
}
