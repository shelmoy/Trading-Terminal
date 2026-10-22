/**
 * Min-Max Normalization (NORMALIZE) - ported to openalgo-charts from Pine Script v6.
 *
 * Source: https://github.com/mihakralj/pinescript/blob/c4e91b962be09733d8fc76caa5191e9e586c5cee/indicators/numerics/normalize.pine
 * Repo:   mihakralj/pinescript
 * License: MIT (c) mihakralj
 * SPDX-FileCopyrightText: (c) mihakralj
 * SPDX-FileCopyrightText: (c) 2026 marketcalls (port to openalgo-charts)
 * SPDX-License-Identifier: MIT
 *
 * Rescales the source to the fixed range 0 to 1 by its own highest and lowest
 * readings over a lookback window, so the current bar is shown as its position
 * within that window rather than as a price.
 */

export default function ({ registerIndicator, sourceValues, nulls }) {
  registerIndicator({
    id: 'oa-normalize',
    name: 'Min-Max Normalization (NORMALIZE)',
    category: 'Numerics',
    placement: 'pane',

    inputs: [
      { key: 'source', type: 'source', label: 'Source', default: 'close' },
      {
        key: 'length',
        type: 'number',
        label: 'Lookback Length',
        default: 200,
        min: 1,
        max: 5000,
        step: 1,
        tooltip: 'Lookback period for finding min and max. Must be at least 1.',
      },
    ],

    plots: [
      { key: 'normalized', type: 'line', title: 'Normalized Value [0,1]', style: { color: '#ffeb3b', lineWidth: 2 } },
    ],

    calc(bars, settings) {
      // A cleared number field arrives as '', and Number('') is 0.
      const length = Math.max(1, Math.floor(Number(settings.length) || 200))
      const src = sourceValues(bars, settings.source ?? 'close')
      const n = bars.length

      const out = new Array(n).fill(NaN)

      for (let i = 0; i < n; i++) {
        const current = src[i]
        if (!Number.isFinite(current)) continue

        // Pine seeds both extremes with the current bar and skips na history,
        // so a short chart normalises against whatever bars exist so far.
        let minVal = current
        let maxVal = current
        const start = Math.max(0, i - (length - 1))
        for (let k = i - 1; k >= start; k--) {
          const value = src[k]
          if (!Number.isFinite(value)) continue
          if (value < minVal) minVal = value
          if (value > maxVal) maxVal = value
        }

        const rangeVal = maxVal - minVal
        // A flat window leaves the source's own 0.0 default in place.
        let normalized = 0
        if (rangeVal !== 0 && Number.isFinite(rangeVal)) {
          normalized = (current - minVal) / rangeVal
        }
        out[i] = normalized
      }

      return { normalized: nulls(out) }
    },
  })
}
