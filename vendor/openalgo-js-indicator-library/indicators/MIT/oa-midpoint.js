/**
 * Midpoint (MIDPOINT) - ported to openalgo-charts from Pine Script v6.
 *
 * Source: https://github.com/mihakralj/pinescript/blob/c4e91b962be09733d8fc76caa5191e9e586c5cee/indicators/core/midpoint.pine
 * Repo:   mihakralj/pinescript
 * License: MIT (c) mihakralj
 * SPDX-FileCopyrightText: (c) mihakralj
 * SPDX-FileCopyrightText: (c) 2026 marketcalls (port to openalgo-charts)
 * SPDX-License-Identifier: MIT
 *
 * The centre of the rolling price range: the average of the highest and the
 * lowest value of the source over the lookback window.
 */

export default function ({ registerIndicator, sourceValues, highest, lowest, nulls }) {
  registerIndicator({
    id: 'oa-midpoint',
    name: 'Midpoint (MIDPOINT)',
    category: 'Price Core',
    placement: 'onchart',

    inputs: [
      { key: 'source', type: 'source', label: 'Source', default: 'close' },
      { key: 'length', type: 'number', label: 'Length', default: 14, min: 1, max: 5000, step: 1 },
    ],

    plots: [
      { key: 'midpoint', type: 'line', title: 'Midpoint', style: { color: '#ffeb3b', lineWidth: 2 } },
    ],

    calc(bars, settings) {
      // A cleared number field arrives as '', and Number('') is 0.
      const length = Math.max(1, Math.floor(Number(settings.length) || 14))
      const src = sourceValues(bars, settings.source ?? 'close')

      // ta.highest / ta.lowest are na until the window is full, and so are these.
      const hi = highest(src, length)
      const lo = lowest(src, length)

      const out = new Array(bars.length).fill(NaN)
      for (let i = 0; i < bars.length; i++) {
        if (!Number.isFinite(hi[i]) || !Number.isFinite(lo[i])) continue
        out[i] = (hi[i] + lo[i]) * 0.5
      }

      return { midpoint: nulls(out) }
    },
  })
}
