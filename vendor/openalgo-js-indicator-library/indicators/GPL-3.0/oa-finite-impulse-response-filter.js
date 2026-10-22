/**
 * Finite Impulse Response (FIR) Filter - ported to openalgo-charts from Pine Script v4.
 *
 * Source: https://github.com/everget/tradingview-pinescript-indicators/blob/60c93d3711d222b8f2db96160defe568429348e0/movings/finite_impulse_response_filter.pine
 * Repo:   everget/tradingview-pinescript-indicators
 * License: GPL-3.0 (c) 2018-present, Alex Orekhov (everget)
 * SPDX-FileCopyrightText: (c) 2018-present Alex Orekhov (everget)
 * SPDX-FileCopyrightText: (c) 2026 marketcalls (port to openalgo-charts)
 * SPDX-License-Identifier: GPL-3.0-only
 *
 * A seven-tap weighted average of the source and its six previous values,
 * normalised by the sum of the taps. The default taps are a low-pass shape with
 * two negative trailing weights, which sharpens the turn at the cost of a little
 * overshoot.
 */

export default function ({ registerIndicator, sourceValues, nulls }) {
  // A cleared number field arrives as '', and Number('') is 0, which would
  // silently replace a coefficient. A tap of 0 is legal, so the empty case has
  // to be tested before the numeric conversion.
  const coef = (value, fallback) => {
    if (value === '' || value === null || value === undefined) return fallback
    const n = Number(value)
    return Number.isFinite(n) ? n : fallback
  }

  const UP = '#26a69a'
  const DOWN = '#ef5350'
  const FLAT = '#6d1e7f'

  registerIndicator({
    id: 'oa-finite-impulse-response-filter',
    name: 'Finite Impulse Response (FIR) Filter (FIRF)',
    category: 'Moving Averages',
    placement: 'onchart',

    inputs: [
      { key: 'coef1', type: 'number', label: '1st Coefficient', default: 1, min: -100, max: 100, step: 0.1 },
      { key: 'coef2', type: 'number', label: '2nd Coefficient', default: 3.5, min: -100, max: 100, step: 0.1 },
      { key: 'coef3', type: 'number', label: '3rd Coefficient', default: 4.5, min: -100, max: 100, step: 0.1 },
      { key: 'coef4', type: 'number', label: '4th Coefficient', default: 3, min: -100, max: 100, step: 0.1 },
      { key: 'coef5', type: 'number', label: '5th Coefficient', default: 0.5, min: -100, max: 100, step: 0.1 },
      { key: 'coef6', type: 'number', label: '6th Coefficient', default: -0.5, min: -100, max: 100, step: 0.1 },
      { key: 'coef7', type: 'number', label: '7th Coefficient', default: -1.5, min: -100, max: 100, step: 0.1 },
      { key: 'source', type: 'source', label: 'Source', default: 'close' },
      {
        key: 'highlight',
        type: 'boolean',
        label: 'Highlight ?',
        default: true,
        tooltip: 'Colour the line green while it is rising and red while it is falling.',
      },
    ],

    plots: [
      {
        key: 'firf',
        type: 'line',
        title: 'FIRF',
        style: { color: UP, lineWidth: 2 },
        colorBy: ({ index, values, settings }) => {
          if (settings.highlight === false) return FLAT
          const cur = values.firf[index]
          const prev = index > 0 ? values.firf[index - 1] : null
          // Pine compares against na as false, so a missing previous bar is red.
          if (!Number.isFinite(cur) || !Number.isFinite(prev)) return DOWN
          return cur > prev ? UP : DOWN
        },
      },
    ],

    calc(bars, settings) {
      const c1 = coef(settings.coef1, 1)
      const c2 = coef(settings.coef2, 3.5)
      const c3 = coef(settings.coef3, 4.5)
      const c4 = coef(settings.coef4, 3)
      const c5 = coef(settings.coef5, 0.5)
      const c6 = coef(settings.coef6, -0.5)
      const c7 = coef(settings.coef7, -1.5)
      const src = sourceValues(bars, settings.source ?? 'close')
      const n = bars.length

      const out = new Array(n).fill(NaN)
      const coefSum = c1 + c2 + c3 + c4 + c5 + c6 + c7
      // Taps that cancel out leave nothing to normalise by.
      if (!Number.isFinite(coefSum) || coefSum === 0) return { firf: nulls(out) }

      for (let i = 0; i < n; i++) {
        const s0 = src[i]
        if (!Number.isFinite(s0)) continue
        // nz(src[k], <previous tap>) walks the fallback down the chain, so the
        // filter emits from the very first bar instead of waiting six bars.
        const s1 = i >= 1 && Number.isFinite(src[i - 1]) ? src[i - 1] : s0
        const s2 = i >= 2 && Number.isFinite(src[i - 2]) ? src[i - 2] : s1
        const s3 = i >= 3 && Number.isFinite(src[i - 3]) ? src[i - 3] : s2
        const s4 = i >= 4 && Number.isFinite(src[i - 4]) ? src[i - 4] : s3
        const s5 = i >= 5 && Number.isFinite(src[i - 5]) ? src[i - 5] : s4
        const s6 = i >= 6 && Number.isFinite(src[i - 6]) ? src[i - 6] : s5

        out[i] = (c1 * s0 + c2 * s1 + c3 * s2 + c4 * s3 + c5 * s4 + c6 * s5 + c7 * s6) / coefSum
      }

      return { firf: nulls(out) }
    },
  })
}
