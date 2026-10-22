/**
 * Ichimoku Cloud (ICHIMOKU) - ported to openalgo-charts from Pine Script v6.
 *
 * Source: https://github.com/mihakralj/pinescript/blob/c4e91b962be09733d8fc76caa5191e9e586c5cee/indicators/dynamics/ichimoku.pine
 * Repo:   mihakralj/pinescript
 * License: MIT (c) mihakralj
 * SPDX-FileCopyrightText: (c) mihakralj
 * SPDX-FileCopyrightText: (c) 2026 marketcalls (port to openalgo-charts)
 * SPDX-License-Identifier: MIT
 *
 * Three Donchian midpoints over different lookbacks give the conversion and base
 * lines and the two leading spans, whose displaced gap is the cloud; the lagging
 * span puts the current close back against the price of the displacement period.
 */

export default function ({ registerIndicator, nulls }) {
  // The source walks its own window rather than calling ta.highest/ta.lowest,
  // and it caps the walk at min(bar_index + 1, period). That is a partial window
  // on early bars, so every line emits from bar 0 instead of carrying the usual
  // period-1 NaN warmup. A monotonic deque reproduces it without the O(n*p) walk.
  const runningExtreme = (values, period, wantHigh) => {
    const n = values.length
    const out = new Array(n).fill(NaN)
    const dq = []
    for (let i = 0; i < n; i++) {
      while (dq.length > 0 && dq[0] <= i - period) dq.shift()
      const v = values[i]
      if (Number.isFinite(v)) {
        while (dq.length > 0) {
          const back = values[dq[dq.length - 1]]
          if (wantHigh ? back <= v : back >= v) dq.pop()
          else break
        }
        dq.push(i)
      }
      if (dq.length > 0) out[i] = values[dq[0]]
    }
    return out
  }

  const midpoint = (highs, lows, period) => {
    const hi = runningExtreme(highs, period, true)
    const lo = runningExtreme(lows, period, false)
    const out = new Array(highs.length).fill(NaN)
    for (let i = 0; i < highs.length; i++) {
      if (Number.isFinite(hi[i]) && Number.isFinite(lo[i])) out[i] = (hi[i] + lo[i]) / 2
    }
    return out
  }

  registerIndicator({
    id: 'oa-ichimoku',
    name: 'Ichimoku Cloud',
    category: 'Dynamics',
    placement: 'onchart',

    inputs: [
      { key: 'tenkan', type: 'number', label: 'Tenkan Period', default: 9, min: 1, max: 5000, step: 1 },
      { key: 'kijun', type: 'number', label: 'Kijun Period', default: 26, min: 1, max: 5000, step: 1 },
      { key: 'senkouB', type: 'number', label: 'Senkou B Period', default: 52, min: 1, max: 5000, step: 1 },
      {
        key: 'displacement',
        type: 'number',
        label: 'Displacement',
        default: 26,
        min: 1,
        max: 500,
        step: 1,
        tooltip: 'Bars the cloud is pushed forward and the lagging span pulled back by.',
      },
    ],

    plots: [
      { key: 'tenkan', type: 'line', title: 'Tenkan-sen', style: { color: '#2962ff', lineWidth: 1 } },
      { key: 'kijun', type: 'line', title: 'Kijun-sen', style: { color: '#FF5252', lineWidth: 1 } },
      { key: 'chikou', type: 'line', title: 'Chikou Span', style: { color: '#9C27B0', lineWidth: 1 } },
      { key: 'senkouA', type: 'line', title: 'Senkou Span A', style: { color: '#4CAF50', lineWidth: 1 } },
      { key: 'senkouB', type: 'line', title: 'Senkou Span B', style: { color: '#FF5252', lineWidth: 1 } },
    ],

    // Pine shades between the two leading spans, green where A leads and red
    // where B does. color.new(..., 90) is 90 percent transparent, so opacity 0.1.
    fills: [{ between: ['senkouA', 'senkouB'], colorUp: '#4CAF50', colorDown: '#FF5252', opacity: 0.1 }],

    calc(bars, settings) {
      // A cleared number field arrives as '', and Number('') is 0.
      const tenkanPeriod = Math.max(1, Math.floor(Number(settings.tenkan) || 9))
      const kijunPeriod = Math.max(1, Math.floor(Number(settings.kijun) || 26))
      const senkouBPeriod = Math.max(1, Math.floor(Number(settings.senkouB) || 52))
      const displacement = Math.max(1, Math.floor(Number(settings.displacement) || 26))

      const n = bars.length
      const highs = bars.map((b) => b.high)
      const lows = bars.map((b) => b.low)

      const tenkanRaw = midpoint(highs, lows, tenkanPeriod)
      const kijunRaw = midpoint(highs, lows, kijunPeriod)
      const senkouBRaw = midpoint(highs, lows, senkouBPeriod)

      const tenkan = new Array(n).fill(NaN)
      const kijun = new Array(n).fill(NaN)
      const senkouA = new Array(n).fill(NaN)
      const senkouB = new Array(n).fill(NaN)
      const chikou = new Array(n).fill(NaN)

      for (let i = 0; i < n; i++) {
        tenkan[i] = tenkanRaw[i]
        kijun[i] = kijunRaw[i]

        // offset = +displacement on the leading spans: the value shown at bar i
        // was computed displacement bars earlier. Shifting the series back onto
        // existing bars draws exactly the cloud the chart shows; the projection
        // past the last bar has no bar to sit on and is not expressible here.
        const back = i - displacement
        if (back >= 0) {
          if (Number.isFinite(tenkanRaw[back]) && Number.isFinite(kijunRaw[back])) {
            senkouA[i] = (tenkanRaw[back] + kijunRaw[back]) / 2
          }
          senkouB[i] = senkouBRaw[back]
        }

        // offset = -displacement on the lagging span: bar i shows the close from
        // displacement bars later, which exists for every bar but the last few.
        const ahead = i + displacement
        if (ahead < n) chikou[i] = bars[ahead].close
      }

      return {
        tenkan: nulls(tenkan),
        kijun: nulls(kijun),
        chikou: nulls(chikou),
        senkouA: nulls(senkouA),
        senkouB: nulls(senkouB),
      }
    },
  })
}
