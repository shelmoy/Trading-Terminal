/**
 * Holt Exponential Moving Average (HOLT) - ported to openalgo-charts from Pine Script v6.
 *
 * Source: https://github.com/mihakralj/pinescript/blob/c4e91b962be09733d8fc76caa5191e9e586c5cee/indicators/trends_IIR/holt.pine
 * Repo:   mihakralj/pinescript
 * License: MIT (c) mihakralj
 * SPDX-FileCopyrightText: (c) mihakralj
 * SPDX-FileCopyrightText: (c) 2026 marketcalls (port to openalgo-charts)
 * SPDX-License-Identifier: MIT
 *
 * Holt's double exponential smoothing carries a level and a trend, and plots
 * their sum as a one-step-ahead forecast, so the line lags a plain EMA far less
 * while a move is still running.
 */

export default function ({ registerIndicator, sourceValues, nulls }) {
  registerIndicator({
    id: 'oa-holt',
    name: 'Holt Exponential Moving Average (HOLT)',
    category: 'Trends IIR',
    placement: 'onchart',

    inputs: [
      { key: 'period', type: 'number', label: 'Period', default: 10, min: 1, max: 5000, step: 1 },
      {
        key: 'gamma',
        type: 'number',
        label: 'Gamma (0 = auto)',
        default: 0,
        min: 0,
        max: 1,
        step: 0.01,
        tooltip: 'Trend smoothing factor. Left at 0 it matches alpha, which is 2 / (period + 1).',
      },
      { key: 'source', type: 'source', label: 'Source', default: 'close' },
    ],

    plots: [{ key: 'holt', type: 'line', title: 'HOLT', style: { color: '#ffeb3b', lineWidth: 2 } }],

    calc(bars, settings) {
      // A cleared number field arrives as '', and Number('') is 0.
      const period = Math.max(1, Math.floor(Number(settings.period) || 10))
      const gammaRaw = Number(settings.gamma)
      const gammaInput = Number.isFinite(gammaRaw) ? Math.min(1, Math.max(0, gammaRaw)) : 0
      const src = sourceValues(bars, settings.source ?? 'close')

      const alpha = 2 / (period + 1)
      const gamma = gammaInput > 0 ? gammaInput : alpha

      const out = new Array(bars.length).fill(NaN)

      // Pine holds level as var na and trend as var 0.0, so the first usable bar
      // seeds the level from the source and emits the source unchanged.
      let level = NaN
      let trend = 0

      for (let i = 0; i < bars.length; i++) {
        const s = src[i]
        if (!Number.isFinite(s)) continue

        if (!Number.isFinite(level)) {
          level = s
          trend = 0
          out[i] = s
          continue
        }

        const prevLevel = level
        level = alpha * s + (1 - alpha) * (prevLevel + trend)
        trend = gamma * (level - prevLevel) + (1 - gamma) * trend
        out[i] = level + trend
      }

      return { holt: nulls(out) }
    },
  })
}
