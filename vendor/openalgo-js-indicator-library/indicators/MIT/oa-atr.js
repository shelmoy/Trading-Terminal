/**
 * Average True Range (ATR) - ported to openalgo-charts from Pine Script v6.
 *
 * Source: https://github.com/mihakralj/pinescript/blob/c4e91b962be09733d8fc76caa5191e9e586c5cee/indicators/volatility/atr.pine
 * Repo:   mihakralj/pinescript
 * License: MIT (c) mihakralj
 * SPDX-FileCopyrightText: (c) mihakralj
 * SPDX-FileCopyrightText: (c) 2026 marketcalls (port to openalgo-charts)
 * SPDX-License-Identifier: MIT
 *
 * Wilder's average true range, with the warmup bias of a zero-seeded Wilder
 * average divided back out, so the line is usable from the very first bar
 * instead of creeping up to its true level over the first period.
 */

export default function ({ registerIndicator, nulls }) {
  registerIndicator({
    id: 'oa-atr',
    name: 'Average True Range (ATR)',
    category: 'Volatility',
    placement: 'pane',

    inputs: [
      {
        key: 'length',
        type: 'number',
        label: 'Length',
        default: 14,
        min: 1,
        max: 5000,
        step: 1,
        tooltip: 'Number of bars used for the ATR calculation.',
      },
    ],

    plots: [
      { key: 'atr', type: 'line', title: 'ATR', style: { color: '#ffeb3b', lineWidth: 2 } },
    ],

    calc(bars, settings) {
      // A cleared number field arrives as '', and Number('') is 0.
      const length = Math.max(1, Math.floor(Number(settings.length) || 14))
      const n = bars.length
      const out = new Array(n).fill(NaN)

      const EPSILON = 1e-10
      const alpha = 1 / length
      const beta = 1 - alpha

      // Pine's `var float prevClose = close` is evaluated once, on the first
      // bar, so bar 0 compares against its own close and its true range is
      // simply high - low.
      let prevClose = NaN
      let rawRma = 0
      let e = 1

      for (let i = 0; i < n; i++) {
        const bar = bars[i]
        const high = bar.high
        const low = bar.low
        const close = bar.close
        if (i === 0) prevClose = Number.isFinite(close) ? close : NaN

        const tr1 = high - low
        const tr2 = Math.abs(high - prevClose)
        const tr3 = Math.abs(low - prevClose)
        const trueRange = Math.max(tr1, tr2, tr3)

        prevClose = close

        if (!Number.isFinite(trueRange)) continue

        // Wilder smoothing seeded at zero, then de-biased by 1 - beta^bars.
        rawRma = (rawRma * (length - 1) + trueRange) / length
        e *= beta
        const value = e > EPSILON ? rawRma / (1 - e) : rawRma
        if (Number.isFinite(value)) out[i] = value
      }

      return { atr: nulls(out) }
    },
  })
}
