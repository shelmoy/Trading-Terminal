/**
 * Infinite Impulse Response (IIR) Filter - ported to openalgo-charts from Pine Script v4.
 *
 * Source: https://github.com/everget/tradingview-pinescript-indicators/blob/60c93d3711d222b8f2db96160defe568429348e0/movings/infinite_impulse_response_filter.pine
 * Repo:   everget/tradingview-pinescript-indicators
 * License: GPL-3.0 (c) 2018-present, Alex Orekhov (everget)
 * SPDX-FileCopyrightText: (c) 2018-present Alex Orekhov (everget)
 * SPDX-FileCopyrightText: (c) 2026 marketcalls (port to openalgo-charts)
 * SPDX-License-Identifier: GPL-3.0-only
 *
 * A single-pole recursive average fed with the source plus its own momentum over
 * the filter's lag, so the added change term cancels most of the lag an ordinary
 * exponential average of the same length would carry.
 */

export default function ({ registerIndicator, sourceValues, nulls }) {
  const UP = '#26a69a'
  const DOWN = '#ef5350'
  const FLAT = '#6d1e7f'

  registerIndicator({
    id: 'oa-infinite-impulse-response-filter',
    name: 'Infinite Impulse Response (IIR) Filter (IIRF)',
    category: 'Moving Averages',
    placement: 'onchart',

    inputs: [
      { key: 'length', type: 'number', label: 'Length', default: 14, min: 2, max: 5000, step: 1 },
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
        key: 'iirf',
        type: 'line',
        title: 'IIRF',
        style: { color: UP, lineWidth: 2 },
        colorBy: ({ index, values, settings }) => {
          if (settings.highlight === false) return FLAT
          const cur = values.iirf[index]
          const prev = index > 0 ? values.iirf[index - 1] : null
          // Pine compares against na as false, so a missing previous bar is red.
          if (!Number.isFinite(cur) || !Number.isFinite(prev)) return DOWN
          return cur > prev ? UP : DOWN
        },
      },
    ],

    calc(bars, settings) {
      // A cleared number field arrives as '', and Number('') is 0.
      const length = Math.max(2, Math.floor(Number(settings.length) || 14))
      const src = sourceValues(bars, settings.source ?? 'close')
      const n = bars.length

      const alpha = 2 / (length + 1)
      const lag = Math.max(1, Math.round(1 / alpha - 1))

      const out = new Array(n).fill(NaN)
      let prev = NaN

      for (let i = 0; i < n; i++) {
        const s = src[i]
        const back = i - lag >= 0 ? src[i - lag] : NaN
        // change(src, lag) is na until there are `lag` bars of history, and Pine
        // propagates that na straight into iirf for those bars.
        if (!Number.isFinite(s) || !Number.isFinite(back)) {
          out[i] = NaN
          prev = NaN
          continue
        }
        // nz(iirf[1]) reads a na previous value as 0.
        const carried = Number.isFinite(prev) ? prev : 0
        const value = alpha * (s + (s - back)) + (1 - alpha) * carried
        out[i] = value
        prev = value
      }

      return { iirf: nulls(out) }
    },
  })
}
