/**
 * Kirshenbaum Bands (KB) - ported to openalgo-charts from Pine Script v3.
 *
 * Source: https://github.com/everget/tradingview-pinescript-indicators/blob/60c93d3711d222b8f2db96160defe568429348e0/bands_and_channels/kirshenbaum_bands.pine
 * Repo:   everget/tradingview-pinescript-indicators
 * License: GPL-3.0 (c) 2019-present, Alex Orekhov (everget)
 * SPDX-FileCopyrightText: (c) 2018-present Alex Orekhov (everget)
 * SPDX-FileCopyrightText: (c) 2026 marketcalls (port to openalgo-charts)
 * SPDX-License-Identifier: GPL-3.0-only
 *
 * An exponential moving average with bands placed a multiple of the standard
 * error of a linear regression away, so the channel widens with how poorly a
 * trend line fits price rather than with raw volatility.
 */

export default function ({ registerIndicator, sourceValues, linreg, sma, smaSeededEma, nulls }) {
  registerIndicator({
    id: 'oa-kirshenbaum-bands',
    name: 'Kirshenbaum Bands (KB)',
    category: 'Channels',
    placement: 'onchart',

    inputs: [
      { key: 'length', type: 'number', label: 'Length', default: 30, min: 1, max: 5000, step: 1 },
      {
        key: 'regressionLength',
        type: 'number',
        label: 'Regression Length',
        default: 20,
        min: 1,
        max: 5000,
        step: 1,
      },
      { key: 'mult', type: 'number', label: 'Multiplier', default: 1.75, min: 0.1, max: 100, step: 0.1 },
      { key: 'source', type: 'source', label: 'Source', default: 'close' },
    ],

    plots: [
      { key: 'basis', type: 'line', title: 'Basis', style: { color: '#351c75', lineWidth: 2 } },
      { key: 'upper', type: 'line', title: 'Upper', style: { color: '#45818e', lineWidth: 2 } },
      { key: 'lower', type: 'line', title: 'Lower', style: { color: '#45818e', lineWidth: 2 } },
    ],

    // Pine: fill(upperBandPlot, lowerBandPlot, color=color(#ffd966, 84))
    fills: [{ between: ['upper', 'lower'], colorUp: '#ffd966', colorDown: '#ffd966', opacity: 0.16 }],

    calc(bars, settings) {
      // A cleared number field arrives as '', and Number('') is 0.
      const length = Math.max(1, Math.floor(Number(settings.length) || 30))
      const regressionLength = Math.max(1, Math.floor(Number(settings.regressionLength) || 20))
      const mult = Math.max(0.1, Number(settings.mult) || 1.75)
      const src = sourceValues(bars, settings.source ?? 'close')

      // linreg(src, regressionLength, 0): the regression value on the current bar.
      const regression = linreg(src, regressionLength, 0)

      // The squared residual stays na wherever the regression is na, and sma
      // needs a full window of finite values, so the standard error first
      // appears at 2 * regressionLength - 2, exactly as in Pine.
      const squared = new Array(bars.length).fill(NaN)
      for (let i = 0; i < bars.length; i++) {
        if (!Number.isFinite(src[i]) || !Number.isFinite(regression[i])) continue
        const residual = src[i] - regression[i]
        squared[i] = residual * residual
      }
      const meanSquared = sma(squared, regressionLength)

      // Pine's ema seeds from the SMA of the first `length` values.
      const basisLine = smaSeededEma(src, length)

      const basis = new Array(bars.length).fill(NaN)
      const upper = new Array(bars.length).fill(NaN)
      const lower = new Array(bars.length).fill(NaN)

      for (let i = 0; i < bars.length; i++) {
        if (!Number.isFinite(basisLine[i])) continue
        basis[i] = basisLine[i]
        if (!Number.isFinite(meanSquared[i]) || meanSquared[i] < 0) continue
        const stdError = mult * Math.sqrt(meanSquared[i])
        upper[i] = basisLine[i] + stdError
        lower[i] = basisLine[i] - stdError
      }

      return { basis: nulls(basis), upper: nulls(upper), lower: nulls(lower) }
    },
  })
}
