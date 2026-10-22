/**
 * Price Channel (PCHANNEL) - ported to openalgo-charts from Pine Script v6.
 *
 * Source: https://github.com/mihakralj/pinescript/blob/c4e91b962be09733d8fc76caa5191e9e586c5cee/indicators/channels/pchannel.pine
 * Repo:   mihakralj/pinescript
 * License: MIT (c) mihakralj
 * SPDX-FileCopyrightText: (c) mihakralj
 * SPDX-FileCopyrightText: (c) 2026 marketcalls (port to openalgo-charts)
 * SPDX-License-Identifier: MIT
 *
 * The highest high and the lowest low of the lookback window, with their
 * midpoint, marking the extremes price has had to break to make a new move.
 */

export default function ({ registerIndicator, nulls }) {
  registerIndicator({
    id: 'oa-pchannel',
    name: 'Price Channel (PCHANNEL)',
    category: 'Channels',
    placement: 'onchart',

    inputs: [
      { key: 'length', type: 'number', label: 'Length', default: 20, min: 1, max: 5000, step: 1 },
    ],

    plots: [
      { key: 'middle', type: 'line', title: 'Middle Channel', style: { color: '#ffeb3b', lineWidth: 2 } },
      { key: 'upper', type: 'line', title: 'Upper Channel', style: { color: '#ffeb3b', lineWidth: 2 } },
      { key: 'lower', type: 'line', title: 'Lower Channel', style: { color: '#ffeb3b', lineWidth: 2 } },
    ],

    fills: [{ between: ['upper', 'lower'], colorUp: '#2196f3', colorDown: '#2196f3', opacity: 0.1 }],

    calc(bars, settings) {
      // A cleared number field arrives as '', and Number('') is 0.
      const length = Math.max(1, Math.floor(Number(settings.length) || 20))

      const upper = new Array(bars.length).fill(NaN)
      const lower = new Array(bars.length).fill(NaN)
      const middle = new Array(bars.length).fill(NaN)

      // The source keeps a monotonic deque of bar indices, which emits a value
      // from the very first bar over whatever part of the window exists rather
      // than staying na for length-1 bars.
      const maxDeque = []
      const minDeque = []
      const highs = new Array(bars.length)
      const lows = new Array(bars.length)

      for (let i = 0; i < bars.length; i++) {
        // nz(high) and nz(low): a missing price reads as 0.
        const hi = Number.isFinite(bars[i].high) ? bars[i].high : 0
        const lo = Number.isFinite(bars[i].low) ? bars[i].low : 0
        highs[i] = hi
        lows[i] = lo

        while (maxDeque.length > 0 && maxDeque[0] <= i - length) maxDeque.shift()
        while (minDeque.length > 0 && minDeque[0] <= i - length) minDeque.shift()

        while (maxDeque.length > 0 && highs[maxDeque[maxDeque.length - 1]] <= hi) maxDeque.pop()
        maxDeque.push(i)
        while (minDeque.length > 0 && lows[minDeque[minDeque.length - 1]] >= lo) minDeque.pop()
        minDeque.push(i)

        const highestHigh = highs[maxDeque[0]]
        const lowestLow = lows[minDeque[0]]
        upper[i] = highestHigh
        lower[i] = lowestLow
        middle[i] = (highestHigh + lowestLow) / 2.0
      }

      return { middle: nulls(middle), upper: nulls(upper), lower: nulls(lower) }
    },
  })
}
