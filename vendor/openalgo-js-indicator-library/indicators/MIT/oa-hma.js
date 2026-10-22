/**
 * Hull Moving Average (HMA) - ported to openalgo-charts from Pine Script v6.
 *
 * Source: https://github.com/mihakralj/pinescript/blob/c4e91b962be09733d8fc76caa5191e9e586c5cee/indicators/trends_FIR/hma.pine
 * Repo:   mihakralj/pinescript
 * License: MIT (c) mihakralj
 * SPDX-FileCopyrightText: (c) mihakralj
 * SPDX-FileCopyrightText: (c) 2026 marketcalls (port to openalgo-charts)
 * SPDX-License-Identifier: MIT
 *
 * Hull's average subtracts a full-length weighted average from twice a
 * half-length one and re-smooths the difference over the square root of the
 * period, which cuts most of the lag a plain weighted average carries.
 */

export default function ({ registerIndicator, sourceValues, nulls }) {
  // The source's wma_helper emits from the very first bar: until the window is
  // full it weights the n values seen so far 1..n and normalises by n(n+1)/2,
  // then switches to the usual 1..period weights. The library's own wma() is
  // na through warmup instead, so this one is written out to match.
  const wmaFromFirstBar = (values, period) => {
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
    id: 'oa-hma',
    name: 'Hull Moving Average (HMA)',
    category: 'Trends FIR',
    placement: 'onchart',

    inputs: [
      { key: 'period', type: 'number', label: 'Period', default: 10, min: 1, max: 5000, step: 1 },
      { key: 'source', type: 'source', label: 'Source', default: 'close' },
    ],

    plots: [{ key: 'hma', type: 'line', title: 'HMA', style: { color: '#ffeb3b', lineWidth: 2 } }],

    calc(bars, settings) {
      // A cleared number field arrives as '', and Number('') is 0.
      const period = Math.max(1, Math.floor(Number(settings.period) || 10))
      const src = sourceValues(bars, settings.source ?? 'close')

      const halfPeriod = Math.max(1, Math.round(period / 2))
      const sqrtPeriod = Math.max(1, Math.round(Math.sqrt(period)))

      const wmaHalf = wmaFromFirstBar(src, halfPeriod)
      const wmaFull = wmaFromFirstBar(src, period)

      const diff = new Array(bars.length).fill(NaN)
      for (let i = 0; i < bars.length; i++) {
        if (!Number.isFinite(wmaHalf[i]) || !Number.isFinite(wmaFull[i])) continue
        diff[i] = 2 * wmaHalf[i] - wmaFull[i]
      }

      return { hma: nulls(wmaFromFirstBar(diff, sqrtPeriod)) }
    },
  })
}
