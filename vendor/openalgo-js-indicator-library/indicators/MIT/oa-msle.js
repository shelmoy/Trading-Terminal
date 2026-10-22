/**
 * Mean Squared Logarithmic Error (MSLE) - ported to openalgo-charts from Pine Script v6.
 *
 * Source: https://github.com/mihakralj/pinescript/blob/c4e91b962be09733d8fc76caa5191e9e586c5cee/indicators/errors/msle.pine
 * Repo:   mihakralj/pinescript
 * License: MIT
 * SPDX-FileCopyrightText: (c) mihakralj
 * SPDX-FileCopyrightText: (c) 2026 marketcalls (port to openalgo-charts)
 * SPDX-License-Identifier: MIT
 *
 * How far price sits from its own exponential average, measured on a log
 * scale and averaged over the same period: the squared difference of
 * log(1 + price) and log(1 + average). Squaring the logs rather than the
 * prices keeps the reading comparable as the instrument's price level moves,
 * and penalises a shortfall below the average more than an overshoot above it.
 */

export default function ({ registerIndicator, sourceValues, smaSeededEma, nulls }) {
  registerIndicator({
    id: 'oa-msle',
    name: 'Mean Squared Logarithmic Error (MSLE)',
    category: 'Errors',
    // The Pine indicator() call names no overlay argument, so it defaults to
    // overlay=false and the error belongs in its own pane. The reference EMA
    // carries force_overlay=true there, which is the plot-level `overlay` flag
    // below: one column of a pane study drawn on the price pane.
    placement: 'pane',

    inputs: [
      { key: 'source', type: 'source', label: 'Source', default: 'close' },
      { key: 'period', type: 'number', label: 'Period', default: 100, min: 1, max: 4000, step: 1 },
    ],

    plots: [
      { key: 'msle', type: 'area', title: 'MSLE', style: { color: '#ef5350', lineWidth: 2 } },
      { key: 'ema', type: 'line', title: 'EMA', style: { color: '#ffeb3b', lineWidth: 1 }, overlay: true },
    ],

    calc(bars, settings) {
      // A cleared number field arrives as '', and Number('') is 0. Pine clamps
      // the averaging window to 4000 with math.min(math.max(1, period), 4000).
      const period = Math.min(4000, Math.max(1, Math.floor(Number(settings.period) || 100)))
      const src = sourceValues(bars, settings.source ?? 'close')
      const n = bars.length

      // Pine's ta.ema seeds from the SMA of the first `period` values and is
      // unavailable before that, which is what smaSeededEma reproduces. The
      // plain ema helper seeds from values[0] and would emit through the whole
      // warmup, shifting every error reading with it.
      const reference = smaSeededEma(src, period)

      const logError = new Array(n).fill(NaN)
      for (let i = 0; i < n; i++) {
        const a = src[i]
        const b = reference[i]
        if (!Number.isFinite(a) || !Number.isFinite(b)) continue
        // math.log of a non-positive argument is unavailable in Pine, so an
        // instrument quoted at or below -1 leaves the error unavailable here.
        if (1 + a <= 0 || 1 + b <= 0) continue
        const d = Math.log(1 + a) - Math.log(1 + b)
        logError[i] = d * d
      }

      // The source averages with a circular buffer that counts only the
      // available entries in it, so the reading starts at the first available
      // error and grows its window until `period` of them have accumulated.
      const out = new Array(n).fill(NaN)
      let sum = 0
      let count = 0
      for (let i = 0; i < n; i++) {
        const drop = i - period
        if (drop >= 0 && Number.isFinite(logError[drop])) {
          sum -= logError[drop]
          count -= 1
        }
        if (Number.isFinite(logError[i])) {
          sum += logError[i]
          count += 1
        }
        out[i] = count > 0 ? sum / count : logError[i]
      }

      return { msle: nulls(out), ema: nulls(reference) }
    },
  })
}
