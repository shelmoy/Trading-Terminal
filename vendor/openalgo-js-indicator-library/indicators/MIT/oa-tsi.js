/**
 * True Strength Index (TSI) - ported to openalgo-charts from Pine Script v6.
 *
 * Source: https://github.com/mihakralj/pinescript/blob/c4e91b962be09733d8fc76caa5191e9e586c5cee/indicators/momentum/tsi.pine
 * Repo:   mihakralj/pinescript
 * License: MIT (c) mihakralj
 * SPDX-FileCopyrightText: (c) mihakralj
 * SPDX-FileCopyrightText: (c) 2026 marketcalls (port to openalgo-charts)
 * SPDX-License-Identifier: MIT
 *
 * Double-smoothed price momentum divided by double-smoothed absolute momentum,
 * scaled to +/-100, with an EMA signal line.
 */

export default function ({ registerIndicator, sourceValues, nulls }) {
  registerIndicator({
    id: 'oa-tsi',
    name: 'True Strength Index (TSI)',
    category: 'Momentum',
    placement: 'pane',

    inputs: [
      { key: 'source', type: 'source', label: 'Source', default: 'close' },
      { key: 'longLen', type: 'number', label: 'Long Length', default: 25, min: 1, max: 5000, step: 1 },
      { key: 'shortLen', type: 'number', label: 'Short Length', default: 13, min: 1, max: 5000, step: 1 },
      { key: 'signalLen', type: 'number', label: 'Signal Length', default: 13, min: 1, max: 5000, step: 1 },
    ],

    plots: [
      { key: 'tsi', type: 'line', title: 'TSI', style: { color: '#2196f3', lineWidth: 2 } },
      { key: 'signal', type: 'line', title: 'Signal Line', style: { color: '#f44336', lineWidth: 2 } },
    ],

    calc(bars, settings) {
      // A cleared number field arrives as '', and Number('') is 0.
      const longLen = Math.max(1, Math.floor(Number(settings.longLen) || 25))
      const shortLen = Math.max(1, Math.floor(Number(settings.shortLen) || 13))
      const signalLen = Math.max(1, Math.floor(Number(settings.signalLen) || 13))
      const src = sourceValues(bars, settings.source ?? 'close')

      // The source uses alpha = 2 / length, not the textbook 2 / (length + 1),
      // and a zero-seeded EMA whose warmup bias is divided out until the
      // remaining weight of the seed falls below 1e-10. State is created per
      // calc call, so calc stays pure.
      const makeEma = (alpha) => {
        let value = NaN
        let seedWeight = 1.0
        let warmup = true
        return (x) => {
          if (!Number.isFinite(value)) {
            // First bar: the accumulator starts at zero and the raw input is
            // emitted unchanged.
            value = 0.0
            return x
          }
          value = alpha * (x - value) + value
          if (!warmup) return value
          seedWeight *= 1 - alpha
          const denom = 1.0 - seedWeight
          const corrected = denom !== 0 ? (1.0 / denom) * value : value
          if (seedWeight <= 1e-10) warmup = false
          return corrected
        }
      }

      const emaMomLong = makeEma(2.0 / Math.max(longLen, 1))
      const emaMomShort = makeEma(2.0 / Math.max(shortLen, 1))
      const emaAbsMomLong = makeEma(2.0 / Math.max(longLen, 1))
      const emaAbsMomShort = makeEma(2.0 / Math.max(shortLen, 1))
      const emaSignal = makeEma(2.0 / Math.max(signalLen, 1))

      const tsiOut = new Array(bars.length).fill(NaN)
      const signalOut = new Array(bars.length).fill(NaN)
      let prevTsi = NaN
      let prevSignal = NaN

      for (let i = 0; i < bars.length; i++) {
        const s = src[i]
        let tsiValue
        let signalValue
        if (Number.isFinite(s)) {
          // mom = src - nz(src[1]): a missing previous value reads as 0.
          const prevSrc = i > 0 && Number.isFinite(src[i - 1]) ? src[i - 1] : 0
          const mom = s - prevSrc
          const absMom = Math.abs(mom)

          const smoothedMomLong = emaMomLong(mom)
          const doubleSmoothedMom = emaMomShort(smoothedMomLong)
          const smoothedAbsMomLong = emaAbsMomLong(absMom)
          const doubleSmoothedAbsMom = emaAbsMomShort(smoothedAbsMomLong)

          tsiValue =
            Number.isFinite(doubleSmoothedAbsMom) && doubleSmoothedAbsMom !== 0 && Number.isFinite(doubleSmoothedMom)
              ? 100 * (doubleSmoothedMom / doubleSmoothedAbsMom)
              : 0
          signalValue = emaSignal(tsiValue)
        } else {
          // Pine holds the previous bar's reading, defaulting to 50.
          tsiValue = Number.isFinite(prevTsi) ? prevTsi : 50.0
          signalValue = Number.isFinite(prevSignal) ? prevSignal : 50.0
        }
        tsiOut[i] = tsiValue
        signalOut[i] = signalValue
        prevTsi = tsiValue
        prevSignal = signalValue
      }

      return { tsi: nulls(tsiOut), signal: nulls(signalOut) }
    },
  })
}
