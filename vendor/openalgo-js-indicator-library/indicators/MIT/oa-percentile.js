/**
 * Percentile - ported to openalgo-charts from Pine Script v6.
 *
 * Source: https://github.com/mihakralj/pinescript/blob/c4e91b962be09733d8fc76caa5191e9e586c5cee/indicators/statistics/percentile.pine
 * Repo:   mihakralj/pinescript
 * License: MIT
 * SPDX-FileCopyrightText: (c) mihakralj
 * SPDX-FileCopyrightText: (c) 2026 marketcalls (port to openalgo-charts)
 * SPDX-License-Identifier: MIT
 *
 * Plots the value sitting at a chosen percentile of the source over a rolling
 * lookback, interpolating linearly between the two neighbouring ranks.
 */

export default function ({ registerIndicator, sourceValues, nulls }) {
  // First index whose value is not less than v, for an ascending array.
  const lowerBound = (arr, v) => {
    let lo = 0
    let hi = arr.length
    while (lo < hi) {
      const mid = (lo + hi) >> 1
      if (arr[mid] < v) lo = mid + 1
      else hi = mid
    }
    return lo
  }

  registerIndicator({
    id: 'oa-percentile',
    name: 'Percentile',
    category: 'Statistics',
    placement: 'onchart',

    inputs: [
      { key: 'source', type: 'source', label: 'Source', default: 'close' },
      { key: 'length', type: 'number', label: 'Period', default: 14, min: 1, max: 5000, step: 1 },
      {
        key: 'percentile',
        type: 'number',
        label: 'Percentile (0-100)',
        default: 25,
        min: 0,
        max: 100,
        step: 0.1,
        tooltip: '50 gives the median, 0 the window low, 100 the window high.',
      },
    ],

    plots: [{ key: 'percentile', type: 'line', title: 'Percentile', style: { color: '#ffeb3b', lineWidth: 2 } }],

    calc(bars, settings) {
      // A cleared number field arrives as '', and Number('') is 0, which is a
      // legal percentile, so the fallback has to test the raw value.
      const length = Math.max(1, Math.floor(Number(settings.length) || 14))
      const rawP = settings.percentile
      const parsedP = rawP === '' || rawP == null ? NaN : Number(rawP)
      const p = Math.min(100, Math.max(0, Number.isFinite(parsedP) ? parsedP : 25))

      const src = sourceValues(bars, settings.source ?? 'close')
      const n = bars.length
      const out = new Array(n).fill(NaN)

      // The source rebuilds and sorts the window on every bar; keeping it sorted
      // incrementally gives the same set of values at a fraction of the cost.
      const win = []

      for (let i = 0; i < n; i++) {
        const drop = i - length
        if (drop >= 0 && Number.isFinite(src[drop])) {
          const idx = lowerBound(win, src[drop])
          if (idx < win.length && win[idx] === src[drop]) win.splice(idx, 1)
        }
        if (Number.isFinite(src[i])) win.splice(lowerBound(win, src[i]), 0, src[i])

        const nValid = win.length
        if (nValid === 0) continue
        if (nValid === 1) {
          out[i] = win[0]
          continue
        }
        if (p === 0) {
          out[i] = win[0]
          continue
        }
        if (p === 100) {
          out[i] = win[nValid - 1]
          continue
        }

        const rank = (p / 100.0) * (nValid - 1)
        const floorIdx = Math.floor(rank)
        const ceilIdx = Math.ceil(rank)
        if (floorIdx === ceilIdx) {
          out[i] = win[floorIdx]
        } else {
          const valFloor = win[floorIdx]
          const valCeil = win[ceilIdx]
          out[i] = valFloor + (rank - floorIdx) * (valCeil - valFloor)
        }
      }

      return { percentile: nulls(out) }
    },
  })
}
