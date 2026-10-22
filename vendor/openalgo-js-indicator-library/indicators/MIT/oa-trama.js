/**
 * TRAMA: Trend Regularity Adaptive Moving Average - ported to openalgo-charts
 * from Pine Script v6.
 *
 * Source: https://github.com/mihakralj/pinescript/blob/c4e91b962be09733d8fc76caa5191e9e586c5cee/indicators/trends_IIR/trama.pine
 * Repo:   mihakralj/pinescript
 * License: MIT (c) mihakralj
 * SPDX-FileCopyrightText: (c) mihakralj
 * SPDX-FileCopyrightText: (c) 2026 marketcalls (port to openalgo-charts)
 * SPDX-License-Identifier: MIT
 *
 * An exponential average whose smoothing factor is the squared fraction of
 * bars in the lookback that printed a fresh rolling high or low. Frequent new
 * extremes mean a trend and a fast average; a quiet range squares down to
 * almost nothing and the line goes flat.
 */

export default function ({ registerIndicator, sma, highest, lowest, change, nulls }) {
  registerIndicator({
    id: 'oa-trama',
    name: 'TRAMA: Trend Regularity Adaptive Moving Average',
    category: 'Trends IIR',
    placement: 'onchart',

    inputs: [
      { key: 'period', type: 'number', label: 'Period', default: 14, min: 1, max: 5000, step: 1 },
    ],

    plots: [
      { key: 'trama', type: 'line', title: 'TRAMA', style: { color: '#ffeb3b', lineWidth: 2 } },
    ],

    calc(bars, settings) {
      // A cleared number field arrives as '', and Number('') is 0.
      const length = Math.max(1, Math.floor(Number(settings.period) || 14))
      const n = bars.length

      // Pine calls trama(close, p): the source is the close, and ta.highest /
      // ta.lowest with a single argument read high and low respectively.
      const highs = bars.map((b) => b.high)
      const lows = bars.map((b) => b.low)
      const closes = bars.map((b) => b.close)

      const hhChange = change(highest(highs, length))
      const llChange = change(lowest(lows, length))

      // math.sign(na) is na in Pine and every comparison with na is false, so a
      // warmup bar contributes 0 to the average rather than firing the test. In
      // JavaScript NaN !== 0 is true, which would fire it on every warmup bar.
      const fired = new Array(n).fill(0)
      for (let i = 0; i < n; i++) {
        const dh = hhChange[i]
        const dl = llChange[i]
        const hh = Number.isFinite(dh) ? Math.max(Math.sign(dh), 0) : NaN
        const ll = Number.isFinite(dl) ? Math.max(Math.sign(dl * -1), 0) : NaN
        const on = (Number.isFinite(hh) && hh !== 0) || (Number.isFinite(ll) && ll !== 0)
        fired[i] = on ? 1 : 0
      }

      // tc = sma(fired, length) squared. ta.sma is na for the first length - 1
      // bars, so tc is too, and the recursion below reproduces Pine's warmup.
      const regularity = sma(fired, length)

      const ama = new Array(n).fill(NaN)
      for (let i = 0; i < n; i++) {
        const prev = i > 0 ? ama[i - 1] : NaN
        const prevNz = Number.isFinite(prev) ? prev : 0
        const src = closes[i]
        let value = NaN

        if (Number.isFinite(regularity[i]) && Number.isFinite(src)) {
          const tc = regularity[i] * regularity[i]
          value = prevNz + tc * (src - prevNz)
        }
        // Pine's `if na(ama[1]) -> ama := src` runs after the recursion and wins,
        // so any bar whose predecessor was na restarts the average at the source.
        if (!Number.isFinite(prev)) value = src

        ama[i] = Number.isFinite(value) ? value : NaN
      }

      return { trama: nulls(ama) }
    },
  })
}
