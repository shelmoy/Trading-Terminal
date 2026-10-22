/**
 * Inverse Distance Weighted Moving Average (IDWMA) - ported to
 * openalgo-charts from Pine Script v6.
 *
 * Source: https://github.com/everget/tradingview-pinescript-indicators/blob/60c93d3711d222b8f2db96160defe568429348e0/movings/inverse_distance_weighted_moving_average.pine
 * Repo:   everget/tradingview-pinescript-indicators
 * License: GPL-3.0 (c) 2019-present, Alex Orekhov (everget)
 * SPDX-FileCopyrightText: (c) 2018-present Alex Orekhov (everget)
 * SPDX-FileCopyrightText: (c) 2026 marketcalls (port to openalgo-charts)
 * SPDX-License-Identifier: GPL-3.0-only
 *
 * Each bar in the window is weighted by the total absolute distance from it to
 * every other bar in the window, so an outlier carries the most weight and a
 * value sitting in the middle of the cluster carries the least.
 */

export default function ({ registerIndicator, sourceValues, withAlpha, nulls }) {
  const BULLISH = '#09b71e'
  const BEARISH = '#e91e63'
  const NEUTRAL = '#512da8'

  // maColor in the source. Only the line honours the highlight switch; the bar
  // and background colours read the slope directly. Pine evaluates ma > ma[1]
  // as false while ma[1] is na, so the very first bar is coloured falling.
  const lineColor = (values, settings, index) => {
    const slope = values && values.slope
    if (!slope || index < 0 || index >= slope.length) return null
    const s = slope[index]
    if (!Number.isFinite(s)) return null
    if (settings.highlightDirection === false) return NEUTRAL
    return s > 0 ? BULLISH : BEARISH
  }

  registerIndicator({
    id: 'oa-inverse-distance-weighted-moving-average',
    name: 'Inverse Distance Weighted Moving Average',
    category: 'Moving Averages',
    placement: 'onchart',

    inputs: [
      { key: 'length', type: 'number', label: 'Length', default: 14, min: 1, max: 1000, step: 1 },
      { key: 'source', type: 'source', label: 'Source', default: 'close' },
      {
        key: 'highlightDirection',
        type: 'boolean',
        label: 'Highlight Direction',
        default: true,
        tooltip: 'Colours the IDWMA line by its direction: green when rising, pink when falling.',
      },
      {
        key: 'applyBarColors',
        type: 'boolean',
        label: 'Apply Bar Colors',
        default: true,
        tooltip: 'Repaints the price candles by the IDWMA direction: bullish colour while rising, bearish while falling.',
      },
      {
        key: 'applyBgColors',
        type: 'boolean',
        label: 'Apply Background Colors',
        default: false,
        tooltip: 'Shades the chart background by the IDWMA direction: bullish colour while rising, bearish while falling.',
      },
    ],

    plots: [
      {
        key: 'idwma',
        type: 'line',
        title: 'IDWMA',
        style: { color: NEUTRAL, lineWidth: 2 },
        colorBy({ index, values, settings }) {
          return lineColor(values, settings, index) || NEUTRAL
        },
      },
    ],

    calc(bars, settings) {
      // A cleared number field arrives as '', and Number('') is 0.
      const length = Math.max(1, Math.floor(Number(settings.length) || 14))
      const src = sourceValues(bars, settings.source ?? 'close')
      const count = bars.length

      const ma = new Array(count).fill(NaN)
      const win = new Array(length)

      for (let b = 0; b < count; b++) {
        const cur = src[b]
        if (!Number.isFinite(cur)) continue

        // Pine reads each tap as nz(src[i], src), so a bar before the start of
        // the chart takes the current value instead of dropping out.
        for (let i = 0; i < length; i++) {
          const idx = b - i
          const v = idx >= 0 ? src[idx] : NaN
          win[i] = Number.isFinite(v) ? v : cur
        }

        // The source walks every unordered pair once and credits the distance
        // to both taps, so a tap weighs its total distance to the rest of the
        // window. Sorting turns that into prefix sums: identical weights, at
        // O(n log n) per bar rather than O(n^2).
        win.sort((a, c) => a - c)
        let total = 0
        for (let i = 0; i < length; i++) total += win[i]

        let prefix = 0
        let weightedSum = 0
        let weightSum = 0
        for (let r = 0; r < length; r++) {
          const v = win[r]
          const below = r * v - prefix
          const above = total - prefix - v - (length - 1 - r) * v
          const weight = below + above
          weightedSum += v * weight
          weightSum += weight
          prefix += v
        }

        // A perfectly flat window makes every distance, and so every weight,
        // zero. The source falls back to the raw value there.
        const value = weightSum > 0 ? weightedSum / weightSum : cur
        ma[b] = Number.isFinite(value) ? value : cur
      }

      // isBullishSlope: 1 rising, 0 flat or falling. Read by the line colour,
      // the bar colours, the background and the alerts, so it is a column.
      const slope = new Array(count).fill(0)
      for (let b = 1; b < count; b++) {
        slope[b] = Number.isFinite(ma[b]) && Number.isFinite(ma[b - 1]) && ma[b] > ma[b - 1] ? 1 : 0
      }

      return { idwma: nulls(ma), slope }
    },

    barColors({ bars, values, settings }) {
      const out = new Array(bars.length).fill(null)
      if (settings.applyBarColors === false) return out
      const slope = values && values.slope
      if (!slope) return out
      // color.new(colour, 50) in the source: half transparent.
      const up = withAlpha(BULLISH, 0.5)
      const down = withAlpha(BEARISH, 0.5)
      for (let i = 0; i < bars.length; i++) {
        out[i] = Number.isFinite(slope[i]) && slope[i] > 0 ? up : down
      }
      return out
    },

    background({ bars, values, settings }) {
      const out = new Array(bars.length).fill(null)
      if (!settings.applyBgColors) return out
      const slope = values && values.slope
      if (!slope) return out
      // color.new(colour, 88) in the source: 12 percent opaque.
      const up = withAlpha(BULLISH, 0.12)
      const down = withAlpha(BEARISH, 0.12)
      for (let i = 0; i < bars.length; i++) {
        out[i] = Number.isFinite(slope[i]) && slope[i] > 0 ? up : down
      }
      return out
    },

    alerts: [
      {
        id: 'bullish-color-change',
        title: 'Bullish Color Change',
        message: 'IDWMA - Bullish Color Change',
        when({ values, settings, index }) {
          const now = lineColor(values, settings, index)
          const prev = lineColor(values, settings, index - 1)
          return prev !== BULLISH && now === BULLISH
        },
      },
      {
        id: 'bearish-color-change',
        title: 'Bearish Color Change',
        message: 'IDWMA - Bearish Color Change',
        when({ values, settings, index }) {
          const now = lineColor(values, settings, index)
          const prev = lineColor(values, settings, index - 1)
          return prev !== BEARISH && now === BEARISH
        },
      },
      {
        id: 'any-color-change',
        title: 'Any Color Change',
        message: 'IDWMA - Any Color Change',
        when({ values, settings, index }) {
          const now = lineColor(values, settings, index)
          const prev = lineColor(values, settings, index - 1)
          return now !== prev
        },
      },
    ],
  })
}
