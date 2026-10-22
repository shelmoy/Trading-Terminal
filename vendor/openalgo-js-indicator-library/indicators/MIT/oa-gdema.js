/**
 * Generalized Double Exponential Moving Average (GDEMA) - ported to openalgo-charts from Pine Script v6.
 *
 * Source: https://github.com/mihakralj/pinescript/blob/c4e91b962be09733d8fc76caa5191e9e586c5cee/indicators/trends_IIR/gdema.pine
 * Repo:   mihakralj/pinescript
 * License: MIT
 * SPDX-FileCopyrightText: (c) mihakralj
 * SPDX-FileCopyrightText: (c) 2026 marketcalls (port to openalgo-charts)
 * SPDX-License-Identifier: MIT
 *
 * DEMA with a tunable lag compensation factor: (1 + v) * EMA1 - v * EMA2.
 * v = 0 is a plain EMA, v = 1 is standard DEMA, v > 1 removes more lag at the
 * cost of overshoot.
 */

export default function ({ registerIndicator, sourceValues, nulls }) {
  registerIndicator({
    id: 'oa-gdema',
    name: 'Generalized Double Exponential Moving Average (GDEMA)',
    category: 'Trends IIR',
    placement: 'onchart',

    inputs: [
      { key: 'period', type: 'number', label: 'Period', default: 10, min: 1, max: 5000, step: 1 },
      {
        key: 'vfactor',
        type: 'number',
        label: 'Volume Factor (v)',
        default: 1,
        min: 0,
        max: 3,
        step: 0.1,
        tooltip: '0=EMA, 1=standard DEMA, >1=more aggressive lag removal',
      },
      { key: 'source', type: 'source', label: 'Source', default: 'close' },
    ],

    plots: [{ key: 'gdema', type: 'line', title: 'GDEMA', style: { color: '#ffeb3b', lineWidth: 2 } }],

    calc(bars, settings) {
      // A cleared number field arrives as '', and Number('') is 0.
      const period = Math.max(1, Math.floor(Number(settings.period) || 10))
      // v = 0 is a legitimate setting (plain EMA), so `|| 1` would be wrong
      // here: a cleared field has to be rejected on its own, not by falsiness.
      const rawV = Number(settings.vfactor)
      const cleared = settings.vfactor == null || settings.vfactor === '' || !Number.isFinite(rawV)
      const vfactor = cleared ? 1 : Math.min(3, Math.max(0, rawV))
      const src = sourceValues(bars, settings.source ?? 'close')

      const a = 2 / (period + 1)
      const beta = 1 - a

      // Pine carries all five of these in var state across bars. The shared
      // compensator c = 1 / (1 - beta^n) removes the zero-seed bias, so the
      // average is usable from the very first bar.
      let warmup = true
      let e = 1
      let ema1Raw = 0
      let ema2Raw = 0
      let ema1 = 0
      let ema2 = 0

      const out = new Array(bars.length).fill(NaN)
      for (let i = 0; i < bars.length; i++) {
        const source = src[i]
        // A non-finite source would poison every later bar of a recursive
        // filter, so hold the state and leave a gap instead.
        if (!Number.isFinite(source)) continue

        ema1Raw = a * (source - ema1Raw) + ema1Raw

        if (warmup) {
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

        out[i] = (1 + vfactor) * ema1 - vfactor * ema2
      }

      return { gdema: nulls(out) }
    },
  })
}
