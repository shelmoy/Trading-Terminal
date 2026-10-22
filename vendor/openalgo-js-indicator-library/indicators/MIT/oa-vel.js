/**
 * Velocity (VEL) - ported to openalgo-charts from Pine Script v6.
 *
 * Source: https://github.com/mihakralj/pinescript/blob/c4e91b962be09733d8fc76caa5191e9e586c5cee/indicators/momentum/vel.pine
 * Repo:   mihakralj/pinescript
 * License: MIT (c) mihakralj
 * SPDX-FileCopyrightText: (c) mihakralj
 * SPDX-FileCopyrightText: (c) 2026 marketcalls (port to openalgo-charts)
 * SPDX-License-Identifier: MIT
 *
 * The raw change of the source over the lookback is pushed through a Jurik
 * moving average, so the reading is a rate of change with the lag of a simple
 * momentum line taken out.
 */

export default function ({ registerIndicator, sourceValues, nulls }) {
  registerIndicator({
    id: 'oa-vel',
    name: 'Velocity (VEL)',
    category: 'Momentum',
    placement: 'pane',

    inputs: [
      { key: 'length', type: 'number', label: 'Length', default: 10, min: 1, max: 5000, step: 1 },
      { key: 'source', type: 'source', label: 'Source', default: 'close' },
    ],

    plots: [
      { key: 'vel', type: 'line', title: 'VEL', style: { color: '#ffeb3b', lineWidth: 2 } },
    ],

    calc(bars, settings) {
      // A cleared number field arrives as '', and Number('') is 0.
      const period = Math.max(1, Math.floor(Number(settings.length) || 10))
      const src = sourceValues(bars, settings.source ?? 'close')
      const n = bars.length
      const out = new Array(n).fill(NaN)

      // Pine hard-codes phase 100 and power 0.2 inside vel(), so these are
      // constants rather than inputs. Every one of them is a `simple float`
      // there, computed once from the period.
      const PHASE_VALUE = Math.min(Math.max(100 * 0.01 + 1.5, 0.5), 2.5)
      const POWER = 0.2
      const BETA = (POWER * (period - 1)) / (POWER * (period - 1) + 2)
      const LEN1 = Math.max(Math.log(Math.sqrt(0.5 * (period - 1))) / Math.log(2) + 2, 0)
      const POW1 = Math.max(LEN1 - 2, 0.5)
      const LEN2 = Math.sqrt(0.5 * (period - 1)) * LEN1
      const POW1_RECIPROCAL = 1 / POW1
      const AVG_VOLTY_ALPHA = 2 / (Math.max(4 * period, 65) + 1)
      const DIV = 1 / (10 + (10 * Math.min(Math.max(period - 10, 0), 100)) / 100)
      const RVOLTY_CAP = Math.pow(LEN1, POW1_RECIPROCAL)

      // var-carried Jurik state. NaN stands in for Pine's na so the nz()
      // fallbacks below read the same way.
      let upperBand = NaN
      let lowerBand = NaN
      let ma1 = NaN
      let jma = NaN
      let avgVolty = NaN
      let vSum = 0
      let det0 = 0
      let det1 = 0
      const voltyRing = new Array(11).fill(0)

      for (let i = 0; i < n; i++) {
        // Pine declares `float source = 0.0` and only overwrites it when both
        // src and src[period] exist, so a warmup bar feeds a zero difference
        // into the filter rather than na.
        const cur = src[i]
        const back = i >= period ? src[i - period] : NaN
        const source = Number.isFinite(cur) && Number.isFinite(back) ? cur - back : 0

        const del1 = source - (Number.isFinite(upperBand) ? upperBand : source)
        const del2 = source - (Number.isFinite(lowerBand) ? lowerBand : source)
        const volty =
          Math.abs(del1) === Math.abs(del2) ? 0 : Math.max(Math.abs(del1), Math.abs(del2))

        // array.unshift then array.pop keeps 11 slots, so index 10 is the volty
        // of ten bars ago and is pre-seeded with zeros.
        voltyRing.unshift(Number.isFinite(volty) ? volty : 0)
        voltyRing.pop()

        vSum = vSum + (volty - voltyRing[10]) * DIV
        avgVolty = Number.isFinite(avgVolty)
          ? avgVolty + AVG_VOLTY_ALPHA * (vSum - avgVolty)
          : vSum

        const avgForTest = Number.isFinite(avgVolty) ? avgVolty : 0
        let rvolty = avgForTest > 0 ? volty / avgVolty : 1
        rvolty = Math.min(Math.max(rvolty, 1), RVOLTY_CAP)

        const pow2 = Math.pow(rvolty, POW1)
        // LEN2 is never negative, so the denominator is at least 1.
        const kv = Math.pow(LEN2 / (LEN2 + 1), Math.sqrt(pow2))

        upperBand = del1 > 0 ? source : source - kv * del1
        lowerBand = del2 < 0 ? source : source - kv * del2

        const alpha = Math.pow(BETA, pow2)
        const alphaSquared = alpha * alpha
        const oneMinusAlpha = 1 - alpha
        const oneMinusAlphaSquared = oneMinusAlpha * oneMinusAlpha

        const ma1Prev = Number.isFinite(ma1) ? ma1 : source
        ma1 = source + alpha * (ma1Prev - source)
        det0 = (source - ma1) * (1 - BETA) + BETA * det0
        const ma2 = ma1 + PHASE_VALUE * det0

        const jmaPrev = Number.isFinite(jma) ? jma : source
        det1 = (ma2 - jmaPrev) * oneMinusAlphaSquared + alphaSquared * det1
        jma = jmaPrev + det1

        // The filter state is carried across every bar exactly as Pine does, but
        // the first `period` bars have no lookback difference at all: Pine emits
        // the 0.0 placeholder there and the house rule is that warmup is a gap.
        if (i >= period && Number.isFinite(jma)) out[i] = jma
      }

      return { vel: nulls(out) }
    },
  })
}
