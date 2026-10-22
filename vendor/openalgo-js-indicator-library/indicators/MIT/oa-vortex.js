/**
 * Vortex Indicator - ported to openalgo-charts from Pine Script v6.
 *
 * Source: https://github.com/mihakralj/pinescript/blob/c4e91b962be09733d8fc76caa5191e9e586c5cee/indicators/dynamics/vortex.pine
 * Repo:   mihakralj/pinescript
 * License: MIT
 * SPDX-FileCopyrightText: (c) mihakralj
 * SPDX-FileCopyrightText: (c) 2026 marketcalls (port to openalgo-charts)
 * SPDX-License-Identifier: MIT
 *
 * VI+ and VI- compare the distance travelled up against the distance travelled
 * down over the window, each normalised by true range, so a crossover marks the
 * point where one direction starts covering more ground than the other.
 */

export default function ({ registerIndicator, nulls }) {
  registerIndicator({
    id: 'oa-vortex',
    name: 'Vortex Indicator',
    category: 'Dynamics',
    placement: 'pane',

    inputs: [{ key: 'period', type: 'number', label: 'Period', default: 14, min: 1, max: 5000, step: 1 }],

    plots: [
      { key: 'viPlus', type: 'line', title: 'VI+', style: { color: '#4caf50', lineWidth: 2 } },
      { key: 'viMinus', type: 'line', title: 'VI-', style: { color: '#ff5252', lineWidth: 2 } },
    ],

    levels: () => [{ price: 1, title: 'Reference', color: '#787b86', dashed: true }],

    calc(bars, settings) {
      // A cleared number field arrives as '', and Number('') is 0.
      const period = Math.max(1, Math.floor(Number(settings.period) || 14))
      const n = bars.length

      const vmPlusBuf = new Array(n).fill(0)
      const vmMinusBuf = new Array(n).fill(0)
      const trBuf = new Array(n).fill(0)
      const viPlus = new Array(n).fill(NaN)
      const viMinus = new Array(n).fill(NaN)

      // Pine seeds its ring buffer with na, so the sums grow over the first
      // `period` bars and only then start dropping the oldest entry.
      let sumVMPlus = 0
      let sumVMMinus = 0
      let sumTR = 0

      for (let i = 0; i < n; i++) {
        const bar = bars[i]
        const prev = i > 0 ? bars[i - 1] : null
        const prevClose = prev && Number.isFinite(prev.close) ? prev.close : null
        const prevHigh = prev && Number.isFinite(prev.high) ? prev.high : null
        const prevLow = prev && Number.isFinite(prev.low) ? prev.low : null

        const tr1 = bar.high - bar.low
        const tr2 = prevClose === null ? 0 : Math.abs(bar.high - prevClose)
        const tr3 = prevClose === null ? 0 : Math.abs(bar.low - prevClose)
        const tr = Math.max(tr1, Math.max(tr2, tr3))

        const vmPlus = prevLow === null ? tr : Math.abs(bar.high - prevLow)
        const vmMinus = prevHigh === null ? tr : Math.abs(bar.low - prevHigh)

        vmPlusBuf[i] = vmPlus
        vmMinusBuf[i] = vmMinus
        trBuf[i] = tr

        const drop = i - period
        if (drop >= 0) {
          sumVMPlus -= vmPlusBuf[drop]
          sumVMMinus -= vmMinusBuf[drop]
          sumTR -= trBuf[drop]
        }
        sumVMPlus += vmPlus
        sumVMMinus += vmMinus
        sumTR += tr

        // A halted or flat instrument gives a zero range: Pine returns 0 there.
        viPlus[i] = sumTR > 0 ? sumVMPlus / sumTR : 0
        viMinus[i] = sumTR > 0 ? sumVMMinus / sumTR : 0
      }

      return { viPlus: nulls(viPlus), viMinus: nulls(viMinus) }
    },
  })
}
