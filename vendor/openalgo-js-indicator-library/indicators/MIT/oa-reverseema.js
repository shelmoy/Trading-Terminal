/**
 * Ehlers Reverse EMA (REVERSEEMA) - ported to openalgo-charts from Pine Script v6.
 *
 * Source: https://github.com/mihakralj/pinescript/blob/c4e91b962be09733d8fc76caa5191e9e586c5cee/indicators/oscillators/reverseema.pine
 * Repo:   mihakralj/pinescript
 * License: MIT (c) mihakralj
 * SPDX-FileCopyrightText: (c) mihakralj
 * SPDX-FileCopyrightText: (c) 2026 marketcalls (port to openalgo-charts)
 * SPDX-License-Identifier: MIT
 *
 * Inverts the EMA transfer function through eight cascaded reverse stages and
 * subtracts the result from the EMA itself, leaving a zero-centred oscillator
 * that carries the smoothing without the lag.
 */

export default function ({ registerIndicator, sourceValues, nulls }) {
  registerIndicator({
    id: 'oa-reverseema',
    name: 'Ehlers Reverse EMA (REVERSEEMA)',
    category: 'Oscillators',
    placement: 'pane',

    inputs: [
      {
        key: 'period',
        type: 'number',
        label: 'Period',
        default: 20,
        min: 1,
        max: 5000,
        step: 1,
        tooltip: 'Lookback period for the base EMA.',
      },
      { key: 'source', type: 'source', label: 'Source', default: 'close' },
    ],

    plots: [{ key: 'reverseema', type: 'line', title: 'REVERSEEMA', style: { color: '#ffeb3b', lineWidth: 2 } }],

    levels: () => [{ price: 0, title: 'Zero', color: '#787b86' }],

    calc(bars, settings) {
      // A cleared number field arrives as '', and Number('') is 0.
      const period = Math.max(1, Math.floor(Number(settings.period) || 20))
      const src = sourceValues(bars, settings.source ?? 'close')

      const a = 2 / (period + 1)
      const cc = 1 - a
      const beta = cc

      // Stage k multiplies by cc^(2^(k-1)): 1, 2, 4, 8, 16, 32, 64, 128.
      const cc2 = cc * cc
      const cc4 = cc2 * cc2
      const cc8 = cc4 * cc4
      const cc16 = cc8 * cc8
      const cc32 = cc16 * cc16
      const cc64 = cc32 * cc32
      const cc128 = cc64 * cc64

      // Forward EMA with the warmup compensator, plus the eight reverse stages.
      // Every one of these is a Pine `var`, so the state lives outside the loop.
      let warmup = true
      let e = 1
      let emaRaw = 0
      let emaVal = 0
      // Pine reads nz(ema_val[1]), which is 0 on the first bar.
      let prevEmaVal = 0
      let re1 = 0
      let re2 = 0
      let re3 = 0
      let re4 = 0
      let re5 = 0
      let re6 = 0
      let re7 = 0
      let re8 = 0

      const out = new Array(bars.length).fill(NaN)

      for (let i = 0; i < bars.length; i++) {
        // Pine substitutes 0.0 for a na source before smoothing, then blanks the
        // output again at the end, so the state advances on every bar.
        const raw = src[i]
        const s = Number.isFinite(raw) ? raw : 0

        emaRaw = a * (s - emaRaw) + emaRaw
        if (warmup) {
          e *= beta
          const denom = 1 - e
          // denom is a (= 1 - beta) on the first bar and only grows from there,
          // so it is positive for every period, but guard it anyway.
          const comp = denom !== 0 ? 1 / denom : 1
          emaVal = comp * emaRaw
          warmup = e > 1e-10
        } else {
          emaVal = emaRaw
        }

        // Each stage reads the PREVIOUS bar's value of the stage below it, so
        // capture them before any assignment overwrites them.
        const prevEma = prevEmaVal
        const prevRe1 = re1
        const prevRe2 = re2
        const prevRe3 = re3
        const prevRe4 = re4
        const prevRe5 = re5
        const prevRe6 = re6
        const prevRe7 = re7

        re1 = cc * emaVal + prevEma
        re2 = cc2 * re1 + prevRe1
        re3 = cc4 * re2 + prevRe2
        re4 = cc8 * re3 + prevRe3
        re5 = cc16 * re4 + prevRe4
        re6 = cc32 * re5 + prevRe5
        re7 = cc64 * re6 + prevRe6
        re8 = cc128 * re7 + prevRe7

        prevEmaVal = emaVal

        if (Number.isFinite(raw)) out[i] = emaVal - a * re8
      }

      return { reverseema: nulls(out) }
    },
  })
}
