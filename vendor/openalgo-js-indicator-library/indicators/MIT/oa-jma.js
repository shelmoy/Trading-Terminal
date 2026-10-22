/**
 * Jurik Moving Average (JMA) - ported to openalgo-charts from Pine Script v6.
 *
 * Source: https://github.com/mihakralj/pinescript/blob/c4e91b962be09733d8fc76caa5191e9e586c5cee/indicators/trends_IIR/jma.pine
 * Repo:   mihakralj/pinescript
 * License: MIT
 * SPDX-FileCopyrightText: (c) mihakralj
 * SPDX-FileCopyrightText: (c) 2026 marketcalls (port to openalgo-charts)
 * SPDX-License-Identifier: MIT
 *
 * An adaptive average that measures relative volatility against its own rolling
 * average and smooths harder when the market is quiet, with a phase control that
 * trades lag against overshoot.
 */

export default function ({ registerIndicator, sourceValues, nulls }) {
  registerIndicator({
    id: 'oa-jma',
    name: 'Jurik Moving Average (JMA)',
    category: 'Trends IIR',
    placement: 'onchart',

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
      {
        key: 'phase',
        type: 'number',
        label: 'Phase',
        default: 0,
        min: -100,
        max: 100,
        step: 10,
        tooltip: 'Phase shift (-100 to 100). Negative values reduce lag but may cause overshoot.',
      },
      {
        key: 'power',
        type: 'number',
        label: 'Power',
        default: 0.45,
        min: 0.1,
        max: 1,
        step: 0.01,
        tooltip: 'Smoothing factor (0.1-1.0). Lower values create smoother curves.',
      },
      { key: 'source', type: 'source', label: 'Source', default: 'close' },
    ],

    plots: [{ key: 'jma', type: 'line', title: 'JMA', style: { color: '#ffeb3b', lineWidth: 2 } }],

    calc(bars, settings) {
      // A cleared number field arrives as '', and Number('') is 0.
      const period = Math.max(1, Math.floor(Number(settings.period) || 10))
      const phase = Math.min(100, Math.max(-100, Number(settings.phase) || 0))
      const power = Math.min(1, Math.max(0.1, Number(settings.power) || 0.45))
      const src = sourceValues(bars, settings.source ?? 'close')

      // Pine's simple-typed constants: computed once, never per bar.
      const PHASE_VALUE = Math.min(Math.max(phase * 0.01 + 1.5, 0.5), 2.5)
      const BETA = (power * (period - 1)) / (power * (period - 1) + 2)
      // With period 1 the log argument is 0, so the term is -Infinity and LEN1
      // clamps to 0, exactly as math.max does in Pine.
      const LEN1 = Math.max(Math.log(Math.sqrt(0.5 * (period - 1))) / Math.log(2) + 2, 0)
      const POW1 = Math.max(LEN1 - 2, 0.5)
      const LEN2 = Math.sqrt(0.5 * (period - 1)) * LEN1
      const POW1_RECIPROCAL = 1 / POW1
      const AVG_VOLTY_ALPHA = 2 / (Math.max(4 * period, 65) + 1)
      const DIV = 1 / (10 + (10 * Math.min(Math.max(period - 10, 0), 100)) / 100)
      const RVOLTY_CAP = Math.pow(LEN1, POW1_RECIPROCAL)
      const KV_BASE = LEN2 / (LEN2 + 1)

      // Pine var state. null stands for na so nz() can be reproduced exactly.
      let upperBand = null
      let lowerBand = null
      let ma1 = null
      let jmaState = null
      let avgVolty = null
      let vSum = 0
      let det0 = 0
      let det1 = 0
      // array.new_float(11, 0.0): unshift the new volty, pop the tail, then read
      // index 10, which is the volty from 10 bars back.
      const voltyRing = new Array(11).fill(0)

      const out = new Array(bars.length).fill(NaN)

      for (let i = 0; i < bars.length; i++) {
        const s = src[i]
        // Pine's `if not na(source)`: state is carried and nothing is emitted.
        if (!Number.isFinite(s)) continue

        const del1 = s - (upperBand === null ? s : upperBand)
        const del2 = s - (lowerBand === null ? s : lowerBand)
        const absDel1 = Math.abs(del1)
        const absDel2 = Math.abs(del2)
        const volty = absDel1 === absDel2 ? 0 : Math.max(absDel1, absDel2)

        voltyRing.unshift(volty)
        voltyRing.pop()
        vSum = vSum + (volty - voltyRing[10]) * DIV

        // Both nz() calls in the Pine line read the same pre-update value.
        const prevAvgVolty = avgVolty === null ? vSum : avgVolty
        avgVolty = prevAvgVolty + AVG_VOLTY_ALPHA * (vSum - prevAvgVolty)

        // nz(avgVolty, 0) > 0 also guards the divide on a flat series.
        const ratio = avgVolty > 0 ? volty / avgVolty : 1
        const rvolty = Math.min(Math.max(ratio, 1), RVOLTY_CAP)
        const pow2 = Math.pow(rvolty, POW1)
        const Kv = Math.pow(KV_BASE, Math.sqrt(pow2))

        upperBand = del1 > 0 ? s : s - Kv * del1
        lowerBand = del2 < 0 ? s : s - Kv * del2

        const alpha = Math.pow(BETA, pow2)
        const alphaSquared = alpha * alpha
        const oneMinusAlpha = 1 - alpha
        const oneMinusAlphaSquared = oneMinusAlpha * oneMinusAlpha

        const prevMa1 = ma1 === null ? s : ma1
        ma1 = s + alpha * (prevMa1 - s)
        det0 = (s - ma1) * (1 - BETA) + BETA * det0
        const ma2 = ma1 + PHASE_VALUE * det0

        const prevJma = jmaState === null ? s : jmaState
        det1 = (ma2 - prevJma) * oneMinusAlphaSquared + alphaSquared * det1
        jmaState = prevJma + det1

        out[i] = jmaState
      }

      return { jma: nulls(out) }
    },
  })
}
