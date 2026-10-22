/**
 * Detrended Price Oscillator (DPO) - ported to openalgo-charts from Pine Script v6.
 *
 * Source: https://github.com/mihakralj/pinescript/blob/c4e91b962be09733d8fc76caa5191e9e586c5cee/indicators/oscillators/dpo.pine
 * Repo:   mihakralj/pinescript
 * License: MIT (c) mihakralj
 * SPDX-FileCopyrightText: (c) mihakralj
 * SPDX-FileCopyrightText: (c) 2026 marketcalls (port to openalgo-charts)
 * SPDX-License-Identifier: MIT
 *
 * Price minus a simple moving average displaced back by half the period plus
 * one, which strips the trend out and leaves the shorter cycle around it.
 */

export default function ({ registerIndicator, sourceValues, nulls }) {
  registerIndicator({
    id: 'oa-dpo',
    name: 'Detrended Price Oscillator (DPO)',
    category: 'Oscillators',
    placement: 'pane',

    inputs: [
      { key: 'source', type: 'source', label: 'Source', default: 'close' },
      { key: 'period', type: 'number', label: 'Period', default: 20, min: 1, max: 5000, step: 1 },
    ],

    plots: [{ key: 'dpo', type: 'line', title: 'DPO', style: { color: '#ffeb3b', lineWidth: 2 } }],

    levels: () => [{ price: 0, title: 'Zero Line', color: '#787b86', lineStyle: 'dotted' }],

    calc(bars, settings) {
      // A cleared number field arrives as '', and Number('') is 0.
      const period = Math.max(1, Math.floor(Number(settings.period) || 20))
      const src = sourceValues(bars, settings.source ?? 'close')
      const n = bars.length
      const displacement = Math.floor(period / 2) + 1

      // Pine sums nz(source[i], source) over the window, so bars that reach back
      // past the start of the series are filled with the current bar's value
      // rather than dropped. That makes the average finite from bar 0.
      // Prefix sums keep it O(n) instead of O(n * period); the parallel count of
      // non-finite entries lets the same fill be applied to gaps inside the window.
      const prefixSum = new Array(n + 1).fill(0)
      const prefixMissing = new Array(n + 1).fill(0)
      for (let i = 0; i < n; i++) {
        const finite = Number.isFinite(src[i])
        prefixSum[i + 1] = prefixSum[i] + (finite ? src[i] : 0)
        prefixMissing[i + 1] = prefixMissing[i] + (finite ? 0 : 1)
      }

      const paddedSma = new Array(n).fill(NaN)
      for (let i = 0; i < n; i++) {
        const cur = src[i]
        if (!Number.isFinite(cur)) continue
        const lo = Math.max(0, i - period + 1)
        const inWindow = i - lo + 1
        const filled = period - inWindow + (prefixMissing[i + 1] - prefixMissing[lo])
        paddedSma[i] = (prefixSum[i + 1] - prefixSum[lo] + filled * cur) / period
      }

      // sma[displacement] is na for the first `displacement` bars, so the Pine
      // result stays na there too.
      const out = new Array(n).fill(NaN)
      for (let i = displacement; i < n; i++) {
        const cur = src[i]
        const displaced = paddedSma[i - displacement]
        if (!Number.isFinite(cur) || !Number.isFinite(displaced)) continue
        out[i] = cur - displaced
      }

      return { dpo: nulls(out) }
    },
  })
}
