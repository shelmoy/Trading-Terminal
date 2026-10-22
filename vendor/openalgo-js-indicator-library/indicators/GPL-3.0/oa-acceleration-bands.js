/**
 * Acceleration Bands - ported to openalgo-charts from Pine Script v3.
 *
 * Source: https://github.com/everget/tradingview-pinescript-indicators/blob/60c93d3711d222b8f2db96160defe568429348e0/bands_and_channels/acceleration_bands.pine
 * Repo:   everget/tradingview-pinescript-indicators
 * License: GPL-3.0, Copyright (c) 2018-present, Alex Orekhov (everget)
 * SPDX-FileCopyrightText: (c) 2018-present Alex Orekhov (everget)
 * SPDX-FileCopyrightText: (c) 2026 marketcalls (port to openalgo-charts)
 * SPDX-License-Identifier: GPL-3.0-only
 *
 * Bands set a fraction of each bar's own range away from its high and low and
 * then smoothed, so the channel widens with the bar range rather than with a
 * measure of deviation.
 */

export default function ({ registerIndicator, sourceValues, sma, nulls }) {
  // A cleared number field arrives as '', and Number('') is 0, which would flatten
  // the bands onto a plain average of the highs and lows.
  const numberInput = (raw, fallback) => {
    if (raw === '' || raw === null || raw === undefined) return fallback
    const value = Number(raw)
    return Number.isFinite(value) ? value : fallback
  }

  registerIndicator({
    id: 'oa-acceleration-bands',
    name: 'Acceleration Bands (AB)',
    category: 'Channels',
    placement: 'onchart',

    inputs: [
      { key: 'length', type: 'number', label: 'Length', default: 20, min: 1, max: 5000, step: 1 },
      { key: 'factor', type: 'number', label: 'Factor', default: 0.001, min: 0, max: 1, step: 0.0001 },
      { key: 'source', type: 'source', label: 'Source', default: 'close' },
    ],

    plots: [
      { key: 'upper', type: 'line', title: 'Upper', style: { color: '#138484', lineWidth: 1 } },
      { key: 'basis', type: 'line', title: 'Basis', style: { color: '#741b47', lineWidth: 1 } },
      { key: 'lower', type: 'line', title: 'Lower', style: { color: '#138484', lineWidth: 1 } },
    ],

    // fill(upperBandPlot, lowerBandPlot, color=color(#ffd966, 84))
    fills: [{ between: ['upper', 'lower'], colorUp: '#ffd966', colorDown: '#ffd966', opacity: 0.16 }],

    calc(bars, settings) {
      const length = Math.max(1, Math.floor(Number(settings.length) || 20))
      const factor = numberInput(settings.factor, 0.001)
      const src = sourceValues(bars, settings.source ?? 'close')
      const n = bars.length

      const upperSrc = new Array(n).fill(NaN)
      const lowerSrc = new Array(n).fill(NaN)

      for (let i = 0; i < n; i++) {
        const high = Number(bars[i].high)
        const low = Number(bars[i].low)
        if (!Number.isFinite(high) || !Number.isFinite(low)) continue

        // A zero or negative sum would make the ratio infinite; a halted or
        // zero-priced series is the case that produces it.
        const denominator = high + low
        const ratio = denominator > 0 ? (4000 * factor * (high - low)) / denominator : 0

        upperSrc[i] = high * (1 + ratio)
        lowerSrc[i] = low * (1 - ratio)
      }

      // Pine v3 sma(), so the first length-1 bars are na on every band.
      const upper = sma(upperSrc, length)
      const basis = sma(src, length)
      const lower = sma(lowerSrc, length)

      return { upper: nulls(upper), basis: nulls(basis), lower: nulls(lower) }
    },
  })
}
