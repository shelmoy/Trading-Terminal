/**
 * Moving Average Convergence Divergence (MACD) - ported to openalgo-charts from
 * Pine Script v6.
 *
 * Source: https://github.com/mihakralj/pinescript/blob/c4e91b962be09733d8fc76caa5191e9e586c5cee/indicators/momentum/macd.pine
 * Repo:   mihakralj/pinescript
 * License: MIT (c) mihakralj
 * SPDX-FileCopyrightText: (c) mihakralj
 * SPDX-FileCopyrightText: (c) 2026 marketcalls (port to openalgo-charts)
 * SPDX-License-Identifier: MIT
 *
 * The distance between a fast and a slow exponential average, its own average
 * as a signal line, and the gap between the two as a histogram. This variant
 * bias-corrects every average during warmup, so it reads correctly from the
 * very first bar instead of drifting up from a zero seed.
 */

export default function ({ registerIndicator, sourceValues, nulls }) {
  registerIndicator({
    id: 'oa-macd',
    name: 'Moving Average Convergence Divergence (MACD)',
    category: 'Momentum',
    placement: 'pane',

    inputs: [
      { key: 'fastLength', type: 'number', label: 'Fast Length', default: 12, min: 1, max: 5000, step: 1 },
      { key: 'slowLength', type: 'number', label: 'Slow Length', default: 26, min: 2, max: 5000, step: 1 },
      { key: 'signalLength', type: 'number', label: 'Signal Length', default: 9, min: 1, max: 5000, step: 1 },
      { key: 'source', type: 'source', label: 'Source', default: 'close' },
    ],

    plots: [
      {
        key: 'histogram',
        type: 'column',
        title: 'Histogram',
        style: { color: '#4caf50' },
        // The Pine ternary picks green for a non-negative bar and red otherwise;
        // both of its inner branches resolve to the same colour.
        colorBy: ({ value }) => (value >= 0 ? '#4caf50' : '#ff5252'),
      },
      { key: 'macd', type: 'line', title: 'MACD', style: { color: '#2196f3', lineWidth: 2 } },
      { key: 'signal', type: 'line', title: 'Signal', style: { color: '#ff5252', lineWidth: 2 } },
    ],

    levels: () => [{ price: 0, title: 'Zero Line', color: '#787b86' }],

    calc(bars, settings) {
      // A cleared number field arrives as '', and Number('') is 0.
      const fastLength = Math.max(1, Math.floor(Number(settings.fastLength) || 12))
      const slowLength = Math.max(2, Math.floor(Number(settings.slowLength) || 26))
      const signalLength = Math.max(1, Math.floor(Number(settings.signalLength) || 9))
      const src = sourceValues(bars, settings.source ?? 'close')

      const n = bars.length
      const macdCol = new Array(n).fill(NaN)
      const signalCol = new Array(n).fill(NaN)
      const histCol = new Array(n).fill(NaN)

      const alphaFast = 2 / (fastLength + 1)
      const alphaSlow = 2 / (slowLength + 1)
      const alphaSignal = 2 / (signalLength + 1)
      const betaFast = 1 - alphaFast
      const betaSlow = 1 - alphaSlow
      const betaSignal = 1 - alphaSignal

      // All six carry across bars exactly as the Pine `var` declarations do.
      let warmup = true
      let eFast = 1
      let eSlow = 1
      let eSignal = 1
      let emaFast = 0
      let emaSlow = 0
      let emaSignal = 0
      let resultFast = 0
      let resultSlow = 0
      let resultSignal = 0

      for (let i = 0; i < n; i++) {
        const s = src[i]
        // A missing source value would poison every later bar through the
        // recursion, so the bar is left as a gap and the state is untouched.
        if (!Number.isFinite(s)) continue

        emaFast = alphaFast * (s - emaFast) + emaFast
        emaSlow = alphaSlow * (s - emaSlow) + emaSlow

        if (warmup) {
          eFast *= betaFast
          eSlow *= betaSlow
          eSignal *= betaSignal
          const cFast = 1 / (1 - eFast)
          const cSlow = 1 / (1 - eSlow)
          const cSignal = 1 / (1 - eSignal)
          resultFast = Number.isFinite(cFast) ? cFast * emaFast : emaFast
          resultSlow = Number.isFinite(cSlow) ? cSlow * emaSlow : emaSlow
          const line = resultFast - resultSlow
          emaSignal = alphaSignal * (line - emaSignal) + emaSignal
          resultSignal = Number.isFinite(cSignal) ? cSignal * emaSignal : emaSignal
          warmup = eFast > 1e-10 || eSlow > 1e-10 || eSignal > 1e-10
        } else {
          resultFast = emaFast
          resultSlow = emaSlow
          const line = resultFast - resultSlow
          emaSignal = alphaSignal * (line - emaSignal) + emaSignal
          resultSignal = emaSignal
        }

        const macdLine = resultFast - resultSlow
        macdCol[i] = macdLine
        signalCol[i] = resultSignal
        histCol[i] = macdLine - resultSignal
      }

      return { macd: nulls(macdCol), signal: nulls(signalCol), histogram: nulls(histCol) }
    },
  })
}
