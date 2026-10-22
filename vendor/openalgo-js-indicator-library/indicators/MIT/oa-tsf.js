/**
 * Time Series Forecast (TSF) - ported to openalgo-charts from Pine Script v6.
 *
 * Source: https://github.com/mihakralj/pinescript/blob/c4e91b962be09733d8fc76caa5191e9e586c5cee/indicators/trends_FIR/tsf.pine
 * Repo:   mihakralj/pinescript
 * License: MIT (c) mihakralj
 * SPDX-FileCopyrightText: (c) mihakralj
 * SPDX-FileCopyrightText: (c) 2026 marketcalls (port to openalgo-charts)
 * SPDX-License-Identifier: MIT
 *
 * A least-squares line is fitted through the last `period` source values and
 * then extrapolated `forecast` bars past the right-hand end of that window, so
 * the plot leads a moving average instead of lagging it.
 */

export default function ({ registerIndicator, sourceValues, linreg, nulls }) {
  registerIndicator({
    id: 'oa-tsf',
    name: 'Time Series Forecast',
    category: 'Trends FIR',
    placement: 'onchart',

    inputs: [
      { key: 'period', type: 'number', label: 'Period', default: 14, min: 1, max: 5000, step: 1 },
      { key: 'forecast', type: 'number', label: 'Forecast Periods', default: 1, min: 1, max: 100, step: 1 },
      { key: 'source', type: 'source', label: 'Source', default: 'close' },
    ],

    plots: [
      { key: 'tsf', type: 'line', title: 'TSF', style: { color: '#ffeb3b', lineWidth: 2 } },
      { key: 'src', type: 'line', title: 'Source', style: { color: '#787b86', lineWidth: 1 } },
    ],

    calc(bars, settings) {
      // A cleared number field arrives as '', and Number('') is 0.
      const period = Math.max(1, Math.min(5000, Math.floor(Number(settings.period) || 14)))
      const forecast = Math.max(1, Math.min(100, Math.floor(Number(settings.forecast) || 1)))
      const src = sourceValues(bars, settings.source ?? 'close')

      // Pine fits x = 0 at the oldest bar of the window and evaluates the line
      // at x = period - 1 + forecast - 1. The helper evaluates at
      // period - 1 - offset, so the matching offset is 1 - forecast. Warmup is
      // identical: the first value lands on bar period - 1.
      const value = linreg(src, period, 1 - forecast)

      const out = new Array(bars.length).fill(NaN)
      const line = new Array(bars.length).fill(NaN)
      for (let i = 0; i < bars.length; i++) {
        if (Number.isFinite(value[i])) out[i] = value[i]
        if (Number.isFinite(src[i])) line[i] = src[i]
      }

      return { tsf: nulls(out), src: nulls(line) }
    },
  })
}
