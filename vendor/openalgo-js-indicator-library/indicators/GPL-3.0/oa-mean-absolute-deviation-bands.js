/**
 * Mean Absolute Deviation Bands (MADB) - ported to openalgo-charts from Pine Script v4.
 *
 * Source: https://github.com/everget/tradingview-pinescript-indicators/blob/60c93d3711d222b8f2db96160defe568429348e0/bands_and_channels/mean_absolute_deviation_bands.pine
 * Repo:   everget/tradingview-pinescript-indicators
 * License: GPL-3.0 (c) 2020-present, Alex Orekhov (everget)
 * SPDX-FileCopyrightText: (c) 2018-present Alex Orekhov (everget)
 * SPDX-FileCopyrightText: (c) 2026 marketcalls (port to openalgo-charts)
 * SPDX-License-Identifier: GPL-3.0-only
 *
 * Bands set a multiple of the mean absolute deviation either side of a simple
 * average, so the channel answers to typical dispersion rather than to
 * variance and a single outlier widens it far less than it widens Bollinger.
 */

export default function ({ registerIndicator, sourceValues, sma, dev, nulls }) {
  registerIndicator({
    id: 'oa-mean-absolute-deviation-bands',
    name: 'Mean Absolute Deviation Bands (MADB)',
    category: 'Channels',
    placement: 'onchart',

    inputs: [
      { key: 'length', type: 'number', label: 'Length', default: 20, min: 2, max: 5000, step: 1 },
      {
        key: 'mult',
        type: 'number',
        label: 'Bands Multiplier',
        default: 2,
        min: 0.1,
        max: 100,
        step: 0.1,
        tooltip: 'Band distance as a multiple of the mean absolute deviation from the basis.',
      },
      { key: 'source', type: 'source', label: 'Source', default: 'close' },
    ],

    plots: [
      { key: 'basis', type: 'line', title: 'Basis', style: { color: '#351c75', lineWidth: 2 } },
      { key: 'upper', type: 'line', title: 'Upper', style: { color: '#45818e', lineWidth: 2 } },
      { key: 'lower', type: 'line', title: 'Lower', style: { color: '#45818e', lineWidth: 2 } },
    ],

    fills: [{ between: ['upper', 'lower'], colorUp: '#ffd966', colorDown: '#ffd966', opacity: 0.16 }],

    calc(bars, settings) {
      // A cleared number field arrives as '', and Number('') is 0.
      const length = Math.max(2, Math.floor(Number(settings.length) || 20))
      const mult = Math.max(0.1, Number(settings.mult) || 2)
      const src = sourceValues(bars, settings.source ?? 'close')

      const basisLine = sma(src, length)
      // Pine's dev() is the mean absolute deviation from the simple average,
      // not the standard deviation.
      const deviation = dev(src, length)

      const basis = new Array(bars.length).fill(NaN)
      const upper = new Array(bars.length).fill(NaN)
      const lower = new Array(bars.length).fill(NaN)

      for (let i = 0; i < bars.length; i++) {
        if (!Number.isFinite(basisLine[i])) continue
        basis[i] = basisLine[i]
        if (!Number.isFinite(deviation[i])) continue
        const band = mult * deviation[i]
        upper[i] = basisLine[i] + band
        lower[i] = basisLine[i] - band
      }

      return { basis: nulls(basis), upper: nulls(upper), lower: nulls(lower) }
    },
  })
}
