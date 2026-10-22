/**
 * Aroon (AROON) - ported to openalgo-charts from Pine Script v6.
 *
 * Source: https://github.com/mihakralj/pinescript/blob/c4e91b962be09733d8fc76caa5191e9e586c5cee/indicators/dynamics/aroon.pine
 * Repo:   mihakralj/pinescript
 * License: MIT (c) mihakralj
 * SPDX-FileCopyrightText: (c) mihakralj
 * SPDX-FileCopyrightText: (c) 2026 marketcalls (port to openalgo-charts)
 * SPDX-License-Identifier: MIT
 *
 * Measures how recently the lookback window made its highest high and its
 * lowest low, each expressed as a percentage of the window length.
 */

export default function ({ registerIndicator, highestBars, lowestBars, nulls }) {
  registerIndicator({
    id: 'oa-aroon',
    name: 'Aroon (AROON)',
    category: 'Dynamics',
    placement: 'pane',

    inputs: [
      {
        key: 'period',
        type: 'number',
        label: 'Period',
        default: 25,
        min: 1,
        max: 5000,
        step: 1,
        tooltip: 'Number of bars used in the calculation',
      },
    ],

    plots: [
      { key: 'up', type: 'line', title: 'Aroon Up', style: { color: '#ffeb3b', lineWidth: 2 } },
      { key: 'down', type: 'line', title: 'Aroon Down', style: { color: '#ffeb3b', lineWidth: 2 } },
    ],

    levels: () => [
      { price: 70, title: 'Upper Level', color: '#787b86' },
      { price: 50, title: 'Mid Level', color: '#787b86' },
      { price: 30, title: 'Lower Level', color: '#787b86' },
    ],

    range: () => ({ min: 0, max: 100 }),

    calc(bars, settings) {
      // A cleared number field arrives as '', and Number('') is 0.
      const period = Math.max(1, Math.floor(Number(settings.period) || 25))
      const highs = bars.map((b) => b.high)
      const lows = bars.map((b) => b.low)

      // ta.highestbars / ta.lowestbars: 0 on the current bar, negative going
      // back, and not available until the window is full.
      const highestPos = highestBars(highs, period)
      const lowestPos = lowestBars(lows, period)

      const up = new Array(bars.length).fill(NaN)
      const down = new Array(bars.length).fill(NaN)
      for (let i = 0; i < bars.length; i++) {
        if (Number.isFinite(highestPos[i])) up[i] = (100 * (period + highestPos[i])) / period
        if (Number.isFinite(lowestPos[i])) down[i] = (100 * (period + lowestPos[i])) / period
      }
      return { up: nulls(up), down: nulls(down) }
    },

    // The source's four alertcondition() calls. TradingView's {{ticker}}
    // placeholder has no equivalent here, so the messages name the event only.
    alerts: [
      {
        id: 'aroon-cross-up',
        title: 'Aroon Up crosses above Down',
        message: 'Bullish crossover',
        when: ({ values, index }) => {
          if (index < 1) return false
          const u = values.up
          const d = values.down
          const uc = u[index]
          const dc = d[index]
          const up1 = u[index - 1]
          const dp1 = d[index - 1]
          if (!Number.isFinite(uc) || !Number.isFinite(dc)) return false
          if (!Number.isFinite(up1) || !Number.isFinite(dp1)) return false
          return uc > dc && up1 <= dp1
        },
      },
      {
        id: 'aroon-cross-down',
        title: 'Aroon Down crosses above Up',
        message: 'Bearish crossover',
        when: ({ values, index }) => {
          if (index < 1) return false
          const u = values.up
          const d = values.down
          const uc = u[index]
          const dc = d[index]
          const up1 = u[index - 1]
          const dp1 = d[index - 1]
          if (!Number.isFinite(uc) || !Number.isFinite(dc)) return false
          if (!Number.isFinite(up1) || !Number.isFinite(dp1)) return false
          return uc < dc && up1 >= dp1
        },
      },
      {
        id: 'aroon-strong-uptrend',
        title: 'Strong uptrend',
        message: 'Strong uptrend detected',
        when: ({ values, index }) => {
          const uc = values.up[index]
          const dc = values.down[index]
          if (!Number.isFinite(uc) || !Number.isFinite(dc)) return false
          return uc > 70 && dc < 30
        },
      },
      {
        id: 'aroon-strong-downtrend',
        title: 'Strong downtrend',
        message: 'Strong downtrend detected',
        when: ({ values, index }) => {
          const uc = values.up[index]
          const dc = values.down[index]
          if (!Number.isFinite(uc) || !Number.isFinite(dc)) return false
          return dc > 70 && uc < 30
        },
      },
    ],
  })
}
