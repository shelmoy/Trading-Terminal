/**
 * Stochastic Momentum Index (SMI) - ported to openalgo-charts from Pine Script v6.
 *
 * Source: https://github.com/mihakralj/pinescript/blob/c4e91b962be09733d8fc76caa5191e9e586c5cee/indicators/oscillators/smi.pine
 * Repo:   mihakralj/pinescript
 * License: MIT (c) mihakralj
 * SPDX-FileCopyrightText: (c) mihakralj
 * SPDX-FileCopyrightText: (c) 2026 marketcalls (port to openalgo-charts)
 * SPDX-License-Identifier: MIT
 *
 * Measures where the close sits relative to the midpoint of the recent
 * high/low range, then double-smooths that distance. Unlike a stochastic it is
 * centred on zero, so the sign says which half of the range price is trading in.
 */

export default function ({ registerIndicator, sourceValues, nulls }) {
  registerIndicator({
    id: 'oa-smi',
    name: 'Stochastic Momentum Index (SMI)',
    category: 'Oscillators',
    placement: 'pane',

    inputs: [
      {
        key: 'kPeriod',
        type: 'number',
        label: '%K Period',
        default: 10,
        min: 1,
        max: 100,
        step: 1,
        tooltip: 'Lookback period for high/low range calculation.',
      },
      {
        key: 'kSmooth',
        type: 'number',
        label: '%K Smooth',
        default: 3,
        min: 1,
        max: 20,
        step: 1,
        tooltip: 'First smoothing period for raw SMI values.',
      },
      {
        key: 'dSmooth',
        type: 'number',
        label: '%D Smooth',
        default: 3,
        min: 1,
        max: 20,
        step: 1,
        tooltip: 'Second smoothing period for the signal line.',
      },
      { key: 'source', type: 'source', label: 'Source', default: 'close' },
      {
        key: 'blau',
        type: 'boolean',
        label: 'Blau Method',
        default: true,
        tooltip: 'On: Blau, smooth the raw SMI ratio. Off: Chande/Kroll, smooth numerator and denominator first.',
      },
    ],

    plots: [
      { key: 'k', type: 'line', title: 'SMI %K', style: { color: '#ffeb3b', lineWidth: 2 } },
      { key: 'd', type: 'line', title: 'SMI %D', style: { color: '#2962ff', lineWidth: 2 } },
    ],

    calc(bars, settings) {
      // A cleared number field arrives as '', and Number('') is 0.
      const kPeriod = Math.max(1, Math.min(100, Math.floor(Number(settings.kPeriod) || 10)))
      const kSmooth = Math.max(1, Math.min(20, Math.floor(Number(settings.kSmooth) || 3)))
      const dSmooth = Math.max(1, Math.min(20, Math.floor(Number(settings.dSmooth) || 3)))
      const blau = settings.blau !== false
      const src = sourceValues(bars, settings.source ?? 'close')

      const a1 = 2 / (kSmooth + 1)
      const a2 = 2 / (kSmooth + 1)
      const a3 = 2 / (dSmooth + 1)

      // Rolling high/low window, exactly as the Pine arrays: push, then drop the
      // oldest once the window is longer than kPeriod.
      const highBuffer = []
      const lowBuffer = []

      // The e1/e2/e3 decay terms are the compensation Pine applies while the
      // three exponential stages are still warming up, so the first bars are
      // unbiased rather than dragged toward the 0.0 seed.
      let e1 = 1
      let e2 = 1
      let e3 = 1
      let warmup = true

      let ema1Raw = 0
      let ema2Raw = 0
      let ema3Raw = 0
      let firstEma = 0
      let kValue = 0
      let dValue = 0

      // Chande/Kroll state: the numerator and the denominator are smoothed apart.
      let numEma1 = 0
      let numEma2 = 0
      let denEma2 = 0
      let numFirst = 0
      let denFirst = 0

      const kOut = new Array(bars.length).fill(NaN)
      const dOut = new Array(bars.length).fill(NaN)

      for (let i = 0; i < bars.length; i++) {
        const value = src[i]
        // Pine returns [na, na] without touching any state when the source is na.
        if (!Number.isFinite(value)) continue

        const bar = bars[i]
        highBuffer.push(Number.isFinite(bar.high) ? bar.high : 0)
        lowBuffer.push(Number.isFinite(bar.low) ? bar.low : 0)
        if (highBuffer.length > kPeriod) highBuffer.shift()
        if (lowBuffer.length > kPeriod) lowBuffer.shift()

        let highestHigh = -Infinity
        let lowestLow = Infinity
        for (let j = 0; j < highBuffer.length; j++) {
          if (highBuffer[j] > highestHigh) highestHigh = highBuffer[j]
          if (lowBuffer[j] < lowestLow) lowestLow = lowBuffer[j]
        }

        const midpoint = (highestHigh + lowestLow) / 2
        const rangeHalf = (highestHigh - lowestLow) / 2

        if (blau) {
          const rawSmi = rangeHalf > 0 ? (100 * (value - midpoint)) / rangeHalf : 0
          ema1Raw = a1 * (rawSmi - ema1Raw) + ema1Raw
          if (warmup) {
            e1 *= 1 - a1
            e2 *= 1 - a2
            e3 *= 1 - a3
            const c1 = 1 - e1 > 0 ? 1 / (1 - e1) : 1
            const c2 = 1 - e2 > 0 ? 1 / (1 - e2) : 1
            const c3 = 1 - e3 > 0 ? 1 / (1 - e3) : 1
            firstEma = ema1Raw * c1
            ema2Raw = a2 * (firstEma - ema2Raw) + ema2Raw
            kValue = ema2Raw * c2
            ema3Raw = a3 * (kValue - ema3Raw) + ema3Raw
            dValue = ema3Raw * c3
            warmup = Math.max(Math.max(e1, e2), e3) > 1e-10
          } else {
            firstEma = ema1Raw
            ema2Raw = a2 * (firstEma - ema2Raw) + ema2Raw
            kValue = ema2Raw
            ema3Raw = a3 * (kValue - ema3Raw) + ema3Raw
            dValue = ema3Raw
          }
        } else {
          const numerator = value - midpoint
          const denominator = rangeHalf
          ema1Raw = a1 * (numerator - ema1Raw) + ema1Raw
          numEma1 = a1 * (denominator - numEma1) + numEma1
          if (warmup) {
            e1 *= 1 - a1
            e2 *= 1 - a2
            e3 *= 1 - a3
            const c1 = 1 - e1 > 0 ? 1 / (1 - e1) : 1
            const c2 = 1 - e2 > 0 ? 1 / (1 - e2) : 1
            const c3 = 1 - e3 > 0 ? 1 / (1 - e3) : 1
            numFirst = ema1Raw * c1
            denFirst = numEma1 * c1
            numEma2 = a2 * (numFirst - numEma2) + numEma2
            denEma2 = a2 * (denFirst - denEma2) + denEma2
            kValue = denEma2 > 0 ? (100 * (numEma2 * c2)) / (denEma2 * c2) : 0
            ema3Raw = a3 * (kValue - ema3Raw) + ema3Raw
            dValue = ema3Raw * c3
            warmup = Math.max(Math.max(e1, e2), e3) > 1e-10
          } else {
            numFirst = ema1Raw
            denFirst = numEma1
            numEma2 = a2 * (numFirst - numEma2) + numEma2
            denEma2 = a2 * (denFirst - denEma2) + denEma2
            kValue = denEma2 > 0 ? (100 * numEma2) / denEma2 : 0
            ema3Raw = a3 * (kValue - ema3Raw) + ema3Raw
            dValue = ema3Raw
          }
        }

        if (Number.isFinite(kValue)) kOut[i] = kValue
        if (Number.isFinite(dValue)) dOut[i] = dValue
      }

      return { k: nulls(kOut), d: nulls(dOut) }
    },
  })
}
