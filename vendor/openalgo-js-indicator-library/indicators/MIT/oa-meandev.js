/**
 * Mean Deviation (MEANDEV) - ported to openalgo-charts from Pine Script v6.
 *
 * Source: https://github.com/mihakralj/pinescript/blob/c4e91b962be09733d8fc76caa5191e9e586c5cee/indicators/statistics/meandev.pine
 * Repo:   mihakralj/pinescript
 * License: MIT (c) mihakralj
 * SPDX-FileCopyrightText: (c) mihakralj
 * SPDX-FileCopyrightText: (c) 2026 marketcalls (port to openalgo-charts)
 * SPDX-License-Identifier: MIT
 *
 * The average absolute distance of the source from its own mean over the
 * lookback: a dispersion measure that, unlike standard deviation, does not
 * square the outliers.
 */

export default function ({ registerIndicator, sourceValues, nulls }) {
  registerIndicator({
    id: 'oa-meandev',
    name: 'Mean Deviation (MEANDEV)',
    category: 'Statistics',
    placement: 'pane',

    inputs: [
      { key: 'period', type: 'number', label: 'Period', default: 14, min: 1, max: 5000, step: 1 },
      { key: 'source', type: 'source', label: 'Source', default: 'close' },
    ],

    plots: [{ key: 'meandev', type: 'line', title: 'MeanDev', style: { color: '#ffeb3b', lineWidth: 2 } }],

    calc(bars, settings) {
      // A cleared number field arrives as '', and Number('') is 0.
      const period = Math.max(1, Math.floor(Number(settings.period) || 14))
      const src = sourceValues(bars, settings.source ?? 'close')
      const n = bars.length

      // The Pine version keeps a circular buffer of the last `period` values and
      // reports from the very first bar over however many it has so far, so the
      // window is expanding until it is full. nz(src) makes a missing price 0.
      const p = Math.max(1, period)
      const v = new Array(n)
      for (let i = 0; i < n; i++) v[i] = Number.isFinite(src[i]) ? src[i] : 0

      const out = new Array(n).fill(NaN)
      let sum = 0
      for (let i = 0; i < n; i++) {
        sum += v[i]
        if (i >= p) sum -= v[i - p]
        const count = Math.min(i + 1, p)
        const mean = sum / count
        let devSum = 0
        for (let k = 0; k < count; k++) devSum += Math.abs(v[i - k] - mean)
        out[i] = devSum / count
      }

      return { meandev: nulls(out) }
    },
  })
}
