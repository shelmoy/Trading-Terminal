/**
 * Donchian Channels (DCHANNEL) - ported to openalgo-charts from Pine Script v6.
 *
 * Source: https://github.com/mihakralj/pinescript/blob/c4e91b962be09733d8fc76caa5191e9e586c5cee/indicators/channels/dchannel.pine
 * Repo:   mihakralj/pinescript
 * License: MIT
 * SPDX-FileCopyrightText: (c) mihakralj
 * SPDX-FileCopyrightText: (c) 2026 marketcalls (port to openalgo-charts)
 * SPDX-License-Identifier: MIT
 *
 * The upper band is the highest high of the lookback window, the lower band the
 * lowest low, and the basis their midpoint, so the channel maps the range price
 * has actually traded rather than a statistic derived from it.
 */

export default function ({ registerIndicator, sourceValues, nulls }) {
  registerIndicator({
    id: 'oa-dchannel',
    name: 'Donchian Channels (DCHANNEL)',
    category: 'Channels',
    placement: 'onchart',

    inputs: [
      { key: 'period', type: 'number', label: 'Period', default: 20, min: 1, max: 5000, step: 1 },
      { key: 'highSource', type: 'source', label: 'High Source', default: 'high' },
      { key: 'lowSource', type: 'source', label: 'Low Source', default: 'low' },
    ],

    plots: [
      { key: 'basis', type: 'line', title: 'Basis', style: { color: '#ffeb3b', lineWidth: 2 } },
      { key: 'upper', type: 'line', title: 'Upper', style: { color: '#ffeb3b', lineWidth: 2 } },
      { key: 'lower', type: 'line', title: 'Lower', style: { color: '#ffeb3b', lineWidth: 2 } },
    ],

    fills: [{ between: ['upper', 'lower'], colorUp: '#2962ff', colorDown: '#2962ff', opacity: 0.1 }],

    calc(bars, settings) {
      // A cleared number field arrives as '', and Number('') is 0.
      const period = Math.max(1, Math.floor(Number(settings.period) || 20))
      const hi = sourceValues(bars, settings.highSource ?? 'high')
      const lo = sourceValues(bars, settings.lowSource ?? 'low')
      const n = bars.length

      const basis = new Array(n).fill(NaN)
      const upper = new Array(n).fill(NaN)
      const lower = new Array(n).fill(NaN)

      // Same monotonic deques as the source: indices only, front holds the
      // extreme of the current window. A head cursor replaces the O(n) shift.
      const hq = []
      const lq = []
      let hHead = 0
      let lHead = 0

      for (let i = 0; i < n; i++) {
        const h = hi[i]
        const l = lo[i]

        while (hHead < hq.length && hq[hHead] <= i - period) hHead++
        if (Number.isFinite(h)) {
          while (hq.length > hHead && hi[hq[hq.length - 1]] <= h) hq.pop()
          hq.push(i)
        }

        while (lHead < lq.length && lq[lHead] <= i - period) lHead++
        if (Number.isFinite(l)) {
          while (lq.length > lHead && lo[lq[lq.length - 1]] >= l) lq.pop()
          lq.push(i)
        }

        // Before the window is full Pine still reports the extremes of the bars
        // it has, so the channel is drawn from the very first bar.
        if (hq.length > hHead && lq.length > lHead) {
          const top = hi[hq[hHead]]
          const bot = lo[lq[lHead]]
          upper[i] = top
          lower[i] = bot
          basis[i] = (top + bot) / 2
        }
      }

      return { basis: nulls(basis), upper: nulls(upper), lower: nulls(lower) }
    },
  })
}
