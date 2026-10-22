/**
 * VHF: Vertical Horizontal Filter - ported to openalgo-charts from Pine Script v6.
 *
 * Source: https://github.com/mihakralj/pinescript/blob/c4e91b962be09733d8fc76caa5191e9e586c5cee/indicators/dynamics/vhf.pine
 * Repo:   mihakralj/pinescript
 * License: MIT (c) mihakralj
 * SPDX-FileCopyrightText: (c) mihakralj
 * SPDX-FileCopyrightText: (c) 2026 marketcalls (port to openalgo-charts)
 * SPDX-License-Identifier: MIT
 *
 * The distance price travelled vertically over a window divided by the distance
 * it travelled in total, so a high reading means a trend and a low reading means
 * a range.
 */

export default function ({ registerIndicator, nulls }) {
  // A cleared number field arrives as '' and Number('') is 0, which would put a
  // reference line on zero rather than keeping the configured default.
  const numberInput = (raw, fallback) => {
    if (raw === '' || raw === null || raw === undefined) return fallback
    const value = Number(raw)
    return Number.isFinite(value) ? value : fallback
  }

  registerIndicator({
    id: 'oa-vhf',
    name: 'VHF: Vertical Horizontal Filter',
    category: 'Dynamics',
    placement: 'pane',

    inputs: [
      {
        key: 'period',
        type: 'number',
        label: 'Period',
        default: 28,
        min: 2,
        max: 200,
        step: 1,
        tooltip: 'Lookback period (Adam White default: 28)',
      },
      {
        key: 'trendThreshold',
        type: 'number',
        label: 'Trend Threshold',
        default: 0.4,
        min: 0,
        max: 2,
        step: 0.05,
        tooltip: 'Above this level = trending market',
      },
      {
        key: 'rangeThreshold',
        type: 'number',
        label: 'Range Threshold',
        default: 0.25,
        min: 0,
        max: 2,
        step: 0.05,
        tooltip: 'Below this level = ranging market',
      },
    ],

    plots: [{ key: 'vhf', type: 'line', title: 'VHF', style: { color: '#ffeb3b', lineWidth: 2 } }],

    // The two hline() calls in the source.
    levels(ctx) {
      const settings = ctx?.settings ?? ctx ?? {}
      const trend = numberInput(settings.trendThreshold, 0.4)
      const range = numberInput(settings.rangeThreshold, 0.25)
      const out = []
      if (Number.isFinite(trend)) {
        out.push({ price: trend, title: 'Trend Threshold', color: '#26a69a', lineStyle: 'dashed' })
      }
      if (Number.isFinite(range)) {
        out.push({ price: range, title: 'Range Threshold', color: '#ef5350', lineStyle: 'dashed' })
      }
      return out
    },

    calc(bars, settings) {
      const period = Math.max(2, Math.floor(Number(settings.period) || 28))
      const n = bars.length
      const out = new Array(n).fill(NaN)
      if (n === 0) return { vhf: nulls(out) }

      const closes = new Array(n)
      for (let i = 0; i < n; i++) closes[i] = Number(bars[i].close)

      // |close[i] - close[i-1]|, undefined on the first bar exactly as the
      // source's circular buffer leaves it.
      const absDiff = new Array(n).fill(NaN)
      for (let i = 1; i < n; i++) {
        if (Number.isFinite(closes[i]) && Number.isFinite(closes[i - 1])) {
          absDiff[i] = Math.abs(closes[i] - closes[i - 1])
        }
      }

      // Running sum of the last `period` absolute changes.
      let diffSum = 0
      for (let i = 0; i < n; i++) {
        if (Number.isFinite(absDiff[i])) diffSum += absDiff[i]
        const leaving = i - period
        if (leaving >= 0 && Number.isFinite(absDiff[leaving])) diffSum -= absDiff[leaving]

        // The source needs period+1 closes and period changes, which both land
        // on bar index `period`.
        if (i < period) continue

        let hi = -Infinity
        let lo = Infinity
        for (let k = i - period; k <= i; k++) {
          const value = closes[k]
          if (!Number.isFinite(value)) continue
          if (value > hi) hi = value
          if (value < lo) lo = value
        }
        if (!Number.isFinite(hi) || !Number.isFinite(lo)) continue

        // Guarded exactly as the source guards it: a flat window sums to zero.
        if (diffSum > 1e-10) out[i] = (hi - lo) / diffSum
      }

      return { vhf: nulls(out) }
    },
  })
}
