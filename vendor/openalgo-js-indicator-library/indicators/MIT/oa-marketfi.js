/**
 * MARKETFI: Market Facilitation Index - ported to openalgo-charts from Pine Script v6.
 *
 * Source: https://github.com/mihakralj/pinescript/blob/c4e91b962be09733d8fc76caa5191e9e586c5cee/indicators/oscillators/marketfi.pine
 * Repo:   mihakralj/pinescript
 * License: MIT
 * SPDX-FileCopyrightText: (c) mihakralj
 * SPDX-FileCopyrightText: (c) 2026 marketcalls (port to openalgo-charts)
 * SPDX-License-Identifier: MIT
 *
 * Bill Williams' Market Facilitation Index: the bar's range divided by its
 * volume, so it reads how much price movement each traded unit bought. A high
 * reading on rising volume is an efficient trend; a low one is a squat bar
 * where heavy trade moved price very little.
 */

export default function ({ registerIndicator, nulls }) {
  registerIndicator({
    id: 'oa-marketfi',
    name: 'MARKETFI: Market Facilitation Index',
    category: 'Oscillators',
    placement: 'pane',

    inputs: [],

    plots: [{ key: 'mfi', type: 'line', title: 'MARKETFI', style: { color: '#2962ff', lineWidth: 2 } }],

    levels: () => [{ price: 0, title: 'Zero', color: '#787b86', dashed: true }],

    calc(bars) {
      const n = bars.length
      const mfi = new Array(n).fill(NaN)

      for (let i = 0; i < n; i++) {
        const bar = bars[i]
        const volume = bar.volume
        // Pine guards with `volume != 0 ? (high - low) / volume : 0.0`, and a
        // comparison against an unavailable volume is false in Pine, so a feed
        // that carries no volume at all reads 0 there and reads 0 here. The
        // zero is the source's own "no market activity" result, not a warmup.
        if (!Number.isFinite(volume) || volume === 0) {
          mfi[i] = 0
          continue
        }
        const range = bar.high - bar.low
        mfi[i] = Number.isFinite(range) ? range / volume : 0
      }

      return { mfi: nulls(mfi) }
    },
  })
}
