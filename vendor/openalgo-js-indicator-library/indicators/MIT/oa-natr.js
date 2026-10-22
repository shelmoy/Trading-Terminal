/**
 * Normalized Average True Range - ported to openalgo-charts from Pine Script v6.
 *
 * Source: https://github.com/mihakralj/pinescript/blob/c4e91b962be09733d8fc76caa5191e9e586c5cee/indicators/volatility/natr.pine
 * Repo:   mihakralj/pinescript
 * License: MIT (c) mihakralj
 * SPDX-FileCopyrightText: (c) mihakralj
 * SPDX-FileCopyrightText: (c) 2026 marketcalls (port to openalgo-charts)
 * SPDX-License-Identifier: MIT
 *
 * Wilder's average true range expressed as a percentage of the close, so the same
 * reading is comparable across instruments and across price levels.
 */

export default function ({ registerIndicator, nulls }) {
  registerIndicator({
    id: 'oa-natr',
    name: 'Normalized Average True Range',
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
        tooltip: 'Number of bars used for the ATR calculation',
      },
    ],

    plots: [{ key: 'natr', type: 'line', title: 'NATR', style: { color: '#ffeb3b', lineWidth: 2 } }],

    calc(bars, settings) {
      const n = bars.length
      // A cleared number field arrives as '', and Number('') is 0.
      const length = Math.max(1, Math.floor(Number(settings.length) || 14))
      const alpha = 1 / length
      const beta = 1 - alpha
      const EPSILON = 1e-10

      // Wilder smoothing with the source's warmup compensator: raw_rma starts at
      // zero and is divided by (1 - beta^bars), so bar 0 already emits true range
      // rather than a seeded average, and there is no NaN warmup.
      let rawRma = 0
      let e = 1

      const out = new Array(n).fill(NaN)
      for (let i = 0; i < n; i++) {
        const bar = bars[i]
        // nz(close[1], close): bar 0 compares against its own close.
        const prev = i > 0 && Number.isFinite(bars[i - 1].close) ? bars[i - 1].close : bar.close
        const tr1 = bar.high - bar.low
        const tr2 = Math.abs(bar.high - prev)
        const tr3 = Math.abs(bar.low - prev)
        const trueRange = Math.max(tr1, Math.max(tr2, tr3))

        let atrValue = NaN
        if (Number.isFinite(trueRange)) {
          rawRma = (rawRma * (length - 1) + trueRange) / length
          e *= beta
          atrValue = e > EPSILON ? rawRma / (1 - e) : rawRma
        }

        // Pine: close != 0 ? (atr / close) * 100 : 0. A na close makes the test
        // false, so that bar reads 0 too.
        const close = bar.close
        if (Number.isFinite(close) && close !== 0) {
          if (Number.isFinite(atrValue)) out[i] = (atrValue / close) * 100
        } else {
          out[i] = 0
        }
      }

      return { natr: nulls(out) }
    },
  })
}
