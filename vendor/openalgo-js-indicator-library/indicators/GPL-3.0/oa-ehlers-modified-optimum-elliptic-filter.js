/**
 * Ehlers Modified Optimum Elliptic Filter (MOEF) - ported to openalgo-charts from Pine Script v3.
 *
 * Source: https://github.com/everget/tradingview-pinescript-indicators/blob/60c93d3711d222b8f2db96160defe568429348e0/movings/ehlers_modified_optimum_elliptic_filter.pine
 * Repo:   everget/tradingview-pinescript-indicators
 * License: GPL-3.0, Copyright (c) 2019-present, Alex Orekhov (everget)
 * SPDX-FileCopyrightText: (c) 2018-present Alex Orekhov (everget)
 * SPDX-FileCopyrightText: (c) 2026 marketcalls (port to openalgo-charts)
 * SPDX-License-Identifier: GPL-3.0-only
 *
 * A two-pole elliptic filter that smooths price with almost no lag, taking
 * three weighted momentum terms and feeding back its own two previous values.
 */

export default function ({ registerIndicator, sourceValues, nulls }) {
  const HIGHLIGHT_UP = '#4caf50'
  const HIGHLIGHT_DOWN = '#ff5252'
  const NEUTRAL = '#6d1e7f'

  registerIndicator({
    id: 'oa-ehlers-modified-optimum-elliptic-filter',
    name: 'Ehlers Modified Optimum Elliptic Filter (MOEF)',
    category: 'Moving Averages',
    placement: 'onchart',

    inputs: [
      { key: 'source', type: 'source', label: 'Source', default: 'hl2' },
      { key: 'highlightMovements', type: 'boolean', label: 'Highlight Movements ?', default: false },
    ],

    plots: [
      {
        key: 'moef',
        type: 'line',
        title: 'MOEF',
        style: { color: NEUTRAL, lineWidth: 2 },
        colorBy({ index, values, settings }) {
          if (!settings?.highlightMovements) return NEUTRAL
          const cur = values?.moef?.[index]
          const prev = index > 0 ? values?.moef?.[index - 1] : undefined
          if (!Number.isFinite(cur) || !Number.isFinite(prev)) return HIGHLIGHT_DOWN
          return cur > prev ? HIGHLIGHT_UP : HIGHLIGHT_DOWN
        },
      },
    ],

    calc(bars, settings) {
      const src = sourceValues(bars, settings.source ?? 'hl2')
      const n = bars.length
      const moef = new Array(n).fill(NaN)

      for (let i = 0; i < n; i++) {
        const s = src[i]
        if (!Number.isFinite(s)) continue

        // nz(src[1], src), nz(src[2], src1), nz(src[3], src2): each missing bar
        // falls back to the newest value that does exist.
        const s1 = i >= 1 && Number.isFinite(src[i - 1]) ? src[i - 1] : s
        const s2 = i >= 2 && Number.isFinite(src[i - 2]) ? src[i - 2] : s1
        const s3 = i >= 3 && Number.isFinite(src[i - 3]) ? src[i - 3] : s2

        // nz(moef[1], moef) and nz(moef[2], moef) fall back to the current
        // source, because moef still holds its 'moef = src' seed at that point.
        const p1 = i >= 1 && Number.isFinite(moef[i - 1]) ? moef[i - 1] : s
        const p2 = i >= 2 && Number.isFinite(moef[i - 2]) ? moef[i - 2] : s

        moef[i] =
          0.13785 * (2 * s - s1) +
          0.0007 * (2 * s1 - s2) +
          0.13785 * (2 * s2 - s3) +
          1.2103 * p1 -
          0.4867 * p2
      }

      return { moef: nulls(moef) }
    },
  })
}
