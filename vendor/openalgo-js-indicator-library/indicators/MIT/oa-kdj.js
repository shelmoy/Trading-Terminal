/**
 * KDJ - ported to openalgo-charts from Pine Script v6.
 *
 * Source: https://github.com/mihakralj/pinescript/blob/c4e91b962be09733d8fc76caa5191e9e586c5cee/indicators/oscillators/kdj.pine
 * Repo:   mihakralj/pinescript
 * License: MIT (c) mihakralj
 * SPDX-FileCopyrightText: (c) mihakralj
 * SPDX-FileCopyrightText: (c) 2026 marketcalls (port to openalgo-charts)
 * SPDX-License-Identifier: MIT
 *
 * An enhanced stochastic oscillator: K smooths the raw stochastic value with a
 * Wilder-style average, D smooths K again, and J extrapolates the pair so it
 * leads both lines and can travel outside 0 to 100.
 */

export default function ({ registerIndicator, nulls }) {
  registerIndicator({
    id: 'oa-kdj',
    name: 'KDJ',
    category: 'Oscillators',
    placement: 'pane',

    inputs: [
      { key: 'length', type: 'number', label: 'Length', default: 9, min: 1, max: 500, step: 1 },
      { key: 'signal', type: 'number', label: 'Signal', default: 3, min: 1, max: 50, step: 1 },
    ],

    plots: [
      { key: 'k', type: 'line', title: 'K', style: { color: '#2962ff', lineWidth: 2 } },
      { key: 'd', type: 'line', title: 'D', style: { color: '#ff5252', lineWidth: 2 } },
      { key: 'j', type: 'line', title: 'J', style: { color: '#ffeb3b', lineWidth: 2 } },
    ],

    levels: () => [
      { price: 80, title: 'Overbought K', color: '#ff5252', dashed: true },
      { price: 70, title: 'Overbought D', color: '#ff9800', dashed: true },
      { price: 50, title: 'Midline', color: '#787b86' },
      { price: 30, title: 'Oversold D', color: '#00e676', dashed: true },
      { price: 20, title: 'Oversold K', color: '#4caf50', dashed: true },
    ],

    calc(bars, settings) {
      // A cleared number field arrives as '', and Number('') is 0. The source
      // refuses anything below 1 and caps length at 500, signal at 50.
      const length = Math.max(1, Math.min(500, Math.floor(Number(settings.length) || 9)))
      const signal = Math.max(1, Math.min(50, Math.floor(Number(settings.signal) || 3)))
      const n = bars.length

      const alpha = 1 / signal
      const beta = 1 - alpha

      const kOut = new Array(n).fill(NaN)
      const dOut = new Array(n).fill(NaN)
      const jOut = new Array(n).fill(NaN)

      // The var state the source carries from bar to bar, with its seeds.
      let warmupK = true
      let warmupD = true
      let eK = 1
      let eD = 1
      let k = 0
      let d = 0
      let resultK = 50
      let resultD = 50

      // Monotonic deques of bar indices, the source's O(n) highest and lowest.
      // Before `length` bars exist the window is simply shorter, which is why
      // the lines start on the first bar rather than after a warmup gap.
      const maxDeque = []
      const minDeque = []

      for (let i = 0; i < n; i++) {
        const high = bars[i].high
        const low = bars[i].low
        const close = bars[i].close

        // Pine skips the whole block on an na bar and keeps the previous result.
        if (Number.isFinite(high) && Number.isFinite(low) && Number.isFinite(close)) {
          while (maxDeque.length > 0 && maxDeque[0] <= i - length) maxDeque.shift()
          while (minDeque.length > 0 && minDeque[0] <= i - length) minDeque.shift()
          while (maxDeque.length > 0 && bars[maxDeque[maxDeque.length - 1]].high <= high) maxDeque.pop()
          while (minDeque.length > 0 && bars[minDeque[minDeque.length - 1]].low >= low) minDeque.pop()
          maxDeque.push(i)
          minDeque.push(i)

          const highest = bars[maxDeque[0]].high
          const lowest = bars[minDeque[0]].low
          const priceRange = highest - lowest

          // A flat window has no range, and the source calls that neutral.
          const rsv = priceRange > 0 ? (100 * (close - lowest)) / priceRange : 50

          k = alpha * rsv + beta * k
          d = alpha * k + beta * d

          // The exponential seed correction: while the accumulated weight is
          // still short of 1 the raw average is scaled up to remove the bias.
          if (warmupK) {
            eK *= beta
            const cK = 1 / (1 - eK)
            resultK = Math.max(0, Math.min(100, cK * k))
            warmupK = eK > 1e-10
          } else {
            resultK = Math.max(0, Math.min(100, k))
          }

          if (warmupD) {
            eD *= beta
            const cD = 1 / (1 - eD)
            resultD = Math.max(0, Math.min(100, cD * d))
            warmupD = eD > 1e-10
          } else {
            resultD = Math.max(0, Math.min(100, d))
          }
        }

        kOut[i] = resultK
        dOut[i] = resultD
        jOut[i] = 3 * resultK - 2 * resultD
      }

      return { k: nulls(kOut), d: nulls(dOut), j: nulls(jOut) }
    },
  })
}
