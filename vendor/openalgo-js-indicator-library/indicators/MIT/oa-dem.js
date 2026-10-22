/**
 * DeMarker Oscillator (DEM) - ported to openalgo-charts from Pine Script v6.
 *
 * Source: https://github.com/mihakralj/pinescript/blob/c4e91b962be09733d8fc76caa5191e9e586c5cee/indicators/oscillators/dem.pine
 * Repo:   mihakralj/pinescript
 * License: MIT
 * SPDX-FileCopyrightText: (c) mihakralj
 * SPDX-FileCopyrightText: (c) 2026 marketcalls (port to openalgo-charts)
 * SPDX-License-Identifier: MIT
 *
 * Compares the sum of recent upward high extensions against the sum of
 * downward low extensions, so the reading sits in [0, 1] with 0.3 read as
 * oversold and 0.7 as overbought.
 */

export default function ({ registerIndicator, nulls }) {
  registerIndicator({
    id: 'oa-dem',
    name: 'DeMarker Oscillator (DEM)',
    category: 'Oscillators',
    placement: 'pane',

    inputs: [
      {
        key: 'period',
        type: 'number',
        label: 'Period',
        default: 14,
        min: 1,
        max: 5000,
        step: 1,
        tooltip: 'Smoothing period over which the up and down extensions are summed. Traditional value is 14.',
      },
    ],

    plots: [{ key: 'dem', type: 'line', title: 'DEM', style: { color: '#ffeb3b', lineWidth: 2 } }],

    levels: () => [
      { price: 0.7, title: 'Overbought', color: '#ff5252', dashed: true },
      { price: 0.5, title: 'Midline', color: '#787b86', dashed: true },
      { price: 0.3, title: 'Oversold', color: '#4caf50', dashed: true },
    ],

    calc(bars, settings) {
      // A cleared number field arrives as '', and Number('') is 0.
      const period = Math.max(1, Math.min(5000, Math.floor(Number(settings.period) || 14)))
      const len = bars.length
      const out = new Array(len).fill(NaN)

      // Pine seeds both circular buffers with 0.0, not na, so the rolling sums
      // are partial-window sums until `period` bars have gone by.
      const deMaxBuf = new Array(period).fill(0)
      const deMinBuf = new Array(period).fill(0)
      let idx = 0
      let deMaxSum = 0
      let deMinSum = 0

      for (let i = 0; i < len; i++) {
        const bar = bars[i]
        const prev = i > 0 ? bars[i - 1] : bar
        // nz(high[1], high): the first bar compares against itself, so both
        // extensions start at zero.
        const prevHigh = Number.isFinite(prev.high) ? prev.high : bar.high
        const prevLow = Number.isFinite(prev.low) ? prev.low : bar.low

        const rawMax = bar.high - prevHigh
        const rawMin = prevLow - bar.low
        const deMax = Number.isFinite(rawMax) ? Math.max(rawMax, 0) : 0
        const deMin = Number.isFinite(rawMin) ? Math.max(rawMin, 0) : 0

        deMaxSum -= deMaxBuf[idx]
        deMinSum -= deMinBuf[idx]
        deMaxBuf[idx] = deMax
        deMinBuf[idx] = deMin
        deMaxSum += deMax
        deMinSum += deMin
        idx = (idx + 1) % period

        const denom = deMaxSum + deMinSum
        out[i] = Number.isFinite(denom) && denom !== 0 ? deMaxSum / denom : 0.5
      }

      return { dem: nulls(out) }
    },
  })
}
