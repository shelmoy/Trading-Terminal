/**
 * Min-Max Channel (MMCHANNEL) - ported to openalgo-charts from Pine Script v6.
 *
 * Source: https://github.com/mihakralj/pinescript/blob/c4e91b962be09733d8fc76caa5191e9e586c5cee/indicators/channels/mmchannel.pine
 * Repo:   mihakralj/pinescript
 * License: MIT
 * SPDX-FileCopyrightText: (c) mihakralj
 * SPDX-FileCopyrightText: (c) 2026 marketcalls (port to openalgo-charts)
 * SPDX-License-Identifier: MIT
 *
 * The highest high and the lowest low of the lookback window, drawn as a
 * channel, so the band edges mark the levels a breakout has to clear.
 */

export default function ({ registerIndicator, sourceValues, nulls }) {
  registerIndicator({
    id: 'oa-mmchannel',
    name: 'Min-Max Channel (MMCHANNEL)',
    category: 'Channels',
    placement: 'onchart',

    inputs: [
      { key: 'period', type: 'number', label: 'Period', default: 20, min: 1, max: 5000, step: 1 },
      { key: 'highSource', type: 'source', label: 'High Source', default: 'high' },
      { key: 'lowSource', type: 'source', label: 'Low Source', default: 'low' },
    ],

    plots: [
      { key: 'highest', type: 'line', title: 'Highest High', style: { color: '#ffeb3b', lineWidth: 2 } },
      { key: 'lowest', type: 'line', title: 'Lowest Low', style: { color: '#ffeb3b', lineWidth: 2 } },
    ],

    fills: [{ between: ['highest', 'lowest'], colorUp: '#2962ff', colorDown: '#2962ff', opacity: 0.1 }],

    calc(bars, settings) {
      // A cleared number field arrives as '', and Number('') is 0.
      const period = Math.max(1, Math.floor(Number(settings.period) || 20))
      const hi = sourceValues(bars, settings.highSource ?? 'high')
      const lo = sourceValues(bars, settings.lowSource ?? 'low')

      const highest = new Array(bars.length).fill(NaN)
      const lowest = new Array(bars.length).fill(NaN)

      // Pine keeps two monotonic deques of bar indices. It emits from the very
      // first bar over whatever part of the window exists, so unlike ta.highest
      // there is no na warmup here.
      const hq = []
      const lq = []
      let hHead = 0
      let lHead = 0

      for (let i = 0; i < bars.length; i++) {
        const h = hi[i]
        const l = lo[i]

        // Drop indices that have fallen out of [i - period + 1, i].
        while (hHead < hq.length && hq[hHead] <= i - period) hHead += 1
        // Pine compares the buffered value against the new one; a na source
        // makes the comparison false, so nothing is popped.
        while (hq.length > hHead && Number.isFinite(h) && hi[hq[hq.length - 1]] <= h) hq.pop()
        hq.push(i)
        highest[i] = hi[hq[hHead]]

        while (lHead < lq.length && lq[lHead] <= i - period) lHead += 1
        while (lq.length > lHead && Number.isFinite(l) && lo[lq[lq.length - 1]] >= l) lq.pop()
        lq.push(i)
        lowest[i] = lo[lq[lHead]]
      }

      return { highest: nulls(highest), lowest: nulls(lowest) }
    },
  })
}
