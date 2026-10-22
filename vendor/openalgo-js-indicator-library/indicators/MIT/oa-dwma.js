/**
 * Double Weighted Moving Average (DWMA) - ported to openalgo-charts from Pine Script v6.
 *
 * Source: https://github.com/mihakralj/pinescript/blob/c4e91b962be09733d8fc76caa5191e9e586c5cee/indicators/trends_FIR/dwma.pine
 * Repo:   mihakralj/pinescript
 * License: MIT (c) mihakralj
 * SPDX-FileCopyrightText: (c) mihakralj
 * SPDX-FileCopyrightText: (c) 2026 marketcalls (port to openalgo-charts)
 * SPDX-License-Identifier: MIT
 *
 * A linearly weighted moving average run twice over the same period, which keeps
 * the weighted average's fast response while removing most of the jitter a single
 * pass leaves behind.
 */

export default function ({ registerIndicator, sourceValues, nulls }) {
  // Pine's inline O(1) weighted moving average. While the buffer is still
  // filling it uses the partial window (weights 1..count, normaliser
  // count * (count + 1) / 2), so it produces a value from the very first bar
  // instead of waiting out a warmup. Once full it carries the standard
  // recursion weighted := weighted - rollingSum + period * current. The shared
  // wma() helper is NaN until period - 1, so it cannot stand in here.
  const runningWma = (values, period) => {
    const n = values.length
    const out = new Array(n).fill(NaN)
    const buffer = new Array(period).fill(NaN)
    let head = 0
    let sum = 0
    let weightedSum = 0
    let count = 0
    let norm = 0
    for (let i = 0; i < n; i++) {
      const oldest = buffer[head]
      // Pine wraps the sample in nz(), so a missing value counts as zero.
      const current = Number.isFinite(values[i]) ? values[i] : 0
      if (Number.isFinite(oldest)) {
        const oldSum = sum
        sum -= oldest
        sum += current
        weightedSum = weightedSum - oldSum + period * current
      } else {
        count += 1
        sum += current
        weightedSum = weightedSum + count * current
        norm = count * (count + 1) * 0.5
      }
      buffer[head] = current
      head = (head + 1) % period
      out[i] = norm > 0 ? weightedSum / norm : NaN
    }
    return out
  }

  registerIndicator({
    id: 'oa-dwma',
    name: 'Double Weighted Moving Average (DWMA)',
    category: 'Trends FIR',
    placement: 'onchart',

    inputs: [
      { key: 'period', type: 'number', label: 'Period', default: 10, min: 1, max: 5000, step: 1, tooltip: 'Lookback for both weighted smoothing passes.' },
      { key: 'source', type: 'source', label: 'Source', default: 'close' },
    ],

    plots: [{ key: 'dwma', type: 'line', title: 'DWMA', style: { color: '#ffeb3b', lineWidth: 2 } }],

    calc(bars, settings) {
      // A cleared number field arrives as '', and Number('') is 0.
      const period = Math.max(1, Math.floor(Number(settings.period) || 10))
      const src = sourceValues(bars, settings.source || 'close')

      const firstPass = runningWma(src, period)
      const dwma = runningWma(firstPass, period)

      return { dwma: nulls(dwma) }
    },
  })
}
