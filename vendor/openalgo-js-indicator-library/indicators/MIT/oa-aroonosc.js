/**
 * Aroon Oscillator - ported to openalgo-charts from Pine Script v6.
 *
 * Source: https://github.com/mihakralj/pinescript/blob/c4e91b962be09733d8fc76caa5191e9e586c5cee/indicators/dynamics/aroonosc.pine
 * Repo:   mihakralj/pinescript
 * License: MIT
 * SPDX-FileCopyrightText: (c) mihakralj
 * SPDX-FileCopyrightText: (c) 2026 marketcalls (port to openalgo-charts)
 * SPDX-License-Identifier: MIT
 *
 * Aroon Up minus Aroon Down: how recently the window made its high against
 * how recently it made its low, on a -100 to +100 scale.
 */

export default function ({ registerIndicator, highestBars, lowestBars, nulls }) {
  registerIndicator({
    id: 'oa-aroonosc',
    name: 'Aroon Oscillator',
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

    plots: [{ key: 'osc', type: 'line', title: 'Aroon Oscillator', style: { color: '#ffeb3b', lineWidth: 2 } }],

    levels: () => [
      { price: 0, title: 'Zero Line', color: '#787b86' },
      { price: 50, title: 'Upper Level', color: '#787b86', dashed: true },
      { price: -50, title: 'Lower Level', color: '#787b86', dashed: true },
    ],

    // Pine: bgcolor(oscillator > 0 ? green 90% transparent : red 90% transparent).
    // Warmup bars are left unshaded here: Pine's na > 0 is false and would
    // paint the whole warmup red, which says nothing about the trend.
    background: ({ bars, values }) => {
      const osc = values.osc
      return bars.map((_bar, i) => {
        const v = osc ? osc[i] : null
        if (!Number.isFinite(v)) return null
        return v > 0 ? '#4caf501a' : '#ff52521a'
      })
    },

    alerts: [
      {
        id: 'bullish-crossover',
        title: 'Bullish Crossover',
        message: 'Aroon Oscillator crossed above zero',
        when: ({ values, index }) => {
          const osc = values.osc
          if (!osc || index < 1) return false
          const cur = osc[index]
          const prev = osc[index - 1]
          if (!Number.isFinite(cur) || !Number.isFinite(prev)) return false
          return cur > 0 && prev <= 0
        },
      },
      {
        id: 'bearish-crossover',
        title: 'Bearish Crossover',
        message: 'Aroon Oscillator crossed below zero',
        when: ({ values, index }) => {
          const osc = values.osc
          if (!osc || index < 1) return false
          const cur = osc[index]
          const prev = osc[index - 1]
          if (!Number.isFinite(cur) || !Number.isFinite(prev)) return false
          return cur < 0 && prev >= 0
        },
      },
      {
        id: 'strong-uptrend',
        title: 'Strong Uptrend',
        message: 'Strong uptrend detected (Oscillator > 70)',
        when: ({ values, index }) => {
          const v = values.osc ? values.osc[index] : null
          return Number.isFinite(v) && v > 70
        },
      },
      {
        id: 'strong-downtrend',
        title: 'Strong Downtrend',
        message: 'Strong downtrend detected (Oscillator < -70)',
        when: ({ values, index }) => {
          const v = values.osc ? values.osc[index] : null
          return Number.isFinite(v) && v < -70
        },
      },
    ],

    calc(bars, settings) {
      // A cleared number field arrives as '', and Number('') is 0.
      const period = Math.max(1, Math.floor(Number(settings.period) || 25))

      const high = bars.map((b) => b.high)
      const low = bars.map((b) => b.low)

      // Both helpers match ta.highestbars / ta.lowestbars: 0 when the extreme
      // is the current bar, otherwise the negative offset back to it, and NaN
      // for the first period - 1 bars.
      const highestPos = highestBars(high, period)
      const lowestPos = lowestBars(low, period)

      const osc = new Array(bars.length).fill(NaN)
      for (let i = 0; i < bars.length; i++) {
        const hp = highestPos[i]
        const lp = lowestPos[i]
        if (!Number.isFinite(hp) || !Number.isFinite(lp)) continue
        const aroonUp = (100 * (period + hp)) / period
        const aroonDown = (100 * (period + lp)) / period
        osc[i] = aroonUp - aroonDown
      }

      return { osc: nulls(osc) }
    },
  })
}
