/**
 * Positive Volume Index (PVI) - ported to openalgo-charts from Pine Script v6.
 *
 * Source: https://github.com/mihakralj/pinescript/blob/c4e91b962be09733d8fc76caa5191e9e586c5cee/indicators/volume/pvi.pine
 * Repo:   mihakralj/pinescript
 * License: MIT (c) mihakralj
 * SPDX-FileCopyrightText: (c) mihakralj
 * SPDX-FileCopyrightText: (c) 2026 marketcalls (port to openalgo-charts)
 * SPDX-License-Identifier: MIT
 *
 * A cumulative index that compounds the price return only on bars whose
 * volume rose against the previous bar, so it tracks what the crowd did on
 * the busy sessions and stays flat on the quiet ones.
 */

export default function ({ registerIndicator, sourceValues, nulls }) {
  // The Pine function takes start_value as a parameter and the main block
  // calls it with the default, so the series always starts at 100.
  const START_VALUE = 100

  registerIndicator({
    id: 'oa-pvi',
    name: 'Positive Volume Index (PVI)',
    category: 'Volume',
    placement: 'pane',

    inputs: [
      { key: 'source', type: 'source', label: 'Price Source', default: 'close' },
    ],

    plots: [{ key: 'pvi', type: 'line', title: 'PVI', style: { color: '#ffeb3b', lineWidth: 2 } }],

    calc(bars, settings) {
      const src = sourceValues(bars, settings.source ?? 'close')

      const out = new Array(bars.length).fill(NaN)
      let pvi = START_VALUE

      for (let i = 0; i < bars.length; i++) {
        const price = src[i]
        const prevPrice = i > 0 ? src[i - 1] : NaN
        // Index series carry no volume at all, so this can be undefined.
        const vol = Number(bars[i].volume)
        const prevVol = i > 0 ? Number(bars[i - 1].volume) : NaN

        const usable =
          Number.isFinite(price) &&
          Number.isFinite(vol) &&
          Number.isFinite(prevPrice) &&
          Number.isFinite(prevVol) &&
          prevPrice !== 0 &&
          prevVol > 0

        if (usable && vol > prevVol) pvi = (pvi * price) / prevPrice
        out[i] = pvi
      }

      return { pvi: nulls(out) }
    },
  })
}
