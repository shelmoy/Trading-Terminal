/**
 * Accumulation/Distribution Line (ADL) - ported to openalgo-charts from Pine Script v6.
 *
 * Source: https://github.com/mihakralj/pinescript/blob/c4e91b962be09733d8fc76caa5191e9e586c5cee/indicators/volume/adl.pine
 * Repo:   mihakralj/pinescript
 * License: MIT (c) mihakralj
 * SPDX-FileCopyrightText: (c) mihakralj
 * SPDX-FileCopyrightText: (c) 2026 marketcalls (port to openalgo-charts)
 * SPDX-License-Identifier: MIT
 *
 * Running total of volume signed by where the close sits inside the bar's
 * range, so the line rises while buying absorbs the range and falls while
 * selling does.
 */

export default function ({ registerIndicator, nulls }) {
  registerIndicator({
    id: 'oa-adl',
    name: 'Accumulation/Distribution Line (ADL)',
    category: 'Volume',
    placement: 'pane',

    inputs: [],

    plots: [{ key: 'adl', type: 'line', title: 'ADL', style: { color: '#ffeb3b', lineWidth: 2 } }],

    calc(bars) {
      const n = bars.length
      const out = new Array(n).fill(NaN)
      let cumulative = 0

      for (let i = 0; i < n; i++) {
        const bar = bars[i]
        const high = bar.high
        const low = bar.low
        const close = bar.close
        const volume = bar.volume

        // Money flow multiplier, zero on a bar with no range (guards the divide).
        let mfm = 0
        if (Number.isFinite(high) && Number.isFinite(low) && Number.isFinite(close)) {
          mfm = close - low - (high - close)
          mfm = high !== low ? mfm / (high - low) : 0
        }

        // Index series carry no volume; Pine treats a missing volume as no flow,
        // which leaves the line flat rather than blanking it.
        const mfv = Number.isFinite(volume) ? volume * mfm : 0
        cumulative += mfv
        out[i] = Number.isFinite(cumulative) ? cumulative : NaN
      }

      return { adl: nulls(out) }
    },
  })
}
