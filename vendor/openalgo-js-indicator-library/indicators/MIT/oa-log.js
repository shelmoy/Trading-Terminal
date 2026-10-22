/**
 * Logarithmic Transformation (LOG) - ported to openalgo-charts from
 * Pine Script v6.
 *
 * Source: https://github.com/mihakralj/pinescript/blob/c4e91b962be09733d8fc76caa5191e9e586c5cee/indicators/numerics/log.pine
 * Repo:   mihakralj/pinescript
 * License: MIT
 * SPDX-FileCopyrightText: (c) mihakralj
 * SPDX-FileCopyrightText: (c) 2026 marketcalls (port to openalgo-charts)
 * SPDX-License-Identifier: MIT
 *
 * Takes the natural logarithm of the source, so equal percentage moves take
 * equal vertical space and a compounding series straightens into a line. Bars
 * whose source is zero or negative have no logarithm and are left blank.
 */

export default function ({ registerIndicator, sourceValues, nulls }) {
  registerIndicator({
    id: 'oa-log',
    name: 'Logarithmic Transformation (LOG)',
    category: 'Numerics',
    placement: 'pane',

    inputs: [{ key: 'source', type: 'source', label: 'Source', default: 'close' }],

    plots: [
      { key: 'log', type: 'line', title: 'Log Transformation', style: { color: '#ffeb3b', lineWidth: 2 } },
    ],

    calc(bars, settings) {
      const n = bars.length
      const src = sourceValues(bars, settings.source ?? 'close')
      const out = new Array(n).fill(NaN)

      for (let i = 0; i < n; i++) {
        const v = src[i]
        // The source returns na for anything at or below zero, and a na input
        // is a hard error there rather than a plotted value.
        if (!Number.isFinite(v) || v <= 0) continue
        out[i] = Math.log(v)
      }

      return { log: nulls(out) }
    },
  })
}
