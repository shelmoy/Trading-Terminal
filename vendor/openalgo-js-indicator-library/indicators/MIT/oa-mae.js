/**
 * Mean Absolute Error (MAE) - ported to openalgo-charts from Pine Script v6.
 *
 * Source: https://github.com/mihakralj/pinescript/blob/c4e91b962be09733d8fc76caa5191e9e586c5cee/indicators/errors/mae.pine
 * Repo:   mihakralj/pinescript
 * License: MIT (c) mihakralj
 * SPDX-FileCopyrightText: (c) mihakralj
 * SPDX-FileCopyrightText: (c) 2026 marketcalls (port to openalgo-charts)
 * SPDX-License-Identifier: MIT
 *
 * The average absolute distance between the source and its own EMA over the
 * lookback, so it reads as the typical error of that EMA as a fit of price.
 *
 * Placement note: the Pine indicator() call omits overlay, so the study sits in
 * its own pane, and the EMA plot carries force_overlay = true to reach the
 * price pane. That is reproduced here as placement 'pane' plus overlay: true on
 * the EMA plot alone.
 */

export default function ({ registerIndicator, sourceValues, smaSeededEma, nulls }) {
  registerIndicator({
    id: 'oa-mae',
    name: 'Mean Absolute Error (MAE)',
    category: 'Errors',
    placement: 'pane',

    inputs: [
      { key: 'source', type: 'source', label: 'Source', default: 'close' },
      { key: 'period', type: 'number', label: 'Period', default: 100, min: 1, max: 4000, step: 1 },
    ],

    plots: [
      { key: 'mae', type: 'area', title: 'MAE', style: { color: '#ffeb3b', lineWidth: 2 } },
      { key: 'ema', type: 'line', title: 'EMA', style: { color: '#ffeb3b', lineWidth: 1 }, overlay: true },
    ],

    calc(bars, settings) {
      // A cleared number field arrives as '', and Number('') is 0.
      const period = Math.max(1, Math.floor(Number(settings.period) || 100))
      const src = sourceValues(bars, settings.source ?? 'close')
      // Pine ta.ema seeds from the SMA of the first `period` values.
      const emaLine = smaSeededEma(src, period)

      // Pine clamps the averaging buffer to 4000 slots, independently of the
      // EMA length.
      const p = Math.min(Math.max(1, period), 4000)
      const buffer = new Array(p).fill(NaN)
      let head = 0
      let sum = 0
      let validCount = 0

      const mae = new Array(bars.length).fill(NaN)
      for (let i = 0; i < bars.length; i++) {
        const a = src[i]
        const b = emaLine[i]
        // na during the EMA warmup: the slot is still written, but it does not
        // count towards the average.
        const absErr = Number.isFinite(a) && Number.isFinite(b) ? Math.abs(a - b) : NaN

        const oldest = buffer[head]
        if (Number.isFinite(oldest)) {
          sum -= oldest
          validCount -= 1
        }
        if (Number.isFinite(absErr)) {
          sum += absErr
          validCount += 1
        }
        buffer[head] = absErr
        head = (head + 1) % p

        mae[i] = validCount > 0 ? sum / validCount : absErr
      }

      return { mae: nulls(mae), ema: nulls(emaLine) }
    },
  })
}
