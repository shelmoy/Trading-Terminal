/**
 * Mean %Error (MPE) - ported to openalgo-charts from Pine Script v6.
 *
 * Source: https://github.com/mihakralj/pinescript/blob/c4e91b962be09733d8fc76caa5191e9e586c5cee/indicators/errors/mpe.pine
 * Repo:   mihakralj/pinescript
 * License: MIT (c) mihakralj
 * SPDX-FileCopyrightText: (c) mihakralj
 * SPDX-FileCopyrightText: (c) 2026 marketcalls (port to openalgo-charts)
 * SPDX-License-Identifier: MIT
 *
 * The average signed percentage by which the source sits above or below its
 * own EMA: unlike an absolute error it keeps the sign, so a persistent bias
 * shows as a level away from zero rather than cancelling out.
 */

export default function ({ registerIndicator, sourceValues, smaSeededEma, nulls }) {
  registerIndicator({
    id: 'oa-mpe',
    name: 'Mean %Error (MPE)',
    category: 'Errors',
    // indicator("Mean %Error (MPE)") declares no overlay, so the study itself
    // gets a pane; the EMA plot carries force_overlay=true and is sent to the
    // price pane by plot.overlay below.
    placement: 'pane',

    inputs: [
      { key: 'source', type: 'source', label: 'Source', default: 'close' },
      { key: 'period', type: 'number', label: 'Period', default: 100, min: 1, max: 5000, step: 1 },
    ],

    plots: [
      { key: 'mpe', type: 'area', title: 'MPE', style: { color: '#ff5252', lineWidth: 2 } },
      { key: 'ema', type: 'line', title: 'EMA', overlay: true, style: { color: '#ffeb3b', lineWidth: 1 } },
    ],

    calc(bars, settings) {
      // A cleared number field arrives as '', and Number('') is 0.
      const period = Math.max(1, Math.floor(Number(settings.period) || 100))
      const actual = sourceValues(bars, settings.source ?? 'close')
      // Pine's ta.ema seeds from the SMA of the first `period` values and is na
      // before that, which smaSeededEma reproduces; the exported ema seeds from
      // values[0] and would start the error series period bars too early.
      const predicted = smaSeededEma(actual, period)

      // The source averages over a circular buffer capped at 4000 slots, even
      // when the period is longer, and counts only the finite entries in it.
      const size = Math.min(Math.max(1, period), 4000)
      const buffer = new Array(size).fill(NaN)
      let head = 0
      let sum = 0
      let validCount = 0

      const mpe = new Array(bars.length).fill(NaN)
      const ema = new Array(bars.length).fill(NaN)

      for (let i = 0; i < bars.length; i++) {
        const a = actual[i]
        const p = predicted[i]
        let percentageError = NaN
        if (Number.isFinite(a) && Number.isFinite(p) && a !== 0) {
          const candidate = 100 * ((a - p) / a)
          if (Number.isFinite(candidate)) percentageError = candidate
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
        head = (head + 1) % size

        // With nothing valid in the window the source returns the raw error,
        // which during the EMA warmup is itself na.
        mpe[i] = validCount > 0 ? sum / validCount : percentageError
        if (Number.isFinite(p)) ema[i] = p
      }

      return { mpe: nulls(mpe), ema: nulls(ema) }
    },
  })
}
