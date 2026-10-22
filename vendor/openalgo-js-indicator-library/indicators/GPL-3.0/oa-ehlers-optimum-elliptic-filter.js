/**
 * Ehlers Optimum Elliptic Filter (OEF) - ported to openalgo-charts from Pine Script v3.
 *
 * Source: https://github.com/everget/tradingview-pinescript-indicators/blob/60c93d3711d222b8f2db96160defe568429348e0/movings/ehlers_optimum_elliptic_filter.pine
 * Repo:   everget/tradingview-pinescript-indicators
 * License: GPL-3.0, Copyright (c) 2019-present, Alex Orekhov (everget)
 * SPDX-FileCopyrightText: (c) 2018-present Alex Orekhov (everget)
 * SPDX-FileCopyrightText: (c) 2026 marketcalls (port to openalgo-charts)
 * SPDX-License-Identifier: GPL-3.0-only
 *
 * A two-pole elliptic smoothing filter: a short FIR stage over the last three
 * source values feeding a recursive IIR stage, which tracks price with very
 * little lag while still rejecting bar-to-bar noise.
 */

export default function ({ registerIndicator, sourceValues, nulls }) {
  // Pine v3 named colour constants.
  const NEUTRAL = '#6d1e7f'
  const UP = '#008000'
  const DOWN = '#ff0000'

  registerIndicator({
    id: 'oa-ehlers-optimum-elliptic-filter',
    name: 'Ehlers Optimum Elliptic Filter (OEF)',
    category: 'Moving Averages',
    placement: 'onchart',

    inputs: [
      { key: 'source', type: 'source', label: 'Source', default: 'hl2' },
      { key: 'highlightMovements', type: 'boolean', label: 'Highlight Movements ?', default: false },
    ],

    plots: [
      {
        key: 'oef',
        type: 'line',
        title: 'OEF',
        style: { color: NEUTRAL, lineWidth: 2 },
        colorBy({ value, index, values, settings }) {
          if (settings.highlightMovements !== true) return NEUTRAL
          const prev = index > 0 ? values.oef[index - 1] : null
          // Pine compares against na on the first bar, which is false, so the
          // filter opens on the down colour.
          if (!Number.isFinite(prev) || !Number.isFinite(value)) return DOWN
          return value > prev ? UP : DOWN
        },
      },
    ],

    calc(bars, settings) {
      const src = sourceValues(bars, settings.source ?? 'hl2')
      const oef = new Array(bars.length).fill(NaN)

      // Pine nz(): a missing history term reads as 0.
      const nz = (v) => (Number.isFinite(v) ? v : 0)

      for (let i = 0; i < bars.length; i++) {
        const s0 = src[i]
        // The current source is not wrapped in nz() by the source, so a missing
        // bar leaves a gap and the recursion restarts from zeroed history.
        if (!Number.isFinite(s0)) continue
        const s1 = nz(i >= 1 ? src[i - 1] : NaN)
        const s2 = nz(i >= 2 ? src[i - 2] : NaN)
        const o1 = nz(i >= 1 ? oef[i - 1] : NaN)
        const o2 = nz(i >= 2 ? oef[i - 2] : NaN)
        oef[i] = 0.13785 * s0 + 0.0007 * s1 + 0.13785 * s2 + 1.2103 * o1 - 0.4867 * o2
      }

      return { oef: nulls(oef) }
    },
  })
}
