/**
 * Stochastic Oscillator (STOCH) - ported to openalgo-charts from Pine Script v6.
 *
 * Source: https://github.com/mihakralj/pinescript/blob/c4e91b962be09733d8fc76caa5191e9e586c5cee/indicators/oscillators/stoch.pine
 * Repo:   mihakralj/pinescript
 * License: MIT (c) mihakralj
 * SPDX-FileCopyrightText: (c) mihakralj
 * SPDX-FileCopyrightText: (c) 2026 marketcalls (port to openalgo-charts)
 * SPDX-License-Identifier: MIT
 *
 * Places the close inside the high-low range of the last K bars as a 0-100
 * reading, then smooths that reading with a simple moving average to give %D.
 */

export default function ({ registerIndicator, nulls }) {
  // Pine keeps a monotonic deque of bar indices and drops the front once it is
  // older than kLength bars, so the window expands over the first kLength bars
  // rather than returning na. The pop comparisons (>= for the low deque, <= for
  // the high deque) are kept as the source has them.
  const rollingExtreme = (values, len, wantMin) => {
    const out = new Array(values.length).fill(NaN)
    const deque = []
    let front = 0
    for (let i = 0; i < values.length; i++) {
      while (front < deque.length && deque[front] <= i - len) front++
      while (front < deque.length) {
        const tail = values[deque[deque.length - 1]]
        if (wantMin ? tail >= values[i] : tail <= values[i]) deque.pop()
        else break
      }
      deque.push(i)
      out[i] = values[deque[front]]
    }
    return out
  }

  registerIndicator({
    id: 'oa-stoch',
    name: 'Stochastic Oscillator (STOCH)',
    category: 'Oscillators',
    placement: 'pane',

    inputs: [
      { key: 'kPeriod', type: 'number', label: 'K Length', default: 14, min: 1, max: 5000, step: 1 },
      { key: 'dPeriod', type: 'number', label: 'D Smooth', default: 3, min: 1, max: 5000, step: 1 },
    ],

    plots: [
      { key: 'k', type: 'line', title: 'Stochastic %K', style: { color: '#26a69a', lineWidth: 2 } },
      { key: 'd', type: 'line', title: 'Stochastic %D', style: { color: '#ef5350', lineWidth: 2 } },
    ],

    calc(bars, settings) {
      // A cleared number field arrives as '', and Number('') is 0.
      const kLength = Math.max(1, Math.floor(Number(settings.kPeriod) || 14))
      const dPeriod = Math.max(1, Math.floor(Number(settings.dPeriod) || 3))

      const lows = new Array(bars.length)
      const highs = new Array(bars.length)
      for (let i = 0; i < bars.length; i++) {
        // Pine reads nz(low) and nz(high) into the buffers.
        lows[i] = Number.isFinite(bars[i].low) ? bars[i].low : 0
        highs[i] = Number.isFinite(bars[i].high) ? bars[i].high : 0
      }

      const lowestLow = rollingExtreme(lows, kLength, true)
      const highestHigh = rollingExtreme(highs, kLength, false)

      const kOut = new Array(bars.length).fill(NaN)
      const dOut = new Array(bars.length).fill(NaN)

      // %D is an SMA whose buffer is seeded on bar 0 with that bar's %K in every
      // slot, so it reads kVal on the first bar instead of a partial average.
      const dBuffer = new Array(dPeriod).fill(0)
      let dHead = 0
      let dSum = 0

      for (let i = 0; i < bars.length; i++) {
        const range = highestHigh[i] - lowestLow[i]
        const close = bars[i].close
        let kVal = 0
        if (Number.isFinite(range) && range > 0 && Number.isFinite(close)) {
          kVal = (100 * (close - lowestLow[i])) / range
        }
        if (!Number.isFinite(kVal)) kVal = 0

        if (i === 0) {
          dSum = kVal * dPeriod
          dBuffer.fill(kVal)
        } else {
          dSum = dSum - dBuffer[dHead] + kVal
          dBuffer[dHead] = kVal
          dHead = (dHead + 1) % dPeriod
        }

        kOut[i] = kVal
        dOut[i] = dSum / dPeriod
      }

      return { k: nulls(kOut), d: nulls(dOut) }
    },
  })
}
