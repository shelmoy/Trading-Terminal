/**
 * Price Momentum Oscillator (PMO) - ported to openalgo-charts from Pine Script v6.
 *
 * Source: https://github.com/mihakralj/pinescript/blob/c4e91b962be09733d8fc76caa5191e9e586c5cee/indicators/momentum/pmo.pine
 * Repo:   mihakralj/pinescript
 * License: MIT
 * SPDX-FileCopyrightText: (c) mihakralj
 * SPDX-FileCopyrightText: (c) 2026 marketcalls (port to openalgo-charts)
 * SPDX-License-Identifier: MIT
 *
 * Rate of change passed through two exponential smoothers, then a third for the
 * signal line, so momentum reads as a slow oscillator around zero rather than
 * as raw percentage noise.
 */

export default function ({ registerIndicator, sourceValues, nulls }) {
  registerIndicator({
    id: 'oa-pmo',
    name: 'Price Momentum Oscillator (PMO)',
    category: 'Momentum',
    placement: 'pane',

    inputs: [
      { key: 'source', type: 'source', label: 'Source', default: 'close' },
      { key: 'rocLength', type: 'number', label: 'ROC Length', default: 35, min: 1, max: 5000, step: 1 },
      { key: 'smooth1', type: 'number', label: 'First Smoothing Length', default: 20, min: 1, max: 5000, step: 1 },
      { key: 'smooth2', type: 'number', label: 'Second Smoothing Length', default: 10, min: 1, max: 5000, step: 1 },
      { key: 'signalLength', type: 'number', label: 'Signal Line Length', default: 10, min: 1, max: 5000, step: 1 },
    ],

    plots: [
      { key: 'pmo', type: 'line', title: 'PMO', style: { color: '#2962ff', lineWidth: 2 } },
      { key: 'signal', type: 'line', title: 'Signal', style: { color: '#ef5350', lineWidth: 2 } },
    ],

    calc(bars, settings) {
      // A cleared number field arrives as '', and Number('') is 0.
      const rocLen = Math.max(1, Math.floor(Number(settings.rocLength) || 35))
      const s1Len = Math.max(1, Math.floor(Number(settings.smooth1) || 20))
      const s2Len = Math.max(1, Math.floor(Number(settings.smooth2) || 10))
      const sigLen = Math.max(1, Math.floor(Number(settings.signalLength) || 10))
      const src = sourceValues(bars, settings.source ?? 'close')
      const n = bars.length

      const pmoOut = new Array(n).fill(NaN)
      const signalOut = new Array(n).fill(NaN)

      const alpha1 = 2 / (s1Len + 1)
      const alpha2 = 2 / (s2Len + 1)
      const alphaSignal = 2 / (sigLen + 1)

      // var float, all seeded na and self-seeding on the first finite input.
      let smooth1 = NaN
      let smooth2 = NaN
      let signalLine = NaN

      for (let i = 0; i < n; i++) {
        // Pine clamps the lookback to bar_index, so the first bar compares with
        // itself and the raw rate of change is zero there.
        const offset = Math.min(rocLen, i)
        const cur = src[i]
        const ref = src[i - offset]

        let roc = NaN
        if (Number.isFinite(cur) && Number.isFinite(ref) && ref !== 0) {
          roc = (100 * (cur - ref)) / ref
          if (!Number.isFinite(roc)) roc = NaN
        }

        smooth1 = !Number.isFinite(smooth1) ? roc : smooth1 * (1 - alpha1) + roc * alpha1
        smooth2 = !Number.isFinite(smooth2) ? smooth1 : smooth2 * (1 - alpha2) + smooth1 * alpha2

        const pmoValue = smooth2
        signalLine = !Number.isFinite(signalLine)
          ? pmoValue
          : signalLine * (1 - alphaSignal) + pmoValue * alphaSignal

        if (Number.isFinite(pmoValue)) pmoOut[i] = pmoValue
        if (Number.isFinite(signalLine)) signalOut[i] = signalLine
      }

      return { pmo: nulls(pmoOut), signal: nulls(signalOut) }
    },
  })
}
