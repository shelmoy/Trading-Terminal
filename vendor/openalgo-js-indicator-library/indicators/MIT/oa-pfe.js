/**
 * PFE: Polarized Fractal Efficiency - ported to openalgo-charts from Pine Script v6.
 *
 * Source: https://github.com/mihakralj/pinescript/blob/c4e91b962be09733d8fc76caa5191e9e586c5cee/indicators/dynamics/pfe.pine
 * Repo:   mihakralj/pinescript
 * License: MIT (c) mihakralj
 * SPDX-FileCopyrightText: (c) mihakralj
 * SPDX-FileCopyrightText: (c) 2026 marketcalls (port to openalgo-charts)
 * SPDX-License-Identifier: MIT
 *
 * Compares the straight-line distance price covered over the lookback with the
 * jagged bar-by-bar path it actually walked. A reading near +/-100 is an
 * efficient directional move, one near zero is chop. Hans Hannula, TASC 1994.
 */

export default function ({ registerIndicator, nulls }) {
  registerIndicator({
    id: 'oa-pfe',
    name: 'PFE: Polarized Fractal Efficiency',
    category: 'Dynamics',
    placement: 'pane',

    inputs: [
      {
        key: 'period',
        type: 'number',
        label: 'Period',
        default: 10,
        min: 2,
        max: 200,
        step: 1,
        tooltip: 'Fractal path lookback period (Hannula default: 10).',
      },
      {
        key: 'smooth',
        type: 'number',
        label: 'Smooth Period',
        default: 5,
        min: 1,
        max: 100,
        step: 1,
        tooltip: 'EMA smoothing period applied to the raw efficiency (Hannula default: 5).',
      },
    ],

    plots: [{ key: 'pfe', type: 'line', title: 'PFE', style: { color: '#ffeb3b', lineWidth: 2 } }],

    levels: () => [
      { price: 50, title: 'Upper Threshold', color: '#ff5252', dashed: true },
      { price: -50, title: 'Lower Threshold', color: '#4caf50', dashed: true },
      { price: 0, title: 'Zero Line', color: '#787b86', dashed: true },
    ],

    calc(bars, settings) {
      // A cleared number field arrives as '', and Number('') is 0.
      const period = Math.min(200, Math.max(2, Math.floor(Number(settings.period) || 10)))
      const smooth = Math.min(100, Math.max(1, Math.floor(Number(settings.smooth) || 5)))

      const n = bars.length
      const out = new Array(n).fill(NaN)
      if (n === 0) return { pfe: nulls(out) }

      const close = bars.map((b) => b.close)

      // Each bar-to-bar path element is sqrt(dClose^2 + 1). Prefix-summing them
      // turns the rolling fractal path over `period` steps into one subtraction,
      // which is what the Pine source's circular buffer is doing by hand.
      const prefix = new Array(n + 1).fill(0)
      for (let i = 0; i < n; i++) {
        let stepLen = 0
        if (i > 0 && Number.isFinite(close[i]) && Number.isFinite(close[i - 1])) {
          const d = close[i] - close[i - 1]
          stepLen = Math.sqrt(d * d + 1)
        }
        prefix[i + 1] = prefix[i] + stepLen
      }

      // The source carries its own warmup-compensated EMA rather than ta.ema:
      // the first reading seeds the average outright, and later readings are
      // scaled by 1 / (1 - beta^k) until that factor has decayed to one.
      let emaValue = NaN
      let e = 1
      let warmup = true
      const alpha = 2 / (smooth + 1)
      const beta = 1 - alpha

      for (let i = 0; i < n; i++) {
        // The Pine buffer holds period + 1 closes, so the first raw value lands
        // on bar index `period`, never earlier.
        if (i < period) continue
        if (!Number.isFinite(close[i]) || !Number.isFinite(close[i - period])) continue

        const priceDiff = close[i] - close[i - period]
        const straightLine = Math.sqrt(priceDiff * priceDiff + period * period)
        const fractalPath = prefix[i + 1] - prefix[i - period + 1]
        // A non-positive path means nothing moved; the source leaves the bar na
        // and does not advance the smoothing state.
        if (!(fractalPath > 0)) continue

        const efficiency = (straightLine / fractalPath) * 100
        const raw = priceDiff >= 0 ? efficiency : -efficiency

        if (!Number.isFinite(emaValue)) {
          emaValue = raw
          e = beta
          out[i] = raw
        } else {
          emaValue = alpha * raw + beta * emaValue
          if (warmup) {
            e *= beta
            const comp = 1 / (1 - e)
            out[i] = Number.isFinite(comp) ? comp * emaValue : emaValue
            warmup = e > 1e-10
          } else {
            out[i] = emaValue
          }
        }
      }

      return { pfe: nulls(out) }
    },
  })
}
