/**
 * Range Candles - ported to openalgo-charts from Pine Script v4.
 *
 * Source: https://github.com/everget/tradingview-pinescript-indicators/blob/60c93d3711d222b8f2db96160defe568429348e0/highlighters/range_candles.pine
 * Repo:   everget/tradingview-pinescript-indicators
 * License: GPL-3.0 (c) 2020-present, Alex Orekhov (everget)
 * SPDX-FileCopyrightText: (c) 2018-present Alex Orekhov (everget)
 * SPDX-FileCopyrightText: (c) 2026 marketcalls (port to openalgo-charts)
 * SPDX-License-Identifier: GPL-3.0-only
 *
 * Repaints the candles from one flat pair of colours: a bar closing at or above
 * its open is bullish, anything else bearish, with body, border and wick all
 * taking the same colour.
 */

const BULL = '#26a69a'
const BEAR = '#ef5350'

export default function ({ registerIndicator }) {
  registerIndicator({
    id: 'oa-range-candles',
    name: 'Range Candles',
    category: 'Highlighters',
    placement: 'onchart',

    inputs: [],

    plots: [
      {
        key: 'candles',
        type: 'candlestick',
        title: 'Range Candles',
        // A candle plot is fed by four columns; the key above is only a label.
        ohlc: { open: 'o', high: 'h', low: 'l', close: 'c' },
        style: {
          upColor: BULL,
          downColor: BEAR,
          borderUpColor: BULL,
          borderDownColor: BEAR,
          wickUpColor: BULL,
          wickDownColor: BEAR,
          borderVisible: true,
        },
        // Pine picks the colour with close >= open, which keeps a doji bullish.
        colorBy({ index, values }) {
          const open = values.o[index]
          const close = values.c[index]
          if (!Number.isFinite(open) || !Number.isFinite(close)) return BULL
          return close >= open ? BULL : BEAR
        },
      },
    ],

    calc(bars) {
      const n = bars.length
      const o = new Array(n).fill(NaN)
      const h = new Array(n).fill(NaN)
      const l = new Array(n).fill(NaN)
      const c = new Array(n).fill(NaN)
      for (let i = 0; i < n; i++) {
        const b = bars[i]
        o[i] = Number.isFinite(b.open) ? b.open : NaN
        h[i] = Number.isFinite(b.high) ? b.high : NaN
        l[i] = Number.isFinite(b.low) ? b.low : NaN
        c[i] = Number.isFinite(b.close) ? b.close : NaN
      }
      return { o, h, l, c }
    },
  })
}
