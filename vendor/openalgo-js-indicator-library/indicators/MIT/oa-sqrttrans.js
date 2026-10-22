/**
 * Square Root Transformation (SQRT) - ported to openalgo-charts from Pine Script v6.
 *
 * Source: https://github.com/mihakralj/pinescript/blob/c4e91b962be09733d8fc76caa5191e9e586c5cee/indicators/numerics/sqrttrans.pine
 * Repo:   mihakralj/pinescript
 * License: MIT (c) mihakralj
 * SPDX-FileCopyrightText: (c) mihakralj
 * SPDX-FileCopyrightText: (c) 2026 marketcalls (port to openalgo-charts)
 * SPDX-License-Identifier: MIT
 *
 * Applies y = sqrt(x) to the chosen source, compressing large values far more
 * than small ones. Negative input has no real root and draws a gap.
 */

export default function ({ registerIndicator, sourceValues, nulls }) {
  registerIndicator({
    id: 'oa-sqrttrans',
    name: 'Square Root Transformation (SQRT)',
    category: 'Numerics',
    placement: 'pane',

    inputs: [{ key: 'source', type: 'source', label: 'Source', default: 'close' }],

    plots: [
      {
        key: 'sqrt',
        type: 'line',
        title: 'Square Root Transformation',
        style: { color: '#ffeb3b', lineWidth: 2 },
      },
    ],

    calc(bars, settings) {
      const src = sourceValues(bars, settings.source ?? 'close')

      const out = new Array(bars.length).fill(NaN)
      for (let i = 0; i < bars.length; i++) {
        const v = src[i]
        // Pine raises on an na source and returns na below zero. A chart cannot
        // raise, so a missing bar leaves a gap exactly as a negative one does.
        if (!Number.isFinite(v) || v < 0) continue
        out[i] = Math.sqrt(v)
      }

      return { sqrt: nulls(out) }
    },
  })
}
