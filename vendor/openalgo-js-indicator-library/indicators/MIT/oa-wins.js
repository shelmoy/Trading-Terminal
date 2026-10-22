/**
 * WINS: Winsorized Mean Moving Average - ported to openalgo-charts from Pine Script v6.
 *
 * Source: https://github.com/mihakralj/pinescript/blob/c4e91b962be09733d8fc76caa5191e9e586c5cee/indicators/statistics/wins.pine
 * Repo:   mihakralj/pinescript
 * License: MIT (c) mihakralj
 * SPDX-FileCopyrightText: (c) mihakralj
 * SPDX-FileCopyrightText: (c) 2026 marketcalls (port to openalgo-charts)
 * SPDX-License-Identifier: MIT
 *
 * Sorts the lookback window and pulls the extreme values at each tail in to the
 * boundary value at the trim point, then averages the whole window. Outliers
 * lose their pull without the sample losing its size.
 */

export default function ({ registerIndicator, nulls }) {
  registerIndicator({
    id: 'oa-wins',
    name: 'WINS: Winsorized Mean Moving Average',
    category: 'Statistics',
    placement: 'onchart',

    inputs: [
      { key: 'period', type: 'number', label: 'Period', default: 20, min: 3, max: 5000, step: 1 },
      {
        key: 'winPct',
        type: 'number',
        label: 'Winsorize %',
        default: 10,
        min: 0,
        max: 49,
        step: 1,
        tooltip: 'Percentage winsorized from each tail. 0 = SMA',
      },
    ],

    plots: [{ key: 'wins', type: 'line', title: 'WINS', style: { color: '#ffeb3b', lineWidth: 2 } }],

    calc(bars, settings) {
      // A cleared number field arrives as '', and Number('') is 0.
      const period = Math.max(3, Math.floor(Number(settings.period) || 20))
      const winPct = Math.min(49, Math.max(0, Math.floor(Number(settings.winPct) || 0)))

      // Pine truncates toward zero here, and its int/int division floors.
      let winCount = Math.max(Math.trunc((period * winPct) / 100), 0)
      if (winCount >= Math.floor(period / 2)) winCount = Math.floor((period - 1) / 2)

      const out = new Array(bars.length).fill(NaN)
      const window = new Array(period)

      // Pine zero-pads the window through nz(src[i]) before enough history
      // exists, which would drag the first bars toward zero and wreck autoscale.
      // Emit nothing until the window is genuinely full instead; from there on
      // the arithmetic is identical.
      for (let i = period - 1; i < bars.length; i++) {
        for (let j = 0; j < period; j++) {
          const v = bars[i - j].close
          window[j] = Number.isFinite(v) ? v : 0
        }
        window.sort((a, b) => a - b)

        const lowerBound = window[winCount]
        const upperBound = window[period - 1 - winCount]
        for (let j = 0; j < winCount; j++) {
          window[j] = lowerBound
          window[period - 1 - j] = upperBound
        }

        let sum = 0
        for (let j = 0; j < period; j++) sum += window[j]
        out[i] = sum / period
      }

      return { wins: nulls(out) }
    },
  })
}
