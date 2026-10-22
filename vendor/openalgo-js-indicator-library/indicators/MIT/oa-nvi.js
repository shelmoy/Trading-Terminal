/**
 * Negative Volume Index (NVI) - ported to openalgo-charts from Pine Script v6.
 *
 * Source: https://github.com/mihakralj/pinescript/blob/c4e91b962be09733d8fc76caa5191e9e586c5cee/indicators/volume/nvi.pine
 * Repo:   mihakralj/pinescript
 * License: MIT (c) mihakralj
 * SPDX-FileCopyrightText: (c) mihakralj
 * SPDX-FileCopyrightText: (c) 2026 marketcalls (port to openalgo-charts)
 * SPDX-License-Identifier: MIT
 *
 * A cumulative index starting at 100 that compounds the price change only on
 * bars whose volume fell against the previous bar, and holds flat otherwise.
 */

export default function ({ registerIndicator, sourceValues, nulls }) {
  registerIndicator({
    id: 'oa-nvi',
    name: 'Negative Volume Index (NVI)',
    category: 'Volume',
    placement: 'pane',

    inputs: [{ key: 'source', type: 'source', label: 'Price Source', default: 'close' }],

    plots: [{ key: 'nvi', type: 'line', title: 'NVI', style: { color: '#ffeb3b', lineWidth: 2 } }],

    calc(bars, settings) {
      const src = sourceValues(bars, settings.source ?? 'close')
      const n = bars.length

      const out = new Array(n).fill(NaN)
      // The source calls nvi() with its default start_value of 100.
      let nviValue = 100

      for (let i = 0; i < n; i++) {
        const value = src[i]
        const vol = bars[i].volume
        const prevValue = i > 0 ? src[i - 1] : NaN
        const prevVol = i > 0 ? bars[i - 1].volume : NaN

        // Volume is absent on index and computed series; Pine's na test then
        // leaves the index flat rather than dividing by nothing.
        const usable =
          Number.isFinite(value) &&
          Number.isFinite(vol) &&
          Number.isFinite(prevValue) &&
          Number.isFinite(prevVol) &&
          prevValue !== 0 &&
          prevVol > 0

        if (usable && vol < prevVol) {
          nviValue = (nviValue * value) / prevValue
        }

        if (Number.isFinite(nviValue)) out[i] = nviValue
      }

      return { nvi: nulls(out) }
    },
  })
}
