/**
 * Klinger Volume Oscillator (KVO) - ported to openalgo-charts from Pine Script v6.
 *
 * Source: https://github.com/mihakralj/pinescript/blob/c4e91b962be09733d8fc76caa5191e9e586c5cee/indicators/volume/kvo.pine
 * Repo:   mihakralj/pinescript
 * License: MIT (c) mihakralj
 * SPDX-FileCopyrightText: (c) mihakralj
 * SPDX-FileCopyrightText: (c) 2026 marketcalls (port to openalgo-charts)
 * SPDX-License-Identifier: MIT
 *
 * Volume force is signed by the direction of the typical price and weighted by
 * where the close sits in the bar's range, then read as the spread between a
 * fast and a slow exponential average of that force.
 */

export default function ({ registerIndicator, nulls }) {
  registerIndicator({
    id: 'oa-kvo',
    name: 'Klinger Volume Oscillator (KVO)',
    category: 'Volume',
    placement: 'pane',

    inputs: [
      { key: 'fastPeriod', type: 'number', label: 'Fast EMA Period', default: 34, min: 1, max: 5000, step: 1 },
      { key: 'slowPeriod', type: 'number', label: 'Slow EMA Period', default: 55, min: 1, max: 5000, step: 1 },
      { key: 'signalPeriod', type: 'number', label: 'Signal Line Period', default: 13, min: 1, max: 5000, step: 1 },
    ],

    plots: [
      { key: 'kvo', type: 'line', title: 'KVO', style: { color: '#ffeb3b', lineWidth: 2 } },
      { key: 'signal', type: 'line', title: 'Signal', style: { color: '#2962ff', lineWidth: 1 } },
      {
        key: 'histogram',
        type: 'histogram',
        title: 'Histogram',
        style: { color: '#26a69a' },
        colorBy: ({ value }) => (value >= 0 ? '#26a69a' : '#ef5350'),
      },
    ],

    levels: () => [{ price: 0, title: 'Zero Line', color: '#787b86', dashed: true }],

    calc(bars, settings) {
      // A cleared number field arrives as '', and Number('') is 0.
      const fastLen = Math.max(1, Math.floor(Number(settings.fastPeriod) || 34))
      const slowLen = Math.max(1, Math.floor(Number(settings.slowPeriod) || 55))
      const signalLen = Math.max(1, Math.floor(Number(settings.signalPeriod) || 13))
      const n = bars.length

      const alphaF = 2 / (fastLen + 1)
      const alphaS = 2 / (slowLen + 1)
      const alphaSig = 2 / (signalLen + 1)

      const kvoOut = new Array(n).fill(NaN)
      const signalOut = new Array(n).fill(NaN)
      const histOut = new Array(n).fill(NaN)

      let trend = 1
      let prevHlc3 = NaN
      let warmup = true
      let eF = 1
      let eS = 1
      let eSig = 1
      let emaValF = 0
      let emaValS = 0
      let emaValSig = 0

      for (let i = 0; i < n; i++) {
        const bar = bars[i]
        const high = bar.high
        const low = bar.low
        const close = bar.close
        const hlc3 = (high + low + close) / 3
        // nz(hlc3[1], hlc3): the first bar compares against itself.
        const hlc3Prev = Number.isFinite(prevHlc3) ? prevHlc3 : hlc3
        if (hlc3 > hlc3Prev) trend = 1
        else if (hlc3 < hlc3Prev) trend = -1
        prevHlc3 = hlc3

        const highLowRange = high - low
        const cm = highLowRange > 0 ? Math.abs(2 * ((highLowRange - (close - low)) / highLowRange) - 1) : 0
        // Volume is absent on index and computed series; Pine's nz() reads it as 0.
        const vol = Number.isFinite(bar.volume) ? bar.volume : 0
        const dm = trend * vol * cm

        emaValF = alphaF * (dm - emaValF) + emaValF
        emaValS = alphaS * (dm - emaValS) + emaValS

        let fastEma
        let slowEma
        if (warmup) {
          // Divide out the decaying seed bias so the averages read true early.
          eF *= 1 - alphaF
          eS *= 1 - alphaS
          const cF = 1 / (1 - eF)
          const cS = 1 / (1 - eS)
          fastEma = cF * emaValF
          slowEma = cS * emaValS
          warmup = eSig > 1e-10
        } else {
          fastEma = emaValF
          slowEma = emaValS
        }

        const kvoLine = fastEma - slowEma

        let signalLine
        emaValSig = alphaSig * (kvoLine - emaValSig) + emaValSig
        if (warmup) {
          eSig *= 1 - alphaSig
          const cSig = 1 / (1 - eSig)
          signalLine = cSig * emaValSig
        } else {
          signalLine = emaValSig
        }

        if (!Number.isFinite(kvoLine) || !Number.isFinite(signalLine)) continue
        kvoOut[i] = kvoLine
        signalOut[i] = signalLine
        histOut[i] = kvoLine - signalLine
      }

      return { kvo: nulls(kvoOut), signal: nulls(signalOut), histogram: nulls(histOut) }
    },
  })
}
