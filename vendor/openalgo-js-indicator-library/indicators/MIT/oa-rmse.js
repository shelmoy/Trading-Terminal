/**
 * Root Mean Squared Error (RMSE) - ported to openalgo-charts from Pine Script v6.
 *
 * Source: https://github.com/mihakralj/pinescript/blob/c4e91b962be09733d8fc76caa5191e9e586c5cee/indicators/errors/rmse.pine
 * Repo:   mihakralj/pinescript
 * License: MIT (c) mihakralj
 * SPDX-FileCopyrightText: (c) mihakralj
 * SPDX-FileCopyrightText: (c) 2026 marketcalls (port to openalgo-charts)
 * SPDX-License-Identifier: MIT
 *
 * The root mean squared distance between the source and its own EMA over the
 * lookback. It reads as the typical size of the gap between price and its
 * trend, in price units, so a rising RMSE means price is ranging further from
 * the average than it has been.
 */

export default function ({ registerIndicator, sourceValues, smaSeededEma, nulls }) {
  registerIndicator({
    id: 'oa-rmse',
    name: 'Root Mean Squared Error (RMSE)',
    category: 'Errors',
    // The source declares indicator(...) with no overlay flag, so the study owns
    // its own pane; only its EMA plot carries force_overlay onto the price pane.
    placement: 'pane',

    inputs: [
      { key: 'source', type: 'source', label: 'Source', default: 'close' },
      { key: 'period', type: 'number', label: 'Period', default: 100, min: 1, max: 4000, step: 1 },
    ],

    plots: [
      { key: 'rmse', type: 'area', title: 'RMSE', style: { color: '#ff5252', lineWidth: 2 } },
      // force_overlay = true in the source: this one plot sits on the price pane.
      { key: 'ema', type: 'line', title: 'EMA', style: { color: '#ffeb3b', lineWidth: 1 }, overlay: true },
    ],

    calc(bars, settings) {
      // A cleared number field arrives as '', and Number('') is 0.
      const period = Math.max(1, Math.floor(Number(settings.period) || 100))
      const src = sourceValues(bars, settings.source ?? 'close')

      // Pine's ta.ema seeds from the SMA of the first `period` values and is na
      // before that, so the squared error carries the same warmup gap.
      const emaLine = smaSeededEma(src, period)

      // The source averages with a circular buffer that skips na samples, so the
      // first real reading is a one-sample mean rather than a full window.
      const p = Math.min(Math.max(1, period), 4000)
      const buffer = new Array(p).fill(NaN)
      let head = 0
      let sum = 0
      let validCount = 0

      const out = new Array(bars.length).fill(NaN)

      for (let i = 0; i < bars.length; i++) {
        const s1 = src[i]
        const s2 = emaLine[i]
        const squaredError =
          Number.isFinite(s1) && Number.isFinite(s2) ? (s1 - s2) * (s1 - s2) : NaN

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

        const mse = validCount > 0 ? sum / validCount : squaredError
        if (!Number.isFinite(mse) || mse < 0) continue
        out[i] = Math.sqrt(mse)
      }

      return { rmse: nulls(out), ema: nulls(emaLine) }
    },
  })
}
