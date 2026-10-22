/**
 * Zero-Lag Double EMA (ZLDEMA) - ported to openalgo-charts from Pine Script v6.
 *
 * Source: https://github.com/mihakralj/pinescript/blob/c4e91b962be09733d8fc76caa5191e9e586c5cee/indicators/trends_IIR/zldema.pine
 * Repo:   mihakralj/pinescript
 * License: MIT (c) mihakralj
 * SPDX-FileCopyrightText: (c) mihakralj
 * SPDX-FileCopyrightText: (c) 2026 marketcalls (port to openalgo-charts)
 * SPDX-License-Identifier: MIT
 *
 * A double exponential average fed a lag-corrected price (2 * price minus the
 * price half a period ago), with an exponential warmup compensator on both
 * stages so the line starts on price instead of crawling up from zero.
 */

export default function ({ registerIndicator, sourceValues, nulls }) {
  registerIndicator({
    id: 'oa-zldema',
    name: 'Zero-Lag Double EMA (ZLDEMA)',
    category: 'Trends IIR',
    placement: 'onchart',

    inputs: [
      { key: 'period', type: 'number', label: 'Period', default: 10, min: 1, max: 5000, step: 1 },
      { key: 'source', type: 'source', label: 'Source', default: 'close' },
    ],

    plots: [{ key: 'zldema', type: 'line', title: 'ZLDEMA', style: { color: '#ffeb3b', lineWidth: 2 } }],

    calc(bars, settings) {
      // A cleared number field arrives as '', and Number('') is 0.
      const period = Math.max(1, Math.floor(Number(settings.period) || 10))
      const src = sourceValues(bars, settings.source ?? 'close')
      const n = bars.length
      const out = new Array(n).fill(NaN)

      const a = 2 / (period + 1)
      const beta = 1 - a
      // Pine divides two ints here, which truncates, and math.round of an int
      // is that int: lag = max(1, trunc((period - 1) / 2)).
      const lag = Math.max(1, Math.trunc((period - 1) / 2))

      // Lag buffer of lag + 1 slots. The Pine source shifts off the front and
      // pushes to the back, so slot 0 always holds the price from lag bars ago,
      // and is na until that many prices have been pushed.
      const size = lag + 1
      const buf = new Array(size).fill(NaN)
      let pushes = 0

      let warmup = true
      let e = 1
      let ema1Raw = 0
      let ema2Raw = 0
      let ema1 = NaN
      let ema2 = NaN

      for (let i = 0; i < n; i++) {
        const s = src[i]
        // Pine returns na and advances no state when the source is na.
        if (!Number.isFinite(s)) continue

        const slot = pushes % size
        buf[slot] = s
        const lagged = buf[(slot + 1) % size]
        pushes += 1
        const laggedPrice = Number.isFinite(lagged) ? lagged : s

        const signal = 2 * s - laggedPrice
        ema1Raw = a * (signal - ema1Raw) + ema1Raw

        if (warmup) {
          // Compensator c = 1 / (1 - beta^bars) rescales an average that has
          // not yet accumulated its full weight.
          e *= beta
          const c = 1 / (1 - e)
          ema1 = c * ema1Raw
          ema2Raw = a * (ema1 - ema2Raw) + ema2Raw
          ema2 = c * ema2Raw
          warmup = e > 1e-10
        } else {
          ema1 = ema1Raw
          ema2Raw = a * (ema1 - ema2Raw) + ema2Raw
          ema2 = ema2Raw
        }

        const value = 2 * ema1 - ema2
        if (Number.isFinite(value)) out[i] = value
      }

      return { zldema: nulls(out) }
    },
  })
}
