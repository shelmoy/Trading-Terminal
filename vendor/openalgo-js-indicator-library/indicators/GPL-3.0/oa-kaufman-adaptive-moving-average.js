/**
 * kaufman_adaptive_moving_average - ported to openalgo-charts from Pine Script v4.
 *
 * Source: https://github.com/everget/tradingview-pinescript-indicators/blob/60c93d3711d222b8f2db96160defe568429348e0/movings/kaufman_adaptive_moving_average.pine
 * Repo:   everget/tradingview-pinescript-indicators
 * License: GPL-3.0, Copyright (c) 2018-present, Alex Orekhov (everget)
 * SPDX-FileCopyrightText: (c) 2018-present Alex Orekhov (everget)
 * SPDX-FileCopyrightText: (c) 2026 marketcalls (port to openalgo-charts)
 * SPDX-License-Identifier: GPL-3.0-only
 *
 * A moving average whose smoothing constant is driven by an efficiency ratio:
 * directional travel divided by total travel. It tracks closely in a clean
 * trend and flattens out when the same distance is covered by churning.
 */

export default function ({ registerIndicator, sourceValues, nulls }) {
  registerIndicator({
    id: 'oa-kaufman-adaptive-moving-average',
    name: 'Kaufman Adaptive Moving Average (KAMA)',
    category: 'Moving Averages',
    placement: 'onchart',

    inputs: [
      { key: 'length', type: 'number', label: 'Length', default: 14, min: 1, max: 5000, step: 1 },
      { key: 'fastLength', type: 'number', label: 'Fast EMA Length', default: 2, min: 1, max: 5000, step: 1 },
      { key: 'slowLength', type: 'number', label: 'Slow EMA Length', default: 30, min: 1, max: 5000, step: 1 },
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
        key: 'kama',
        type: 'line',
        title: 'KAMA',
        style: { color: '#6d1e7f', lineWidth: 2 },
        colorBy: ({ value, index, values, settings }) => {
          // With the highlight off the source draws one fixed colour; returning
          // nothing leaves the chart's own colour control in charge of it.
          if (settings.highlight === false) return undefined
          const prev = index > 0 ? values.kama[index - 1] : null
          // Pine compares against na on the first bar, which is false, so that
          // bar is red rather than green.
          return Number.isFinite(prev) && value > prev ? '#4caf50' : '#ff5252'
        },
      },
    ],

    calc(bars, settings) {
      // A cleared number field arrives as '', and Number('') is 0.
      const length = Math.max(1, Math.floor(Number(settings.length) || 14))
      const fastLength = Math.max(1, Math.floor(Number(settings.fastLength) || 2))
      const slowLength = Math.max(1, Math.floor(Number(settings.slowLength) || 30))
      const src = sourceValues(bars, settings.source ?? 'close')

      const n = bars.length
      const out = new Array(n).fill(NaN)
      if (n === 0) return { kama: nulls(out) }

      const fastAlpha = 2 / (fastLength + 1)
      const slowAlpha = 2 / (slowLength + 1)

      // sum(abs(change(src)), length), prefix-summed. change() is na on bar 0,
      // which contributes nothing anyway because the first complete window ends
      // on bar `length`, the same bar change(src, length) first has a value on.
      const prefix = new Array(n + 1).fill(0)
      for (let i = 0; i < n; i++) {
        const finite = i > 0 && Number.isFinite(src[i]) && Number.isFinite(src[i - 1])
        prefix[i + 1] = prefix[i] + (finite ? Math.abs(src[i] - src[i - 1]) : 0)
      }

      let prev = NaN
      for (let i = length; i < n; i++) {
        if (!Number.isFinite(src[i]) || !Number.isFinite(src[i - length])) continue

        const mom = Math.abs(src[i] - src[i - length])
        const volatility = prefix[i + 1] - prefix[i - length + 1]
        const er = volatility !== 0 ? mom / volatility : 0
        const alpha = Math.pow(er * (fastAlpha - slowAlpha) + slowAlpha, 2)

        // nz(kama[1], src): the first bar with a value seeds itself from price.
        const carried = Number.isFinite(prev) ? prev : src[i]
        const value = alpha * src[i] + (1 - alpha) * carried
        if (!Number.isFinite(value)) continue
        out[i] = value
        prev = value
      }

      return { kama: nulls(out) }
    },
  })
}
