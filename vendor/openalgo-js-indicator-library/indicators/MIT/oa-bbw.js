/**
 * Bollinger Band Width (BBW) - ported to openalgo-charts from Pine Script v6.
 *
 * Source: https://github.com/mihakralj/pinescript/blob/c4e91b962be09733d8fc76caa5191e9e586c5cee/indicators/volatility/bbw.pine
 * Repo:   mihakralj/pinescript
 * License: MIT (c) mihakralj
 * SPDX-FileCopyrightText: (c) mihakralj
 * SPDX-FileCopyrightText: (c) 2026 marketcalls (port to openalgo-charts)
 * SPDX-License-Identifier: MIT
 *
 * The absolute distance between the upper and lower Bollinger Bands, which is
 * twice the multiplier times the standard deviation of the source. It reads as
 * raw volatility: squeezes show as troughs, expansions as spikes.
 */

export default function ({ registerIndicator, sourceValues, nulls }) {
  registerIndicator({
    id: 'oa-bbw',
    name: 'Bollinger Band Width (BBW)',
    category: 'Volatility',
    placement: 'pane',

    inputs: [
      { key: 'period', type: 'number', label: 'Period', default: 20, min: 1, max: 5000, step: 1 },
      { key: 'source', type: 'source', label: 'Source', default: 'close' },
      {
        key: 'multiplier',
        type: 'number',
        label: 'StdDev Multiplier',
        default: 2,
        min: 0.001,
        max: 100,
        step: 0.1,
      },
    ],

    plots: [{ key: 'bbw', type: 'line', title: 'BBW', style: { color: '#ffeb3b', lineWidth: 2 } }],

    calc(bars, settings) {
      // A cleared number field arrives as '', and Number('') is 0.
      const period = Math.max(1, Math.floor(Number(settings.period) || 20))
      const multiplier = Math.max(0.001, Number(settings.multiplier) || 2)
      const src = sourceValues(bars, settings.source || 'close')
      const n = bars.length
      const p = Math.max(1, period)

      // The Pine version keeps running sums in a circular buffer of p slots and
      // pushes nz(source) on every bar, so the window expands from one value to
      // p and the deviation is the population one, sqrt(E[x^2] - E[x]^2).
      const v = new Array(n)
      for (let i = 0; i < n; i++) v[i] = Number.isFinite(src[i]) ? src[i] : 0

      const out = new Array(n).fill(NaN)
      let sum = 0
      let sumSq = 0
      for (let i = 0; i < n; i++) {
        if (i >= p) {
          const oldest = v[i - p]
          sum -= oldest
          sumSq -= oldest * oldest
        }
        sum += v[i]
        sumSq += v[i] * v[i]
        const count = Math.min(i + 1, p)
        // A single sample has no width: the source reports 0 there, which would
        // drag the pane's autoscale to zero, so the port leaves it as a gap.
        if (count <= 1) continue
        const basis = sum / count
        const dev = multiplier * Math.sqrt(Math.max(0, sumSq / count - basis * basis))
        out[i] = 2 * dev
      }

      return { bbw: nulls(out) }
    },
  })
}
