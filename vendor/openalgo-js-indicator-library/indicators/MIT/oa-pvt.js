/**
 * Price Volume Trend (PVT) - ported to openalgo-charts from Pine Script v6.
 *
 * Source: https://github.com/mihakralj/pinescript/blob/c4e91b962be09733d8fc76caa5191e9e586c5cee/indicators/volume/pvt.pine
 * Repo:   mihakralj/pinescript
 * License: MIT
 * SPDX-FileCopyrightText: (c) mihakralj
 * SPDX-FileCopyrightText: (c) 2026 marketcalls (port to openalgo-charts)
 * SPDX-License-Identifier: MIT
 *
 * A running total of volume weighted by each bar's percentage price change, so
 * it accumulates faster on large moves than on-balance volume does and reads as
 * accumulation while it holds above its signal line.
 */

export default function ({ registerIndicator, sma, nulls, withAlpha }) {
  // Pine's color.green and color.red, softened so the shading sits behind the
  // two lines instead of hiding them.
  const UP = withAlpha('#4caf50', 0.12)
  const DOWN = withAlpha('#ff5252', 0.12)

  registerIndicator({
    id: 'oa-pvt',
    name: 'Price Volume Trend (PVT)',
    category: 'Volume',
    placement: 'pane',

    inputs: [
      { key: 'signalLength', type: 'number', label: 'Signal Line Period', default: 14, min: 1, step: 1 },
    ],

    plots: [
      { key: 'pvt', type: 'line', title: 'PVT', style: { color: '#ffeb3b', lineWidth: 2 } },
      { key: 'signal', type: 'line', title: 'PVT Signal', style: { color: '#ff5252', lineWidth: 1 } },
    ],

    // Ported from hline(0, "Zero Line", color.gray, style_dashed).
    levels: () => [{ price: 0, title: 'Zero Line', color: '#787b86', dashed: true }],

    // Ported from bgcolor(pvt_line > pvt_signal ? green : red). Pine reads a
    // comparison against an na signal as false, so the warmup shades down.
    background: ({ bars, values }) =>
      bars.map((_, i) => {
        const p = values.pvt[i]
        const s = values.signal[i]
        return Number.isFinite(p) && Number.isFinite(s) && p > s ? UP : DOWN
      }),

    calc(bars, settings) {
      // A cleared number field arrives as '', and Number('') is 0.
      const signalLength = Math.max(1, Math.floor(Number(settings.signalLength) || 14))
      const n = bars.length
      const pvt = new Array(n).fill(NaN)

      // Pine hard-codes close and volume here, so there is no source input.
      let cumulative = 0.0
      for (let i = 0; i < n; i++) {
        const price = bars[i].close
        // nz(src[1], src): the first bar compares against itself, so it adds 0.
        const prevRaw = i > 0 ? bars[i - 1].close : NaN
        const prev = Number.isFinite(prevRaw) ? prevRaw : price

        let ratio = 0.0
        if (Number.isFinite(price) && Number.isFinite(prev) && prev !== 0) {
          const change = price - prev
          if (Number.isFinite(change)) ratio = change / prev
        }
        if (!Number.isFinite(ratio)) ratio = 0.0

        // Index series carry no volume, and nz(src_vol, 0.0) reads that as 0.
        const vol = Number.isFinite(bars[i].volume) ? bars[i].volume : 0
        cumulative += vol * ratio
        pvt[i] = cumulative
      }

      return { pvt: nulls(pvt), signal: nulls(sma(pvt, signalLength)) }
    },
  })
}
