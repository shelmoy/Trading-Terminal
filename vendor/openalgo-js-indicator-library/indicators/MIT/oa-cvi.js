/**
 * Chaikin's Volatility (CVI) - ported to openalgo-charts from Pine Script v6.
 *
 * Source: https://github.com/mihakralj/pinescript/blob/c4e91b962be09733d8fc76caa5191e9e586c5cee/indicators/volatility/cvi.pine
 * Repo:   mihakralj/pinescript
 * License: MIT
 * SPDX-FileCopyrightText: (c) mihakralj
 * SPDX-FileCopyrightText: (c) 2026 marketcalls (port to openalgo-charts)
 * SPDX-License-Identifier: MIT
 *
 * The high-low range is smoothed with an exponential average and then read as
 * a rate of change, so the reading rises while daily ranges are expanding and
 * falls while they contract.
 */

export default function ({ registerIndicator, nulls }) {
  // A cleared field arrives as '', and Number('') is 0, which would silently
  // replace a deliberate value. Fall back only when the field is truly empty.
  const numOr = (v, fallback) => {
    if (v === '' || v === null || v === undefined) return fallback
    const n = Number(v)
    return Number.isFinite(n) ? n : fallback
  }

  registerIndicator({
    id: 'oa-cvi',
    name: 'Chaikin\'s Volatility (CVI)',
    category: 'Volatility',
    placement: 'pane',

    inputs: [
      {
        key: 'rocLength',
        type: 'number',
        label: 'ROC Length',
        default: 10,
        min: 1,
        max: 500,
        step: 1,
        tooltip: 'Period for Rate of Change calculation',
      },
      {
        key: 'smoothLength',
        type: 'number',
        label: 'Smoothing Length',
        default: 10,
        min: 1,
        max: 500,
        step: 1,
        tooltip: 'Period for EMA smoothing of high-low range',
      },
    ],

    plots: [
      { key: 'cvi', type: 'line', title: 'CVI', style: { color: '#ffeb3b', lineWidth: 2 } },
      {
        key: 'zero',
        type: 'line-markers',
        title: 'Zero',
        style: { color: '#787b86', lineWidth: 1, markersOnly: true, markerRadius: 2 },
      },
    ],

    calc(bars, settings) {
      const n = bars.length
      const rocLength = Math.max(1, Math.min(500, Math.floor(numOr(settings.rocLength, 10))))
      const smoothLength = Math.max(1, Math.min(500, Math.floor(numOr(settings.smoothLength, 10))))

      const out = new Array(n).fill(NaN)
      const zero = new Array(n).fill(0)
      if (n === 0) return { cvi: nulls(out), zero }

      const alpha = 2.0 / (smoothLength + 1)
      const emaArr = new Array(n).fill(NaN)

      // On the first bar the source seeds the average from the sum of the last
      // smoothLength ranges. Only the current bar exists there, so every other
      // term is nz() to zero and the seed is that one range divided by the
      // smoothing length.
      const range0 = Number.isFinite(bars[0].high - bars[0].low) ? bars[0].high - bars[0].low : 0
      let prevEma = range0 / smoothLength

      for (let i = 0; i < n; i++) {
        const hl = bars[i].high - bars[i].low
        const hlRange = Number.isFinite(hl) ? hl : 0
        const value = (hlRange - prevEma) * alpha + prevEma
        emaArr[i] = value
        prevEma = value

        // The source leaves the reading na until rocLength bars have passed.
        if (i >= rocLength) {
          const past = emaArr[i - rocLength]
          if (Number.isFinite(past) && past !== 0) {
            out[i] = ((value - past) / past) * 100
          }
        }
      }

      return { cvi: nulls(out), zero }
    },
  })
}
