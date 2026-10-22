/**
 * HA: Heikin-Ashi - ported to openalgo-charts from Pine Script v6.
 *
 * Source: https://github.com/mihakralj/pinescript/blob/c4e91b962be09733d8fc76caa5191e9e586c5cee/indicators/core/ha.pine
 * Repo:   mihakralj/pinescript
 * License: MIT (c) mihakralj
 * SPDX-FileCopyrightText: (c) mihakralj
 * SPDX-FileCopyrightText: (c) 2026 marketcalls (port to openalgo-charts)
 * SPDX-License-Identifier: MIT
 *
 * Synthetic candles whose close is the whole bar's average and whose open is
 * the midpoint of the previous synthetic candle, so a noisy candle series is
 * smoothed without being shifted in time.
 */

export default function ({ registerIndicator }) {
  registerIndicator({
    id: 'oa-ha',
    name: 'HA: Heikin-Ashi',
    category: 'Price Core',
    placement: 'onchart',

    // The Pine source declares no inputs.
    inputs: [],

    // plotcandle(haOpen, haHigh, haLow, haClose) is one plot fed by four
    // columns. Pine paints body, border and wick the same colour, green when
    // haClose >= haOpen and red otherwise, which is what a candle plot already
    // decides for itself.
    plots: [
      {
        key: 'ha',
        type: 'candlestick',
        title: 'HA',
        ohlc: { open: 'haOpen', high: 'haHigh', low: 'haLow', close: 'haClose' },
        style: {
          upColor: '#4caf50',
          downColor: '#ff5252',
          borderUpColor: '#4caf50',
          borderDownColor: '#ff5252',
          wickUpColor: '#4caf50',
          wickDownColor: '#ff5252',
        },
      },
    ],

    calc(bars) {
      const n = bars.length
      const haOpen = new Array(n).fill(null)
      const haHigh = new Array(n).fill(null)
      const haLow = new Array(n).fill(null)
      const haClose = new Array(n).fill(null)

      // var float haOpen = na / var float haClose = na: both carry across bars,
      // and haOpen reads the PREVIOUS bar's haClose, not this bar's.
      let prevOpen = NaN
      let prevClose = NaN

      for (let i = 0; i < n; i++) {
        const b = bars[i]
        const o = Number(b.open)
        const h = Number(b.high)
        const l = Number(b.low)
        const c = Number(b.close)
        if (!Number.isFinite(o) || !Number.isFinite(h) || !Number.isFinite(l) || !Number.isFinite(c)) continue

        const close = (o + h + l + c) * 0.25
        // na(haOpen) is true only on the first bar that produces a value.
        const open = Number.isFinite(prevOpen) && Number.isFinite(prevClose)
          ? (prevOpen + prevClose) * 0.5
          : (o + c) * 0.5

        haOpen[i] = open
        haClose[i] = close
        haHigh[i] = Math.max(h, open, close)
        haLow[i] = Math.min(l, open, close)

        prevOpen = open
        prevClose = close
      }

      return { haOpen, haHigh, haLow, haClose }
    },
  })
}
