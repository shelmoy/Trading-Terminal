/**
 * Volume Weighted Accumulation/Distribution (VWAD) - ported to openalgo-charts from Pine Script v6.
 *
 * Source: https://github.com/mihakralj/pinescript/blob/c4e91b962be09733d8fc76caa5191e9e586c5cee/indicators/volume/vwad.pine
 * Repo:   mihakralj/pinescript
 * License: MIT (c) mihakralj
 * SPDX-FileCopyrightText: (c) mihakralj
 * SPDX-FileCopyrightText: (c) 2026 marketcalls (port to openalgo-charts)
 * SPDX-License-Identifier: MIT
 *
 * A running total of the money flow multiplier, weighted twice by volume: once
 * by the bar's own volume and again by that volume's share of the recent
 * rolling total, so a heavy bar counts for far more than a quiet one.
 */

export default function ({ registerIndicator, nulls }) {
  registerIndicator({
    id: 'oa-vwad',
    name: 'Volume Weighted Accumulation/Distribution (VWAD)',
    category: 'Volume',
    placement: 'pane',

    inputs: [
      {
        key: 'period',
        type: 'number',
        label: 'Volume Weight Period',
        default: 20,
        min: 1,
        max: 5000,
        step: 1,
        tooltip: 'Lookback over which each bar volume is measured against the rolling volume total.',
      },
    ],

    plots: [{ key: 'vwad', type: 'line', title: 'VWAD', style: { color: '#ffeb3b', lineWidth: 2 } }],

    calc(bars, settings) {
      // A cleared number field arrives as '', and Number('') is 0.
      const period = Math.max(1, Math.min(5000, Math.floor(Number(settings.period) || 20)))

      const volBuffer = new Array(period).fill(NaN)
      let head = 0
      let sumVol = 0
      let cumVwad = 0

      const out = new Array(bars.length).fill(NaN)
      for (let i = 0; i < bars.length; i++) {
        const bar = bars[i]

        const oldVol = volBuffer[head]
        if (Number.isFinite(oldVol)) sumVol -= oldVol
        // Index series carry no volume at all, and Pine reads it through nz().
        const currentVol = Number.isFinite(bar.volume) ? bar.volume : 0
        sumVol += currentVol
        volBuffer[head] = currentVol
        head = (head + 1) % period

        let mfm = 0
        if (Number.isFinite(bar.high) && Number.isFinite(bar.low) && Number.isFinite(bar.close)) {
          const raw = bar.close - bar.low - (bar.high - bar.close)
          mfm = bar.high !== bar.low ? raw / (bar.high - bar.low) : 0
        }

        const volWeight = sumVol > 0 ? currentVol / sumVol : 0
        const weightedMfv = currentVol * mfm * volWeight
        if (Number.isFinite(weightedMfv)) cumVwad += weightedMfv
        out[i] = cumVwad
      }

      return { vwad: nulls(out) }
    },
  })
}
