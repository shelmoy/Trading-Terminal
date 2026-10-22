/**
 * Efficiency Ratio (ER) - ported to openalgo-charts from Pine Script v6.
 *
 * Source: https://github.com/mihakralj/pinescript/blob/c4e91b962be09733d8fc76caa5191e9e586c5cee/indicators/oscillators/er.pine
 * Repo:   mihakralj/pinescript
 * License: MIT (c) mihakralj
 * SPDX-FileCopyrightText: (c) mihakralj
 * SPDX-FileCopyrightText: (c) 2026 marketcalls (port to openalgo-charts)
 * SPDX-License-Identifier: MIT
 *
 * Kaufman's signal-to-noise measure: the net move over the period divided by
 * the sum of every bar-to-bar move in it, so 1 is a straight trend and 0 is
 * pure chop.
 */

export default function ({ registerIndicator, sourceValues, nulls }) {
  registerIndicator({
    id: 'oa-er',
    name: 'Efficiency Ratio (ER)',
    category: 'Oscillators',
    placement: 'pane',

    inputs: [
      { key: 'source', type: 'source', label: 'Source', default: 'close' },
      { key: 'period', type: 'number', label: 'Period', default: 10, min: 1, max: 500, step: 1 },
    ],

    plots: [{ key: 'er', type: 'line', title: 'ER', style: { color: '#ffeb3b', lineWidth: 2 } }],

    levels: () => [{ price: 0.5, title: 'Midline', color: '#9e9e9e', dashed: true }],

    calc(bars, settings) {
      // A cleared number field arrives as '', and Number('') is 0.
      const period = Math.max(1, Math.min(500, Math.floor(Number(settings.period) || 10)))
      const src = sourceValues(bars, settings.source ?? 'close')

      const out = new Array(bars.length).fill(NaN)
      const current = new Array(bars.length)
      const absChange = new Array(bars.length)
      // The source keeps a running sum over a ring of period slots and emits a
      // real 0 before the window is full rather than na, so the plot starts at
      // the first bar.
      let noiseSum = 0.0
      let prevVal = NaN

      for (let i = 0; i < bars.length; i++) {
        // nz(source): a missing value reads as 0.
        const cur = Number.isFinite(src[i]) ? src[i] : 0
        current[i] = cur
        const change = Number.isFinite(prevVal) ? Math.abs(cur - prevVal) : 0.0
        absChange[i] = change

        // Drop the entry leaving the window, then add this bar's.
        if (i - period >= 0) noiseSum -= absChange[i - period]
        noiseSum += change

        // The net move is only measured once period bars have gone by.
        const signal = i >= period ? Math.abs(cur - current[i - period]) : 0.0
        const result = noiseSum !== 0.0 && Number.isFinite(noiseSum) ? signal / noiseSum : 0.0
        out[i] = Math.max(0.0, Math.min(1.0, result))

        prevVal = cur
      }

      return { er: nulls(out) }
    },
  })
}
