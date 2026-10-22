/**
 * Average Daily Range (ADR) - ported to openalgo-charts from Pine Script v6.
 *
 * Source: https://github.com/mihakralj/pinescript/blob/c4e91b962be09733d8fc76caa5191e9e586c5cee/indicators/volatility/adr.pine
 * Repo:   mihakralj/pinescript
 * License: MIT
 * SPDX-FileCopyrightText: (c) mihakralj
 * SPDX-FileCopyrightText: (c) 2026 marketcalls (port to openalgo-charts)
 * SPDX-License-Identifier: MIT
 *
 * The plain high-minus-low range of each bar, smoothed by a choice of SMA, a
 * bias-compensated EMA or a WMA. It measures how far an instrument travels in a
 * bar without the gap component that true range carries.
 */

export default function ({ registerIndicator, nulls }) {
  registerIndicator({
    id: 'oa-adr',
    name: 'Average Daily Range (ADR)',
    category: 'Volatility',
    placement: 'pane',

    inputs: [
      {
        key: 'length',
        type: 'number',
        label: 'Length',
        default: 14,
        min: 1,
        max: 500,
        step: 1,
        tooltip: 'Number of bars to average the daily range over',
      },
      {
        key: 'method',
        type: 'number',
        label: 'Method',
        default: 1,
        min: 1,
        max: 3,
        step: 1,
        tooltip: '1 = SMA, 2 = EMA, 3 = WMA',
      },
    ],

    plots: [{ key: 'adr', type: 'line', title: 'ADR', style: { color: '#ffeb3b', lineWidth: 2 } }],

    calc(bars, settings) {
      // A cleared number field arrives as '', and Number('') is 0.
      const length = Math.max(1, Math.min(500, Math.floor(Number(settings.length) || 14)))
      const method = Math.max(1, Math.min(3, Math.floor(Number(settings.method) || 1)))
      const n = bars.length
      const out = new Array(n).fill(NaN)

      // Pine stores the bar range in a circular buffer and nz() reads an unset
      // slot as 0, so a non-finite range is folded to 0 rather than propagated.
      const dayRange = new Array(n)
      for (let i = 0; i < n; i++) {
        const d = bars[i].high - bars[i].low
        dayRange[i] = Number.isFinite(d) ? d : 0
      }

      if (method === 1) {
        // SMA over however many slots are filled, so it emits from bar 0.
        let sum = 0
        let count = 0
        for (let i = 0; i < n; i++) {
          if (i - length >= 0) {
            sum -= dayRange[i - length]
            count -= 1
          }
          sum += dayRange[i]
          count += 1
          out[i] = count > 0 ? sum / count : dayRange[i]
        }
      } else if (method === 2) {
        // EMA with alpha = 1/length (Wilder-style), divided by the running
        // 1 - (1 - alpha)^bars compensator so the warmup is unbiased.
        const EPSILON = 1e-10
        const alpha = 1.0 / length
        let rawEma = 0.0
        let e = 1.0
        for (let i = 0; i < n; i++) {
          rawEma = (rawEma * (length - 1) + dayRange[i]) / length
          e = (1 - alpha) * e
          out[i] = e > EPSILON ? rawEma / (1.0 - e) : rawEma
        }
      } else {
        // WMA: weight length for the newest slot down to 1 for the oldest, over
        // the fixed divisor, so early bars ramp in from below.
        const divisor = (length * (length + 1)) / 2
        for (let i = 0; i < n; i++) {
          let wsum = 0.0
          let weight = length
          for (let k = 0; k < length; k++) {
            const idx = i - k
            wsum += (idx >= 0 ? dayRange[idx] : 0) * weight
            weight -= 1.0
          }
          out[i] = divisor > 0 ? wsum / divisor : NaN
        }
      }

      return { adr: nulls(out) }
    },
  })
}
