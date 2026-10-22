/**
 * TUKEY_W: Tukey (Tapered Cosine) Window MA - ported to openalgo-charts from
 * Pine Script v6.
 *
 * Source: https://github.com/mihakralj/pinescript/blob/c4e91b962be09733d8fc76caa5191e9e586c5cee/indicators/trends_FIR/tukey_w.pine
 * Repo:   mihakralj/pinescript
 * License: MIT
 * SPDX-FileCopyrightText: (c) mihakralj
 * SPDX-FileCopyrightText: (c) 2026 marketcalls (port to openalgo-charts)
 * SPDX-License-Identifier: MIT
 *
 * A finite impulse response average whose weights are flat through the middle
 * of the window and cosine tapered at both edges, so alpha 0 is a simple moving
 * average and alpha 1 is a Hann window.
 */

export default function ({ registerIndicator, nulls }) {
  registerIndicator({
    id: 'oa-tukey-w',
    name: 'TUKEY_W: Tukey (Tapered Cosine) Window MA',
    category: 'Trends FIR',
    placement: 'onchart',

    inputs: [
      { key: 'period', type: 'number', label: 'Period', default: 20, min: 2, max: 1000, step: 1 },
      {
        key: 'alpha',
        type: 'number',
        label: 'Alpha (taper fraction)',
        default: 0.5,
        min: 0,
        max: 1,
        step: 0.05,
        tooltip: '0=SMA, 1=Hann, 0.5=half taper',
      },
    ],

    plots: [{ key: 'tukey', type: 'line', title: 'TUKEY_W', style: { color: '#ffeb3b', lineWidth: 2 } }],

    calc(bars, settings) {
      // A cleared number field arrives as ''. Zero is a legal alpha, so the
      // cleared case is tested on its own rather than with a falsy fallback.
      const period = Math.max(2, Math.floor(Number(settings.period) || 20))
      const alphaRaw = Number(settings.alpha)
      const alpha =
        settings.alpha === '' || settings.alpha === null || settings.alpha === undefined || !Number.isFinite(alphaRaw)
          ? 0.5
          : Math.min(1, Math.max(0, alphaRaw))

      const out = new Array(bars.length).fill(NaN)

      const N = period - 1
      const aN = alpha * N

      // The weights depend only on the settings, so build them once.
      const weights = new Array(period)
      let sumW = 0
      for (let i = 0; i <= N; i++) {
        let w = 1
        if (aN > 0) {
          if (i < aN / 2) w = 0.5 * (1 - Math.cos((2 * Math.PI * i) / aN))
          else if (i > N - aN / 2) w = 0.5 * (1 - Math.cos((2 * Math.PI * (N - i)) / aN))
        }
        weights[i] = w
        sumW += w
      }

      // With period 2 and alpha 1 every weight is zero, which Pine resolves to
      // na rather than a divide by zero.
      if (!(sumW > 0)) return { tukey: nulls(out) }

      // Pine's src[i] is na before enough history exists, and that na reaches
      // the result, so the first period-1 bars stay blank.
      for (let t = N; t < bars.length; t++) {
        let sumWV = 0
        let ok = true
        for (let i = 0; i <= N; i++) {
          const v = bars[t - i].close
          if (!Number.isFinite(v)) {
            ok = false
            break
          }
          sumWV += v * weights[i]
        }
        if (ok) out[t] = sumWV / sumW
      }

      return { tukey: nulls(out) }
    },
  })
}
