/**
 * Stochastic Fast (STOCHF) - ported to openalgo-charts from Pine Script v6.
 *
 * Source: https://github.com/mihakralj/pinescript/blob/c4e91b962be09733d8fc76caa5191e9e586c5cee/indicators/oscillators/stochf.pine
 * Repo:   mihakralj/pinescript
 * License: MIT (c) mihakralj
 * SPDX-FileCopyrightText: (c) mihakralj
 * SPDX-FileCopyrightText: (c) 2026 marketcalls (port to openalgo-charts)
 * SPDX-License-Identifier: MIT
 *
 * Places the close inside the high-low range of the last K bars, with no
 * smoothing on %K, and averages that raw line over D bars for the signal.
 */

export default function ({ registerIndicator, nulls }) {
  registerIndicator({
    id: 'oa-stochf',
    name: 'Stochastic Fast (STOCHF)',
    category: 'Oscillators',
    placement: 'pane',

    inputs: [
      {
        key: 'kLength',
        type: 'number',
        label: 'K Length',
        default: 5,
        min: 1,
        max: 100,
        step: 1,
        tooltip: 'Period for calculating the raw %K line',
      },
      {
        key: 'dLength',
        type: 'number',
        label: 'D Length',
        default: 3,
        min: 1,
        max: 50,
        step: 1,
        tooltip: 'Smoothing period for the %D signal line',
      },
    ],

    plots: [
      { key: 'k', type: 'line', title: 'Fast %K', style: { color: '#ffeb3b', lineWidth: 2 } },
      { key: 'd', type: 'line', title: 'Fast %D', style: { color: '#2962ff', lineWidth: 2 } },
    ],

    calc(bars, settings) {
      // A cleared number field arrives as '', and Number('') is 0.
      const kLength = Math.min(100, Math.max(1, Math.floor(Number(settings.kLength) || 5)))
      const dLength = Math.min(50, Math.max(1, Math.floor(Number(settings.dLength) || 3)))

      const kOut = new Array(bars.length).fill(NaN)
      const dOut = new Array(bars.length).fill(NaN)

      // The source's monotonic deques only ever hold bar indices inside the
      // window, and its ring buffers start empty, so on the first bars the
      // extremes come from however many bars exist. Both lines therefore emit
      // from bar 0 with a partial window rather than warming up on na.
      let dSum = 0
      for (let i = 0; i < bars.length; i++) {
        const start = Math.max(0, i - kLength + 1)
        let lowestLow = Infinity
        let highestHigh = -Infinity
        for (let j = start; j <= i; j++) {
          // nz(low) / nz(high): a missing value reads as 0.
          const lv = Number.isFinite(bars[j].low) ? bars[j].low : 0
          const hv = Number.isFinite(bars[j].high) ? bars[j].high : 0
          if (lv < lowestLow) lowestLow = lv
          if (hv > highestHigh) highestHigh = hv
        }

        const cv = Number.isFinite(bars[i].close) ? bars[i].close : 0
        const rangeVal = highestHigh - lowestLow
        // A flat window gives 0, not 50: that is what the source returns.
        const kVal = rangeVal > 0 ? (100 * (cv - lowestLow)) / rangeVal : 0
        kOut[i] = kVal

        // %D is the mean of the ring buffer's filled slots, so it averages
        // min(bars so far, dLength) values instead of waiting for a full window.
        dSum += kVal
        if (i >= dLength) dSum -= kOut[i - dLength]
        const count = Math.min(i + 1, dLength)
        dOut[i] = count > 0 ? dSum / count : kVal
      }

      return { k: nulls(kOut), d: nulls(dOut) }
    },
  })
}
