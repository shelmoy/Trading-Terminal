/**
 * Arnaud Legoux Moving Average (ALMA) - ported to openalgo-charts from
 * Pine Script v3.
 *
 * Source: https://github.com/everget/tradingview-pinescript-indicators/blob/60c93d3711d222b8f2db96160defe568429348e0/movings/arnaud_legoux_moving_average.pine
 * Repo:   everget/tradingview-pinescript-indicators
 * License: GPL-3.0
 * SPDX-FileCopyrightText: (c) 2018-present Alex Orekhov (everget)
 * SPDX-FileCopyrightText: (c) 2026 marketcalls (port to openalgo-charts)
 * SPDX-License-Identifier: GPL-3.0-only
 *
 * A Gaussian-weighted average whose weight peak is placed by Offset and whose
 * width is set by Sigma, so it trades lag against smoothness without the
 * symmetric shape of a plain weighted mean.
 */

export default function ({ registerIndicator, sourceValues, alma, clamp, nulls }) {
  // A cleared field arrives as '', and Number('') is 0, which would silently
  // replace a deliberate value. Fall back only when the field is truly empty.
  const numOr = (v, fallback) => {
    if (v === '' || v === null || v === undefined) return fallback
    const n = Number(v)
    return Number.isFinite(n) ? n : fallback
  }

  registerIndicator({
    id: 'oa-arnaud-legoux-moving-average',
    name: 'Arnaud Legoux Moving Average (ALMA)',
    category: 'Moving Averages',
    placement: 'onchart',

    inputs: [
      { key: 'length', type: 'number', label: 'Length', default: 9, min: 1, max: 5000, step: 1 },
      {
        key: 'offset',
        type: 'number',
        label: 'Offset',
        default: 0.85,
        min: 0,
        max: 1,
        step: 0.05,
        tooltip: 'Where the weight peak sits in the window: 0 is the oldest bar, 1 the newest.',
      },
      {
        key: 'sigma',
        type: 'number',
        label: 'Sigma',
        default: 6,
        min: 0.1,
        max: 100,
        step: 0.1,
        tooltip: 'Width of the Gaussian weighting. Larger values concentrate the weight near the peak.',
      },
      { key: 'source', type: 'source', label: 'Source', default: 'close' },
    ],

    plots: [
      { key: 'alma', type: 'line', title: 'ALMA', style: { color: '#e69138', lineWidth: 2 } },
    ],

    calc(bars, settings) {
      const length = Math.max(1, Math.floor(numOr(settings.length, 9)))
      const offset = clamp(numOr(settings.offset, 0.85), 0, 1)
      // Sigma divides the window width, so a zero or negative value would make
      // the weights degenerate. Floor it rather than emitting Infinity.
      const sigma = Math.max(0.1, numOr(settings.sigma, 6))
      const src = sourceValues(bars, settings.source ?? 'close')

      return { alma: nulls(alma(src, length, offset, sigma)) }
    },
  })
}
