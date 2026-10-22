/**
 * Double Exponential Moving Average (DEMA) - ported to openalgo-charts from Pine Script v3.
 *
 * Source: https://github.com/everget/tradingview-pinescript-indicators/blob/60c93d3711d222b8f2db96160defe568429348e0/movings/double_exponential_moving_average.pine
 * Repo:   everget/tradingview-pinescript-indicators
 * License: GPL-3.0, Copyright (c) 2018-present, Alex Orekhov (everget)
 * SPDX-FileCopyrightText: (c) 2018-present Alex Orekhov (everget)
 * SPDX-FileCopyrightText: (c) 2026 marketcalls (port to openalgo-charts)
 * SPDX-License-Identifier: GPL-3.0-only
 *
 * Two chained exponential averages recombined as 2 * EMA - EMA(EMA), which
 * cancels most of the lag a single EMA of the same length carries.
 */

export default function ({ registerIndicator, sourceValues, smaSeededEma, nulls }) {
  // Pine's ema() is seeded from the SMA of the first `period` values and is na
  // for the period-1 bars before that. Chaining one onto another therefore
  // starts the outer average at the first bar the inner one produced a value,
  // so the leading gap is skipped and the result realigned. smaSeededEma is not
  // NaN tolerant: fed a series with a warmup gap it returns nothing at all.
  const pineEma = (values, period) => {
    const out = new Array(values.length).fill(NaN)
    let start = 0
    while (start < values.length && !Number.isFinite(values[start])) start += 1
    if (start >= values.length) return out
    const seeded = smaSeededEma(values.slice(start), period)
    for (let i = 0; i < seeded.length; i += 1) out[start + i] = seeded[i]
    return out
  }

  registerIndicator({
    id: 'oa-double-exponential-moving-average',
    name: 'Double Exponential Moving Average (DEMA)',
    category: 'Moving Averages',
    placement: 'onchart',

    inputs: [
      { key: 'length', type: 'number', label: 'Length', default: 14, min: 1, max: 5000, step: 1 },
      { key: 'source', type: 'source', label: 'Source', default: 'close' },
    ],

    plots: [{ key: 'dema', type: 'line', title: 'DEMA', style: { color: '#6d1e7f', lineWidth: 2 } }],

    calc(bars, settings) {
      // A cleared number field arrives as '', and Number('') is 0.
      const length = Math.max(1, Math.floor(Number(settings.length) || 14))
      const src = sourceValues(bars, settings.source ?? 'close')

      const ema1 = pineEma(src, length)
      const ema2 = pineEma(ema1, length)

      const dema = new Array(bars.length).fill(NaN)
      for (let i = 0; i < bars.length; i += 1) {
        if (!Number.isFinite(ema1[i]) || !Number.isFinite(ema2[i])) continue
        dema[i] = 2 * ema1[i] - ema2[i]
      }

      return { dema: nulls(dema) }
    },
  })
}
