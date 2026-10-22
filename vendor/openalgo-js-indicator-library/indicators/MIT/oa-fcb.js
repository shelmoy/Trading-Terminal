/**
 * Fractal Chaos Bands (FCB) - ported to openalgo-charts from Pine Script v6.
 *
 * Source: https://github.com/mihakralj/pinescript/blob/c4e91b962be09733d8fc76caa5191e9e586c5cee/indicators/channels/fcb.pine
 * Repo:   mihakralj/pinescript
 * License: MIT (c) mihakralj
 * SPDX-FileCopyrightText: (c) mihakralj
 * SPDX-FileCopyrightText: (c) 2026 marketcalls (port to openalgo-charts)
 * SPDX-License-Identifier: MIT
 *
 * The upper band tracks the highest confirmed fractal high and the lower band the
 * lowest confirmed fractal low over the lookback window, so the channel only moves
 * when a new swing point is printed.
 */

export default function ({ registerIndicator, nulls }) {
  // Monotonic deque, mirroring the source's O(1) amortised highest/lowest. The
  // window is the last `period` bars and it emits from bar 0 on a partial window,
  // exactly as the Pine deque does.
  const rollingExtreme = (values, period, isMax) => {
    const n = values.length
    const out = new Array(n).fill(NaN)
    const deque = new Array(n)
    let front = 0
    let back = 0
    for (let i = 0; i < n; i++) {
      while (back > front && deque[front] <= i - period) front += 1
      while (back > front) {
        const last = values[deque[back - 1]]
        const beaten = isMax ? last <= values[i] : last >= values[i]
        if (!beaten) break
        back -= 1
      }
      deque[back] = i
      back += 1
      out[i] = values[deque[front]]
    }
    return out
  }

  registerIndicator({
    id: 'oa-fcb',
    name: 'Fractal Chaos Bands (FCB)',
    category: 'Channels',
    placement: 'onchart',

    inputs: [
      { key: 'period', type: 'number', label: 'Period', default: 20, min: 1, max: 999, step: 1 },
      {
        key: 'showFractals',
        type: 'boolean',
        label: 'Show Fractal Points',
        default: false,
        tooltip: 'Mark the bars that printed the fractal high or fractal low the bands track.',
      },
    ],

    plots: [
      { key: 'upper', type: 'line', title: 'Upper Band', style: { color: '#ffeb3b', lineWidth: 2 } },
      { key: 'lower', type: 'line', title: 'Lower Band', style: { color: '#ffeb3b', lineWidth: 2 } },
    ],

    fills: [{ between: ['upper', 'lower'], colorUp: '#2962ff', colorDown: '#2962ff', opacity: 0.1 }],

    calc(bars, settings) {
      const n = bars.length
      // A cleared number field arrives as '', and Number('') is 0.
      const period = Math.max(1, Math.floor(Number(settings.period) || 20))

      const hiFractal = new Array(n).fill(NaN)
      const loFractal = new Array(n).fill(NaN)
      // Columns the markers hook reads: the fractal price on the bar that printed it.
      const fracHigh = new Array(n).fill(NaN)
      const fracLow = new Array(n).fill(NaN)

      // Pine seeds `var float hi_fractal = high` on the first bar and only replaces
      // it when a three-bar fractal completes, so the carried value persists.
      let hi = n > 0 ? bars[0].high : NaN
      let lo = n > 0 ? bars[0].low : NaN

      for (let i = 0; i < n; i++) {
        if (i >= 2) {
          const h0 = bars[i].high
          const h1 = bars[i - 1].high
          const h2 = bars[i - 2].high
          const l0 = bars[i].low
          const l1 = bars[i - 1].low
          const l2 = bars[i - 2].low
          // Pine treats any comparison against na as false, so guard every operand.
          if (Number.isFinite(h0) && Number.isFinite(h1) && Number.isFinite(h2) && h1 > h2 && h1 > h0) {
            hi = h1
            fracHigh[i - 1] = h1
          }
          if (Number.isFinite(l0) && Number.isFinite(l1) && Number.isFinite(l2) && l1 < l2 && l1 < l0) {
            lo = l1
            fracLow[i - 1] = l1
          }
        }
        // nz() on the carried fractal, matching nz(hi_fractal) / nz(lo_fractal).
        hiFractal[i] = Number.isFinite(hi) ? hi : 0
        loFractal[i] = Number.isFinite(lo) ? lo : 0
      }

      const upper = rollingExtreme(hiFractal, period, true)
      const lower = rollingExtreme(loFractal, period, false)

      return {
        upper: nulls(upper),
        lower: nulls(lower),
        fracHigh: nulls(fracHigh),
        fracLow: nulls(fracLow),
      }
    },

    markers({ bars, values, settings }) {
      if (settings.showFractals !== true) return []
      const n = bars.length
      if (!n) return []

      // Scale the offset to the instrument rather than using a fixed point count.
      let rangeSum = 0
      let rangeCount = 0
      for (let i = Math.max(0, n - 200); i < n; i++) {
        const r = bars[i].high - bars[i].low
        if (Number.isFinite(r)) {
          rangeSum += r
          rangeCount += 1
        }
      }
      const meanRange = rangeCount > 0 ? rangeSum / rangeCount : 0
      const lastClose = Number.isFinite(bars[n - 1].close) ? bars[n - 1].close : 0
      const pad = Math.max(meanRange * 0.5, Math.abs(lastClose) * 0.0005)

      const out = []
      const highs = values.fracHigh
      const lows = values.fracLow
      for (let i = 0; i < n; i++) {
        const h = highs[i]
        if (Number.isFinite(h)) {
          out.push({
            time: bars[i].time,
            position: 'atPrice',
            price: h + pad,
            shape: 'triangleDown',
            size: 'tiny',
            color: '#ffeb3b',
          })
        }
        const l = lows[i]
        if (Number.isFinite(l)) {
          out.push({
            time: bars[i].time,
            position: 'atPrice',
            price: l - pad,
            shape: 'triangleUp',
            size: 'tiny',
            color: '#ffeb3b',
          })
        }
      }
      return out
    },
  })
}
