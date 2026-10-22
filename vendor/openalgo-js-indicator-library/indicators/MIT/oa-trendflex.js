/**
 * Ehlers Trendflex Indicator (TRENDFLEX) - ported to openalgo-charts from Pine Script v6.
 *
 * Source: https://github.com/mihakralj/pinescript/blob/c4e91b962be09733d8fc76caa5191e9e586c5cee/indicators/oscillators/trendflex.pine
 * Repo:   mihakralj/pinescript
 * License: MIT (c) mihakralj
 * SPDX-FileCopyrightText: (c) mihakralj
 * SPDX-FileCopyrightText: (c) 2026 marketcalls (port to openalgo-charts)
 * SPDX-License-Identifier: MIT
 *
 * A SuperSmoother pre-filter feeds the average distance between the filtered
 * price and its own recent history; dividing that by its running root mean
 * square gives a trend gauge centred on zero and comparable across symbols.
 */

export default function ({ registerIndicator, sourceValues, nulls }) {
  registerIndicator({
    id: 'oa-trendflex',
    name: ' Ehlers Trendflex Indicator (TRENDFLEX)',
    category: 'Oscillators',
    placement: 'pane',

    inputs: [
      {
        key: 'period',
        type: 'number',
        label: 'Period',
        default: 20,
        min: 1,
        max: 5000,
        step: 1,
        tooltip: 'Lookback period for trend measurement.',
      },
      { key: 'source', type: 'source', label: 'Source', default: 'close' },
    ],

    plots: [
      { key: 'trendflex', type: 'line', title: 'TRENDFLEX', style: { color: '#ffeb3b', lineWidth: 2 } },
    ],

    levels: () => [{ price: 0, title: 'Zero', color: '#787b86', dashed: true }],

    calc(bars, settings) {
      // A cleared number field arrives as '', and Number('') is 0.
      const period = Math.max(1, Math.floor(Number(settings.period) || 20))
      const raw = sourceValues(bars, settings.source ?? 'close')

      // SuperSmoother (2-pole Butterworth lowpass) coefficients.
      const halfPeriod = period * 0.5
      const a1 = Math.exp((-1.414 * Math.PI) / halfPeriod)
      const b1 = 2 * a1 * Math.cos((1.414 * Math.PI) / halfPeriod)
      const c2 = b1
      const c3 = -(a1 * a1)
      const c1 = 1 - c2 - c3

      // Pine's nz(source): a missing bar value enters the filter as zero, and
      // only the plotted result is blanked for that bar.
      const src = new Array(bars.length)
      for (let i = 0; i < bars.length; i++) src[i] = Number.isFinite(raw[i]) ? raw[i] : 0

      // var state carried bar to bar.
      let filt = 0
      let filt1 = 0
      const buf = new Array(period).fill(0)
      let head = 0
      let runningSum = 0
      let count = 0
      let ms = 0

      const out = new Array(bars.length).fill(NaN)

      for (let i = 0; i < bars.length; i++) {
        const prevSrc = i > 0 ? src[i - 1] : 0
        const newFilt = i < 2 ? src[i] : c1 * (src[i] + prevSrc) * 0.5 + c2 * filt + c3 * filt1
        filt1 = filt
        filt = newFilt

        // Cumulative slope as a running sum: sum(Filt - Filt[k]) for k = 1..N
        // equals N * Filt - sum(Filt[k]), divided by the period.
        const n = Math.min(count, period)
        const slopeSum = n > 0 ? (n * newFilt - runningSum) / period : 0

        runningSum -= buf[head]
        runningSum += newFilt
        buf[head] = newFilt
        head = (head + 1) % period
        if (count < period) count += 1

        // RMS normalisation via an exponential mean square.
        ms = 0.04 * slopeSum * slopeSum + 0.96 * ms

        const result = ms > 0 ? slopeSum / Math.sqrt(ms) : 0
        // Pine returns na where the source is na, which keeps the gap visible.
        if (Number.isFinite(raw[i]) && Number.isFinite(result)) out[i] = result
      }

      return { trendflex: nulls(out) }
    },
  })
}
