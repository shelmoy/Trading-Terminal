/**
 * Highest Value (HIGHEST) - ported to openalgo-charts from Pine Script v6.
 *
 * Source: https://github.com/mihakralj/pinescript/blob/c4e91b962be09733d8fc76caa5191e9e586c5cee/indicators/numerics/highest.pine
 * Repo:   mihakralj/pinescript
 * License: MIT (c) mihakralj
 * SPDX-FileCopyrightText: (c) mihakralj
 * SPDX-FileCopyrightText: (c) 2026 marketcalls (port to openalgo-charts)
 * SPDX-License-Identifier: MIT
 *
 * The running maximum of the source over a rolling lookback window. Before the
 * window is full it reports the highest value seen so far, so the line starts
 * on the very first bar rather than after a warmup gap.
 */

export default function ({ registerIndicator, sourceValues, nulls }) {
  registerIndicator({
    id: 'oa-highest',
    name: 'Highest Value (HIGHEST)',
    category: 'Numerics',
    placement: 'onchart',

    inputs: [
      { key: 'period', type: 'number', label: 'Period', default: 14, min: 1, max: 5000, step: 1 },
      { key: 'source', type: 'source', label: 'Source', default: 'close' },
    ],

    plots: [
      { key: 'highest', type: 'line', title: 'Highest', style: { color: '#ffeb3b', lineWidth: 2 } },
    ],

    calc(bars, settings) {
      // A cleared number field arrives as '', and Number('') is 0.
      const len = Math.max(1, Math.floor(Number(settings.period) || 14))
      const src = sourceValues(bars, settings.source ?? 'close')
      const n = bars.length

      // Pine nz(src): a missing source reads as 0 and still enters the window.
      const values = new Array(n)
      for (let i = 0; i < n; i++) values[i] = Number.isFinite(src[i]) ? src[i] : 0

      // Same monotonic deque as the source: indices held in decreasing value
      // order, so the front is always the maximum of the live window.
      const out = new Array(n).fill(NaN)
      const deque = []
      for (let i = 0; i < n; i++) {
        const current = values[i]
        while (deque.length > 0 && deque[0] <= i - len) deque.shift()
        while (deque.length > 0 && values[deque[deque.length - 1]] <= current) deque.pop()
        deque.push(i)
        out[i] = values[deque[0]]
      }

      return { highest: nulls(out) }
    },
  })
}
