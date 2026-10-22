/**
 * Linear Time Moving Average (LTMA) - ported to openalgo-charts from Pine Script v6.
 *
 * Source: https://github.com/mihakralj/pinescript/blob/c4e91b962be09733d8fc76caa5191e9e586c5cee/indicators/trends_IIR/ltma.pine
 * Repo:   mihakralj/pinescript
 * License: MIT (c) mihakralj
 * SPDX-FileCopyrightText: (c) mihakralj
 * SPDX-FileCopyrightText: (c) 2026 marketcalls (port to openalgo-charts)
 * SPDX-License-Identifier: MIT
 *
 * Each bar in the window is weighted by how recent it is, the newest by the
 * full period and the oldest by one, so the average leans on recent price
 * without dropping older bars outright.
 */

export default function ({ registerIndicator, sourceValues, nulls }) {
  // The source walks the whole window on every bar, skipping any bar whose
  // source value is not available and falling back to the raw source when the
  // window turns up nothing. This is that loop, written out.
  const ltmaDirect = (src, period, out) => {
    for (let i = 0; i < src.length; i++) {
      let sum = 0
      let weightSum = 0
      let count = 0
      for (let j = 0; j < period; j++) {
        const idx = i - j
        if (idx < 0) continue
        const val = src[idx]
        if (!Number.isFinite(val)) continue
        const weight = period - j
        sum += val * weight
        weightSum += weight
        count += 1
      }
      out[i] = count > 0 && weightSum > 0 ? sum / weightSum : src[i]
    }
  }

  // Same weighted sum rolled forward in constant time, which is what keeps a
  // long period usable while the chart is being panned. Adding the newest bar
  // at weight `period` and subtracting the previous window's plain sum demotes
  // every older bar by exactly one weight, and that also reproduces the partial
  // window of the first `period` bars, whose weights run period, period-1, ...
  // down to period-i. It cannot step over a hole in the source, so it is only
  // used when there is none.
  const ltmaRolling = (src, period, out) => {
    let weighted = 0
    let windowSum = 0
    for (let i = 0; i < src.length; i++) {
      const prevWindowSum = windowSum
      weighted = period * src[i] + weighted - prevWindowSum
      windowSum = prevWindowSum + src[i] - (i - period >= 0 ? src[i - period] : 0)

      const filled = i + 1
      const weightSum =
        filled >= period ? (period * (period + 1)) / 2 : filled * period - (i * filled) / 2
      out[i] = weighted / weightSum
    }
  }

  registerIndicator({
    id: 'oa-ltma',
    name: 'Linear Time Moving Average (LTMA)',
    category: 'Trends IIR',
    placement: 'onchart',

    inputs: [
      { key: 'period', type: 'number', label: 'Period', default: 10, min: 1, max: 5000, step: 1 },
      { key: 'source', type: 'source', label: 'Source', default: 'close' },
    ],

    plots: [{ key: 'ltma', type: 'line', title: 'LTMA', style: { color: '#ffeb3b', lineWidth: 2 } }],

    calc(bars, settings) {
      // A cleared number field arrives as '', and Number('') is 0.
      const period = Math.max(1, Math.floor(Number(settings.period) || 10))
      const src = sourceValues(bars, settings.source ?? 'close')

      const out = new Array(bars.length).fill(NaN)
      let complete = true
      for (let i = 0; i < src.length; i++) {
        if (!Number.isFinite(src[i])) {
          complete = false
          break
        }
      }

      if (complete) ltmaRolling(src, period, out)
      else ltmaDirect(src, period, out)

      return { ltma: nulls(out) }
    },
  })
}
