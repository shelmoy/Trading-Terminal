/**
 * Alpha-Decreasing Exponential Moving Average (ADEMA) - ported to openalgo-charts
 * from Pine Script v4.
 *
 * Source: https://github.com/everget/tradingview-pinescript-indicators/blob/60c93d3711d222b8f2db96160defe568429348e0/movings/alpha_decreasing_exponential_moving_average.pine
 * Repo:   everget/tradingview-pinescript-indicators
 * License: GPL-3.0
 * SPDX-FileCopyrightText: (c) 2018-present Alex Orekhov (everget)
 * SPDX-FileCopyrightText: (c) 2026 marketcalls (port to openalgo-charts)
 * SPDX-License-Identifier: GPL-3.0-only
 *
 * An exponential average whose smoothing factor shrinks as the chart grows:
 * alpha is 2 / (bar_index + 1), so the line tracks price on the earliest bars
 * and settles into a running mean of the whole loaded history.
 */

export default function ({ registerIndicator, nulls }) {
  registerIndicator({
    id: 'oa-alpha-decreasing-exponential-moving-average',
    name: 'Alpha-Decreasing Exponential Moving Average (ADEMA)',
    category: 'Moving Averages',
    placement: 'onchart',

    // The source script declares no inputs: alpha is derived from bar_index and
    // the series is always close.
    inputs: [],

    plots: [
      { key: 'adema', type: 'line', title: 'ADEMA', style: { color: '#ff9800', lineWidth: 2 } },
    ],

    calc(bars) {
      const out = new Array(bars.length).fill(NaN)
      let prev = NaN

      for (let i = 0; i < bars.length; i++) {
        const c = bars[i].close
        if (!Number.isFinite(c)) continue

        // Pine: alpha = 2 / (int(bar_index) + 1). bar_index is 0 on the first
        // loaded bar, so alpha is 2 there and 1 on the next bar.
        const alpha = 2 / (i + 1)

        // Pine: ema := alpha * ema + (1 - alpha) * nz(ema[1], ema), where the
        // fallback `ema` is still the initialiser `close` on the first bar.
        // That makes bar 0 resolve to 2c - c = c exactly.
        const base = Number.isFinite(prev) ? prev : c
        const v = alpha * c + (1 - alpha) * base
        out[i] = v
        prev = v
      }

      return { adema: nulls(out) }
    },
  })
}
