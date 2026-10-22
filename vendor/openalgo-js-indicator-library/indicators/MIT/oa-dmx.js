/**
 * Jurik Directional Movement Index (DMX) - ported to openalgo-charts from Pine Script v6.
 *
 * Source: https://github.com/mihakralj/pinescript/blob/c4e91b962be09733d8fc76caa5191e9e586c5cee/indicators/dynamics/dmx.pine
 * Repo:   mihakralj/pinescript
 * License: MIT
 * SPDX-FileCopyrightText: (c) mihakralj
 * SPDX-FileCopyrightText: (c) 2026 marketcalls (port to openalgo-charts)
 * SPDX-License-Identifier: MIT
 *
 * The normalised difference between the Wilder smoothed +DI and -DI, then
 * passed through a Jurik moving average instead of the usual Wilder ADX
 * smoothing, so the reading turns faster with far less whipsaw.
 */

export default function ({ registerIndicator, nulls }) {
  registerIndicator({
    id: 'oa-dmx',
    name: 'Jurik Directional Movement Index (DMX)',
    category: 'Dynamics',
    placement: 'pane',

    inputs: [
      {
        key: 'period',
        type: 'number',
        label: 'Period',
        default: 14,
        min: 1,
        max: 5000,
        step: 1,
        tooltip: 'Number of bars used in the calculation',
      },
    ],

    plots: [{ key: 'dmx', type: 'line', title: 'DMX', style: { color: '#ffeb3b', lineWidth: 2 } }],

    calc(bars, settings) {
      // A cleared number field arrives as '', and Number('') is 0.
      const period = Math.max(1, Math.floor(Number(settings.period) || 14))

      const n = bars.length
      const out = new Array(n).fill(NaN)
      if (n === 0) return { dmx: nulls(out) }

      const wilderAlpha = 1 / period

      // Jurik constants. Pine computes these once as `simple` values, so they
      // depend on the period alone and never on the bar.
      const PHASE_VALUE = 0.5
      const power = 0.2
      const BETA = (power * (period - 1)) / (power * (period - 1) + 2)
      const LEN1 = Math.max(Math.log(Math.sqrt(0.5 * (period - 1))) / Math.log(2) + 2, 0)
      const POW1 = Math.max(LEN1 - 2, 0.5)
      const LEN2 = Math.sqrt(0.5 * (period - 1)) * LEN1
      const POW1_RECIPROCAL = 1 / POW1
      const AVG_VOLTY_ALPHA = 2 / (Math.max(4 * period, 65) + 1)
      const DIV = 1 / (10 + (10 * Math.min(Math.max(period - 10, 0), 100)) / 100)

      // Wilder directional movement state. Pine seeds the EMA at 0 on the
      // first bar and then runs a warmup compensator c = 1 / (1 - (1-a)^k)
      // until the residual (1-a)^k drops below 1e-10.
      let upEma = NaN
      let upDi = NaN
      let upE = 1
      let upWarmup = true
      let downEma = NaN
      let downDi = NaN
      let downE = 1
      let downWarmup = true

      // Jurik filter state.
      let upperBand = NaN
      let lowerBand = NaN
      let ma1 = NaN
      let jma = NaN
      let vSum = 0
      let det0 = 0
      let det1 = 0
      let avgVolty = NaN
      // Pine keeps an 11 slot array, unshifting the newest volty and popping
      // the oldest, then reads index 10: a rolling window of the last 10.
      const voltyArray = new Array(11).fill(0)

      for (let i = 0; i < n; i++) {
        const bar = bars[i]
        const high = bar.high
        const low = bar.low
        if (!Number.isFinite(high) || !Number.isFinite(low)) continue

        const prev = i > 0 ? bars[i - 1] : null
        const prevHigh = prev && Number.isFinite(prev.high) ? prev.high : NaN
        const prevLow = prev && Number.isFinite(prev.low) ? prev.low : NaN

        // On the first bar Pine sees na(high[1]) and na(low[1]) and takes 0.
        let upDm = 0
        let downDm = 0
        if (Number.isFinite(prevHigh) && Number.isFinite(prevLow)) {
          const upMove = high - prevHigh
          const downMove = prevLow - low
          upDm = upMove > downMove && upMove > 0 ? upMove : 0
          downDm = downMove > upMove && downMove > 0 ? downMove : 0
        }

        if (!Number.isFinite(upEma)) {
          upEma = 0
          upDi = upDm
        } else {
          upEma = wilderAlpha * (upDm - upEma) + upEma
          if (upWarmup) {
            upE *= 1 - wilderAlpha
            const upC = 1 / (1 - upE)
            upDi = upC * upEma
            if (upE <= 1e-10) upWarmup = false
          } else {
            upDi = upEma
          }
        }

        if (!Number.isFinite(downEma)) {
          downEma = 0
          downDi = downDm
        } else {
          downEma = wilderAlpha * (downDm - downEma) + downEma
          if (downWarmup) {
            downE *= 1 - wilderAlpha
            const downC = 1 / (1 - downE)
            downDi = downC * downEma
            if (downE <= 1e-10) downWarmup = false
          } else {
            downDi = downEma
          }
        }

        const sumDi = upDi + downDi
        // Guarded divide: a flat bar run leaves both DI values at zero.
        const source = Number.isFinite(sumDi) && sumDi !== 0 ? (upDi - downDi) / sumDi : 0

        // Jurik moving average of the normalised DI difference.
        const del1 = source - (Number.isFinite(upperBand) ? upperBand : source)
        const del2 = source - (Number.isFinite(lowerBand) ? lowerBand : source)
        const absDel1 = Math.abs(del1)
        const absDel2 = Math.abs(del2)
        const volty = absDel1 === absDel2 ? 0 : Math.max(absDel1, absDel2)

        voltyArray.unshift(Number.isFinite(volty) ? volty : 0)
        voltyArray.pop()

        vSum = vSum + (volty - voltyArray[10]) * DIV
        const prevAvgVolty = Number.isFinite(avgVolty) ? avgVolty : vSum
        avgVolty = prevAvgVolty + AVG_VOLTY_ALPHA * (vSum - prevAvgVolty)

        const avgForRatio = Number.isFinite(avgVolty) ? avgVolty : 0
        const ratio = avgForRatio > 0 ? volty / (Number.isFinite(avgVolty) ? avgVolty : 1) : 1
        const rvolty = Math.min(Math.max(ratio, 1), Math.pow(LEN1, POW1_RECIPROCAL))
        const pow2 = Math.pow(rvolty, POW1)
        const Kv = Math.pow(LEN2 / (LEN2 + 1), Math.sqrt(pow2))

        upperBand = del1 > 0 ? source : source - Kv * del1
        lowerBand = del2 < 0 ? source : source - Kv * del2

        const alpha = Math.pow(BETA, pow2)
        const alphaSquared = alpha * alpha
        const oneMinusAlpha = 1 - alpha
        const oneMinusAlphaSquared = oneMinusAlpha * oneMinusAlpha

        const prevMa1 = Number.isFinite(ma1) ? ma1 : source
        ma1 = source + alpha * (prevMa1 - source)
        det0 = (source - ma1) * (1 - BETA) + BETA * det0
        const ma2 = ma1 + PHASE_VALUE * det0
        const prevJma = Number.isFinite(jma) ? jma : source
        det1 = (ma2 - prevJma) * oneMinusAlphaSquared + alphaSquared * det1
        jma = prevJma + det1

        out[i] = jma
      }

      return { dmx: nulls(out) }
    },
  })
}
