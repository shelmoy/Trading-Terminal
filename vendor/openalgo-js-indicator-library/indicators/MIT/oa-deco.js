/**
 * Ehlers Decycler Oscillator (DECO) - ported to openalgo-charts from Pine Script v6.
 *
 * Source: https://github.com/mihakralj/pinescript/blob/c4e91b962be09733d8fc76caa5191e9e586c5cee/indicators/oscillators/deco.pine
 * Repo:   mihakralj/pinescript
 * License: MIT
 * SPDX-FileCopyrightText: (c) mihakralj
 * SPDX-FileCopyrightText: (c) 2026 marketcalls (port to openalgo-charts)
 * SPDX-License-Identifier: MIT
 *
 * The difference between two 2-pole Butterworth high-pass filters, one cut at a
 * long cycle and one at a short cycle, so only the band of cycles between the
 * two periods survives and the trend is removed.
 */

export default function ({ registerIndicator, sourceValues, nulls }) {
  // Butterworth 2-pole high-pass coefficients for one cutoff period.
  const hpCoeffs = (period) => {
    const arg = (0.707 * 2.0 * Math.PI) / period
    const cosArg = Math.cos(arg)
    if (!Number.isFinite(cosArg) || cosArg === 0) return null
    const alpha = (cosArg + Math.sin(arg) - 1.0) / cosArg
    const omah = 1.0 - alpha * 0.5
    const oma = 1.0 - alpha
    return { a1: omah * omah, b1: 2.0 * oma, c1: -(oma * oma) }
  }

  registerIndicator({
    id: 'oa-deco',
    name: 'Ehlers Decycler Oscillator (DECO)',
    category: 'Oscillators',
    placement: 'pane',

    inputs: [
      {
        key: 'shortPeriod',
        type: 'number',
        label: 'Short Period',
        default: 30,
        min: 1,
        max: 500,
        step: 1,
        tooltip: 'Short cycle cutoff period for high-pass filter.',
      },
      {
        key: 'longPeriod',
        type: 'number',
        label: 'Long Period',
        default: 60,
        min: 2,
        max: 1000,
        step: 1,
        tooltip: 'Long cycle cutoff period for high-pass filter.',
      },
      { key: 'source', type: 'source', label: 'Source', default: 'close', tooltip: 'Price series to analyze.' },
    ],

    plots: [{ key: 'deco', type: 'line', title: 'DECO', style: { color: '#ffeb3b', lineWidth: 2 } }],

    levels: () => [{ price: 0, title: 'Zero Line', color: '#787b86', dashed: true }],

    calc(bars, settings) {
      // A cleared number field arrives as '', and Number('') is 0.
      const shortPeriod = Math.max(1, Math.floor(Number(settings.shortPeriod) || 30))
      const longPeriod = Math.max(2, Math.floor(Number(settings.longPeriod) || 60))
      const src = sourceValues(bars, settings.source ?? 'close')

      const out = new Array(bars.length).fill(NaN)

      // Pine raises a runtime error when the short cutoff is not below the long
      // one; here that draws nothing rather than showing a meaningless series.
      if (shortPeriod >= longPeriod) return { deco: nulls(out) }

      const cs = hpCoeffs(shortPeriod)
      const cl = hpCoeffs(longPeriod)
      if (!cs || !cl) return { deco: nulls(out) }

      // Pine: float src = na(source) ? 0.0 : source, then nz() on each lag.
      const x = new Array(bars.length)
      for (let i = 0; i < bars.length; i++) x[i] = Number.isFinite(src[i]) ? src[i] : 0

      let hpS = 0
      let hpS1 = 0
      let hpL = 0
      let hpL1 = 0

      for (let i = 0; i < bars.length; i++) {
        const x1 = i >= 1 ? x[i - 1] : 0
        const x2 = i >= 2 ? x[i - 2] : 0
        const diff = x[i] - 2.0 * x1 + x2

        const newHpS = i < 2 ? 0 : cs.a1 * diff + cs.b1 * hpS + cs.c1 * hpS1
        const newHpL = i < 2 ? 0 : cl.a1 * diff + cl.b1 * hpL + cl.c1 * hpL1

        hpS1 = hpS
        hpS = newHpS
        hpL1 = hpL
        hpL = newHpL

        // Pine returns na only where the source itself is na.
        if (Number.isFinite(src[i])) out[i] = newHpL - newHpS
      }

      return { deco: nulls(out) }
    },
  })
}
