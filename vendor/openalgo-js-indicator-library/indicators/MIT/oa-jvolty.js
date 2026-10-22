/**
 * Jurik Volatility (JVOLTY) - ported to openalgo-charts from Pine Script v6.
 *
 * Source: https://github.com/mihakralj/pinescript/blob/c4e91b962be09733d8fc76caa5191e9e586c5cee/indicators/volatility/jvolty.pine
 * Repo:   mihakralj/pinescript
 * License: MIT (c) mihakralj
 * SPDX-FileCopyrightText: (c) mihakralj
 * SPDX-FileCopyrightText: (c) 2026 marketcalls (port to openalgo-charts)
 * SPDX-License-Identifier: MIT
 *
 * The adaptive volatility term from inside a Jurik moving average, published on
 * its own. It reports current volatility as a multiple of its own smoothed
 * average, floored at 1, so it rises only when the market moves faster than it
 * has been moving.
 */

export default function ({ registerIndicator, sourceValues, nulls }) {
  registerIndicator({
    id: 'oa-jvolty',
    name: 'Jurik Volatility (JVOLTY)',
    category: 'Volatility',
    placement: 'pane',

    inputs: [
      {
        key: 'period',
        type: 'number',
        label: 'Period',
        default: 10,
        min: 1,
        max: 5000,
        step: 1,
        tooltip: 'Number of bars used in the calculation.',
      },
      { key: 'source', type: 'source', label: 'Source', default: 'close' },
    ],

    plots: [
      { key: 'jvolty', type: 'line', title: 'JVolty', style: { color: '#ffeb3b', lineWidth: 2 } },
    ],

    calc(bars, settings) {
      // A cleared number field arrives as '', and Number('') is 0.
      const period = Math.max(1, Math.floor(Number(settings.period) || 10))
      const src = sourceValues(bars, settings.source ?? 'close')
      const n = bars.length
      const out = new Array(n).fill(NaN)

      // Every one of these is a `simple float` in Pine, computed once from the
      // period. A period of 1 makes LEN1 and LEN2 zero, which the clamps below
      // still handle without dividing by zero.
      const LEN1 = Math.max(Math.log(Math.sqrt(0.5 * (period - 1))) / Math.log(2) + 2, 0)
      const POW1 = Math.max(LEN1 - 2, 0.5)
      const LEN2 = Math.sqrt(0.5 * (period - 1)) * LEN1
      const AVG_VOLTY_ALPHA = 2 / (Math.max(4 * period, 65) + 1)
      const DIV = 1 / (10 + (10 * Math.min(Math.max(period - 10, 0), 100)) / 100)
      const RVOLTY_CAP = Math.pow(LEN1, 1 / POW1)

      // Pine: `var float upperBand = nz(source)` is evaluated once, on the first
      // bar, so both bands start on the first source value.
      const seed = Number.isFinite(src[0]) ? src[0] : 0
      let upperBand = seed
      let lowerBand = seed
      let vSum = 0
      let avgVolty = 0

      // volty[10] is the local variable's own history, so it needs its own array.
      const voltyHist = new Array(n).fill(NaN)

      for (let i = 0; i < n; i++) {
        const source = src[i]
        if (!Number.isFinite(source)) continue

        const del1 = source - upperBand
        const del2 = source - lowerBand
        const volty = Math.max(Math.abs(del1), Math.abs(del2))
        voltyHist[i] = volty

        const pastVolty = i >= 10 && Number.isFinite(voltyHist[i - 10]) ? voltyHist[i - 10] : 0
        vSum = vSum + (volty - pastVolty) * DIV
        // avgVolty is seeded to 0.0 in Pine, so the na(avgVolty) branch there is
        // never taken and this is always the smoothing step.
        avgVolty = avgVolty + AVG_VOLTY_ALPHA * (vSum - avgVolty)

        let rvolty = 1
        if (avgVolty > 0) {
          rvolty = volty / avgVolty
          rvolty = Math.min(Math.max(rvolty, 1), RVOLTY_CAP)
        }

        // LEN2 is never negative, so the denominator is at least 1.
        const kv = Math.pow(LEN2 / (LEN2 + 1), Math.sqrt(Math.pow(rvolty, POW1)))
        upperBand = del1 > 0 ? source : source - kv * del1
        lowerBand = del2 < 0 ? source : source - kv * del2

        // The function returns rvolty, not the band or the raw volty.
        if (Number.isFinite(rvolty)) out[i] = rvolty
      }

      return { jvolty: nulls(out) }
    },
  })
}
