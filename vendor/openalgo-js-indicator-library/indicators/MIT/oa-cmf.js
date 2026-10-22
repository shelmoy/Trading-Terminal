/**
 * Chaikin Money Flow (CMF) - ported to openalgo-charts from Pine Script v6.
 *
 * Source: https://github.com/mihakralj/pinescript/blob/c4e91b962be09733d8fc76caa5191e9e586c5cee/indicators/volume/cmf.pine
 * Repo:   mihakralj/pinescript
 * License: MIT
 * SPDX-FileCopyrightText: (c) mihakralj
 * SPDX-FileCopyrightText: (c) 2026 marketcalls (port to openalgo-charts)
 * SPDX-License-Identifier: MIT
 *
 * Volume weighted by where each bar closes inside its own range, summed over a
 * window and divided by the volume of that window, so the reading is the share
 * of recent volume that traded on the buying side.
 */

export default function ({ registerIndicator, nulls }) {
  registerIndicator({
    id: 'oa-cmf',
    name: 'Chaikin Money Flow (CMF)',
    category: 'Volume',
    placement: 'pane',

    inputs: [
      { key: 'length', type: 'number', label: 'Length', default: 20, min: 1, max: 5000, step: 1 },
    ],

    plots: [
      { key: 'cmf', type: 'line', title: 'CMF', style: { color: '#ffeb3b', lineWidth: 2 } },
    ],

    calc(bars, settings) {
      // A cleared number field arrives as '', and Number('') is 0.
      const len = Math.max(1, Math.floor(Number(settings.length) || 20))
      const n = bars.length

      const mfv = new Array(n).fill(0)
      const vols = new Array(n).fill(0)
      const out = new Array(n).fill(NaN)

      // The source keeps two running sums and subtracts the value `len` bars
      // back once bar_index reaches len. Before that the window is still
      // filling, so the sums cover every bar so far and the source emits a
      // value from the very first bar rather than a warmup gap.
      let sumMfv = 0
      let sumVol = 0

      for (let i = 0; i < n; i++) {
        const b = bars[i]
        const h = b.high
        const l = b.low
        const c = b.close

        // Money Flow Multiplier. The source leaves it at 0 when any of the
        // three prices is missing, and when the bar has no range at all.
        let mult = 0
        if (Number.isFinite(h) && Number.isFinite(l) && Number.isFinite(c)) {
          mult = h !== l ? ((c - l) - (h - c)) / (h - l) : 0
        }

        // Volume is genuinely optional on index series and computed charts.
        // The source already treats a missing volume as contributing nothing.
        const v = Number.isFinite(b.volume) ? b.volume : 0

        mfv[i] = mult * v
        vols[i] = v

        sumMfv += mfv[i] - (i >= len ? mfv[i - len] : 0)
        sumVol += vols[i] - (i >= len ? vols[i - len] : 0)

        // Guarded divide: a window with no volume reads 0, as in the source.
        out[i] = sumVol !== 0 ? sumMfv / sumVol : 0
      }

      return { cmf: nulls(out) }
    },
  })
}
