/**
 * Lanczos (Sinc) Window Moving Average (LANCZOS) - ported to openalgo-charts
 * from Pine Script v6.
 *
 * Source: https://github.com/mihakralj/pinescript/blob/c4e91b962be09733d8fc76caa5191e9e586c5cee/indicators/trends_FIR/lanczos.pine
 * Repo:   mihakralj/pinescript
 * License: MIT (c) mihakralj
 * SPDX-FileCopyrightText: (c) mihakralj
 * SPDX-FileCopyrightText: (c) 2026 marketcalls (port to openalgo-charts)
 * SPDX-License-Identifier: MIT
 *
 * A finite impulse response average whose weights come from one lobe of the
 * sinc function, giving a smoother roll-off at the window edges than a flat
 * or triangular window.
 */

export default function ({ registerIndicator, sourceValues, nulls }) {
  registerIndicator({
    id: 'oa-lanczos',
    name: 'Lanczos (Sinc) Window Moving Average (LANCZOS)',
    category: 'Trends FIR',
    placement: 'onchart',

    inputs: [
      { key: 'period', type: 'number', label: 'Period', default: 14, min: 2, max: 5000, step: 1 },
      { key: 'source', type: 'source', label: 'Source', default: 'close' },
    ],

    plots: [{ key: 'lanczos', type: 'line', title: 'LANCZOS', style: { color: '#ffeb3b', lineWidth: 2 } }],

    calc(bars, settings) {
      // A cleared number field arrives as '', and Number('') is 0. Pine raises
      // below 2, so clamp there rather than throwing.
      const period = Math.max(2, Math.floor(Number(settings.period) || 14))
      const src = sourceValues(bars, settings.source ?? 'close')

      // w(k) = sinc(2k/(N-1) - 1), sinc(x) = sin(pi*x)/(pi*x), sinc(0) = 1.
      // weights[0] weights the oldest bar in the window, weights[N-1] the newest.
      const weights = new Array(period)
      const nm1 = (period - 1) * 1.0
      let wsum = 0
      for (let k = 0; k < period; k++) {
        const x = nm1 > 0 ? (2.0 * k) / nm1 - 1.0 : 0.0
        const pix = Math.PI * x
        const w = Math.abs(pix) < 1e-8 ? 1.0 : Math.sin(pix) / pix
        weights[k] = w
        wsum += w
      }
      // Pine normalises only when the raw weights sum to something usable.
      if (wsum > 1e-15) {
        for (let j = 0; j < period; j++) weights[j] = weights[j] / wsum
      }

      const out = new Array(bars.length).fill(NaN)
      for (let i = 0; i < bars.length; i++) {
        const price = Number.isFinite(src[i]) ? src[i] : 0 // Pine nz(source)
        if (i + 1 < period) {
          // Pine returns the raw source until the window is full.
          out[i] = price
          continue
        }
        let result = 0
        for (let j = 0; j < period; j++) {
          const v = src[i - (period - 1) + j]
          result += (Number.isFinite(v) ? v : 0) * weights[j]
        }
        out[i] = result
      }

      return { lanczos: nulls(out) }
    },
  })
}
