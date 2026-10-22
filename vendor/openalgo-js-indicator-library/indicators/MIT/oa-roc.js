/**
 * Rate of Change (ROC) - ported to openalgo-charts from Pine Script v6.
 *
 * Source: https://github.com/mihakralj/pinescript/blob/c4e91b962be09733d8fc76caa5191e9e586c5cee/indicators/momentum/roc.pine
 * Repo:   mihakralj/pinescript
 * License: MIT
 * SPDX-FileCopyrightText: (c) mihakralj
 * SPDX-FileCopyrightText: (c) 2026 marketcalls (port to openalgo-charts)
 * SPDX-License-Identifier: MIT
 *
 * Absolute price change over the lookback: the source now minus the source
 * that many bars ago, in price units rather than as a percentage.
 */

export default function ({ registerIndicator, sourceValues, nulls }) {
  registerIndicator({
    id: 'oa-roc',
    name: 'Rate of Change (ROC)',
    category: 'Momentum',
    placement: 'pane',

    inputs: [
      { key: 'source', type: 'source', label: 'Source', default: 'close' },
      { key: 'length', type: 'number', label: 'Length', default: 9, min: 1, max: 5000, step: 1 },
    ],

    plots: [{ key: 'roc', type: 'line', title: 'ROC', style: { color: '#ffeb3b', lineWidth: 2 } }],

    calc(bars, settings) {
      // A cleared number field arrives as '', and Number('') is 0.
      const length = Math.max(1, Math.floor(Number(settings.length) || 9))
      const src = sourceValues(bars, settings.source ?? 'close')

      const out = new Array(bars.length).fill(NaN)
      // Pine carries a var counter that walks up to length, so the lookback
      // grows with the chart: before the window is full the comparison is
      // against the first bar, and the study emits from bar zero.
      let count = 0

      for (let i = 0; i < bars.length; i++) {
        const backIndex = i - count
        const reference = backIndex >= 0 ? src[backIndex] : NaN
        if (!Number.isFinite(reference)) continue
        out[i] = Number.isFinite(src[i]) ? src[i] - reference : NaN
        count = Math.min(count + 1, length)
      }

      return { roc: nulls(out) }
    },
  })
}
