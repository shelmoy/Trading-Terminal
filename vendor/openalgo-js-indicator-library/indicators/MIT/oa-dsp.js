/**
 * Detrended Synthetic Price (DSP) - ported to openalgo-charts from Pine Script v6.
 *
 * Source: https://github.com/mihakralj/pinescript/blob/c4e91b962be09733d8fc76caa5191e9e586c5cee/indicators/cycles/dsp.pine
 * Repo:   mihakralj/pinescript
 * License: MIT (c) mihakralj
 * SPDX-FileCopyrightText: (c) mihakralj
 * SPDX-FileCopyrightText: (c) 2026 marketcalls (port to openalgo-charts)
 * SPDX-License-Identifier: MIT
 *
 * Ehlers' detrended synthetic price: the gap between a quarter-cycle and a
 * half-cycle EMA, which strips the trend out and leaves the dominant cycle
 * swinging around zero.
 */

export default function ({ registerIndicator, sourceValues, nulls }) {
  registerIndicator({
    id: 'oa-dsp',
    name: 'Detrended Synthetic Price (DSP)',
    category: 'Cycles',
    placement: 'pane',

    inputs: [
      { key: 'source', type: 'source', label: 'Source', default: 'hlc3' },
      {
        key: 'period',
        type: 'number',
        label: 'Dominant Cycle Period',
        default: 40,
        min: 4,
        max: 200,
        step: 1,
        tooltip: 'Dominant cycle period. Quarter-cycle and half-cycle EMAs calculated from this value.',
      },
    ],

    plots: [{ key: 'dsp', type: 'line', title: 'DSP', style: { color: '#ffeb3b', lineWidth: 2 } }],

    levels: () => [{ price: 0, title: 'Zero Line', color: '#9598a1' }],

    calc(bars, settings) {
      // A cleared number field arrives as '', and Number('') is 0.
      const period = Math.min(200, Math.max(4, Math.floor(Number(settings.period) || 40)))
      const src = sourceValues(bars, settings.source ?? 'hlc3')

      const fastPeriod = Math.max(2, Math.round(period / 4))
      const slowPeriod = Math.max(3, Math.round(period / 2))
      const alphaFast = 2 / (fastPeriod + 1)
      const alphaSlow = 2 / (slowPeriod + 1)

      const out = new Array(bars.length).fill(NaN)

      // Both EMAs start at zero and are divided by the remaining decay weight
      // until that weight is exhausted, which is Pine's bias-corrected warmup.
      let emaFastRaw = 0
      let emaSlowRaw = 0
      let warmup = true
      let eFast = 1
      let eSlow = 1

      for (let i = 0; i < bars.length; i++) {
        const current = Number.isFinite(src[i]) ? src[i] : 0

        emaFastRaw += alphaFast * (current - emaFastRaw)
        emaSlowRaw += alphaSlow * (current - emaSlowRaw)

        let emaFast = emaFastRaw
        let emaSlow = emaSlowRaw

        if (warmup) {
          eFast *= 1 - alphaFast
          eSlow *= 1 - alphaSlow
          const denomFast = 1 - eFast
          const denomSlow = 1 - eSlow
          const cFast = denomFast !== 0 ? 1 / denomFast : 1
          const cSlow = denomSlow !== 0 ? 1 / denomSlow : 1
          emaFast = cFast * emaFastRaw
          emaSlow = cSlow * emaSlowRaw
          warmup = eFast > 1e-10 || eSlow > 1e-10
        }

        const value = emaFast - emaSlow
        if (Number.isFinite(value)) out[i] = value
      }

      return { dsp: nulls(out) }
    },
  })
}
