/**
 * Standard Deviation Channel (SDCHANNEL) - ported to openalgo-charts from Pine Script v6.
 *
 * Source: https://github.com/mihakralj/pinescript/blob/c4e91b962be09733d8fc76caa5191e9e586c5cee/indicators/channels/sdchannel.pine
 * Repo:   mihakralj/pinescript
 * License: MIT (c) mihakralj
 * SPDX-FileCopyrightText: (c) mihakralj
 * SPDX-FileCopyrightText: (c) 2026 marketcalls (port to openalgo-charts)
 * SPDX-License-Identifier: MIT
 *
 * Fits a least-squares line to the lookback window and places a band a fixed
 * multiple of the residual standard deviation either side of it, so the channel
 * tracks the trend rather than a flat average.
 */

export default function ({ registerIndicator, sourceValues, nulls }) {
  registerIndicator({
    id: 'oa-sdchannel',
    name: 'Standard Deviation Channel (SDCHANNEL)',
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
        tooltip: 'Channel distance as a multiple of the standard deviation of the regression residuals.',
      },
    ],

    plots: [
      { key: 'upper', type: 'line', title: 'Upper Channel', style: { color: '#ffeb3b', lineWidth: 2 } },
      { key: 'mid', type: 'line', title: 'Regression Line', style: { color: '#ffeb3b', lineWidth: 2 } },
      { key: 'lower', type: 'line', title: 'Lower Channel', style: { color: '#ffeb3b', lineWidth: 2 } },
    ],

    fills: [
      { between: ['upper', 'mid'], colorUp: '#ff5252', colorDown: '#ff5252', opacity: 0.1 },
      { between: ['mid', 'lower'], colorUp: '#4caf50', colorDown: '#4caf50', opacity: 0.1 },
    ],

    calc(bars, settings) {
      // A cleared number field arrives as '', and Number('') is 0.
      const period = Math.max(2, Math.floor(Number(settings.period) || 20))
      const multiplier = Math.max(0.1, Number(settings.multiplier) || 2)
      const src = sourceValues(bars, settings.source ?? 'close')

      const n = period
      // sumX and sumX2 depend only on the window length, so they are constant.
      let sumX = 0
      let sumX2 = 0
      for (let x = 0; x < period; x++) {
        sumX += x
        sumX2 += x * x
      }
      const denom = n * sumX2 - sumX * sumX

      const upper = new Array(bars.length).fill(NaN)
      const mid = new Array(bars.length).fill(NaN)
      const lower = new Array(bars.length).fill(NaN)

      if (!Number.isFinite(denom) || denom === 0) {
        return { upper: nulls(upper), mid: nulls(mid), lower: nulls(lower) }
      }

      for (let i = period - 1; i < bars.length; i++) {
        // x = 0 is the oldest bar in the window, x = period - 1 the current one.
        let sumY = 0
        let sumXY = 0
        let usable = true
        for (let k = 0; k < period; k++) {
          const y = src[i - (period - 1) + k]
          if (!Number.isFinite(y)) { usable = false; break }
          sumY += y
          sumXY += k * y
        }
        if (!usable) continue

        const slope = (n * sumXY - sumX * sumY) / denom
        const intercept = (sumY - slope * sumX) / n
        const regressionLine = slope * (period - 1) + intercept

        let sumSquaredResiduals = 0
        for (let k = 0; k < period; k++) {
          const y = src[i - (period - 1) + k]
          const residual = y - (slope * k + intercept)
          sumSquaredResiduals += residual * residual
        }
        // Pine divides the residual sum by n, not by n - 1.
        const stdDev = Math.sqrt(sumSquaredResiduals / n)
        if (!Number.isFinite(regressionLine) || !Number.isFinite(stdDev)) continue

        mid[i] = regressionLine
        upper[i] = regressionLine + multiplier * stdDev
        lower[i] = regressionLine - multiplier * stdDev
      }

      return { upper: nulls(upper), mid: nulls(mid), lower: nulls(lower) }
    },
  })
}
