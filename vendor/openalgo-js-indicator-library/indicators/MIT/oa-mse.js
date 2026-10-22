/**
 * Mean Squared Error (MSE) - ported to openalgo-charts from Pine Script v6.
 *
 * Source: https://github.com/mihakralj/pinescript/blob/c4e91b962be09733d8fc76caa5191e9e586c5cee/indicators/errors/mse.pine
 * Repo:   mihakralj/pinescript
 * License: MIT (c) mihakralj
 * SPDX-FileCopyrightText: (c) mihakralj
 * SPDX-FileCopyrightText: (c) 2026 marketcalls (port to openalgo-charts)
 * SPDX-License-Identifier: MIT
 *
 * The average squared gap between the source and its own exponential average
 * over a rolling window, a plain measure of how far price is running from its
 * own trend estimate.
 */

export default function ({ registerIndicator, sourceValues, smaSeededEma, nulls }) {
  registerIndicator({
    id: 'oa-mse',
    name: 'Mean Squared Error (MSE)',
    category: 'Errors',
    // The Pine indicator() call carries no overlay flag, so the study sits in
    // its own pane; only the reference average uses force_overlay, which maps
    // onto the 'overlay: true' plot below.
    placement: 'pane',

    inputs: [
      { key: 'source', type: 'source', label: 'Source', default: 'close' },
      { key: 'period', type: 'number', label: 'Period', default: 100, min: 1, max: 4000, step: 1 },
    ],

    plots: [
      { key: 'mse', type: 'area', title: 'MSE', style: { color: '#ef5350', lineWidth: 2 } },
      { key: 'ema', type: 'line', title: 'EMA', overlay: true, style: { color: '#ffeb3b', lineWidth: 1 } },
    ],

    calc(bars, settings) {
      // A cleared number field arrives as '', and Number('') is 0.
      const period = Math.max(1, Math.floor(Number(settings.period) || 100))
      const src = sourceValues(bars, settings.source ?? 'close')

      // Pine's ta.ema seeds from the SMA of the first `period` values, so the
      // reference series is na for the first period - 1 bars.
      const reference = smaSeededEma(src, period)

      const out = new Array(bars.length).fill(NaN)
      const emaOut = new Array(bars.length).fill(NaN)

      // Circular window of squared errors; na entries are stored but not counted.
      const p = Math.min(Math.max(1, period), 4000)
      const buffer = new Array(p).fill(NaN)
      let head = 0
      let sum = 0
      let validCount = 0

      for (let i = 0; i < bars.length; i++) {
        const a = src[i]
        const b = reference[i]
        if (Number.isFinite(b)) emaOut[i] = b

        let squaredError = NaN
        if (Number.isFinite(a) && Number.isFinite(b)) {
          const diff = a - b
          squaredError = diff * diff
        }

        const oldest = buffer[head]
        if (Number.isFinite(oldest)) {
          sum -= oldest
          validCount -= 1
        }
        if (Number.isFinite(squaredError)) {
          sum += squaredError
          validCount += 1
        }
        buffer[head] = squaredError
        head = (head + 1) % p

        out[i] = validCount > 0 ? sum / validCount : squaredError
      }

      return { mse: nulls(out), ema: nulls(emaOut) }
    },
  })
}
