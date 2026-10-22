/**
 * Ehlers Reflex Indicator (REFLEX) - ported to openalgo-charts from Pine Script v6.
 *
 * Source: https://github.com/mihakralj/pinescript/blob/c4e91b962be09733d8fc76caa5191e9e586c5cee/indicators/oscillators/reflex.pine
 * Repo:   mihakralj/pinescript
 * License: MIT
 * SPDX-FileCopyrightText: (c) mihakralj
 * SPDX-FileCopyrightText: (c) 2026 marketcalls (port to openalgo-charts)
 * SPDX-License-Identifier: MIT
 *
 * A two-pole Super Smoother is run at half the cycle period, a straight line is
 * extrapolated forward from the filtered value of N bars ago, and the average
 * gap between that line and the filtered series is normalised by an exponential
 * RMS, so the output reads roughly in standard deviations either side of zero.
 */

export default function ({ registerIndicator, sourceValues, nulls, withAlpha }) {
  registerIndicator({
    id: 'oa-reflex',
    name: 'Ehlers Reflex Indicator (REFLEX)',
    category: 'Oscillators',
    placement: 'pane',

    inputs: [
      { key: 'period', type: 'number', label: 'Period', default: 20, min: 2, max: 5000, step: 1 },
      { key: 'source', type: 'source', label: 'Source', default: 'close' },
    ],

    plots: [{ key: 'reflex', type: 'line', title: 'REFLEX', style: { color: '#ffeb3b', lineWidth: 2 } }],

    levels: () => [
      { price: 0, title: 'Zero', color: '#9598a1' },
      { price: 1, title: '+1 Sigma', color: withAlpha('#ff5252', 0.4) },
      { price: -1, title: '-1 Sigma', color: withAlpha('#4caf50', 0.4) },
    ],

    calc(bars, settings) {
      // A cleared number field arrives as '', and Number('') is 0.
      const period = Math.max(2, Math.floor(Number(settings.period) || 20))
      const src = sourceValues(bars, settings.source ?? 'close')
      const n = bars.length
      const out = new Array(n).fill(NaN)

      // Two-pole Super Smoother coefficients at the half-period cutoff.
      const halfPeriod = period * 0.5
      const a1 = Math.exp((-1.414 * Math.PI) / halfPeriod)
      const b1 = 2 * a1 * Math.cos((1.414 * Math.PI) / halfPeriod)
      const c2 = b1
      const c3 = -(a1 * a1)
      const c1 = 1 - c2 - c3

      let filt = 0
      let filt1 = 0
      let filt2 = 0

      // Pine seeds the ring buffer with 0.0, so the lag slot still reads 0 on the
      // first bar the summation runs. Reproduced rather than treated as warmup.
      const buf = new Array(period + 1).fill(0)
      let head = 0
      let ms = 0

      for (let i = 0; i < n; i++) {
        // Pine wraps both the current and the previous sample in nz().
        const price = Number.isFinite(src[i]) ? src[i] : 0
        const prevPrice = i > 0 && Number.isFinite(src[i - 1]) ? src[i - 1] : 0

        filt2 = filt1
        filt1 = filt
        filt = c1 * (price + prevPrice) * 0.5 + c2 * filt1 + c3 * filt2

        buf[head] = filt
        const count = Math.min(i + 1, period)

        const lagIdx = (head + 1) % (period + 1)
        const filtLag = buf[lagIdx]
        const slope = (filtLag - filt) / period

        let theSum = 0
        if (count >= period) {
          for (let k = 1; k <= period; k++) {
            const idx = (head - k + period + 1) % (period + 1)
            theSum += filt + k * slope - buf[idx]
          }
          theSum /= period
        }

        head = (head + 1) % (period + 1)

        ms = 0.04 * theSum * theSum + 0.96 * ms
        out[i] = ms > 0 ? theSum / Math.sqrt(ms) : 0
      }

      return { reflex: nulls(out) }
    },
  })
}
