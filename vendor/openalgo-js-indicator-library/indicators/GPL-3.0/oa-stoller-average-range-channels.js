/**
 * Stoller Average Range Channels (STARC) Bands - ported to openalgo-charts from Pine Script v3.
 *
 * Source: https://github.com/everget/tradingview-pinescript-indicators/blob/60c93d3711d222b8f2db96160defe568429348e0/bands_and_channels/stoller_average_range_channels.pine
 * Repo:   everget/tradingview-pinescript-indicators
 * License: GPL-3.0 - Copyright (c) 2018-present, Alex Orekhov (everget)
 * SPDX-FileCopyrightText: (c) 2018-present Alex Orekhov (everget)
 * SPDX-FileCopyrightText: (c) 2026 marketcalls (port to openalgo-charts)
 * SPDX-License-Identifier: GPL-3.0-only
 *
 * A short moving average with bands placed a multiple of the average true
 * range above and below it, so the envelope tracks realised range rather than
 * a fixed percentage of price.
 */

export default function ({ registerIndicator, sourceValues, sma, wma, vwma, smaSeededEma, atr, nulls }) {
  registerIndicator({
    id: 'oa-stoller-average-range-channels',
    name: 'Stoller Average Range Channels (STARC) Bands (STARC)',
    category: 'Channels',
    placement: 'onchart',

    inputs: [
      { key: 'length', type: 'number', label: 'Length', default: 6, min: 1, max: 5000, step: 1 },
      {
        key: 'maType',
        type: 'select',
        label: 'MA',
        default: 'SMA',
        options: [
          { label: 'EMA', value: 'EMA' },
          { label: 'SMA', value: 'SMA' },
          { label: 'VWMA', value: 'VWMA' },
          { label: 'WMA', value: 'WMA' },
        ],
      },
      {
        key: 'mult',
        type: 'number',
        label: 'Multiplier',
        default: 1.33,
        min: 0.1,
        max: 100,
        step: 0.1,
        tooltip: 'Band distance as a multiple of the average true range over the Length period.',
      },
      { key: 'source', type: 'source', label: 'Source', default: 'close' },
    ],

    plots: [
      { key: 'upper', type: 'line', title: 'Upper', style: { color: '#2962ff', lineWidth: 2 } },
      { key: 'basis', type: 'line', title: 'Basis', style: { color: '#6d1e7f', lineWidth: 2 } },
      { key: 'lower', type: 'line', title: 'Lower', style: { color: '#f23645', lineWidth: 2 } },
    ],

    calc(bars, settings) {
      // A cleared number field arrives as '', and Number('') is 0.
      const length = Math.max(1, Math.floor(Number(settings.length) || 6))
      const mult = Math.max(0.1, Number(settings.mult) || 1.33)
      const src = sourceValues(bars, settings.source ?? 'close')
      const len = bars.length

      const high = bars.map((b) => Number(b.high))
      const low = bars.map((b) => Number(b.low))
      const close = bars.map((b) => Number(b.close))
      // Volume is absent on index and computed series, so keep it numeric and
      // let VWMA blank out rather than divide by nothing.
      const volume = bars.map((b) => (Number.isFinite(b.volume) ? Number(b.volume) : 0))

      let basisRaw
      switch (settings.maType) {
        // Pine's ema seeds from the SMA of the first `length` values.
        case 'EMA': basisRaw = smaSeededEma(src, length); break
        case 'VWMA': basisRaw = vwma(src, volume, length); break
        case 'WMA': basisRaw = wma(src, length); break
        default: basisRaw = sma(src, length)
      }

      // The source script sizes the bands with atr(length), not with its own
      // ATR Length input, so the ATR period follows Length here too.
      const range = atr(high, low, close, length)

      const upper = new Array(len).fill(NaN)
      const basis = new Array(len).fill(NaN)
      const lower = new Array(len).fill(NaN)

      for (let i = 0; i < len; i++) {
        const b = basisRaw[i]
        if (!Number.isFinite(b)) continue
        basis[i] = b
        const r = range[i]
        if (!Number.isFinite(r)) continue
        upper[i] = b + r * mult
        lower[i] = b - r * mult
      }

      return { upper: nulls(upper), basis: nulls(basis), lower: nulls(lower) }
    },
  })
}
