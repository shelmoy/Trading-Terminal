/**
 * Mass Index (MASSI) - ported to openalgo-charts from Pine Script v6.
 *
 * Source: https://github.com/mihakralj/pinescript/blob/c4e91b962be09733d8fc76caa5191e9e586c5cee/indicators/volatility/massi.pine
 * Repo:   mihakralj/pinescript
 * License: MIT (c) mihakralj
 * SPDX-FileCopyrightText: (c) mihakralj
 * SPDX-FileCopyrightText: (c) 2026 marketcalls (port to openalgo-charts)
 * SPDX-License-Identifier: MIT
 *
 * Sums the ratio of a single to a double EMA of the high-low range, so a
 * bulge in the reading marks a widening range that often precedes a reversal.
 */

export default function ({ registerIndicator, rollingSum, nulls }) {
  registerIndicator({
    id: 'oa-massi',
    name: 'Mass Index (MASSI)',
    category: 'Volatility',
    placement: 'pane',

    inputs: [
      {
        key: 'emaLength',
        type: 'number',
        label: 'EMA Length',
        default: 9,
        min: 1,
        max: 5000,
        step: 1,
        tooltip: 'Period for EMA smoothing of high-low range',
      },
      {
        key: 'sumLength',
        type: 'number',
        label: 'Sum Length',
        default: 25,
        min: 1,
        max: 5000,
        step: 1,
        tooltip: 'Period for summing the EMA ratio',
      },
    ],

    plots: [{ key: 'massi', type: 'line', title: 'MASSI', style: { color: '#ffeb3b', lineWidth: 2 } }],

    calc(bars, settings) {
      // A cleared number field arrives as '', and Number('') is 0.
      const emaLength = Math.max(1, Math.floor(Number(settings.emaLength) || 9))
      const sumLength = Math.max(1, Math.floor(Number(settings.sumLength) || 25))

      const n = bars.length
      const ratio = new Array(n).fill(0)

      const a = 2.0 / (emaLength + 1)
      const beta = 1.0 - a

      // var state carried across bars, exactly as the Pine function does.
      let warmup = true
      let e = 1.0
      let ema1Raw = 0.0
      let ema2Raw = 0.0

      for (let i = 0; i < n; i++) {
        const high = bars[i].high
        const low = bars[i].low
        // nz(high - low)
        const span = Number.isFinite(high) && Number.isFinite(low) ? high - low : 0

        ema1Raw = a * (span - ema1Raw) + ema1Raw
        ema2Raw = a * (ema1Raw - ema2Raw) + ema2Raw

        if (warmup) {
          e *= beta
          warmup = e > 1e-10
        }

        // Pine reads the flag after it has been updated, so the bar that ends
        // the warmup already uses an uncompensated c of 1.
        const denom = 1.0 - e
        const c = warmup && denom > 0 ? 1.0 / denom : 1.0
        const ema1 = c * ema1Raw
        const ema2 = c * ema2Raw

        ratio[i] = ema2 !== 0 ? ema1 / ema2 : 0
      }

      // math.sum over sumLength bars, na until the window is full.
      const massi = rollingSum(ratio, sumLength)

      return { massi: nulls(massi) }
    },
  })
}
