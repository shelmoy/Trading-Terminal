/**
 * Decay Min-Max Channel (DECAYCHANNEL) - ported to openalgo-charts from Pine Script v6.
 *
 * Source: https://github.com/mihakralj/pinescript/blob/c4e91b962be09733d8fc76caa5191e9e586c5cee/indicators/channels/decaychannel.pine
 * Repo:   mihakralj/pinescript
 * License: MIT (c) mihakralj
 * SPDX-FileCopyrightText: (c) mihakralj
 * SPDX-FileCopyrightText: (c) 2026 marketcalls (port to openalgo-charts)
 * SPDX-License-Identifier: MIT
 *
 * A channel that jumps instantly to a new extreme and then decays back toward
 * the channel midpoint with a half-life of one period, so stale highs and lows
 * fade instead of holding the band open.
 */

export default function ({ registerIndicator, nulls }) {
  registerIndicator({
    id: 'oa-decaychannel',
    name: 'Decay Min-Max Channel (DECAYCHANNEL)',
    category: 'Channels',
    placement: 'onchart',

    inputs: [
      { key: 'period', type: 'number', label: 'Period', default: 100, min: 1, max: 2000, step: 1 },
    ],

    plots: [
      { key: 'highest', type: 'line', title: 'Decaying High', style: { color: '#ffeb3b', lineWidth: 2 } },
      { key: 'lowest', type: 'line', title: 'Decaying Low', style: { color: '#ffeb3b', lineWidth: 2 } },
    ],

    fills: [{ between: ['highest', 'lowest'], colorUp: '#2962ff', colorDown: '#2962ff', opacity: 0.1 }],

    calc(bars, settings) {
      // A cleared number field arrives as '', and Number('') is 0.
      const period = Math.max(1, Math.floor(Number(settings.period) || 100))
      const decayLambda = Math.log(2) / period

      const highs = new Array(bars.length).fill(NaN)
      const lows = new Array(bars.length).fill(NaN)

      // Pine keeps a circular buffer of `period` slots written at bar_index % period,
      // which is exactly the window of the most recent `period` bars.
      const hbuf = new Array(period).fill(NaN)
      const lbuf = new Array(period).fill(NaN)

      let currentMax = NaN
      let currentMin = NaN
      let timeSinceNewMax = 0
      let timeSinceNewMin = 0

      for (let i = 0; i < bars.length; i++) {
        const hi = bars[i].high
        const lo = bars[i].low
        const idx = i % period
        hbuf[idx] = hi
        lbuf[idx] = lo

        let periodMax = NaN
        let periodMin = NaN
        let validCount = 0
        for (let k = 0; k < period; k++) {
          const hVal = hbuf[k]
          const lVal = lbuf[k]
          if (!Number.isFinite(hVal) || !Number.isFinite(lVal)) continue
          periodMax = Number.isFinite(periodMax) ? Math.max(periodMax, hVal) : hVal
          periodMin = Number.isFinite(periodMin) ? Math.min(periodMin, lVal) : lVal
          validCount += 1
        }

        if (!Number.isFinite(currentMax) || !Number.isFinite(currentMin)) {
          currentMax = Number.isFinite(periodMax) ? periodMax : hi
          currentMin = Number.isFinite(periodMin) ? periodMin : lo
          timeSinceNewMax = 0
          timeSinceNewMin = 0
        } else {
          if (Number.isFinite(hi) && hi >= currentMax) {
            currentMax = hi
            timeSinceNewMax = 0
          } else {
            timeSinceNewMax += 1
          }
          if (Number.isFinite(lo) && lo <= currentMin) {
            currentMin = lo
            timeSinceNewMin = 0
          } else {
            timeSinceNewMin += 1
          }
          if (validCount > 0) {
            const midpoint = (currentMax + currentMin) / 2
            const maxDecayRate = 1 - Math.exp(-decayLambda * timeSinceNewMax)
            const minDecayRate = 1 - Math.exp(-decayLambda * timeSinceNewMin)
            currentMax = currentMax - maxDecayRate * (currentMax - midpoint)
            currentMin = currentMin - minDecayRate * (currentMin - midpoint)
            if (Number.isFinite(periodMax)) currentMax = Math.min(currentMax, periodMax)
            if (Number.isFinite(periodMin)) currentMin = Math.max(currentMin, periodMin)
          }
        }

        highs[i] = currentMax
        lows[i] = currentMin
      }

      return { highest: nulls(highs), lowest: nulls(lows) }
    },
  })
}
