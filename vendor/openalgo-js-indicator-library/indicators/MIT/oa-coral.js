/**
 * Coral Filter (CORAL) - ported to openalgo-charts from Pine Script v6.
 *
 * Source: https://github.com/mihakralj/pinescript/blob/c4e91b962be09733d8fc76caa5191e9e586c5cee/indicators/trends_IIR/coral.pine
 * Repo:   mihakralj/pinescript
 * License: MIT
 * SPDX-FileCopyrightText: (c) mihakralj
 * SPDX-FileCopyrightText: (c) 2026 marketcalls (port to openalgo-charts)
 * SPDX-License-Identifier: MIT
 *
 * Six cascaded exponential passes are recombined with polynomial weights drawn
 * from a single constant, giving a trend line that is smooth but lags far less
 * than a plain moving average of the same period.
 */

export default function ({ registerIndicator, sourceValues, nulls }) {
  registerIndicator({
    id: 'oa-coral',
    name: 'Coral Filter (CORAL)',
    category: 'Trends IIR',
    placement: 'onchart',

    inputs: [
      { key: 'period', type: 'number', label: 'Smoothing Period', default: 21, min: 1, max: 5000, step: 1 },
      {
        key: 'cd',
        type: 'number',
        label: 'Constant D',
        default: 0.4,
        min: 0,
        max: 1,
        step: 0.01,
        tooltip: 'Weighting of the cascaded stages. Higher values follow price more closely at the cost of smoothness.',
      },
      { key: 'source', type: 'source', label: 'Source', default: 'close' },
    ],

    plots: [{ key: 'coral', type: 'line', title: 'CORAL', style: { color: '#ffeb3b', lineWidth: 2 } }],

    calc(bars, settings) {
      // A cleared number field arrives as '', and Number('') is 0.
      const period = Math.max(1, Math.floor(Number(settings.period) || 21))
      const rawCd = Number(settings.cd)
      const cd = Math.min(1, Math.max(0, Number.isFinite(rawCd) ? rawCd : 0.4))
      const src = sourceValues(bars, settings.source ?? 'close')

      const di = (period - 1.0) / 2.0 + 1.0
      const c1 = 2.0 / (di + 1.0)
      const c2 = 1.0 - c1

      const cd2 = cd * cd
      const cd3 = cd2 * cd
      const c3 = 3.0 * (cd2 + cd3)
      const c4 = -3.0 * (2.0 * cd2 + cd + cd3)
      const c5 = 3.0 * cd + 1.0 + cd3 + 3.0 * cd2

      // Pine declares the six stages as var floats seeded at 0, so the filter
      // emits from the very first bar and settles over the first few periods.
      let i1 = 0.0
      let i2 = 0.0
      let i3 = 0.0
      let i4 = 0.0
      let i5 = 0.0
      let i6 = 0.0

      const out = new Array(bars.length).fill(NaN)
      for (let i = 0; i < bars.length; i++) {
        const s = src[i]
        // A non-finite source would poison every stage for the rest of the
        // series, so hold the cascade and leave the bar empty instead.
        if (!Number.isFinite(s)) continue

        i1 = c1 * s + c2 * i1
        i2 = c1 * i1 + c2 * i2
        i3 = c1 * i2 + c2 * i3
        i4 = c1 * i3 + c2 * i4
        i5 = c1 * i4 + c2 * i5
        i6 = c1 * i5 + c2 * i6

        out[i] = -cd3 * i6 + c3 * i5 + c4 * i4 + c5 * i3
      }

      return { coral: nulls(out) }
    },
  })
}
