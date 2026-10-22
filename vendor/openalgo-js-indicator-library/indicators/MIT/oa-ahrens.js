/**
 * Ahrens Moving Average (AHRENS) - ported to openalgo-charts from Pine Script v6.
 *
 * Source: https://github.com/mihakralj/pinescript/blob/c4e91b962be09733d8fc76caa5191e9e586c5cee/indicators/trends_IIR/ahrens.pine
 * Repo:   mihakralj/pinescript
 * License: MIT
 * SPDX-FileCopyrightText: (c) mihakralj
 * SPDX-FileCopyrightText: (c) 2026 marketcalls (port to openalgo-charts)
 * SPDX-License-Identifier: MIT
 *
 * A recursive filter that steps toward the source by the distance from the
 * midpoint of its current and its period-bars-ago value, so the lag it carries
 * is corrected rather than smoothed away.
 */

export default function ({ registerIndicator, sourceValues, nulls }) {
  registerIndicator({
    id: 'oa-ahrens',
    name: 'Ahrens Moving Average (AHRENS)',
    category: 'Trends IIR',
    placement: 'onchart',

    inputs: [
      { key: 'period', type: 'number', label: 'Period', default: 9, min: 1, max: 5000, step: 1 },
      { key: 'source', type: 'source', label: 'Source', default: 'close' },
    ],

    plots: [{ key: 'ahrens', type: 'line', title: 'AHRENS', style: { color: '#ffeb3b', lineWidth: 2 } }],

    calc(bars, settings) {
      // A cleared number field arrives as '', and Number('') is 0.
      const period = Math.max(1, Math.floor(Number(settings.period) || 9))
      const src = sourceValues(bars, settings.source ?? 'close')
      const n = bars.length
      const out = new Array(n).fill(NaN)

      // Ring buffer of past results, so buffer[head] is the value from exactly
      // `period` bars ago once it has wrapped. Seeded na: until then the lag
      // term falls back to the source, as nz(array.get(...), source) does.
      const buffer = new Array(period).fill(NaN)
      let head = 0
      let result = NaN

      for (let i = 0; i < n; i++) {
        const value = src[i]
        if (Number.isFinite(value)) {
          const prev = Number.isFinite(result) ? result : value
          const laggedRaw = buffer[head]
          const lagged = Number.isFinite(laggedRaw) ? laggedRaw : value
          const midpoint = (prev + lagged) * 0.5
          result = prev + (value - midpoint) / period
          buffer[head] = result
          head = (head + 1) % period
        }
        // Pine carries `result` in a var, so a gap in the source holds the line
        // at its last value rather than breaking it.
        out[i] = result
      }

      return { ahrens: nulls(out) }
    },
  })
}
