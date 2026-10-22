/**
 * Average True Range Percent (ATRP) - ported to openalgo-charts from Pine Script v6.
 *
 * Source: https://github.com/mihakralj/pinescript/blob/c4e91b962be09733d8fc76caa5191e9e586c5cee/indicators/volatility/atrp.pine
 * Repo:   mihakralj/pinescript
 * License: MIT
 * SPDX-FileCopyrightText: (c) mihakralj
 * SPDX-FileCopyrightText: (c) 2026 marketcalls (port to openalgo-charts)
 * SPDX-License-Identifier: MIT
 *
 * Average True Range expressed as a percentage of the close, so volatility is
 * comparable across instruments trading at very different price levels.
 */

export default function ({ registerIndicator, nulls }) {
  registerIndicator({
    id: 'oa-atrp',
    name: 'Average True Range Percent (ATRP)',
    category: 'Volatility',
    placement: 'pane',

    inputs: [
      {
        key: 'length',
        type: 'number',
        label: 'Length',
        default: 14,
        min: 1,
        max: 5000,
        step: 1,
        tooltip: 'Number of bars used for the ATR calculation.',
      },
    ],

    plots: [
      { key: 'atrp', type: 'line', title: 'ATRP', style: { color: '#ffeb3b', lineWidth: 2 } },
    ],

    calc(bars, settings) {
      // A cleared number field arrives as '', and Number('') is 0.
      const length = Math.max(1, Math.floor(Number(settings.length) || 14))
      const alpha = 1 / length
      const beta = 1 - alpha
      const EPSILON = 1e-10

      const out = new Array(bars.length).fill(NaN)

      // The source keeps its own true range rather than calling ta.tr: prevClose
      // is a var seeded on the first bar with that same bar's close, so the first
      // true range collapses to high - low exactly as ta.tr does.
      let prevClose = null
      // Zero-seeded Wilder smoothing with a bias correction, so the series is
      // usable from the very first bar instead of after length bars.
      let rawRma = 0
      let e = 1

      for (let i = 0; i < bars.length; i++) {
        const high = Number(bars[i].high)
        const low = Number(bars[i].low)
        const close = Number(bars[i].close)

        if (prevClose === null) prevClose = close

        const tr1 = high - low
        const tr2 = Math.abs(high - prevClose)
        const tr3 = Math.abs(low - prevClose)
        const trueRange = Math.max(tr1, tr2, tr3)

        prevClose = close

        if (!Number.isFinite(trueRange)) continue

        rawRma = (rawRma * (length - 1) + trueRange) / length
        e *= beta
        const atr = e > EPSILON ? rawRma / (1 - e) : rawRma

        // Pine returns na on a zero close rather than dividing.
        if (!Number.isFinite(close) || close === 0) continue
        if (!Number.isFinite(atr)) continue
        out[i] = (atr / close) * 100
      }

      return { atrp: nulls(out) }
    },
  })
}
