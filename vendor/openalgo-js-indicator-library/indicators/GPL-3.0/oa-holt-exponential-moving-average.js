/**
 * Holt Exponential Moving Average (HEMA) - ported to openalgo-charts from Pine Script v4.
 *
 * Source: https://github.com/everget/tradingview-pinescript-indicators/blob/60c93d3711d222b8f2db96160defe568429348e0/movings/holt_exponential_moving_average.pine
 * Repo:   everget/tradingview-pinescript-indicators
 * License: GPL-3.0 - Copyright (c) 2018-present, Alex Orekhov (everget)
 * SPDX-FileCopyrightText: (c) 2018-present Alex Orekhov (everget)
 * SPDX-FileCopyrightText: (c) 2026 marketcalls (port to openalgo-charts)
 * SPDX-License-Identifier: GPL-3.0-only
 *
 * Holt double exponential smoothing: one recursion smooths the level and a
 * second smooths the trend, and the level is carried forward by that trend, so
 * the line keeps up with a directional move instead of lagging behind it.
 */

export default function ({ registerIndicator, sourceValues, nulls }) {
  registerIndicator({
    id: 'oa-holt-exponential-moving-average',
    name: 'Holt Exponential Moving Average (HEMA)',
    category: 'Moving Averages',
    placement: 'onchart',

    inputs: [
      { key: 'alphaLength', type: 'number', label: 'Alpha Length', default: 20, min: 1, max: 5000, step: 1 },
      { key: 'gammaLength', type: 'number', label: 'Gamma Length', default: 20, min: 1, max: 5000, step: 1 },
      { key: 'source', type: 'source', label: 'Source', default: 'close' },
      {
        key: 'highlight',
        type: 'boolean',
        label: 'Highlight ?',
        default: true,
        tooltip: 'Colour the line green while it rises and red while it falls.',
      },
    ],

    plots: [
      {
        key: 'hema',
        type: 'line',
        title: 'HEMA',
        style: { color: '#6d1e7f', lineWidth: 2 },
        colorBy({ value, index, values, settings }) {
          if (settings.highlight === false) return '#6d1e7f'
          const prev = index > 0 ? values.hema[index - 1] : null
          // Pine treats a comparison against na as false, so the first bar is red.
          if (!Number.isFinite(prev) || !Number.isFinite(value)) return '#FF5252'
          return value > prev ? '#4CAF50' : '#FF5252'
        },
      },
    ],

    calc(bars, settings) {
      // A cleared number field arrives as '', and Number('') is 0.
      const alphaLength = Math.max(1, Math.floor(Number(settings.alphaLength) || 20))
      const gammaLength = Math.max(1, Math.floor(Number(settings.gammaLength) || 20))
      const src = sourceValues(bars, settings.source || 'close')

      const alpha = 2.0 / (alphaLength + 1.0)
      const gamma = 2.0 / (gammaLength + 1.0)

      const out = new Array(bars.length).fill(NaN)
      let hemaPrev = NaN // hema[1]
      let bPrev = NaN // b[1]

      for (let i = 0; i < bars.length; i++) {
        const value = src[i]

        // nz(hema[1]) is 0 on the first bar; nz(b[1], src) falls back to the source.
        const hemaPrevNz = Number.isFinite(hemaPrev) ? hemaPrev : 0
        const bPrevOrSrc = Number.isFinite(bPrev) ? bPrev : value
        const bPrevNz = Number.isFinite(bPrev) ? bPrev : 0

        const hema = (1.0 - alpha) * (hemaPrevNz + bPrevOrSrc) + alpha * value
        const b = (1.0 - gamma) * bPrevNz + gamma * (hema - hemaPrevNz)

        out[i] = hema
        hemaPrev = hema
        bPrev = b
      }

      return { hema: nulls(out) }
    },
  })
}
