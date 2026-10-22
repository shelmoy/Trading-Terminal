/**
 * Fibonacci Weighted Moving Average (FWMA) - ported to openalgo-charts from Pine Script v6.
 *
 * Source: https://github.com/everget/tradingview-pinescript-indicators/blob/60c93d3711d222b8f2db96160defe568429348e0/movings/fibonacci_weighted_moving_average.pine
 * Repo:   everget/tradingview-pinescript-indicators
 * License: GPL-3.0 (c) 2018-present, Alex Orekhov (everget)
 * SPDX-FileCopyrightText: (c) 2018-present Alex Orekhov (everget)
 * SPDX-FileCopyrightText: (c) 2026 marketcalls (port to openalgo-charts)
 * SPDX-License-Identifier: GPL-3.0-only
 *
 * A weighted average whose kernel is the Fibonacci sequence, heaviest on the
 * newest bar, so recent price dominates far more steeply than a linear WMA.
 */

export default function ({ registerIndicator, sourceValues, nulls, withAlpha }) {
  // The Pine script hard-codes these, so they are constants here rather than
  // inputs: the chart already generates a colour control for the plot itself.
  const BULLISH = '#09b71e'
  const BEARISH = '#e91e63'
  const NEUTRAL = '#512da8'
  // color.new(x, 50) and color.new(x, 88) in Pine transparency terms.
  const BULLISH_BAR = withAlpha(BULLISH, 0.5)
  const BEARISH_BAR = withAlpha(BEARISH, 0.5)
  const BULLISH_BG = withAlpha(BULLISH, 0.12)
  const BEARISH_BG = withAlpha(BEARISH, 0.12)

  /**
   * The colour the Pine `maColor` variable holds on bar `i`, or null when that
   * bar has no value yet. Shared by colorBy and the three alerts so they cannot
   * drift apart, exactly as Pine reads one series.
   */
  function colorAt(values, settings, i) {
    if (i < 0) return null
    if (settings.highlightDirection === false) return NEUTRAL
    const d = values.dir[i]
    if (d == null) return null
    return d > 0 ? BULLISH : BEARISH
  }

  registerIndicator({
    id: 'oa-fibonacci-weighted-moving-average',
    name: 'Fibonacci Weighted Moving Average',
    category: 'Moving Averages',
    placement: 'onchart',

    inputs: [
      { key: 'length', type: 'number', label: 'Length', default: 14, min: 1, max: 300, step: 1 },
      { key: 'source', type: 'source', label: 'Source', default: 'close' },
      {
        key: 'highlightDirection',
        type: 'boolean',
        label: 'Highlight Direction',
        default: true,
        tooltip: 'Colors the FWMA according to its direction: green rising, pink falling.',
      },
      {
        key: 'applyBarColors',
        type: 'boolean',
        label: 'Apply Bar Colors',
        default: true,
        tooltip: 'Colors price bars according to the FWMA direction.',
      },
      {
        key: 'applyBgColors',
        type: 'boolean',
        label: 'Apply Background Colors',
        default: false,
        tooltip: 'Colors the chart background according to the FWMA direction.',
      },
    ],

    plots: [
      {
        key: 'fwma',
        type: 'line',
        title: 'FWMA',
        style: { color: NEUTRAL, lineWidth: 2 },
        colorBy({ index, values, settings }) {
          return colorAt(values, settings, index) ?? NEUTRAL
        },
      },
      // The slope column is the single source of truth for colorBy, barColors,
      // background and the alerts, none of which is handed `store`.
      { key: 'dir', type: 'line', title: 'Direction', style: { visible: false } },
    ],

    calc(bars, settings) {
      // A cleared number field arrives as '', and Number('') is 0.
      const length = Math.max(1, Math.floor(Number(settings.length) || 14))
      const src = sourceValues(bars, settings.source ?? 'close')

      // Fibonacci weights built iteratively, exact integers, no Binet round-off.
      // Pine pushes F(1)..F(length) then reverses, so index 0 (the newest bar)
      // carries F(length).
      const weights = new Array(length)
      let prev = 0
      let curr = 1
      let weightSum = 0
      for (let k = 0; k < length; k++) {
        weights[k] = curr
        weightSum += curr
        const next = prev + curr
        prev = curr
        curr = next
      }
      weights.reverse()

      const ma = new Array(bars.length).fill(NaN)
      const dir = new Array(bars.length).fill(NaN)
      if (!(weightSum > 0)) return { fwma: nulls(ma), dir: nulls(dir) }

      for (let i = 0; i < bars.length; i++) {
        const now = Number.isFinite(src[i]) ? src[i] : 0
        let sum = 0
        for (let j = 0; j < length; j++) {
          // Pine's nz(src[j], src): missing history falls back to the current
          // source value, so the average emits from the very first bar.
          const back = i - j
          const v = back >= 0 && Number.isFinite(src[back]) ? src[back] : now
          sum += v * weights[j]
        }
        ma[i] = sum / weightSum
        // Pine: ma > ma[1]. On bar 0 the comparison is against na, which is
        // false, so the first bar reads as falling.
        const p = i > 0 ? ma[i - 1] : NaN
        dir[i] = Number.isFinite(p) && ma[i] > p ? 1 : 0
      }

      return { fwma: nulls(ma), dir: nulls(dir) }
    },

    barColors({ bars, values, settings }) {
      if (settings.applyBarColors === false) return bars.map(() => null)
      return bars.map((_, i) => {
        const d = values.dir[i]
        if (d == null) return null
        return d > 0 ? BULLISH_BAR : BEARISH_BAR
      })
    },

    background({ bars, values, settings }) {
      if (settings.applyBgColors !== true) return bars.map(() => null)
      return bars.map((_, i) => {
        const d = values.dir[i]
        if (d == null) return null
        return d > 0 ? BULLISH_BG : BEARISH_BG
      })
    },

    alerts: [
      {
        id: 'bullish-color-change',
        title: 'FWMA - Bullish Color Change',
        message: 'FWMA turned green: the average is rising.',
        when: ({ values, settings, index }) => {
          const now = colorAt(values, settings, index)
          const prev = colorAt(values, settings, index - 1)
          // Pine reads maColor[1], which is na on the first bar, and every
          // comparison with na is false there, so the alert cannot fire yet.
          return prev != null && now === BULLISH && prev !== BULLISH
        },
      },
      {
        id: 'bearish-color-change',
        title: 'FWMA - Bearish Color Change',
        message: 'FWMA turned pink: the average is falling.',
        when: ({ values, settings, index }) => {
          const now = colorAt(values, settings, index)
          const prev = colorAt(values, settings, index - 1)
          return prev != null && now === BEARISH && prev !== BEARISH
        },
      },
      {
        id: 'any-color-change',
        title: 'FWMA - Any Color Change',
        message: 'FWMA changed direction.',
        when: ({ values, settings, index }) => {
          const now = colorAt(values, settings, index)
          const prev = colorAt(values, settings, index - 1)
          return now != null && prev != null && now !== prev
        },
      },
    ],
  })
}
