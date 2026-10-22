/**
 * Lowest Value (LOWEST) - ported to openalgo-charts from Pine Script v6.
 *
 * Source: https://github.com/mihakralj/pinescript/blob/c4e91b962be09733d8fc76caa5191e9e586c5cee/indicators/numerics/lowest.pine
 * Repo:   mihakralj/pinescript
 * License: MIT (c) mihakralj
 * SPDX-FileCopyrightText: (c) mihakralj
 * SPDX-FileCopyrightText: (c) 2026 marketcalls (port to openalgo-charts)
 * SPDX-License-Identifier: MIT
 *
 * The lowest value of the source over a rolling lookback window. While the
 * window is still filling it reports the lowest value seen so far, so the line
 * starts on the very first bar instead of waiting out a warmup.
 */

export default function ({ registerIndicator, sourceValues, lowest, nulls }) {
  registerIndicator({
    id: 'oa-lowest',
    name: 'Lowest Value (LOWEST)',
    category: 'Numerics',
    placement: 'onchart',

    inputs: [
      { key: 'period', type: 'number', label: 'Period', default: 14, min: 1, max: 5000, step: 1 },
      { key: 'source', type: 'source', label: 'Source', default: 'close' },
    ],

    plots: [
      { key: 'lowest', type: 'line', title: 'Lowest', style: { color: '#ffeb3b', lineWidth: 2 } },
    ],

    calc(bars, settings) {
      // A cleared number field arrives as '', and Number('') is 0.
      const period = Math.max(1, Math.floor(Number(settings.period) || 14))
      const src = sourceValues(bars, settings.source ?? 'close')

      // Pine pushes nz(src) into the deque, so a missing value counts as zero
      // rather than dropping out of the window.
      const vals = new Array(bars.length)
      for (let i = 0; i < bars.length; i++) vals[i] = Number.isFinite(src[i]) ? src[i] : 0

      // The monotonic deque in the source holds every bar index newer than
      // bar_index - len, which during the first len-1 bars is simply every bar
      // seen so far. That is a running minimum, not a gap.
      const windowed = lowest(vals, period)
      const out = new Array(bars.length).fill(NaN)
      let running = Infinity
      for (let i = 0; i < bars.length; i++) {
        running = Math.min(running, vals[i])
        out[i] = i < period - 1 ? running : windowed[i]
      }

      return { lowest: nulls(out) }
    },
  })
}
