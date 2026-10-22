/**
 * Percentage Volume Oscillator (PVO) - ported to openalgo-charts from Pine Script v6.
 *
 * Source: https://github.com/mihakralj/pinescript/blob/c4e91b962be09733d8fc76caa5191e9e586c5cee/indicators/volume/pvo.pine
 * Repo:   mihakralj/pinescript
 * License: MIT (c) mihakralj
 * SPDX-FileCopyrightText: (c) mihakralj
 * SPDX-FileCopyrightText: (c) 2026 marketcalls (port to openalgo-charts)
 * SPDX-License-Identifier: MIT
 *
 * The distance between a fast and a slow exponential average of volume,
 * expressed as a percentage of the slow average, with its own signal line and
 * histogram. It reads volume expansion the way MACD reads price momentum.
 */

export default function ({ registerIndicator, nulls }) {
  registerIndicator({
    id: 'oa-pvo',
    name: 'Percentage Volume Oscillator (PVO)',
    category: 'Volume',
    placement: 'pane',

    inputs: [
      { key: 'fastPeriod', type: 'number', label: 'Fast Period', default: 12, min: 1, max: 5000, step: 1 },
      { key: 'slowPeriod', type: 'number', label: 'Slow Period', default: 26, min: 1, max: 5000, step: 1 },
      { key: 'signalPeriod', type: 'number', label: 'Signal Period', default: 9, min: 1, max: 5000, step: 1 },
    ],

    plots: [
      { key: 'pvo', type: 'line', title: 'PVO', style: { color: '#ffeb3b', lineWidth: 2 } },
      { key: 'signal', type: 'line', title: 'Signal', style: { color: '#f23645', lineWidth: 2 } },
      { key: 'histogram', type: 'histogram', title: 'Histogram', style: { color: '#2962ff', lineWidth: 2 } },
    ],

    levels: () => [{ price: 0, title: 'Zero Line', color: '#787b86' }],

    calc(bars, settings) {
      // A cleared number field arrives as '', and Number('') is 0.
      const fastPeriod = Math.max(1, Math.floor(Number(settings.fastPeriod) || 12))
      let slowPeriod = Math.max(1, Math.floor(Number(settings.slowPeriod) || 26))
      const signalPeriod = Math.max(1, Math.floor(Number(settings.signalPeriod) || 9))
      // Pine raises when the fast period is not strictly faster. A chart cannot
      // raise, so hold the slow period one bar behind the fast one instead of
      // drawing an inverted oscillator.
      if (slowPeriod <= fastPeriod) slowPeriod = fastPeriod + 1

      const fastAlpha = 2 / (fastPeriod + 1)
      const slowAlpha = 2 / (slowPeriod + 1)
      const signalAlpha = 2 / (signalPeriod + 1)
      const fastBeta = 1 - fastAlpha
      const slowBeta = 1 - slowAlpha
      const signalBeta = 1 - signalAlpha
      const slowestBeta = Math.max(fastBeta, slowBeta, signalBeta)

      const pvo = new Array(bars.length).fill(NaN)
      const signal = new Array(bars.length).fill(NaN)
      const histogram = new Array(bars.length).fill(NaN)

      let warmup = true
      let eFast = 1
      let eSlow = 1
      let eSignal = 1
      let eSlowest = 1
      let fastEma = 0
      let slowEma = 0
      let signalEma = 0

      for (let i = 0; i < bars.length; i++) {
        // Pine's nz(volume, 0.0): an index series carries no volume at all.
        const raw = bars[i].volume
        const volValue = Number.isFinite(raw) ? raw : 0

        fastEma = fastAlpha * (volValue - fastEma) + fastEma
        slowEma = slowAlpha * (volValue - slowEma) + slowEma

        if (warmup) {
          eFast *= fastBeta
          eSlow *= slowBeta
          eSignal *= signalBeta
          eSlowest *= slowestBeta
          // The flag is updated before the compensation factors are read, so the
          // bar that ends warmup already uses uncompensated values.
          warmup = eSlowest > 1e-10
        }

        const cFast = warmup ? 1 / (1 - eFast) : 1
        const cSlow = warmup ? 1 / (1 - eSlow) : 1
        const cSignal = warmup ? 1 / (1 - eSignal) : 1

        const fastComp = cFast * fastEma
        const slowComp = cSlow * slowEma
        const pvoValue = slowComp !== 0 ? ((fastComp - slowComp) / slowComp) * 100 : 0

        signalEma = signalAlpha * (pvoValue - signalEma) + signalEma
        const signalValue = cSignal * signalEma

        pvo[i] = Number.isFinite(pvoValue) ? pvoValue : NaN
        signal[i] = Number.isFinite(signalValue) ? signalValue : NaN
        histogram[i] = Number.isFinite(pvoValue) && Number.isFinite(signalValue) ? pvoValue - signalValue : NaN
      }

      return { pvo: nulls(pvo), signal: nulls(signal), histogram: nulls(histogram) }
    },
  })
}
