/**
 * Jurik Volatility Bands (JBANDS) - ported to openalgo-charts from Pine Script v6.
 *
 * Source: https://github.com/mihakralj/pinescript/blob/c4e91b962be09733d8fc76caa5191e9e586c5cee/indicators/channels/jbands.pine
 * Repo:   mihakralj/pinescript
 * License: MIT (c) mihakralj
 * SPDX-FileCopyrightText: (c) mihakralj
 * SPDX-FileCopyrightText: (c) 2026 marketcalls (port to openalgo-charts)
 * SPDX-License-Identifier: MIT
 *
 * Two adaptive bands that snap straight to the bar when price pushes through
 * them and otherwise trail it at a distance set by current volatility measured
 * against its own smoothed average.
 */

export default function ({ registerIndicator, sourceValues, nulls }) {
  registerIndicator({
    id: 'oa-jbands',
    name: 'Jurik Volatility Bands (JBANDS)',
    category: 'Channels',
    placement: 'onchart',

    inputs: [
      { key: 'period', type: 'number', label: 'Period', default: 10, min: 1, max: 5000, step: 1 },
      { key: 'source', type: 'source', label: 'Source', default: 'close' },
    ],

    plots: [
      { key: 'upper', type: 'line', title: 'Upper', style: { color: '#ffeb3b', lineWidth: 2 } },
      { key: 'lower', type: 'line', title: 'Lower', style: { color: '#ffeb3b', lineWidth: 2 } },
    ],

    fills: [{ between: ['upper', 'lower'], colorUp: '#2962ff', colorDown: '#2962ff', opacity: 0.1 }],

    calc(bars, settings) {
      // A cleared number field arrives as '', and Number('') is 0.
      const period = Math.max(1, Math.floor(Number(settings.period) || 10))
      const src = sourceValues(bars, settings.source ?? 'close')
      const n = bars.length

      // Constants, evaluated once as Pine's `var simple float` are.
      const LEN1 = Math.max(Math.log(Math.sqrt(0.5 * (period - 1))) / Math.log(2) + 2, 0)
      const POW1 = Math.max(LEN1 - 2, 0.5)
      const LEN2 = Math.sqrt(0.5 * (period - 1)) * LEN1
      const AVG_VOLTY_ALPHA = 2 / (Math.max(4 * period, 65) + 1)
      const DIV = 1 / (10 + 10 * (Math.min(Math.max(period - 10, 0), 100) / 100))
      const RVOLTY_CAP = Math.pow(LEN1, 1 / POW1)

      const upperOut = new Array(n).fill(NaN)
      const lowerOut = new Array(n).fill(NaN)
      const voltyHistory = new Array(n).fill(NaN)

      // var float upperBand = nz(source): both bands seed from the first source value.
      let upperBand = Number.isFinite(src[0]) ? src[0] : 0
      let lowerBand = upperBand
      let vSum = 0
      let avgVolty = 0

      for (let i = 0; i < n; i++) {
        const high = bars[i].high
        const low = bars[i].low
        // Pine returns na without touching state when the source is na.
        if (!Number.isFinite(src[i]) || !Number.isFinite(high) || !Number.isFinite(low)) continue

        const mid = (low + high) * 0.5
        const del1 = mid - upperBand
        const del2 = mid - lowerBand
        const volty = Math.max(Math.abs(del1), Math.abs(del2))
        voltyHistory[i] = volty

        // na(volty[10]) reads as 0 for the first ten bars.
        const pastVolty = i >= 10 && Number.isFinite(voltyHistory[i - 10]) ? voltyHistory[i - 10] : 0
        vSum = vSum + (volty - pastVolty) * DIV
        // avgVolty is a var seeded at 0, so the na branch never runs.
        avgVolty = avgVolty + AVG_VOLTY_ALPHA * (vSum - avgVolty)

        let rvolty = 1
        if (avgVolty > 0) {
          rvolty = volty / avgVolty
          rvolty = Math.min(Math.max(rvolty, 1), RVOLTY_CAP)
        }
        const Kv = Math.pow(LEN2 / (LEN2 + 1), Math.sqrt(Math.pow(rvolty, POW1)))

        upperBand = del1 > 0 ? high : high - Kv * del1
        lowerBand = del2 < 0 ? low : low - Kv * del2

        if (!Number.isFinite(upperBand) || !Number.isFinite(lowerBand)) continue
        upperOut[i] = upperBand
        lowerOut[i] = lowerBand
      }

      return { upper: nulls(upperOut), lower: nulls(lowerOut) }
    },
  })
}
