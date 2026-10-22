/**
 * Momentum (MOM) - ported to openalgo-charts from Pine Script v6.
 *
 * Source: https://github.com/mihakralj/pinescript/blob/c4e91b962be09733d8fc76caa5191e9e586c5cee/indicators/momentum/mom.pine
 * Repo:   mihakralj/pinescript
 * License: MIT (c) mihakralj
 * SPDX-FileCopyrightText: (c) mihakralj
 * SPDX-FileCopyrightText: (c) 2026 marketcalls (port to openalgo-charts)
 * SPDX-License-Identifier: MIT
 *
 * The raw difference between the source and its value a fixed number of bars
 * back, so the line sits above zero while price is advancing and below it
 * while price is falling.
 */

export default function ({ registerIndicator, sourceValues, nulls }) {
  registerIndicator({
    id: 'oa-mom',
    name: 'Momentum (MOM)',
    category: 'Momentum',
    placement: 'pane',

    inputs: [
      { key: 'length', type: 'number', label: 'Length', default: 10, min: 1, max: 5000, step: 1 },
      { key: 'source', type: 'source', label: 'Source', default: 'close' },
    ],

    plots: [{ key: 'mom', type: 'line', title: 'MOM', style: { color: '#ffeb3b', lineWidth: 2 } }],

    calc(bars, settings) {
      // A cleared number field arrives as '', and Number('') is 0.
      const length = Math.max(1, Math.floor(Number(settings.length) || 10))
      const src = sourceValues(bars, settings.source ?? 'close')

      const mom = new Array(bars.length).fill(NaN)
      for (let i = length; i < bars.length; i++) {
        // Pine guards with not na(src) and not na(src[len]); every comparison
        // against a missing value is false there, so both must be finite here.
        if (!Number.isFinite(src[i]) || !Number.isFinite(src[i - length])) continue
        mom[i] = src[i] - src[i - length]
      }
      // Pine substitutes a placeholder 0.0 on the first `length` bars, where
      // src[len] does not exist yet. That is not a momentum reading, so it is
      // left as a warmup gap rather than drawn as a flat zero line.

      return { mom: nulls(mom) }
    },
  })
}
