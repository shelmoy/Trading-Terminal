/**
 * SSF-Based Detrended Synthetic Price (SSF-DSP) - ported to openalgo-charts from
 * Pine Script v6.
 *
 * Source: https://github.com/mihakralj/pinescript/blob/c4e91b962be09733d8fc76caa5191e9e586c5cee/indicators/cycles/ssfdsp.pine
 * Repo:   mihakralj/pinescript
 * License: MIT (c) mihakralj
 * SPDX-FileCopyrightText: (c) mihakralj
 * SPDX-FileCopyrightText: (c) 2026 marketcalls (port to openalgo-charts)
 * SPDX-License-Identifier: MIT
 *
 * The difference between a quarter-cycle and a half-cycle Ehlers Super Smoother
 * filter. Subtracting the slower filter removes the trend and leaves an
 * oscillator centred on zero that tracks the dominant cycle.
 */

export default function ({ registerIndicator, sourceValues, nulls }) {
  registerIndicator({
    id: 'oa-ssfdsp',
    name: 'SSF-Based Detrended Synthetic Price',
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
        tooltip: 'Dominant cycle period. Quarter-cycle and half-cycle SSFs calculated from this value.',
      },
    ],

    plots: [{ key: 'ssfdsp', type: 'line', title: 'SSF-DSP', style: { color: '#ffeb3b', lineWidth: 2 } }],

    levels: () => [{ price: 0, title: 'Zero Line', color: '#787b86' }],

    calc(bars, settings) {
      // A cleared number field arrives as '', and Number('') is 0.
      const period = Math.min(200, Math.max(4, Math.floor(Number(settings.period) || 40)))
      const src = sourceValues(bars, settings.source ?? 'hlc3')
      const out = new Array(bars.length).fill(NaN)

      const fastPeriod = Math.max(2, Math.round(period / 4))
      const slowPeriod = Math.max(3, Math.round(period / 2))

      const SQRT2_PI = Math.sqrt(2) * Math.PI
      const argFast = SQRT2_PI / fastPeriod
      const expFast = Math.exp(-argFast)
      const c2Fast = 2 * expFast * Math.cos(argFast)
      const c3Fast = -expFast * expFast
      const c1Fast = 1 - c2Fast - c3Fast
      const argSlow = SQRT2_PI / slowPeriod
      const expSlow = Math.exp(-argSlow)
      const c2Slow = 2 * expSlow * Math.cos(argSlow)
      const c3Slow = -expSlow * expSlow
      const c1Slow = 1 - c2Slow - c3Slow

      let ssfFast1 = 0
      let ssfFast2 = 0
      let ssfSlow1 = 0
      let ssfSlow2 = 0
      let seeded = false

      for (let i = 0; i < bars.length; i++) {
        // Pine: nz(source) and nz(source[1], current).
        const current = Number.isFinite(src[i]) ? src[i] : 0
        const prevRaw = i > 0 ? src[i - 1] : NaN
        const prev = Number.isFinite(prevRaw) ? prevRaw : current
        const input = (current + prev) * 0.5

        // The period is constant, so Pine's period-change reset only ever fires
        // on the first bar, where both filter states are seeded with the input.
        if (!seeded) {
          ssfFast1 = input
          ssfFast2 = input
          ssfSlow1 = input
          ssfSlow2 = input
          seeded = true
        }

        const ssfFast = c1Fast * input + c2Fast * ssfFast1 + c3Fast * ssfFast2
        ssfFast2 = ssfFast1
        ssfFast1 = ssfFast

        const ssfSlow = c1Slow * input + c2Slow * ssfSlow1 + c3Slow * ssfSlow2
        ssfSlow2 = ssfSlow1
        ssfSlow1 = ssfSlow

        const value = ssfFast - ssfSlow
        if (!Number.isFinite(value)) continue
        out[i] = value
      }

      return { ssfdsp: nulls(out) }
    },
  })
}
