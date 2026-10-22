/**
 * Interquartile Range (IQR) - ported to openalgo-charts from Pine Script v6.
 *
 * Source: https://github.com/mihakralj/pinescript/blob/c4e91b962be09733d8fc76caa5191e9e586c5cee/indicators/statistics/iqr.pine
 * Repo:   mihakralj/pinescript
 * License: MIT
 * SPDX-FileCopyrightText: (c) mihakralj
 * SPDX-FileCopyrightText: (c) 2026 marketcalls (port to openalgo-charts)
 * SPDX-License-Identifier: MIT
 *
 * The spread between the 75th and the 25th percentile of the lookback window,
 * both taken with linear interpolation, so dispersion is measured without the
 * outlier sensitivity of a standard deviation.
 */

export default function ({ registerIndicator, sourceValues, nulls }) {
  // Linear-interpolated percentile over an already ascending-sorted array,
  // reproducing the clamping and the equal-neighbour shortcut of the source.
  const percentile = (sorted, p) => {
    const n = sorted.length
    if (n === 0) return NaN
    if (n === 1) return sorted[0]
    if (p === 0) return sorted[0]
    if (p === 100) return sorted[n - 1]

    const rank = (p / 100.0) * (n - 1)
    const kFloor = Math.floor(rank)
    const kCeil = Math.ceil(rank)
    const lo = Math.max(0, Math.min(n - 1, kFloor))
    const hi = Math.max(0, Math.min(n - 1, kCeil))
    if (lo === hi) return sorted[lo]

    const valFloor = sorted[lo]
    const valCeil = sorted[hi]
    if (valFloor === valCeil) return valFloor
    return valFloor + (rank - kFloor) * (valCeil - valFloor)
  }

  registerIndicator({
    id: 'oa-iqr',
    name: 'Interquartile Range (IQR)',
    category: 'Statistics',
    placement: 'pane',

    inputs: [
      { key: 'source', type: 'source', label: 'Source', default: 'close' },
      { key: 'length', type: 'number', label: 'Lookback Period', default: 20, min: 2, max: 500, step: 1 },
    ],

    plots: [{ key: 'iqr', type: 'line', title: 'IQR', style: { color: '#ffeb3b', lineWidth: 2 } }],

    calc(bars, settings) {
      // A cleared number field arrives as '', and Number('') is 0.
      const length = Math.max(2, Math.floor(Number(settings.length) || 20))
      const src = sourceValues(bars, settings.source ?? 'close')

      const out = new Array(bars.length).fill(NaN)

      for (let i = 0; i < bars.length; i++) {
        // Pine reads src[0 .. len-1] and skips na, so early bars simply hold
        // fewer points rather than being suppressed.
        const window = []
        const start = Math.max(0, i - length + 1)
        for (let j = start; j <= i; j++) {
          if (Number.isFinite(src[j])) window.push(src[j])
        }
        if (window.length === 0) continue

        window.sort((a, b) => a - b)
        const q1 = percentile(window, 25.0)
        const q3 = percentile(window, 75.0)
        if (!Number.isFinite(q1) || !Number.isFinite(q3)) continue
        out[i] = q3 - q1
      }

      return { iqr: nulls(out) }
    },
  })
}
