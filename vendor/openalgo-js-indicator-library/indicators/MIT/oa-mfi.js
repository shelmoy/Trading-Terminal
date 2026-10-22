/**
 * Money Flow Index (MFI) - ported to openalgo-charts from Pine Script v6.
 *
 * Source: https://github.com/mihakralj/pinescript/blob/c4e91b962be09733d8fc76caa5191e9e586c5cee/indicators/volume/mfi.pine
 * Repo:   mihakralj/pinescript
 * License: MIT
 * SPDX-FileCopyrightText: (c) mihakralj
 * SPDX-FileCopyrightText: (c) 2026 marketcalls (port to openalgo-charts)
 * SPDX-License-Identifier: MIT
 *
 * A volume-weighted RSI: raw money flow (typical price times volume) is split
 * into the bars that rose and the bars that fell, and the ratio of the two
 * rolling sums is scaled onto 0-100.
 */

export default function ({ registerIndicator, nulls }) {
  registerIndicator({
    id: 'oa-mfi',
    name: 'Money Flow Index (MFI)',
    category: 'Volume',
    placement: 'pane',

    inputs: [{ key: 'length', type: 'number', label: 'MFI Period', default: 14, min: 1, max: 100, step: 1 }],

    plots: [{ key: 'mfi', type: 'line', title: 'MFI', style: { color: '#ffeb3b', lineWidth: 2 } }],

    calc(bars, settings) {
      // A cleared number field arrives as '', and Number('') is 0.
      const len = Math.max(1, Math.floor(Number(settings.length) || 14))
      const n = bars.length
      const out = new Array(n).fill(NaN)

      // Circular buffers seeded with NaN, exactly as the source seeds with na:
      // an unwritten slot is what tells the window it is not yet full.
      const posBuffer = new Array(len).fill(NaN)
      const negBuffer = new Array(len).fill(NaN)
      let head = 0
      let sumPositive = 0
      let sumNegative = 0
      let prevTypical = NaN

      for (let i = 0; i < n; i++) {
        const bar = bars[i]
        const typical = (bar.high + bar.low + bar.close) / 3
        // Volume is absent on index and computed series; Pine reads nz(volume, 0).
        const vol = Number.isFinite(bar.volume) ? bar.volume : 0
        const rawFlow = Number.isFinite(typical) ? typical * vol : 0

        // nz(typical_price[1], typical_price): the first bar compares with itself.
        const prior = Number.isFinite(prevTypical) ? prevTypical : typical
        const isPositive = Number.isFinite(typical) && Number.isFinite(prior) && typical > prior
        const isNegative = Number.isFinite(typical) && Number.isFinite(prior) && typical < prior
        const positiveFlow = isPositive ? rawFlow : 0
        const negativeFlow = isNegative ? rawFlow : 0

        const posOldest = posBuffer[head]
        if (Number.isFinite(posOldest)) {
          sumPositive -= posOldest
          sumNegative -= Number.isFinite(negBuffer[head]) ? negBuffer[head] : 0
        }
        sumPositive += positiveFlow
        sumNegative += negativeFlow
        posBuffer[head] = positiveFlow
        negBuffer[head] = negativeFlow
        head = (head + 1) % len

        // The source returns a ratio of 0 when there is no negative flow, which
        // reads as 0 rather than 100. Kept as written.
        const ratio = sumNegative !== 0 ? sumPositive / sumNegative : 0
        const denom = 1 + ratio
        out[i] = Number.isFinite(denom) && denom !== 0 ? 100 - 100 / denom : NaN

        prevTypical = typical
      }

      return { mfi: nulls(out) }
    },
  })
}
