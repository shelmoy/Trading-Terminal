/**
 * Psychological Line (PSL) - ported to openalgo-charts from Pine Script v6.
 *
 * Source: https://github.com/mihakralj/pinescript/blob/c4e91b962be09733d8fc76caa5191e9e586c5cee/indicators/oscillators/psl.pine
 * Repo:   mihakralj/pinescript
 * License: MIT (c) mihakralj
 * SPDX-FileCopyrightText: (c) mihakralj
 * SPDX-FileCopyrightText: (c) 2026 marketcalls (port to openalgo-charts)
 * SPDX-License-Identifier: MIT
 *
 * The share of up-bars in the lookback window, as a percentage. Above 50 says
 * more bars closed up than down; above 75 or below 25 is the stretched reading
 * the study is usually watched for.
 */

export default function ({ registerIndicator, sourceValues, nulls }) {
  registerIndicator({
    id: 'oa-psl',
    name: 'Psychological Line (PSL)',
    category: 'Oscillators',
    placement: 'pane',

    inputs: [
      { key: 'period', type: 'number', label: 'Period', default: 12, min: 1, max: 5000, step: 1 },
      { key: 'source', type: 'source', label: 'Source', default: 'close' },
    ],

    plots: [{ key: 'psl', type: 'line', title: 'PSL', style: { color: '#ffeb3b', lineWidth: 2 } }],

    levels: () => [
      { price: 50, title: 'Midline', color: '#787b86', dashed: true },
      { price: 75, title: 'Overbought', color: '#ff5252', dashed: true },
      { price: 25, title: 'Oversold', color: '#4caf50', dashed: true },
    ],

    // PSL is a share of a count, so it cannot leave [0, 100].
    range: () => ({ min: 0, max: 100 }),

    calc(bars, settings) {
      // A cleared number field arrives as '', and Number('') is 0.
      const period = Math.max(1, Math.floor(Number(settings.period) || 12))
      const src = sourceValues(bars, settings.source ?? 'close')

      const n = bars.length
      const upFlags = new Array(n).fill(0)
      const out = new Array(n).fill(NaN)

      // The Pine version keeps a circular buffer seeded with na, so `count`
      // grows to `period` over the first `period` bars and the average is taken
      // over the bars actually seen. That makes PSL defined from the very first
      // bar rather than na through a warmup.
      let upSum = 0
      let count = 0

      for (let i = 0; i < n; i++) {
        const prev = i >= 1 ? src[i - 1] : NaN
        const curr = src[i]
        // Pine: `not na(prev) and source > prev`. Guarded here because in
        // JavaScript a comparison against a missing value is not automatically
        // false.
        const upVal = Number.isFinite(prev) && Number.isFinite(curr) && curr > prev ? 1 : 0

        if (i >= period) {
          // The slot about to be overwritten held the flag from bar i - period.
          upSum -= upFlags[i - period]
        } else {
          count += 1
        }

        upSum += upVal
        upFlags[i] = upVal

        out[i] = (100 * upSum) / Math.max(1, count)
      }

      return { psl: nulls(out) }
    },
  })
}
