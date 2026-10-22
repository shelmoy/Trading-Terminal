/**
 * Volume Force (VF) - ported to openalgo-charts from Pine Script v6.
 *
 * Source: https://github.com/mihakralj/pinescript/blob/c4e91b962be09733d8fc76caa5191e9e586c5cee/indicators/volume/vf.pine
 * Repo:   mihakralj/pinescript
 * License: MIT (c) mihakralj
 * SPDX-FileCopyrightText: (c) mihakralj
 * SPDX-FileCopyrightText: (c) 2026 marketcalls (port to openalgo-charts)
 * SPDX-License-Identifier: MIT
 *
 * Each bar's price change is weighted by its volume, then smoothed with a
 * bias-compensated EMA, so the reading is unbiased from the very first bar.
 */

export default function ({ registerIndicator, nulls }) {
  registerIndicator({
    id: 'oa-vf',
    name: 'Volume Force (VF)',
    category: 'Volume',
    placement: 'pane',

    inputs: [
      {
        key: 'length',
        type: 'number',
        label: 'Smoothing Period',
        default: 14,
        min: 1,
        max: 5000,
        step: 1,
      },
    ],

    plots: [{ key: 'vf', type: 'line', title: 'Volume Force', style: { color: '#ffeb3b', lineWidth: 2 } }],

    levels: () => [{ price: 0, title: 'Zero Line', color: '#787b86', dashed: true }],

    // Pine shades the pane with bgcolor(). The source uses opaque green and red;
    // they are carried here at low alpha so the line stays readable over them.
    background: ({ bars, values }) =>
      bars.map((_, i) => {
        const v = values.vf[i]
        if (!Number.isFinite(v)) return null
        return v > 0 ? '#26a69a22' : '#ef535022'
      }),

    calc(bars, settings) {
      // A cleared number field arrives as '', and Number('') is 0.
      const length = Math.max(1, Math.floor(Number(settings.length) || 14))
      const alpha = 2 / (length + 1)
      const out = new Array(bars.length).fill(NaN)

      // Pine carries `warmup`, `e`, `ema_val` across bars with var.
      let warmup = true
      let e = 1
      let emaVal = 0

      for (let i = 0; i < bars.length; i++) {
        const close = bars[i].close
        // nz(src[1], src): the first bar compares against itself, so no change.
        const prev = i > 0 ? bars[i - 1].close : close
        const change = Number.isFinite(close) && Number.isFinite(prev) ? close - prev : 0
        // nz(volume, 0.0): a feed without volume contributes no force.
        const volume = Number.isFinite(bars[i].volume) ? bars[i].volume : 0
        const rawVf = change * volume

        emaVal = alpha * (rawVf - emaVal) + emaVal

        if (warmup) {
          e *= 1 - alpha
          const denom = 1 - e
          out[i] = denom > 0 ? emaVal / denom : emaVal
          warmup = e > 1e-10
        } else {
          out[i] = emaVal
        }
      }

      return { vf: nulls(out) }
    },
  })
}
