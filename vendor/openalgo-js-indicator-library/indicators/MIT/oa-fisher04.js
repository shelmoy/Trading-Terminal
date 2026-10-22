/**
 * Fisher04 - Ehlers 2004 Cybernetic Analysis - ported to openalgo-charts from Pine Script v6.
 *
 * Source: https://github.com/mihakralj/pinescript/blob/c4e91b962be09733d8fc76caa5191e9e586c5cee/indicators/oscillators/fisher04.pine
 * Repo:   mihakralj/pinescript
 * License: MIT (c) mihakralj
 * SPDX-FileCopyrightText: (c) mihakralj
 * SPDX-FileCopyrightText: (c) 2026 marketcalls (port to openalgo-charts)
 * SPDX-License-Identifier: MIT
 *
 * Normalises the midpoint price inside its recent range, smooths it, then runs
 * it through the Fisher transform so the tails stretch out and turning points
 * read as sharp peaks. The signal line is the previous bar's Fisher value.
 */

export default function ({ registerIndicator, sourceValues, highest, lowest, nulls }) {
  registerIndicator({
    id: 'oa-fisher04',
    name: 'Fisher04 - Ehlers 2004 Cybernetic Analysis',
    category: 'Oscillators',
    placement: 'pane',

    inputs: [{ key: 'length', type: 'number', label: 'Length', default: 10, min: 1, max: 5000, step: 1 }],

    plots: [
      { key: 'fisher', type: 'line', title: 'Fisher04', style: { color: '#ffeb3b', lineWidth: 2 } },
      { key: 'signal', type: 'line', title: 'Signal', style: { color: '#ff9800', lineWidth: 1 } },
    ],

    levels: () => [{ price: 0, title: 'Zero', color: '#787b86', lineStyle: 'dotted' }],

    calc(bars, settings) {
      // A cleared number field arrives as '', and Number('') is 0.
      const length = Math.max(1, Math.floor(Number(settings.length) || 10))
      // The script hard-codes hl2 as its price, with no source input.
      const price = sourceValues(bars, 'hl2')

      const maxH = highest(price, length)
      const minL = lowest(price, length)

      const fisherOut = new Array(bars.length).fill(NaN)
      const signalOut = new Array(bars.length).fill(NaN)

      // var state carried across bars.
      let value1 = 0
      let fisher = 0

      for (let i = 0; i < bars.length; i++) {
        const span = maxH[i] - minL[i]
        // In Pine a comparison against na is na, and `if na` takes the else
        // branch, so the warmup bars fall through to value1 := 0.0.
        if (Number.isFinite(span) && span !== 0 && Number.isFinite(price[i])) {
          value1 = (price[i] - minL[i]) / span - 0.5 + 0.5 * value1
        } else {
          value1 = 0
        }

        // Ehlers clamps to +/- 0.9999, which also keeps the log argument finite.
        value1 = Math.max(Math.min(value1, 0.9999), -0.9999)

        // signal := fisher happens before fisher is updated, so the signal line
        // is the previous bar's Fisher value.
        signalOut[i] = fisher
        fisher = 0.25 * Math.log((1 + value1) / (1 - value1)) + 0.5 * fisher
        fisherOut[i] = fisher
      }

      return { fisher: nulls(fisherOut), signal: nulls(signalOut) }
    },
  })
}
