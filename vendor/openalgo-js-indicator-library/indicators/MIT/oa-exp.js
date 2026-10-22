/**
 * Exponential Transformation (EXP) - ported to openalgo-charts from Pine Script v6.
 *
 * Source: https://github.com/mihakralj/pinescript/blob/c4e91b962be09733d8fc76caa5191e9e586c5cee/indicators/numerics/exp.pine
 * Repo:   mihakralj/pinescript
 * License: MIT (c) mihakralj
 * SPDX-FileCopyrightText: (c) mihakralj
 * SPDX-FileCopyrightText: (c) 2026 marketcalls (port to openalgo-charts)
 * SPDX-License-Identifier: MIT
 *
 * Applies y = e^x to the chosen source, one bar at a time. It is a raw numeric
 * transform, so it is only readable on a series already scaled near zero, such
 * as a log return or a normalised oscillator.
 */

export default function ({ registerIndicator, sourceValues, nulls }) {
  registerIndicator({
    id: 'oa-exp',
    name: 'Exponential Transformation (EXP)',
    category: 'Numerics',
    placement: 'pane',

    inputs: [{ key: 'source', type: 'source', label: 'Source', default: 'close' }],

    plots: [
      {
        key: 'exp',
        type: 'line',
        title: 'Exponential Transformation',
        style: { color: '#ffeb3b', lineWidth: 2 },
      },
    ],

    calc(bars, settings) {
      const src = sourceValues(bars, settings.source ?? 'close')
      const out = new Array(bars.length).fill(NaN)

      for (let i = 0; i < bars.length; i++) {
        const value = src[i]
        if (!Number.isFinite(value)) continue
        const transformed = Math.exp(value)
        // Math.exp overflows to Infinity above about 709, which every price
        // series crosses. Pine reports that as na, and an Infinity here would
        // destroy the pane's autoscale, so it becomes a gap.
        if (Number.isFinite(transformed)) out[i] = transformed
      }

      return { exp: nulls(out) }
    },
  })
}
