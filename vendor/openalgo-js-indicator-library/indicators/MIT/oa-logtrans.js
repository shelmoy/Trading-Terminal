/**
 * Logarithmic Transformation (LOG) - ported to openalgo-charts from Pine Script v6.
 *
 * Source: https://github.com/mihakralj/pinescript/blob/c4e91b962be09733d8fc76caa5191e9e586c5cee/indicators/numerics/logtrans.pine
 * Repo:   mihakralj/pinescript
 * License: MIT (c) mihakralj
 * SPDX-FileCopyrightText: (c) mihakralj
 * SPDX-FileCopyrightText: (c) 2026 marketcalls (port to openalgo-charts)
 * SPDX-License-Identifier: MIT
 *
 * Applies the natural logarithm to the chosen source, compressing a
 * multiplicative price scale into an additive one so equal percentage moves
 * cover equal vertical distance. Non-positive values have no logarithm and are
 * left as gaps.
 */

export default function ({ registerIndicator, sourceValues, nulls }) {
  registerIndicator({
    id: 'oa-logtrans',
    name: 'Logarithmic Transformation (LOG)',
    category: 'Numerics',
    placement: 'pane',

    inputs: [{ key: 'source', type: 'source', label: 'Source', default: 'close' }],

    plots: [{ key: 'log', type: 'line', title: 'Log Transformation', style: { color: '#ffeb3b', lineWidth: 2 } }],

    calc(bars, settings) {
      const src = sourceValues(bars, settings.source ?? 'close')

      const out = new Array(bars.length).fill(NaN)
      for (let i = 0; i < bars.length; i++) {
        const v = src[i]
        // Pine returns na for source <= 0; ln of a non-positive number does not exist.
        if (!Number.isFinite(v) || v <= 0) continue
        out[i] = Math.log(v)
      }

      return { log: nulls(out) }
    },
  })
}
