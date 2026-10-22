/**
 * Rate of Change Ratio (ROCR) - ported to openalgo-charts from Pine Script v6.
 *
 * Source: https://github.com/mihakralj/pinescript/blob/c4e91b962be09733d8fc76caa5191e9e586c5cee/indicators/momentum/rocr.pine
 * Repo:   mihakralj/pinescript
 * License: MIT
 * SPDX-FileCopyrightText: (c) mihakralj
 * SPDX-FileCopyrightText: (c) 2026 marketcalls (port to openalgo-charts)
 * SPDX-License-Identifier: MIT
 *
 * The ratio of the current price to the price N bars ago, so 1 is unchanged,
 * above 1 is an advance and below 1 a decline.
 */

export default function ({ registerIndicator, sourceValues, nulls }) {
  registerIndicator({
    id: 'oa-rocr',
    name: 'Rate of Change Ratio (ROCR)',
    category: 'Momentum',
    placement: 'pane',

    inputs: [
      { key: 'source', type: 'source', label: 'Source', default: 'close' },
      { key: 'length', type: 'number', label: 'Length', default: 9, min: 1, max: 5000, step: 1 },
    ],

    plots: [{ key: 'rocr', type: 'line', title: 'ROCR', style: { color: '#ffeb3b', lineWidth: 2 } }],

    calc(bars, settings) {
      // A cleared number field arrives as '', and Number('') is 0.
      const length = Math.max(1, Math.floor(Number(settings.length) || 9))
      const src = sourceValues(bars, settings.source ?? 'close')
      const n = bars.length
      const out = new Array(n).fill(NaN)

      // Pine carries the offset in a var that climbs one bar at a time up to
      // `length`, so early bars compare against the first bar rather than
      // being blank, and the offset stops growing once the window is full.
      // The offset is held back on any bar whose reference price is unusable.
      let count = 0

      for (let i = 0; i < n; i++) {
        const refIndex = i - count
        const reference = refIndex >= 0 ? src[refIndex] : NaN
        if (!Number.isFinite(reference) || reference === 0) continue
        const ratio = src[i] / reference
        out[i] = Number.isFinite(ratio) ? ratio : NaN
        count = Math.min(count + 1, length)
      }

      return { rocr: nulls(out) }
    },
  })
}
