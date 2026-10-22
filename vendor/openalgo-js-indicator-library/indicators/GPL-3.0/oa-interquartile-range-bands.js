/**
 * Interquartile Range Bands (IQRB) - ported to openalgo-charts from Pine Script v3.
 *
 * Source: https://github.com/everget/tradingview-pinescript-indicators/blob/60c93d3711d222b8f2db96160defe568429348e0/bands_and_channels/interquartile_range_bands.pine
 * Repo:   everget/tradingview-pinescript-indicators
 * License: GPL-3.0 (c) 2018-present, Alex Orekhov (everget)
 * SPDX-FileCopyrightText: (c) 2018-present Alex Orekhov (everget)
 * SPDX-FileCopyrightText: (c) 2026 marketcalls (port to openalgo-charts)
 * SPDX-License-Identifier: GPL-3.0-only
 *
 * Bands built from the quartiles of the recent source values rather than from a
 * mean and a standard deviation, so outliers widen the channel only as far as
 * the interquartile range allows.
 */

export default function ({ registerIndicator, sourceValues, percentileNearestRank, nulls }) {
  registerIndicator({
    id: 'oa-interquartile-range-bands',
    name: 'Interquartile Range Bands (IQRB)',
    category: 'Channels',
    placement: 'onchart',

    inputs: [
      { key: 'length', type: 'number', label: 'Length', default: 14, min: 1, max: 5000, step: 1 },
      { key: 'mult', type: 'number', label: 'Multiplier', default: 1.5, min: 0, max: 100, step: 0.1,
        tooltip: 'Band distance beyond the quartiles as a multiple of the interquartile range.' },
      { key: 'source', type: 'source', label: 'Source', default: 'close' },
    ],

    plots: [
      { key: 'upper', type: 'line', title: 'Upper', style: { color: '#138484', lineWidth: 1 } },
      { key: 'median', type: 'line', title: 'Median', style: { color: '#741b47', lineWidth: 1 } },
      { key: 'lower', type: 'line', title: 'Lower', style: { color: '#138484', lineWidth: 1 } },
    ],

    // Pine shades the channel with #ffd966 at transp=84.
    fills: [{ between: ['upper', 'lower'], colorUp: '#ffd966', colorDown: '#ffd966', opacity: 0.16 }],

    calc(bars, settings) {
      // A cleared number field arrives as '', and Number('') is 0.
      const length = Math.max(1, Math.floor(Number(settings.length) || 14))
      // A multiplier of 0 is legal here, so do not fall back on a falsy value.
      const rawMult = Number(settings.mult)
      const mult = Math.max(0, settings.mult === '' || !Number.isFinite(rawMult) ? 1.5 : rawMult)
      const src = sourceValues(bars, settings.source ?? 'close')

      // Nearest rank, not interpolated, exactly as Pine's percentile_nearest_rank.
      const q1 = percentileNearestRank(src, length, 25)
      const median = percentileNearestRank(src, length, 50)
      const q3 = percentileNearestRank(src, length, 75)

      const upper = new Array(bars.length).fill(NaN)
      const mid = new Array(bars.length).fill(NaN)
      const lower = new Array(bars.length).fill(NaN)

      for (let i = 0; i < bars.length; i++) {
        if (Number.isFinite(median[i])) mid[i] = median[i]
        if (!Number.isFinite(q1[i]) || !Number.isFinite(q3[i])) continue
        const iqr = q3[i] - q1[i]
        upper[i] = q3[i] + mult * iqr
        lower[i] = q1[i] - mult * iqr
      }

      return { upper: nulls(upper), median: nulls(mid), lower: nulls(lower) }
    },
  })
}
