/**
 * TTM Scalper Alert - ported to openalgo-charts from Pine Script v6.
 *
 * Source: https://github.com/mihakralj/pinescript/blob/c4e91b962be09733d8fc76caa5191e9e586c5cee/indicators/reversals/ttmscalper.pine
 * Repo:   mihakralj/pinescript
 * License: MIT (c) mihakralj
 * SPDX-FileCopyrightText: (c) mihakralj
 * SPDX-FileCopyrightText: (c) 2026 marketcalls (port to openalgo-charts)
 * SPDX-License-Identifier: MIT
 *
 * Marks the middle bar of a three bar swing: a high that tops both neighbours
 * is a bearish pivot, a low that undercuts both is a bullish one.
 */

export default function ({ registerIndicator, nulls }) {
  const HIGH_COLOR = '#ff5252'
  const LOW_COLOR = '#4caf50'

  registerIndicator({
    id: 'oa-ttmscalper',
    name: 'TTM Scalper Alert',
    category: 'Reversals',
    placement: 'onchart',

    inputs: [
      {
        key: 'useCloses',
        type: 'boolean',
        label: 'Use Closes',
        default: false,
        tooltip: 'Use close prices instead of high and low for pivot detection.',
      },
      { key: 'showHigh', type: 'boolean', label: 'Show Pivot Highs', default: true, tooltip: 'Display bearish pivot markers.' },
      { key: 'showLow', type: 'boolean', label: 'Show Pivot Lows', default: true, tooltip: 'Display bullish pivot markers.' },
    ],

    // Pine draws nothing but plotshape, so these two columns exist to carry the
    // pivot prices to the marker hook rather than to be drawn themselves.
    plots: [
      { key: 'pivotHigh', type: 'line', title: 'Pivot High', style: { color: HIGH_COLOR, visible: false } },
      { key: 'pivotLow', type: 'line', title: 'Pivot Low', style: { color: LOW_COLOR, visible: false } },
    ],

    calc(bars, settings) {
      const n = bars.length
      const useCloses = settings.useCloses === true

      const pivotHigh = new Array(n).fill(NaN)
      const pivotLow = new Array(n).fill(NaN)

      // Pine tests bar_index >= 2 and plots with offset=-1, so a pivot found on
      // bar i belongs to bar i-1, which is the bar it is measured from.
      for (let i = 2; i < n; i++) {
        const upper = useCloses
          ? [bars[i - 2].close, bars[i - 1].close, bars[i].close]
          : [bars[i - 2].high, bars[i - 1].high, bars[i].high]
        const lower = useCloses
          ? [bars[i - 2].close, bars[i - 1].close, bars[i].close]
          : [bars[i - 2].low, bars[i - 1].low, bars[i].low]

        if (upper.every((v) => Number.isFinite(v)) && upper[1] > upper[0] && upper[1] > upper[2]) {
          pivotHigh[i - 1] = upper[1]
        }
        if (lower.every((v) => Number.isFinite(v)) && lower[1] < lower[0] && lower[1] < lower[2]) {
          pivotLow[i - 1] = lower[1]
        }
      }

      return { pivotHigh: nulls(pivotHigh), pivotLow: nulls(pivotLow) }
    },

    markers({ bars, values, settings }) {
      const showHigh = settings.showHigh !== false
      const showLow = settings.showLow !== false
      const out = []
      for (let i = 0; i < bars.length; i++) {
        // location.absolute in Pine, so the shape sits exactly on the pivot
        // price with no padding of its own.
        const ph = values.pivotHigh[i]
        if (showHigh && Number.isFinite(ph)) {
          out.push({
            time: bars[i].time,
            position: 'atPrice',
            price: ph,
            shape: 'triangleDown',
            size: 'small',
            color: HIGH_COLOR,
          })
        }
        const pl = values.pivotLow[i]
        if (showLow && Number.isFinite(pl)) {
          out.push({
            time: bars[i].time,
            position: 'atPrice',
            price: pl,
            shape: 'triangleUp',
            size: 'small',
            color: LOW_COLOR,
          })
        }
      }
      return out
    },
  })
}
