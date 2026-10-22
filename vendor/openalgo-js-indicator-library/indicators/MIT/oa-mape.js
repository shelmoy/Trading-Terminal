/**
 * Mean Absolute %Error (MAPE) - ported to openalgo-charts from Pine Script v6.
 *
 * Source: https://github.com/mihakralj/pinescript/blob/c4e91b962be09733d8fc76caa5191e9e586c5cee/indicators/errors/mape.pine
 * Repo:   mihakralj/pinescript
 * License: MIT (c) mihakralj
 * SPDX-FileCopyrightText: (c) mihakralj
 * SPDX-FileCopyrightText: (c) 2026 marketcalls (port to openalgo-charts)
 * SPDX-License-Identifier: MIT
 *
 * Average absolute percentage distance between the source and its own EMA, so
 * it reads as how far price typically strays from its trend, in percent.
 */

export default function ({ registerIndicator, sourceValues, smaSeededEma, nulls }) {
  registerIndicator({
    id: 'oa-mape',
    name: 'Mean Absolute %Error (MAPE)',
    category: 'Errors',
    // The Pine indicator() call carries no overlay flag, so the study itself
    // sits in its own pane. Only the reference EMA is force_overlay onto price,
    // which is what `overlay: true` on that one plot does here.
    placement: 'pane',

    inputs: [
      { key: 'source', type: 'source', label: 'Source', default: 'close' },
      { key: 'period', type: 'number', label: 'Period', default: 100, min: 1, max: 4000, step: 1 },
    ],

    plots: [
      { key: 'mape', type: 'area', title: 'MAPE', style: { color: '#ff5252', lineWidth: 2 } },
      { key: 'ema', type: 'line', title: 'EMA', overlay: true, style: { color: '#ffeb3b', lineWidth: 1 } },
    ],

    calc(bars, settings) {
      const n = bars.length
      // A cleared number field arrives as '', and Number('') is 0.
      const period = Math.max(1, Math.floor(Number(settings.period) || 100))
      const src = sourceValues(bars, settings.source ?? 'close')

      // Pine's ta.ema seeds from the SMA of the first `period` values, which is
      // what smaSeededEma reproduces. The plain ema() here seeds from values[0].
      const emaLine = smaSeededEma(src, period)

      // Same circular buffer the source uses: a running sum over the last p
      // errors, counting only the entries that are not na.
      const p = Math.min(Math.max(1, period), 4000)
      const buffer = new Array(p).fill(NaN)
      let head = 0
      let sum = 0
      let validCount = 0

      const mape = new Array(n).fill(NaN)
      const ema = new Array(n).fill(NaN)

      for (let i = 0; i < n; i++) {
        const actual = src[i]
        const predicted = emaLine[i]
        ema[i] = Number.isFinite(predicted) ? predicted : NaN

        // na until the EMA has warmed up, and guarded against a zero divisor.
        let percentageError = NaN
        if (Number.isFinite(actual) && Number.isFinite(predicted) && actual !== 0) {
          percentageError = 100 * Math.abs((actual - predicted) / actual)
        }

        const oldest = buffer[head]
        if (Number.isFinite(oldest)) {
          sum -= oldest
          validCount -= 1
        }
        if (Number.isFinite(percentageError)) {
          sum += percentageError
          validCount += 1
        }
        buffer[head] = percentageError
        head = (head + 1) % p

        mape[i] = validCount > 0 ? sum / validCount : percentageError
      }

      return { mape: nulls(mape), ema: nulls(ema) }
    },
  })
}
