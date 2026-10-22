/**
 * Root Mean Squared Logarithmic Error (RMSLE) - ported to openalgo-charts from Pine Script v6.
 *
 * Source: https://github.com/mihakralj/pinescript/blob/c4e91b962be09733d8fc76caa5191e9e586c5cee/indicators/errors/rmsle.pine
 * Repo:   mihakralj/pinescript
 * License: MIT (c) mihakralj
 * SPDX-FileCopyrightText: (c) mihakralj
 * SPDX-FileCopyrightText: (c) 2026 marketcalls (port to openalgo-charts)
 * SPDX-License-Identifier: MIT
 *
 * The same idea as mean squared error but measured on log price, so the gap
 * between the source and its own exponential average is read as a relative
 * distance rather than an absolute one.
 */

export default function ({ registerIndicator, sourceValues, smaSeededEma, nulls }) {
  registerIndicator({
    id: 'oa-rmsle',
    name: 'Root Mean Squared Logarithmic Error (RMSLE)',
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
      { key: 'rmsle', type: 'area', title: 'RMSLE', style: { color: '#ef5350', lineWidth: 2 } },
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

      // Circular window of squared log errors; na entries are stored but not counted.
      const p = Math.min(Math.max(1, period), 4000)
      const buffer = new Array(p).fill(NaN)
      let head = 0
      let sum = 0
      let validCount = 0

      for (let i = 0; i < bars.length; i++) {
        const a = src[i]
        const b = reference[i]
        if (Number.isFinite(b)) emaOut[i] = b

        // log of a non-positive argument is not available in Pine either, so a
        // source at or below -1 leaves this bar out of the window.
        let logSquaredError = NaN
        if (Number.isFinite(a) && Number.isFinite(b) && 1 + a > 0 && 1 + b > 0) {
          const diff = Math.log(1 + a) - Math.log(1 + b)
          const squared = diff * diff
          if (Number.isFinite(squared)) logSquaredError = squared
        }

        const oldest = buffer[head]
        if (Number.isFinite(oldest)) {
          sum -= oldest
          validCount -= 1
        }
        if (Number.isFinite(logSquaredError)) {
          sum += logSquaredError
          validCount += 1
        }
        buffer[head] = logSquaredError
        head = (head + 1) % p

        const msle = validCount > 0 ? sum / validCount : logSquaredError
        out[i] = msle >= 0 ? Math.sqrt(msle) : NaN
      }

      return { rmsle: nulls(out), ema: nulls(emaOut) }
    },
  })
}
