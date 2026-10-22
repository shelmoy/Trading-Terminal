/**
 * Ahrens Moving Average (AHMA) - ported to openalgo-charts from Pine Script v4.
 *
 * Source: https://github.com/everget/tradingview-pinescript-indicators/blob/60c93d3711d222b8f2db96160defe568429348e0/movings/ahrens_moving_average.pine
 * Repo:   everget/tradingview-pinescript-indicators
 * License: GPL-3.0, Copyright (c) 2018-present, Alex Orekhov (everget)
 * SPDX-FileCopyrightText: (c) 2018-present Alex Orekhov (everget)
 * SPDX-FileCopyrightText: (c) 2026 marketcalls (port to openalgo-charts)
 * SPDX-License-Identifier: GPL-3.0-only
 *
 * Each bar is pulled towards the source by a fraction of the distance from the
 * midpoint between the previous value and the value a full length ago, which
 * smooths harder than an EMA of the same length for the same lag.
 */

export default function ({ registerIndicator, sourceValues, nulls }) {
  registerIndicator({
    id: 'oa-ahrens-moving-average',
    name: 'Ahrens Moving Average (AHMA)',
    category: 'Moving Averages',
    placement: 'onchart',

    inputs: [
      { key: 'length', type: 'number', label: 'Length', default: 9, min: 1, max: 5000, step: 1 },
      { key: 'source', type: 'source', label: 'Source', default: 'close' },
      { key: 'highlight', type: 'boolean', label: 'Highlight ?', default: true },
    ],

    plots: [
      {
        key: 'ahma',
        type: 'line',
        title: 'AHMA',
        style: { color: '#6d1e7f', lineWidth: 2 },
        // Pine recolours the line green while it rises and red while it falls.
        // A na previous value makes that comparison false, so the first bar is red.
        colorBy({ index, values, settings }) {
          if (settings.highlight === false) return '#6d1e7f'
          const column = values.ahma
          const current = column ? column[index] : undefined
          const previous = index > 0 && column ? column[index - 1] : undefined
          if (!Number.isFinite(current) || !Number.isFinite(previous)) return '#ff5252'
          return current > previous ? '#4caf50' : '#ff5252'
        },
      },
    ],

    calc(bars, settings) {
      // A cleared number field arrives as '', and Number('') is 0.
      const length = Math.max(1, Math.floor(Number(settings.length) || 9))
      const src = sourceValues(bars, settings.source ?? 'close')
      const n = bars.length
      const ahma = new Array(n).fill(NaN)

      // Pine reads both recursive terms through nz(), so a bar before the
      // series exists contributes zero. That is also why the line starts near
      // zero and climbs onto price over the first few dozen bars: it is the
      // source's own warmup, not a gap this port introduced.
      const nz = (value) => (Number.isFinite(value) ? value : 0)

      for (let i = 0; i < n; i++) {
        const value = src[i]
        if (!Number.isFinite(value)) continue
        const previous = nz(ahma[i - 1])
        const lagged = nz(ahma[i - length])
        ahma[i] = previous + (value - (previous + lagged) / 2) / length
      }

      return { ahma: nulls(ahma) }
    },
  })
}
