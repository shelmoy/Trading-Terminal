/**
 * Ehlers Recursive Median Filter (RMED) - ported to openalgo-charts from Pine Script v6.
 *
 * Source: https://github.com/mihakralj/pinescript/blob/c4e91b962be09733d8fc76caa5191e9e586c5cee/indicators/filters/rmed.pine
 * Repo:   mihakralj/pinescript
 * License: MIT (c) mihakralj
 * SPDX-FileCopyrightText: (c) mihakralj
 * SPDX-FileCopyrightText: (c) 2026 marketcalls (port to openalgo-charts)
 * SPDX-License-Identifier: MIT
 *
 * A nonlinear IIR filter: a 5-bar running median throws away impulsive spikes
 * that a linear average would smear, and an EMA whose constant comes from the
 * Ehlers cycle-period formula tracks what is left with little lag.
 */

export default function ({ registerIndicator, sourceValues, nulls }) {
  registerIndicator({
    id: 'oa-rmed',
    name: 'Ehlers Recursive Median Filter (RMED)',
    category: 'Filters',
    placement: 'onchart',

    inputs: [
      { key: 'period', type: 'number', label: 'Period', default: 12, min: 1, max: 5000, step: 1 },
      { key: 'source', type: 'source', label: 'Source', default: 'close' },
    ],

    plots: [
      { key: 'rmed', type: 'line', title: 'RMED', style: { color: '#ffeb3b', lineWidth: 2 } },
    ],

    calc(bars, settings) {
      const n = bars.length
      // A cleared number field arrives as '', and Number('') is 0.
      const period = Math.max(1, Math.floor(Number(settings.period) || 12))
      const src = sourceValues(bars, settings.source ?? 'close')

      // alpha = (cos(2pi/P) + sin(2pi/P) - 1) / cos(2pi/P), clamped to [0, 1].
      // The clamp is what keeps a division by a near-zero cosine harmless: an
      // infinite ratio lands on a bound rather than poisoning the recursion.
      const angle = 360 / period
      const cosA = Math.cos((angle * Math.PI) / 180)
      const sinA = Math.sin((angle * Math.PI) / 180)
      let alpha = (cosA + sinA - 1) / cosA
      if (Number.isNaN(alpha)) alpha = 0
      alpha = Math.max(0, Math.min(1, alpha))

      // Pine seeds the 5-slot ring with 0.0, so the medians of the first four
      // bars genuinely include those zeros. Reproduced rather than hidden: the
      // source emits a value from bar 0 and has no na warmup.
      const buf = [0, 0, 0, 0, 0]
      const temp = [0, 0, 0, 0, 0]
      let head = 0
      let rm = 0

      const out = new Array(n).fill(NaN)
      for (let i = 0; i < n; i++) {
        const price = Number.isFinite(src[i]) ? src[i] : 0
        buf[head] = price
        head = (head + 1) % 5

        for (let k = 0; k < 5; k++) temp[k] = buf[k]
        temp.sort((a, b) => a - b)
        const med5 = temp[2]

        rm = i === 0 ? price : alpha * med5 + (1 - alpha) * rm
        out[i] = rm
      }

      return { rmed: nulls(out) }
    },
  })
}
