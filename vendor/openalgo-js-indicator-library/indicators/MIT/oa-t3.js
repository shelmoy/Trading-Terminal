/**
 * Tillson T3 Moving Average (T3) - ported to openalgo-charts from Pine Script v6.
 *
 * Source: https://github.com/mihakralj/pinescript/blob/c4e91b962be09733d8fc76caa5191e9e586c5cee/indicators/trends_IIR/t3.pine
 * Repo:   mihakralj/pinescript
 * License: MIT (c) mihakralj
 * SPDX-FileCopyrightText: (c) mihakralj
 * SPDX-FileCopyrightText: (c) 2026 marketcalls (port to openalgo-charts)
 * SPDX-License-Identifier: MIT
 *
 * Six cascaded exponential averages recombined with volume-factor weights, so
 * the curve tracks price with far less lag than a single average of the same
 * period while staying smooth.
 */

export default function ({ registerIndicator, sourceValues, nulls }) {
  registerIndicator({
    id: 'oa-t3',
    name: 'Tillson T3 Moving Average (T3)',
    category: 'Trends IIR',
    placement: 'onchart',

    inputs: [
      { key: 'source', type: 'source', label: 'Source', default: 'close' },
      { key: 'period', type: 'number', label: 'Period', default: 10, min: 1, max: 5000, step: 1 },
      { key: 'vfactor', type: 'number', label: 'Volume Factor', default: 0.7, min: 0, max: 1, step: 0.1 },
    ],

    plots: [{ key: 't3', type: 'line', title: 'T3', style: { color: '#ffeb3b', lineWidth: 2 } }],

    calc(bars, settings) {
      // A cleared number field arrives as '', and Number('') is 0. The volume
      // factor is legitimately 0, so it is read separately from its default.
      const period = Math.max(1, Math.floor(Number(settings.period) || 10))
      const rawV = Number(settings.vfactor)
      const v = Number.isFinite(rawV) && settings.vfactor !== '' && settings.vfactor != null
        ? Math.min(1, Math.max(0, rawV))
        : 0.7

      const src = sourceValues(bars, settings.source ?? 'close')

      const a = 2 / (period + 1)
      const v2 = v * v
      const v3 = v2 * v
      const c1 = -v3
      const c2 = 3 * (v2 + v3)
      const c3 = -3 * (2 * v2 + v + v3)
      const c4 = 1 + 3 * v + 3 * v2 + v3

      const out = new Array(bars.length).fill(NaN)
      // Pine seeds all six stages from the first non-na source value and emits
      // that value itself on the seed bar.
      let seeded = false
      let e1 = NaN
      let e2 = NaN
      let e3 = NaN
      let e4 = NaN
      let e5 = NaN
      let e6 = NaN

      for (let i = 0; i < bars.length; i++) {
        const s = src[i]
        if (!Number.isFinite(s)) continue

        if (!seeded) {
          e1 = s
          e2 = s
          e3 = s
          e4 = s
          e5 = s
          e6 = s
          out[i] = s
          seeded = true
        } else {
          e1 = e1 + a * (s - e1)
          e2 = e2 + a * (e1 - e2)
          e3 = e3 + a * (e2 - e3)
          e4 = e4 + a * (e3 - e4)
          e5 = e5 + a * (e4 - e5)
          e6 = e6 + a * (e5 - e6)
          out[i] = c1 * e6 + c2 * e5 + c3 * e4 + c4 * e3
        }
      }

      return { t3: nulls(out) }
    },
  })
}
