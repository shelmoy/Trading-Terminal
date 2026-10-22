/**
 * Price Volume Rank (PVR) - ported to openalgo-charts from Pine Script v6.
 *
 * Source: https://github.com/mihakralj/pinescript/blob/c4e91b962be09733d8fc76caa5191e9e586c5cee/indicators/volume/pvr.pine
 * Repo:   mihakralj/pinescript
 * License: MIT
 * SPDX-FileCopyrightText: (c) mihakralj
 * SPDX-FileCopyrightText: (c) 2026 marketcalls (port to openalgo-charts)
 * SPDX-License-Identifier: MIT
 *
 * Classifies each bar into one of four cases by whether price and volume rose
 * or fell together: 1 and 3 are the confirmed moves, 2 and 4 the divergent ones,
 * and 0 marks an unchanged price.
 */

export default function ({ registerIndicator, sourceValues, nulls }) {
  registerIndicator({
    id: 'oa-pvr',
    name: 'Price Volume Rank (PVR)',
    category: 'Volume',
    placement: 'pane',

    inputs: [{ key: 'source', type: 'source', label: 'Price Source', default: 'close' }],

    plots: [
      { key: 'pvr', type: 'step', title: 'PVR', style: { color: '#ffeb3b', lineWidth: 2 } },
    ],

    calc(bars, settings) {
      const src = sourceValues(bars, settings.source ?? 'close')
      const n = bars.length
      const out = new Array(n).fill(NaN)

      let prevP = NaN
      let prevV = NaN

      for (let i = 0; i < n; i++) {
        // nz(price, close) and nz(vol, 0.0): index series carry no volume, so
        // a missing one reads as zero rather than blanking the study.
        const raw = src[i]
        const close = bars[i].close
        const p = Number.isFinite(raw) ? raw : Number.isFinite(close) ? close : NaN
        const rawVol = bars[i].volume
        const v = Number.isFinite(rawVol) ? rawVol : 0

        // nz(p[1], p) / nz(v[1], v): the first bar compares with itself, so it
        // ranks 0 rather than starting with a gap.
        const pp = Number.isFinite(prevP) ? prevP : p
        const pv = Number.isFinite(prevV) ? prevV : v

        if (Number.isFinite(p) && Number.isFinite(pp)) {
          if (p > pp) out[i] = v > pv ? 1 : 2
          else if (p < pp) out[i] = v < pv ? 3 : 4
          else out[i] = 0
        }

        prevP = p
        prevV = v
      }

      return { pvr: nulls(out) }
    },
  })
}
