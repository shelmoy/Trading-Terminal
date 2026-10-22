/**
 * Hyperbolic Tangent (TANH) - ported to openalgo-charts from Pine Script v6.
 *
 * Source: https://github.com/mihakralj/pinescript/blob/c4e91b962be09733d8fc76caa5191e9e586c5cee/indicators/numerics/tanh.pine
 * Repo:   mihakralj/pinescript
 * License: MIT (c) mihakralj
 * SPDX-FileCopyrightText: (c) mihakralj
 * SPDX-FileCopyrightText: (c) 2026 marketcalls (port to openalgo-charts)
 * SPDX-License-Identifier: MIT
 *
 * Squashes the distance between the source and its 200 period simple average
 * into the open range -1 to +1, so a stretch far from the mean saturates instead
 * of running off the scale.
 */

export default function ({ registerIndicator, sourceValues, sma, nulls }) {
  // The inflection point is the 200 bar simple average, fixed in the source.
  const X0_LENGTH = 200

  registerIndicator({
    id: 'oa-tanh',
    name: 'Hyperbolic Tangent (TANH)',
    category: 'Numerics',
    placement: 'pane',

    inputs: [
      { key: 'source', type: 'source', label: 'Source', default: 'close' },
      { key: 'steepness', type: 'number', label: 'Steepness (k)', default: 0.5, min: 0.1, max: 100, step: 0.1,
        tooltip: 'Higher k makes the curve steeper around the inflection point.' },
    ],

    plots: [{ key: 'tanh', type: 'line', title: 'Tanh', style: { color: '#ffeb3b', lineWidth: 2 } }],

    calc(bars, settings) {
      // A cleared number field arrives as '', and Number('') is 0.
      const k = Math.max(0.1, Number(settings.steepness) || 0.5)
      const src = sourceValues(bars, settings.source ?? 'close')

      // ta.sma is na for the first 199 bars, and Pine's na propagates through
      // the whole expression, so the output is a gap over the same stretch.
      const x0 = sma(src, X0_LENGTH)

      const out = new Array(bars.length).fill(NaN)
      for (let i = 0; i < bars.length; i++) {
        if (!Number.isFinite(src[i]) || !Number.isFinite(x0[i])) continue
        const y = k * (src[i] - x0[i])
        // (exp(y) - exp(-y)) / (exp(y) + exp(-y)) written stably: the explicit
        // form overflows to Infinity/Infinity past |y| of about 710, where the
        // true value is already plus or minus 1.
        out[i] = Math.tanh(y)
      }

      return { tanh: nulls(out) }
    },
  })
}
