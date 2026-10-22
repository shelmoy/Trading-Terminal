/**
 * Mean Error (ME) - ported to openalgo-charts from Pine Script v6.
 *
 * Source: https://github.com/mihakralj/pinescript/blob/c4e91b962be09733d8fc76caa5191e9e586c5cee/indicators/errors/me.pine
 * Repo:   mihakralj/pinescript
 * License: MIT (c) mihakralj
 * SPDX-FileCopyrightText: (c) mihakralj
 * SPDX-FileCopyrightText: (c) 2026 marketcalls (port to openalgo-charts)
 * SPDX-License-Identifier: MIT
 *
 * The average signed gap between the source and its own EMA over the lookback.
 * Because the sign is kept, it reads as bias: a positive plot means price has
 * been sitting above its average, a negative one below it.
 */

export default function ({ registerIndicator, sourceValues, smaSeededEma, nulls }) {
  registerIndicator({
    id: 'oa-me',
    name: 'Mean Error (ME)',
    category: 'Errors',
    // The Pine indicator() call carries no overlay argument, so it defaults to
    // overlay=false, and the EMA plot is the one marked force_overlay=true.
    placement: 'pane',

    inputs: [
      { key: 'source', type: 'source', label: 'Source', default: 'close' },
      { key: 'period', type: 'number', label: 'Period', default: 100, min: 1, max: 5000, step: 1 },
    ],

    plots: [
      { key: 'me', type: 'area', title: 'ME', style: { color: '#ef5350', lineWidth: 2 } },
      // Pine plots the EMA with force_overlay = true, which is this flag.
      { key: 'ema', type: 'line', title: 'EMA', style: { color: '#ffeb3b', lineWidth: 1 }, overlay: true },
    ],

    calc(bars, settings) {
      // A cleared number field arrives as '', and Number('') is 0.
      const period = Math.max(1, Math.min(5000, Math.floor(Number(settings.period) || 100)))
      // Pine caps only the error buffer at 4000; the EMA keeps the full period.
      const bufferLen = Math.min(period, 4000)
      const src = sourceValues(bars, settings.source ?? 'close')

      // Pine's ta.ema seeds from the SMA of the first `period` values and is na
      // before that, which is what makes the error na through the warmup.
      const emaLine = smaSeededEma(src, period)

      const buffer = new Array(bufferLen).fill(NaN)
      let head = 0
      let sum = 0
      let validCount = 0

      const meOut = new Array(bars.length).fill(NaN)
      const emaOut = new Array(bars.length).fill(NaN)

      for (let i = 0; i < bars.length; i++) {
        const predicted = emaLine[i]
        const error =
          Number.isFinite(src[i]) && Number.isFinite(predicted) ? src[i] - predicted : NaN

        const oldest = buffer[head]
        if (Number.isFinite(oldest)) {
          sum -= oldest
          validCount -= 1
        }
        if (Number.isFinite(error)) {
          sum += error
          validCount += 1
        }
        buffer[head] = error
        head = (head + 1) % bufferLen

        // Pine falls back to the raw error, which is na through the warmup.
        const value = validCount > 0 ? sum / validCount : error
        if (Number.isFinite(value)) meOut[i] = value
        if (Number.isFinite(predicted)) emaOut[i] = predicted
      }

      return { me: nulls(meOut), ema: nulls(emaOut) }
    },
  })
}
