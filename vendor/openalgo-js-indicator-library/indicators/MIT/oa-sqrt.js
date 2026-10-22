/**
 * Square Root Transformation (SQRT) - ported to openalgo-charts from Pine Script v6.
 *
 * Source: https://github.com/mihakralj/pinescript/blob/c4e91b962be09733d8fc76caa5191e9e586c5cee/indicators/numerics/sqrt.pine
 * Repo:   mihakralj/pinescript
 * License: MIT (c) mihakralj
 * SPDX-FileCopyrightText: (c) mihakralj
 * SPDX-FileCopyrightText: (c) 2026 marketcalls (port to openalgo-charts)
 * SPDX-License-Identifier: MIT
 *
 * Applies y = sqrt(x) to the chosen source, which compresses large values and
 * stretches small ones so a strongly skewed series reads on a flatter scale.
 * Negative inputs have no real root and are left as gaps.
 */

export default function ({ registerIndicator, sourceValues, nulls }) {
  registerIndicator({
    id: 'oa-sqrt',
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
        // Pine returns na for a negative input; na in, na out.
        if (!Number.isFinite(v) || v < 0) continue
        out[i] = Math.sqrt(v)
      }

      return { sqrt: nulls(out) }
    },
  })
}
