/**
 * Andrews' Pitchfork (AP) - ported to openalgo-charts from Pine Script v6.
 *
 * Source: https://github.com/mihakralj/pinescript/blob/c4e91b962be09733d8fc76caa5191e9e586c5cee/indicators/channels/apchannel.pine
 * Repo:   mihakralj/pinescript
 * License: MIT (c) mihakralj
 * SPDX-FileCopyrightText: (c) mihakralj
 * SPDX-FileCopyrightText: (c) 2026 marketcalls (port to openalgo-charts)
 * SPDX-License-Identifier: MIT
 *
 * Three rolling pivots set a median line through the midpoint of the two newer
 * ones, and the outer lines run parallel to it, so the channel tracks the
 * prevailing slope rather than a volatility band.
 */

export default function ({ registerIndicator, nulls }) {
  registerIndicator({
    id: 'oa-apchannel',
    name: 'Andrews\' Pitchfork (AP)',
    category: 'Channels',
    placement: 'onchart',

    inputs: [
      { key: 'p1Back', type: 'number', label: 'Point 1 (Leftmost)', default: 45, min: 1, max: 5000, step: 1 },
      { key: 'p2Back', type: 'number', label: 'Point 2 (Second)', default: 30, min: 1, max: 5000, step: 1 },
      { key: 'p3Back', type: 'number', label: 'Point 3 (Third)', default: 15, min: 1, max: 5000, step: 1 },
    ],

    plots: [
      { key: 'median', type: 'line', title: 'Median', style: { color: '#ffeb3b', lineWidth: 2 } },
      { key: 'upper', type: 'line', title: 'Upper', style: { color: '#2962ff', lineWidth: 1 } },
      { key: 'lower', type: 'line', title: 'Lower', style: { color: '#2962ff', lineWidth: 1 } },
    ],

    fills: [{ between: ['upper', 'lower'], colorUp: '#2962ff', colorDown: '#2962ff', opacity: 0.1 }],

    calc(bars, settings) {
      // A cleared number field arrives as '', and Number('') is 0.
      const p1Back = Math.max(1, Math.floor(Number(settings.p1Back) || 45))
      const p2Back = Math.max(1, Math.floor(Number(settings.p2Back) || 30))
      const p3Back = Math.max(1, Math.floor(Number(settings.p3Back) || 15))

      const n = bars.length
      const median = new Array(n).fill(NaN)
      const upper = new Array(n).fill(NaN)
      const lower = new Array(n).fill(NaN)

      for (let i = 0; i < n; i++) {
        // Pine clamps each lookback to bar_index, so early bars collapse the
        // pivots onto the first bar rather than reading off the start of history.
        const p1b = Math.min(p1Back, i)
        const p2b = Math.min(p2Back, i)
        const p3b = Math.min(p3Back, i)
        const p1Time = i - p1b
        const p2Time = i - p2b
        const p3Time = i - p3b

        const p1Price = Number(bars[p1Time].close)
        const p2Price = Number(bars[p2Time].high)
        const p3Price = Number(bars[p3Time].low)
        // Pine reads these through nz() and then guards them; a bar with no
        // price would place the fork at zero, so the port leaves the gap open.
        if (!Number.isFinite(p1Price) || !Number.isFinite(p2Price) || !Number.isFinite(p3Price)) continue

        const midTime = (p2Time + p3Time) / 2
        const midPrice = (p2Price + p3Price) / 2
        const timeDiff = midTime - p1Time
        const slope = Math.abs(timeDiff) > 1e-10 ? (midPrice - p1Price) / timeDiff : 0

        const medianValue = p1Price + slope * (i - p1Time)
        const upperValue = p2Price + slope * (i - p2Time)
        const lowerValue = p3Price + slope * (i - p3Time)

        // The source rejects a projection that has run away; without it a near
        // flat time base throws the lines far off the price scale.
        if (Math.abs(medianValue) > 1e9 || Math.abs(upperValue) > 1e9 || Math.abs(lowerValue) > 1e9) continue

        median[i] = medianValue
        upper[i] = upperValue
        lower[i] = lowerValue
      }

      return { median: nulls(median), upper: nulls(upper), lower: nulls(lower) }
    },
  })
}
