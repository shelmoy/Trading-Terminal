/**
 * Average True Range Normalized (ATRN) - ported to openalgo-charts from Pine Script v6.
 *
 * Source: https://github.com/mihakralj/pinescript/blob/c4e91b962be09733d8fc76caa5191e9e586c5cee/indicators/volatility/atrn.pine
 * Repo:   mihakralj/pinescript
 * License: MIT (c) mihakralj
 * SPDX-FileCopyrightText: (c) mihakralj
 * SPDX-FileCopyrightText: (c) 2026 marketcalls (port to openalgo-charts)
 * SPDX-License-Identifier: MIT
 *
 * A Wilder average true range rescaled onto its own range over the last ten
 * lengths, so the reading says where current volatility sits between the
 * quietest and the wildest stretch rather than how many points it spans.
 */

export default function ({ registerIndicator, nulls }) {
  registerIndicator({
    id: 'oa-atrn',
    name: 'Average True Range Normalized (ATRN)',
    category: 'Volatility',
    placement: 'pane',

    inputs: [
      {
        key: 'length',
        type: 'number',
        label: 'Length',
        default: 14,
        min: 1,
        max: 2000,
        step: 1,
        tooltip: 'Number of bars used for the ATR calculation',
      },
    ],

    plots: [
      {
        key: 'atrn',
        type: 'line',
        title: 'ATRN',
        style: { color: '#ffeb3b', lineWidth: 2 },
        priceFormat: { type: 'percent' },
      },
    ],

    calc(bars, settings) {
      // A cleared number field arrives as '', and Number('') is 0.
      const length = Math.max(1, Math.floor(Number(settings.length) || 14))
      const n = bars.length
      const out = new Array(n).fill(NaN)
      if (n === 0) return { atrn: nulls(out) }

      const alpha = 1 / length
      const beta = 1 - alpha
      const EPSILON = 1e-10

      // Pine seeds prevClose with the first bar's own close, so bar 0 reduces
      // to high - low, and its zero-seeded Wilder average is divided by
      // 1 - beta^n to stay usable from that first bar.
      const atr = new Array(n).fill(NaN)
      let prevClose = NaN
      let rawRma = 0
      let e = 1

      // The window is min(10 * length, bar_index + 1), so it grows with history
      // and then slides. Its left edge never moves backwards, which is what
      // lets two monotonic queues carry the running high and low.
      const win = Math.max(1, 10 * length)
      const maxQ = []
      const minQ = []

      for (let i = 0; i < n; i++) {
        const bar = bars[i]
        const high = Number(bar.high)
        const low = Number(bar.low)
        const close = Number(bar.close)
        if (!Number.isFinite(high) || !Number.isFinite(low) || !Number.isFinite(close)) continue
        if (!Number.isFinite(prevClose)) prevClose = close

        const tr1 = high - low
        const tr2 = Math.abs(high - prevClose)
        const tr3 = Math.abs(low - prevClose)
        const trueRange = Math.max(tr1, tr2, tr3)
        prevClose = close

        rawRma = (rawRma * (length - 1) + trueRange) / length
        e *= beta
        atr[i] = e > EPSILON ? rawRma / (1 - e) : rawRma

        const start = Math.max(0, i - win + 1)
        while (maxQ.length > 0 && atr[maxQ[maxQ.length - 1]] <= atr[i]) maxQ.pop()
        maxQ.push(i)
        while (maxQ[0] < start) maxQ.shift()
        while (minQ.length > 0 && atr[minQ[minQ.length - 1]] >= atr[i]) minQ.pop()
        minQ.push(i)
        while (minQ[0] < start) minQ.shift()

        const maxAtr = atr[maxQ[0]]
        const minAtr = atr[minQ[0]]
        // A flat stretch leaves the two equal; Pine reports the midpoint rather
        // than dividing by a zero range.
        out[i] = minAtr < maxAtr ? (atr[i] - minAtr) / (maxAtr - minAtr) : 0.5
      }

      return { atrn: nulls(out) }
    },
  })
}
