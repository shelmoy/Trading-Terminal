/**
 * Butterworth Filter (BF) - ported to openalgo-charts from Pine Script v4.
 *
 * Source: https://github.com/everget/tradingview-pinescript-indicators/blob/60c93d3711d222b8f2db96160defe568429348e0/movings/butterworth_filter.pine
 * Repo:   everget/tradingview-pinescript-indicators
 * License: GPL-3.0
 * SPDX-FileCopyrightText: (c) 2018-present Alex Orekhov (everget)
 * SPDX-FileCopyrightText: (c) 2026 marketcalls (port to openalgo-charts)
 * SPDX-License-Identifier: GPL-3.0-only
 *
 * Copyright (c) 2018-present, Alex Orekhov (everget)
 * Butterworth Filter script may be freely distributed under the terms of the
 * GPL-3.0 license.
 *
 * A two or three pole Butterworth low-pass filter: a maximally flat passband
 * smoother that removes short cycles with far less ripple than a moving
 * average of the same length.
 */

export default function ({ registerIndicator, sourceValues, nulls }) {
  const HIGHLIGHT_UP = '#4caf50'
  const HIGHLIGHT_DOWN = '#ff5252'
  const PLAIN = '#6d1e7f'

  registerIndicator({
    id: 'oa-butterworth-filter',
    name: 'Butterworth Filter (BF)',
    category: 'Moving Averages',
    placement: 'onchart',

    inputs: [
      { key: 'length', type: 'number', label: 'Length', default: 14, min: 1, max: 5000, step: 1 },
      {
        key: 'poles',
        type: 'select',
        label: 'Poles',
        default: 2,
        options: [
          { label: '2', value: 2 },
          { label: '3', value: 3 },
        ],
      },
      { key: 'source', type: 'source', label: 'Source', default: 'close' },
      { key: 'highlight', type: 'boolean', label: 'Highlight ?', default: true },
    ],

    plots: [
      {
        key: 'bf',
        type: 'line',
        title: 'BF',
        style: { color: PLAIN, lineWidth: 2 },
        // Pine: bfColor = highlight ? (bf > bf[1] ? green : red) : #6d1e7f
        // On the first bar bf[1] is na, so the comparison is false and Pine
        // paints red. A missing previous value therefore falls to red too.
        colorBy: ({ value, index, values, settings }) => {
          if (settings.highlight === false) return PLAIN
          const series = values && values.bf
          const previous = Array.isArray(series) ? series[index - 1] : NaN
          if (!Number.isFinite(previous)) return HIGHLIGHT_DOWN
          return value > previous ? HIGHLIGHT_UP : HIGHLIGHT_DOWN
        },
      },
    ],

    calc(bars, settings) {
      // A cleared number field arrives as '', and Number('') is 0.
      const length = Math.max(1, Math.floor(Number(settings.length) || 14))
      const poles = Math.round(Number(settings.poles)) === 3 ? 3 : 2
      const src = sourceValues(bars, settings.source ?? 'close')

      const PI = 2 * Math.asin(1)
      const out = new Array(bars.length).fill(NaN)

      if (poles === 2) {
        const a = Math.exp((-Math.SQRT2 * PI) / length)
        const b = 2 * a * Math.cos((Math.SQRT2 * PI) / length)
        const aSq = a * a
        for (let i = 0; i < bars.length; i++) {
          const s0 = src[i]
          if (!Number.isFinite(s0)) continue
          // Pine: src1 = nz(src[1], src), src2 = nz(src[2], src1).
          const s1 = Number.isFinite(src[i - 1]) ? src[i - 1] : s0
          const s2 = Number.isFinite(src[i - 2]) ? src[i - 2] : s1
          // Pine: bf1 = nz(bf[1], src), bf2 = nz(bf[2], bf1). The recursion is
          // seeded from the price, not from zero.
          const bf1 = Number.isFinite(out[i - 1]) ? out[i - 1] : s0
          const bf2 = Number.isFinite(out[i - 2]) ? out[i - 2] : bf1
          out[i] = b * bf1 - aSq * bf2 + ((1 - b + aSq) / 4) * (s0 + 2 * s1 + s2)
        }
      } else {
        const a = Math.exp(-PI / length)
        const b = 2 * a * Math.cos((1.738 * PI) / length)
        const c = a * a
        for (let i = 0; i < bars.length; i++) {
          const s0 = src[i]
          if (!Number.isFinite(s0)) continue
          const s1 = Number.isFinite(src[i - 1]) ? src[i - 1] : s0
          const s2 = Number.isFinite(src[i - 2]) ? src[i - 2] : s1
          const s3 = Number.isFinite(src[i - 3]) ? src[i - 3] : s2
          const bf1 = Number.isFinite(out[i - 1]) ? out[i - 1] : s0
          const bf2 = Number.isFinite(out[i - 2]) ? out[i - 2] : bf1
          const bf3 = Number.isFinite(out[i - 3]) ? out[i - 3] : bf2
          out[i] =
            (b + c) * bf1 -
            (c + b * c) * bf2 +
            c * c * bf3 +
            (((1 - b + c) * (1 - c)) / 8) * (s0 + 3 * s1 + 3 * s2 + s3)
        }
      }

      return { bf: nulls(out) }
    },
  })
}
