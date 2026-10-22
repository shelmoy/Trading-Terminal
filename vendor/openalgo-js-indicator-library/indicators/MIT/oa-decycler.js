/**
 * Ehlers Decycler (DECYCLER) - ported to openalgo-charts from Pine Script v6.
 *
 * Source: https://github.com/mihakralj/pinescript/blob/c4e91b962be09733d8fc76caa5191e9e586c5cee/indicators/trends_IIR/decycler.pine
 * Repo:   mihakralj/pinescript
 * License: MIT
 * SPDX-FileCopyrightText: (c) mihakralj
 * SPDX-FileCopyrightText: (c) 2026 marketcalls (port to openalgo-charts)
 * SPDX-License-Identifier: MIT
 *
 * A two-pole Butterworth high-pass filter is subtracted from price, so cycles
 * shorter than the cutoff period are removed and what is left is the trend with
 * almost no lag.
 */

export default function ({ registerIndicator, sourceValues, nulls }) {
  registerIndicator({
    id: 'oa-decycler',
    name: 'Ehlers Decycler (DECYCLER)',
    category: 'Trends IIR',
    placement: 'onchart',

    inputs: [
      {
        key: 'period',
        type: 'number',
        label: 'Period',
        default: 60,
        min: 1,
        max: 5000,
        step: 1,
        tooltip: 'Cutoff period for the high-pass filter',
      },
      { key: 'source', type: 'source', label: 'Source', default: 'close' },
    ],

    plots: [{ key: 'decycler', type: 'line', title: 'DECYCLER', style: { color: '#ffeb3b', lineWidth: 2 } }],

    calc(bars, settings) {
      // A cleared number field arrives as '', and Number('') is 0.
      const period = Math.max(1, Math.floor(Number(settings.period) || 60))
      const src = sourceValues(bars, settings.source ?? 'close')

      const n = bars.length
      const out = new Array(n).fill(NaN)

      // Butterworth two-pole high-pass coefficient.
      const arg = (0.707 * 2 * Math.PI) / period
      const cosArg = Math.cos(arg)
      const alpha = Math.abs(cosArg) > 1e-10 ? (cosArg + Math.sin(arg) - 1) / cosArg : 0
      const omah = 1 - alpha * 0.5
      const oma = 1 - alpha
      const a1 = omah * omah
      const b1 = 2 * oma
      const c1 = -(oma * oma)

      let hp = 0
      let hp1 = 0

      for (let i = 0; i < n; i++) {
        // The source nz()s price to zero before differencing, and reads the two
        // prior nz()ed values, so the first two bars difference against zero.
        const s0 = Number.isFinite(src[i]) ? src[i] : 0
        const s1 = i >= 1 && Number.isFinite(src[i - 1]) ? src[i - 1] : 0
        const s2 = i >= 2 && Number.isFinite(src[i - 2]) ? src[i - 2] : 0
        const diff = s0 - 2 * s1 + s2

        // The filter is held at zero until two prior bars exist.
        const newHp = i < 2 ? 0 : a1 * diff + b1 * hp + c1 * hp1
        hp1 = hp
        hp = newHp

        if (Number.isFinite(src[i]) && Number.isFinite(newHp)) out[i] = s0 - newHp
      }

      return { decycler: nulls(out) }
    },
  })
}
