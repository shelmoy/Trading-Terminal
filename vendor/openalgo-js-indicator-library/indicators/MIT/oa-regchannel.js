/**
 * Regression Channels (REGCHANNEL) - ported to openalgo-charts from Pine
 * Script v6.
 *
 * Source: https://github.com/mihakralj/pinescript/blob/c4e91b962be09733d8fc76caa5191e9e586c5cee/indicators/channels/regchannel.pine
 * Repo:   mihakralj/pinescript
 * License: MIT (c) mihakralj
 * SPDX-FileCopyrightText: (c) mihakralj
 * SPDX-FileCopyrightText: (c) 2026 marketcalls (port to openalgo-charts)
 * SPDX-License-Identifier: MIT
 *
 * A least-squares line is fitted through the last N prices and two parallel
 * lines are placed a multiple of the fit's own residual spread away, so the
 * channel tracks the trend rather than a flat average.
 */

export default function ({ registerIndicator, sourceValues, nulls }) {
  registerIndicator({
    id: 'oa-regchannel',
    name: 'Regression Channels (REGCHANNEL)',
    category: 'Channels',
    placement: 'onchart',

    inputs: [
      { key: 'period', type: 'number', label: 'Period', default: 20, min: 2, max: 5000, step: 1 },
      { key: 'source', type: 'source', label: 'Source', default: 'close' },
      {
        key: 'multiplier',
        type: 'number',
        label: 'Standard Deviation Multiplier',
        default: 2,
        min: 0.1,
        max: 100,
        step: 0.1,
        tooltip: 'Band distance as a multiple of the root mean square residual of the regression fit.',
      },
    ],

    plots: [
      { key: 'upper', type: 'line', title: 'Upper Band', style: { color: '#ffeb3b', lineWidth: 2 } },
      { key: 'mid', type: 'line', title: 'Regression Line', style: { color: '#ffeb3b', lineWidth: 2 } },
      { key: 'lower', type: 'line', title: 'Lower Band', style: { color: '#ffeb3b', lineWidth: 2 } },
    ],

    fills: [
      { between: ['upper', 'mid'], colorUp: '#ef5350', colorDown: '#ef5350', opacity: 0.1 },
      { between: ['mid', 'lower'], colorUp: '#26a69a', colorDown: '#26a69a', opacity: 0.1 },
    ],

    calc(bars, settings) {
      // A cleared number field arrives as '', and Number('') is 0. The Pine
      // function raises on a period below 2 or a multiplier at or below 0.
      const period = Math.max(2, Math.floor(Number(settings.period) || 20))
      const multiplier = Math.max(0.1, Number(settings.multiplier) || 2)
      const src = sourceValues(bars, settings.source ?? 'close')
      const n = bars.length

      const upper = new Array(n).fill(NaN)
      const mid = new Array(n).fill(NaN)
      const lower = new Array(n).fill(NaN)

      // x runs 0 .. period-1 over the window, oldest first, so these two sums
      // are the same on every bar.
      let sumX = 0
      let sumX2 = 0
      for (let k = 0; k < period; k++) {
        sumX += k
        sumX2 += k * k
      }
      const count = period
      const denom = count * sumX2 - sumX * sumX

      for (let i = period - 1; i < n; i++) {
        if (!Number.isFinite(denom) || denom === 0) break

        let sumY = 0
        let sumXY = 0
        let ok = true
        for (let k = 0; k < period; k++) {
          const y = src[i - period + 1 + k]
          if (!Number.isFinite(y)) {
            ok = false
            break
          }
          sumY += y
          sumXY += k * y
        }
        if (!ok) continue

        const slope = (count * sumXY - sumX * sumY) / denom
        const intercept = (sumY - slope * sumX) / count
        const regression = slope * (period - 1) + intercept

        let sumResiduals2 = 0
        for (let k = 0; k < period; k++) {
          const residual = src[i - period + 1 + k] - (slope * k + intercept)
          sumResiduals2 += residual * residual
        }
        const stdDev = Math.sqrt(sumResiduals2 / count)
        if (!Number.isFinite(regression) || !Number.isFinite(stdDev)) continue

        mid[i] = regression
        upper[i] = regression + multiplier * stdDev
        lower[i] = regression - multiplier * stdDev
      }

      return { upper: nulls(upper), mid: nulls(mid), lower: nulls(lower) }
    },
  })
}
