/**
 * Notch Filter (NOTCH) - ported to openalgo-charts from Pine Script v6.
 *
 * Source: https://github.com/mihakralj/pinescript/blob/c4e91b962be09733d8fc76caa5191e9e586c5cee/indicators/filters/notch.pine
 * Repo:   mihakralj/pinescript
 * License: MIT (c) mihakralj
 * SPDX-FileCopyrightText: (c) mihakralj
 * SPDX-FileCopyrightText: (c) 2026 marketcalls (port to openalgo-charts)
 * SPDX-License-Identifier: MIT
 *
 * A second-order IIR notch removes one cycle length from price and leaves
 * everything else close to untouched, so a known periodic component can be
 * taken out without the lag a smoothing filter would add.
 */

export default function ({ registerIndicator, sourceValues, nulls }) {
  registerIndicator({
    id: 'oa-notch',
    name: 'Notch Filter (NOTCH)',
    category: 'Filters',
    placement: 'onchart',

    inputs: [
      { key: 'source', type: 'source', label: 'Source', default: 'close' },
      {
        key: 'period',
        type: 'number',
        label: 'Period to Remove',
        default: 14,
        min: 2,
        max: 5000,
        step: 1,
        tooltip: 'Cycle length placed at the centre of the notch.',
      },
      {
        key: 'bandwidth',
        type: 'number',
        label: 'Relative Bandwidth',
        default: 0.3,
        min: 0.01,
        max: 0.99,
        step: 0.01,
        tooltip: 'Width of the notch as a fraction of its centre frequency. Narrow removes less either side.',
      },
    ],

    plots: [{ key: 'notch', type: 'line', title: 'Notch', style: { color: '#ffeb3b', lineWidth: 2 } }],

    calc(bars, settings) {
      const n = bars.length
      // A cleared number field arrives as '', and Number('') is 0.
      const period = Math.max(2, Math.floor(Number(settings.period) || 14))
      const bandwidth = Math.min(0.99, Math.max(0.01, Number(settings.bandwidth) || 0.3))
      const src = sourceValues(bars, settings.source ?? 'close')

      const omega = (2 * Math.PI) / period
      const bwAbs = bandwidth * omega
      // The source clamps the half-bandwidth argument before taking its tangent,
      // which is what keeps the coefficients finite at any period.
      const tanArg = Math.max(Math.min(bwAbs / 2, Math.PI * 0.499), 0.0001)
      const tanBwHalf = Math.tan(tanArg)
      const alpha = (1 - tanBwHalf) / (1 + tanBwHalf)
      const beta = Math.cos(omega)
      const a1 = -2 * beta * alpha
      const a2 = alpha * alpha
      const b0 = (1 + alpha * alpha) / 2
      const b1 = a1
      const b2 = b0

      const out = new Array(n).fill(NaN)
      let y1 = 0
      let y2 = 0
      let x1 = 0
      let x2 = 0

      for (let i = 0; i < n; i++) {
        const x0 = Number.isFinite(src[i]) ? src[i] : 0
        if (i < 1) {
          // Seed the delay line with the first price so the filter starts at rest.
          x1 = x0
          x2 = x0
          y1 = x0
          y2 = x0
        }
        const y0 = b0 * x0 + b1 * x1 + b2 * x2 - a1 * y1 - a2 * y2
        y2 = y1
        y1 = y0
        x2 = x1
        x1 = x0
        out[i] = Number.isFinite(y0) ? y0 : NaN
      }

      return { notch: nulls(out) }
    },
  })
}
