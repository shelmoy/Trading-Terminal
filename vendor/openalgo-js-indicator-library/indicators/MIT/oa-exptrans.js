/**
 * Exponential Transformation (EXP) - ported to openalgo-charts from Pine Script v6.
 *
 * Source: https://github.com/mihakralj/pinescript/blob/c4e91b962be09733d8fc76caa5191e9e586c5cee/indicators/numerics/exptrans.pine
 * Repo:   mihakralj/pinescript
 * License: MIT (c) mihakralj
 * SPDX-FileCopyrightText: (c) mihakralj
 * SPDX-FileCopyrightText: (c) 2026 marketcalls (port to openalgo-charts)
 * SPDX-License-Identifier: MIT
 *
 * Applies y = e^x element by element to the chosen source, so a series that is
 * already normalised (a z-score, a log return, an oscillator around zero) is
 * re-expressed on a multiplicative scale.
 */

export default function ({ registerIndicator, sourceValues, nulls }) {
  registerIndicator({
    id: 'oa-exptrans',
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
        // Pine raises on an na source; here a missing bar value stays a gap.
        if (!Number.isFinite(src[i])) continue
        const value = Math.exp(src[i])
        // e^x overflows to Infinity above about 709. Pine plots the overflow as
        // nothing usable either, so leave the bar empty rather than let an
        // infinite value destroy the pane's autoscale.
        if (!Number.isFinite(value)) continue
        out[i] = value
      }

      return { exp: nulls(out) }
    },
  })
}
