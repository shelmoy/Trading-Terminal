/**
 * Modular Filter (MODF) - ported to openalgo-charts from Pine Script v6.
 *
 * Source: https://github.com/mihakralj/pinescript/blob/c4e91b962be09733d8fc76caa5191e9e586c5cee/indicators/filters/modf.pine
 * Repo:   mihakralj/pinescript
 * License: MIT (c) mihakralj
 * SPDX-FileCopyrightText: (c) mihakralj
 * SPDX-FileCopyrightText: (c) 2026 marketcalls (port to openalgo-charts)
 * SPDX-License-Identifier: MIT
 *
 * Two exponential bands, one that snaps up to price and one that snaps down to
 * it, with a latched state choosing which side leads. Beta blends the two, so
 * 1.0 behaves as a smooth filter and 0.0 as a trailing stop. Original filter by
 * alexgrover.
 */

export default function ({ registerIndicator, sourceValues, clamp, nulls }) {
  // A cleared field arrives as '' and Number('') is 0, so an empty box must fall
  // back to the default while a genuine 0 is kept.
  const num = (value, fallback) => {
    if (value === '' || value === null || value === undefined) return fallback
    const n = Number(value)
    return Number.isFinite(n) ? n : fallback
  }

  registerIndicator({
    id: 'oa-modf',
    name: 'Modular Filter (MODF)',
    category: 'Filters',
    placement: 'onchart',

    inputs: [
      { key: 'period', type: 'number', label: 'Period', default: 14, min: 2, max: 5000, step: 1 },
      {
        key: 'beta',
        type: 'number',
        label: 'Beta',
        default: 0.8,
        min: 0,
        max: 1,
        step: 0.1,
        tooltip: 'Blend weight: 1.0 is a smooth filter, 0.0 is a trailing stop.',
      },
      { key: 'feedback', type: 'boolean', label: 'Feedback', default: false },
      {
        key: 'fbWeight',
        type: 'number',
        label: 'Feedback Weight',
        default: 0.5,
        min: 0.01,
        max: 1,
        step: 0.05,
        tooltip: 'Only used when Feedback is on. Lower is smoother.',
      },
      { key: 'source', type: 'source', label: 'Source', default: 'close' },
    ],

    plots: [{ key: 'modf', type: 'line', title: 'MODF', style: { color: '#ffeb3b', lineWidth: 2 } }],

    calc(bars, settings) {
      const period = Math.max(2, Math.floor(Number(settings.period) || 14))
      const beta = clamp(num(settings.beta, 0.8), 0, 1)
      const feedback = settings.feedback === true
      const fbWeight = clamp(num(settings.fbWeight, 0.5), 0.01, 1)
      const src = sourceValues(bars, settings.source ?? 'close')

      const alpha = 2 / (period + 1)
      const oneMinusAlpha = 1 - alpha

      // Pine declares these as var float = 0.0, so nz() never fires on them and
      // the first bar genuinely smooths against zero.
      let b = 0
      let c = 0
      let os = 0
      let ts = 0

      const out = new Array(bars.length).fill(NaN)

      for (let i = 0; i < bars.length; i++) {
        const value = src[i]
        // A missing source would poison every later bar through the recursion,
        // so the bar is skipped and the carried state left untouched.
        if (!Number.isFinite(value)) continue

        const a = feedback ? fbWeight * value + (1 - fbWeight) * ts : value

        const emaB = alpha * a + oneMinusAlpha * b
        b = a > emaB ? a : emaB

        const emaC = alpha * a + oneMinusAlpha * c
        c = a < emaC ? a : emaC

        // The state latches: it only changes on a bar where the input touches a
        // band, otherwise the previous side is carried forward.
        os = a === b ? 1 : a === c ? 0 : os

        const upper = beta * b + (1 - beta) * c
        const lower = beta * c + (1 - beta) * b

        ts = os * upper + (1 - os) * lower
        out[i] = ts
      }

      return { modf: nulls(out) }
    },
  })
}
