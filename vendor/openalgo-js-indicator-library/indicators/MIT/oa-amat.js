/**
 * Archer Moving Averages Trends (AMAT) - ported to openalgo-charts from Pine Script v6.
 *
 * Source: https://github.com/mihakralj/pinescript/blob/c4e91b962be09733d8fc76caa5191e9e586c5cee/indicators/dynamics/amat.pine
 * Repo:   mihakralj/pinescript
 * License: MIT (c) mihakralj
 * SPDX-FileCopyrightText: (c) mihakralj
 * SPDX-FileCopyrightText: (c) 2026 marketcalls (port to openalgo-charts)
 * SPDX-License-Identifier: MIT
 *
 * Marks a bar as trending only when the fast and the slow average agree on
 * both their order and their direction, and reports how far apart the two
 * averages have opened as a percentage of the slow one.
 */

export default function ({ registerIndicator, sourceValues, nulls }) {
  registerIndicator({
    id: 'oa-amat',
    name: 'Archer Moving Averages Trends (AMAT)',
    category: 'Dynamics',
    placement: 'pane',

    inputs: [
      { key: 'fast', type: 'number', label: 'Fast Period', default: 10, min: 1, max: 5000, step: 1 },
      { key: 'slow', type: 'number', label: 'Slow Period', default: 50, min: 2, max: 5000, step: 1 },
      { key: 'source', type: 'source', label: 'Source', default: 'close' },
    ],

    plots: [
      {
        key: 'trend',
        type: 'column',
        title: 'AMAT Trend',
        style: { color: '#787b86', lineWidth: 3 },
        // Pine colours the columns green above zero, red below, grey at zero.
        colorBy: ({ value }) => {
          if (!Number.isFinite(value)) return '#787b86'
          if (value > 0) return '#4caf50'
          if (value < 0) return '#ff5252'
          return '#787b86'
        },
      },
      { key: 'strength', type: 'line', title: 'Trend Strength %', style: { color: '#ffeb3b', lineWidth: 2 } },
    ],

    levels: () => [{ price: 0, title: 'Zero', color: '#787b86', dashed: true }],

    calc(bars, settings) {
      // A cleared number field arrives as '', and Number('') is 0.
      const fast = Math.max(1, Math.floor(Number(settings.fast) || 10))
      const slow = Math.max(2, Math.floor(Number(settings.slow) || 50))
      const src = sourceValues(bars, settings.source ?? 'close')

      const alphaFast = 2 / (fast + 1)
      const alphaSlow = 2 / (slow + 1)

      const n = bars.length
      const trend = new Array(n).fill(NaN)
      const strength = new Array(n).fill(NaN)

      // Pine seeds all four var floats from the source on the first bar, so
      // both averages start at the first value and both previous values start
      // there too. The first bar therefore reports no trend and zero spread.
      let emaFast = NaN
      let emaSlow = NaN
      let prevFast = NaN
      let prevSlow = NaN

      for (let i = 0; i < n; i++) {
        const value = src[i]
        if (!Number.isFinite(value)) continue

        if (!Number.isFinite(emaFast)) {
          emaFast = value
          emaSlow = value
          prevFast = value
          prevSlow = value
        }

        emaFast = alphaFast * (value - emaFast) + emaFast
        emaSlow = alphaSlow * (value - emaSlow) + emaSlow

        const longTrend = emaFast > emaSlow && emaFast > prevFast && emaSlow > prevSlow ? 1 : 0
        const shortTrend = emaFast < emaSlow && emaFast < prevFast && emaSlow < prevSlow ? -1 : 0

        prevFast = emaFast
        prevSlow = emaSlow

        trend[i] = longTrend + shortTrend
        // Guard the divide: a zero slow average would otherwise be infinite.
        strength[i] = emaSlow === 0 ? NaN : (Math.abs(emaFast - emaSlow) / emaSlow) * 100
      }

      return { trend: nulls(trend), strength: nulls(strength) }
    },
  })
}
