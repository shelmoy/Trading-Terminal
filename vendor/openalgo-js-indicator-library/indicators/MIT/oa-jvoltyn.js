/**
 * Normalized Jurik Volatility (JVOLTYN) - ported to openalgo-charts from Pine Script v6.
 *
 * Source: https://github.com/mihakralj/pinescript/blob/c4e91b962be09733d8fc76caa5191e9e586c5cee/indicators/volatility/jvoltyn.pine
 * Repo:   mihakralj/pinescript
 * License: MIT (c) mihakralj
 * SPDX-FileCopyrightText: (c) mihakralj
 * SPDX-FileCopyrightText: (c) 2026 marketcalls (port to openalgo-charts)
 * SPDX-License-Identifier: MIT
 *
 * The Jurik adaptive volatility ratio, squashed through a logistic function so
 * the reading stays bounded: values near the floor mean price is moving at its
 * own average pace, rising values mean it is moving faster than usual.
 */

export default function ({ registerIndicator, sourceValues, nulls }) {
  registerIndicator({
    id: 'oa-jvoltyn',
    name: 'Normalized Jurik Volatility (JVOLTYN)',
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
        tooltip: 'Number of bars used in the calculation',
      },
      { key: 'source', type: 'source', label: 'Source', default: 'close' },
    ],

    plots: [{ key: 'jvoltyn', type: 'line', title: 'JVoltyN', style: { color: '#ffeb3b', lineWidth: 2 } }],

    calc(bars, settings) {
      // A cleared number field arrives as '', and Number('') is 0.
      const period = Math.max(1, Math.floor(Number(settings.period) || 10))
      const src = sourceValues(bars, settings.source ?? 'close')

      // Pine computes these once as `var simple`, so they never change per bar.
      // At period 1 the sqrt term is 0 and log(0) is -Infinity, which the max()
      // floors back to 0 exactly as Pine does.
      const root = Math.sqrt(0.5 * (period - 1))
      const LEN1 = Math.max(Math.log(root) / Math.log(2) + 2, 0)
      const POW1 = Math.max(LEN1 - 2, 0.5)
      const LEN2 = root * LEN1
      const AVG_VOLTY_ALPHA = 2 / (Math.max(4 * period, 65) + 1)
      const DIV = 1 / (10 + (10 * Math.min(Math.max(period - 10, 0), 100)) / 100)
      const RVOLTY_CAP = Math.pow(LEN1, 1 / POW1)

      const out = new Array(bars.length).fill(NaN)
      // volty[10] is a history reference on a local of the Pine function, so it
      // has to be kept per bar; a bar the function skipped leaves NaN there,
      // which Pine's na(volty[10]) ? 0.0 turns into zero.
      const voltyHist = new Array(bars.length).fill(NaN)

      // `var float upperBand = nz(source)` seeds both bands from bar 0.
      let upperBand = Number.isFinite(src[0]) ? src[0] : 0
      let lowerBand = upperBand
      let vSum = 0
      let avgVolty = 0

      for (let i = 0; i < bars.length; i++) {
        const source = src[i]
        if (!Number.isFinite(source)) continue

        const del1 = source - upperBand
        const del2 = source - lowerBand
        const volty = Math.max(Math.abs(del1), Math.abs(del2))
        voltyHist[i] = volty

        const pastRaw = i >= 10 ? voltyHist[i - 10] : NaN
        const pastVolty = Number.isFinite(pastRaw) ? pastRaw : 0

        vSum = vSum + (volty - pastVolty) * DIV
        avgVolty = avgVolty + AVG_VOLTY_ALPHA * (vSum - avgVolty)

        let rvolty = 1
        if (avgVolty > 0) {
          rvolty = volty / avgVolty
          rvolty = Math.min(Math.max(rvolty, 1), RVOLTY_CAP)
        }

        const Kv = Math.pow(LEN2 / (LEN2 + 1), Math.sqrt(Math.pow(rvolty, POW1)))

        upperBand = del1 > 0 ? source : source - Kv * del1
        lowerBand = del2 < 0 ? source : source - Kv * del2

        const value = 1 / (1 + Math.exp(-(rvolty - 1) * 1.5))
        if (Number.isFinite(value)) out[i] = value
      }

      return { jvoltyn: nulls(out) }
    },
  })
}
