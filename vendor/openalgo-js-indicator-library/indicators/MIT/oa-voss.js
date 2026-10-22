/**
 * Ehlers Voss Predictive Filter (VOSS) - ported to openalgo-charts from Pine Script v6.
 *
 * Source: https://github.com/mihakralj/pinescript/blob/c4e91b962be09733d8fc76caa5191e9e586c5cee/indicators/filters/voss.pine
 * Repo:   mihakralj/pinescript
 * License: MIT
 * SPDX-FileCopyrightText: (c) mihakralj
 * SPDX-FileCopyrightText: (c) 2026 marketcalls (port to openalgo-charts)
 * SPDX-License-Identifier: MIT
 *
 * A two-pole bandpass filter feeds a weighted feedback predictor that removes
 * part of the filter's group delay, so the Voss line leads the bandpass line by
 * roughly the number of bars asked for.
 */

export default function ({ registerIndicator, sourceValues, nulls }) {
  registerIndicator({
    id: 'oa-voss',
    name: 'Ehlers Voss Predictive Filter (VOSS)',
    category: 'Filters',
    placement: 'pane',

    inputs: [
      {
        key: 'period',
        type: 'number',
        label: 'Period',
        default: 20,
        min: 2,
        max: 5000,
        step: 1,
        tooltip: 'Primary cycle period in bars',
      },
      {
        key: 'predict',
        type: 'number',
        label: 'Predict',
        default: 3,
        min: 1,
        max: 100,
        step: 1,
        tooltip: 'Prediction bars (negative delay)',
      },
      {
        key: 'bandwidth',
        type: 'number',
        label: 'Bandwidth',
        default: 0.25,
        min: 0.01,
        max: 0.99,
        step: 0.05,
        tooltip: 'Bandpass tolerance as fraction of period',
      },
      { key: 'source', type: 'source', label: 'Source', default: 'close' },
    ],

    plots: [
      { key: 'filt', type: 'line', title: 'Bandpass', style: { color: '#ff5252', lineWidth: 1 } },
      { key: 'voss', type: 'line', title: 'Voss', style: { color: '#2196f3', lineWidth: 2 } },
    ],

    levels: () => [{ price: 0, title: 'Zero', color: '#787b86', dashed: true }],

    calc(bars, settings) {
      // A cleared number field arrives as '', and Number('') is 0.
      const period = Math.min(5000, Math.max(2, Math.floor(Number(settings.period) || 20)))
      const predict = Math.min(100, Math.max(1, Math.floor(Number(settings.predict) || 3)))
      const rawBandwidth = Number(settings.bandwidth)
      const bandwidth = Number.isFinite(rawBandwidth) && rawBandwidth > 0 ? Math.min(0.99, Math.max(0.01, rawBandwidth)) : 0.25
      const src = sourceValues(bars, settings.source ?? 'close')

      const order = 3 * predict
      const f1 = Math.cos((2 * Math.PI) / period)
      const g1 = Math.cos((bandwidth * 2 * Math.PI) / period)
      // g1 lands exactly on zero only for a degenerate period and bandwidth
      // pair; s1 is then undefined and the filter has nothing to draw.
      const invG1 = g1 !== 0 ? 1 / g1 : NaN
      const s1 = invG1 - Math.sqrt(invG1 * invG1 - 1)

      const filt = new Array(bars.length).fill(NaN)
      const voss = new Array(bars.length).fill(NaN)
      if (!Number.isFinite(s1)) return { filt: nulls(filt), voss: nulls(voss) }

      for (let i = 0; i < bars.length; i++) {
        // Pine: ssrc = nz(src, src[1]), src2 = nz(src[2], ssrc).
        let ssrc = src[i]
        if (!Number.isFinite(ssrc)) ssrc = Number.isFinite(src[i - 1]) ? src[i - 1] : NaN
        const src2 = Number.isFinite(src[i - 2]) ? src[i - 2] : ssrc
        const filt1 = Number.isFinite(filt[i - 1]) ? filt[i - 1] : 0
        const filt2 = Number.isFinite(filt[i - 2]) ? filt[i - 2] : 0

        let filtValue = 0.5 * (1 - s1) * (ssrc - src2) + f1 * (1 + s1) * filt1 - s1 * filt2
        // The source zeroes the filter over the first six bars so the two-pole
        // recursion is not primed by an arbitrary transient.
        if (i <= 5) filtValue = 0
        filt[i] = filtValue

        let sumC = 0
        for (let count = 0; count < order; count++) {
          const idx = order - count
          const past = Number.isFinite(voss[i - idx]) ? voss[i - idx] : 0
          sumC += ((count + 1) / order) * past
        }
        voss[i] = ((3 + order) / 2) * filtValue - sumC
      }

      return { filt: nulls(filt), voss: nulls(voss) }
    },
  })
}
