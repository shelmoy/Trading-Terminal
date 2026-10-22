/**
 * Logistic Function (SIGMOID) - ported to openalgo-charts from Pine Script v6.
 *
 * Source: https://github.com/mihakralj/pinescript/blob/c4e91b962be09733d8fc76caa5191e9e586c5cee/indicators/numerics/sigmoid.pine
 * Repo:   mihakralj/pinescript
 * License: MIT (c) mihakralj
 * SPDX-FileCopyrightText: (c) mihakralj
 * SPDX-FileCopyrightText: (c) 2026 marketcalls (port to openalgo-charts)
 * SPDX-License-Identifier: MIT
 *
 * Squashes the distance between the source and its 200-period average through
 * the logistic curve, mapping any excursion onto the open interval (0, 1).
 */

export default function ({ registerIndicator, sourceValues, sma, nulls }) {
  // The Pine main loop hardcodes ta.sma(source, 200) as the sigmoid midpoint,
  // so the curve reads 0.5 exactly where price sits on its 200-period average.
  const MIDPOINT_LENGTH = 200

  registerIndicator({
    id: 'oa-sigmoid',
    name: 'Logistic Function (SIGMOID)',
    category: 'Numerics',
    placement: 'pane',

    inputs: [
      { key: 'source', type: 'source', label: 'Source', default: 'close' },
      {
        key: 'steepness',
        type: 'number',
        label: 'Steepness (k)',
        default: 0.5,
        min: 0.000001,
        max: 1000,
        step: 0.1,
        tooltip: 'Higher k makes the curve steeper, so it saturates closer to the average.',
      },
    ],

    plots: [{ key: 'sigmoid', type: 'line', title: 'Sigmoid', style: { color: '#ffeb3b', lineWidth: 2 } }],

    calc(bars, settings) {
      // A cleared number field arrives as '', and Number('') is 0.
      const k = Math.max(0.000001, Number(settings.steepness) || 0.5)
      const src = sourceValues(bars, settings.source ?? 'close')
      // ta.sma is na for the first MIDPOINT_LENGTH - 1 bars, and so is the curve.
      const midpoint = sma(src, MIDPOINT_LENGTH)
      const out = new Array(bars.length).fill(NaN)

      for (let i = 0; i < bars.length; i++) {
        if (!Number.isFinite(src[i]) || !Number.isFinite(midpoint[i])) continue
        // math.exp saturates to Infinity on a large excursion, which lands the
        // result on 0 rather than on NaN, exactly as the formula demands.
        const value = 1 / (1 + Math.exp(-k * (src[i] - midpoint[i])))
        if (Number.isFinite(value)) out[i] = value
      }

      return { sigmoid: nulls(out) }
    },
  })
}
