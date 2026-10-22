/**
 * Chande Momentum Oscillator (CMO) - ported to openalgo-charts from Pine Script v6.
 *
 * Source: https://github.com/mihakralj/pinescript/blob/c4e91b962be09733d8fc76caa5191e9e586c5cee/indicators/momentum/cmo.pine
 * Repo:   mihakralj/pinescript
 * License: MIT
 * SPDX-FileCopyrightText: (c) mihakralj
 * SPDX-FileCopyrightText: (c) 2026 marketcalls (port to openalgo-charts)
 * SPDX-License-Identifier: MIT
 *
 * Compares the summed up moves against the summed down moves over the lookback
 * and scales the difference to -100..100, so the sign shows which side of the
 * window carried the move and the magnitude shows how one-sided it was.
 */

export default function ({ registerIndicator, sourceValues, nulls }) {
  registerIndicator({
    id: 'oa-cmo',
    name: 'Chande Momentum Oscillator (CMO)',
    category: 'Momentum',
    placement: 'pane',

    inputs: [
      { key: 'length', type: 'number', label: 'Length', default: 14, min: 1, max: 5000, step: 1 },
      { key: 'source', type: 'source', label: 'Source', default: 'close' },
    ],

    plots: [{ key: 'cmo', type: 'line', title: 'CMO', style: { color: '#ffeb3b', lineWidth: 2 } }],

    calc(bars, settings) {
      // A cleared number field arrives as '', and Number('') is 0.
      const len = Math.max(1, Math.floor(Number(settings.length) || 14))
      const src = sourceValues(bars, settings.source ?? 'close')
      const n = bars.length
      const out = new Array(n).fill(NaN)

      // The source keeps a circular buffer seeded with na and adds and removes
      // one slot per bar, so the running sums are kept the same way here.
      const upBuffer = new Array(len).fill(NaN)
      const downBuffer = new Array(len).fill(NaN)
      let head = 0
      let sumUp = 0.0
      let sumDown = 0.0

      for (let i = 0; i < n; i++) {
        // On bar 0 the difference is na in Pine, and na > 0 and na < 0 are both
        // false there, so the bar contributes 0 to each side.
        const cur = src[i]
        const prev = i > 0 ? src[i - 1] : undefined
        const diff = Number.isFinite(cur) && Number.isFinite(prev) ? cur - prev : NaN
        const up = Number.isFinite(diff) && diff > 0 ? diff : 0.0
        const down = Number.isFinite(diff) && diff < 0 ? -diff : 0.0

        const oldUp = upBuffer[head]
        const oldDown = downBuffer[head]
        if (Number.isFinite(oldUp)) {
          sumUp -= oldUp
          sumDown -= Number.isFinite(oldDown) ? oldDown : 0
        }

        upBuffer[head] = up
        downBuffer[head] = down
        sumUp += up
        sumDown += down
        head = (head + 1) % len

        const denom = sumUp + sumDown
        out[i] = denom !== 0.0 ? (100 * (sumUp - sumDown)) / denom : 0.0
        if (!Number.isFinite(out[i])) out[i] = 0.0
      }

      return { cmo: nulls(out) }
    },
  })
}
