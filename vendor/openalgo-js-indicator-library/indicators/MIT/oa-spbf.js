/**
 * Ehlers Super Passband Filter (SPBF) - ported to openalgo-charts from Pine Script v6.
 *
 * Source: https://github.com/mihakralj/pinescript/blob/c4e91b962be09733d8fc76caa5191e9e586c5cee/indicators/filters/spbf.pine
 * Repo:   mihakralj/pinescript
 * License: MIT (c) mihakralj
 * SPDX-FileCopyrightText: (c) mihakralj
 * SPDX-FileCopyrightText: (c) 2026 marketcalls (port to openalgo-charts)
 * SPDX-License-Identifier: MIT
 *
 * A wide-band passband oscillator built from the difference of two
 * z-transformed exponential filters, with an RMS envelope of its own recent
 * output as the trigger level.
 */

export default function ({ registerIndicator, sourceValues, nulls }) {
  registerIndicator({
    id: 'oa-spbf',
    name: 'Ehlers Super Passband Filter (SPBF)',
    category: 'Filters',
    placement: 'pane',

    inputs: [
      {
        key: 'shortPeriod',
        type: 'number',
        label: 'Short Period',
        default: 40,
        min: 1,
        max: 5000,
        step: 1,
        tooltip: 'Short EMA period (alpha = 5/period)',
      },
      {
        key: 'longPeriod',
        type: 'number',
        label: 'Long Period',
        default: 60,
        min: 1,
        max: 5000,
        step: 1,
        tooltip: 'Long EMA period (alpha = 5/period)',
      },
      {
        key: 'rmsPeriod',
        type: 'number',
        label: 'RMS Period',
        default: 50,
        min: 1,
        max: 5000,
        step: 1,
        tooltip: 'RMS averaging period for trigger envelope',
      },
      { key: 'source', type: 'source', label: 'Source', default: 'close' },
    ],

    plots: [
      { key: 'pb', type: 'line', title: 'SuperPB', style: { color: '#2196f3', lineWidth: 2 } },
      { key: 'rmsUpper', type: 'line', title: '+RMS', style: { color: '#ff5252', lineWidth: 1 } },
      { key: 'rmsLower', type: 'line', title: '-RMS', style: { color: '#4caf50', lineWidth: 1 } },
    ],

    levels: () => [{ price: 0, title: 'Zero', color: '#787b86', dashed: true }],

    calc(bars, settings) {
      // A cleared number field arrives as '', and Number('') is 0.
      const shortPeriod = Math.max(1, Math.floor(Number(settings.shortPeriod) || 40))
      const longPeriod = Math.max(1, Math.floor(Number(settings.longPeriod) || 60))
      const rmsPeriod = Math.max(1, Math.floor(Number(settings.rmsPeriod) || 50))
      const src = sourceValues(bars, settings.source ?? 'close')

      // Ehlers smoothing: alpha = 5/N, more reactive than the usual 2/(N+1).
      const a1 = 5.0 / shortPeriod
      const a2 = 5.0 / longPeriod
      const cSrc = a1 - a2
      const cSrc1 = a2 * (1.0 - a1) - a1 * (1.0 - a2)
      const cPb1 = (1.0 - a1) + (1.0 - a2)
      const cPb2 = (1.0 - a1) * (1.0 - a2)

      const pb = new Array(bars.length).fill(NaN)
      const rmsUpper = new Array(bars.length).fill(NaN)
      const rmsLower = new Array(bars.length).fill(NaN)

      // Rolling sum of the squared passband values; a bar outside the window
      // contributes 0, which is what nz(pb[i], 0.0) does in Pine.
      const squares = new Array(bars.length).fill(0)
      let running = 0

      for (let i = 0; i < bars.length; i++) {
        const cur = Number.isFinite(src[i]) ? src[i] : NaN
        const prev = i > 0 && Number.isFinite(src[i - 1]) ? src[i - 1] : NaN
        const ssrc = Number.isFinite(cur) ? cur : prev
        const src1 = Number.isFinite(prev) ? prev : ssrc
        const pb1 = i > 0 && Number.isFinite(pb[i - 1]) ? pb[i - 1] : 0
        const pb2 = i > 1 && Number.isFinite(pb[i - 2]) ? pb[i - 2] : 0

        pb[i] = cSrc * ssrc + cSrc1 * src1 + cPb1 * pb1 - cPb2 * pb2

        squares[i] = Number.isFinite(pb[i]) ? pb[i] * pb[i] : 0
        running += squares[i]
        if (i >= rmsPeriod) running -= squares[i - rmsPeriod]
        const rms = Math.sqrt(Math.max(0, running) / rmsPeriod)
        rmsUpper[i] = rms
        rmsLower[i] = -rms
      }

      return { pb: nulls(pb), rmsUpper: nulls(rmsUpper), rmsLower: nulls(rmsLower) }
    },
  })
}
