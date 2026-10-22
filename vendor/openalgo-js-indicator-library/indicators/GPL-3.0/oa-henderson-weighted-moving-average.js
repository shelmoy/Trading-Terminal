/**
 * Henderson Weighted Moving Average (HWMA) - ported to openalgo-charts from Pine Script v6.
 *
 * Source: https://github.com/everget/tradingview-pinescript-indicators/blob/60c93d3711d222b8f2db96160defe568429348e0/movings/henderson_weighted_moving_average.pine
 * Repo:   everget/tradingview-pinescript-indicators
 * License: GPL-3.0, Copyright (c) 2018-present, Alex Orekhov (everget)
 * SPDX-FileCopyrightText: (c) 2018-present Alex Orekhov (everget)
 * SPDX-FileCopyrightText: (c) 2026 marketcalls (port to openalgo-charts)
 * SPDX-License-Identifier: GPL-3.0-only
 *
 * A symmetric kernel built to pass a cubic trend untouched while suppressing
 * as much short-term movement as possible, which is why national statistics
 * agencies use it for trend estimation.
 */

export default function ({ registerIndicator, sourceValues, withAlpha, nulls }) {
  const BULLISH_COLOR = '#09b71e'
  const BEARISH_COLOR = '#e91e63'
  const NEUTRAL_COLOR = '#512da8'

  // The general form of the weights of the (2m + 1)-term Henderson WMA.
  const hwmaWeight = (m, j) => {
    const m1 = m + 1
    const m2 = m + 2
    const m3 = m + 3
    const powj2 = j * j
    const powm22 = m2 * m2

    const numerator =
      315 *
      (m1 * m1 - powj2) *
      (powm22 - powj2) *
      (m3 * m3 - powj2) *
      (3 * powm22 - 11 * powj2 - 16)
    const denominator =
      8 * m2 * (powm22 - 1) * (4 * powm22 - 1) * (4 * powm22 - 9) * (4 * powm22 - 25)
    return denominator !== 0 ? numerator / denominator : 0
  }

  // Pine's `isBullishSlope = ma > ma[1]`: na on the first bar, so it reads
  // bearish there.
  const isBullishAt = (values, index) => {
    const cur = values.hwma?.[index]
    const prev = index > 0 ? values.hwma?.[index - 1] : undefined
    return Number.isFinite(cur) && Number.isFinite(prev) && cur > prev
  }

  const maColorAt = (values, index, settings) => {
    if (settings.highlightDirection === false) return NEUTRAL_COLOR
    return isBullishAt(values, index) ? BULLISH_COLOR : BEARISH_COLOR
  }

  registerIndicator({
    id: 'oa-henderson-weighted-moving-average',
    name: 'Henderson Weighted Moving Average',
    category: 'Moving Averages',
    placement: 'onchart',

    inputs: [
      { key: 'length', type: 'number', label: 'Length', default: 7, min: 1, max: 1000, step: 1 },
      { key: 'source', type: 'source', label: 'Source', default: 'close' },
      {
        key: 'highlightDirection',
        type: 'boolean',
        label: 'Highlight Direction',
        default: true,
        tooltip: 'Colors the HWMA according to its direction: green rising, pink falling.',
      },
      {
        key: 'applyBarColors',
        type: 'boolean',
        label: 'Apply Bar Colors',
        default: true,
        tooltip: 'Colors price bars according to the HWMA direction.',
      },
      {
        key: 'applyBgColors',
        type: 'boolean',
        label: 'Apply Background Colors',
        default: false,
        tooltip: 'Colors the chart background according to the HWMA direction.',
      },
    ],

    plots: [
      {
        key: 'hwma',
        type: 'line',
        title: 'HWMA',
        style: { color: NEUTRAL_COLOR, lineWidth: 2 },
        colorBy({ index, values, settings }) {
          return maColorAt(values, index, settings)
        },
      },
    ],

    calc(bars, settings) {
      // A cleared number field arrives as '', and Number('') is 0.
      const length = Math.min(1000, Math.max(1, Math.floor(Number(settings.length) || 7)))
      const src = sourceValues(bars, settings.source ?? 'close')

      // Pine divides two ints here, which truncates.
      const termMult = Math.trunc((length - 1) / 2)
      const weights = new Array(length)
      let weightSum = 0
      for (let i = 0; i < length; i++) {
        const w = hwmaWeight(termMult, i - termMult)
        weights[i] = w
        weightSum += w
      }

      const out = new Array(bars.length).fill(NaN)
      for (let b = 0; b < bars.length; b++) {
        const current = src[b]
        if (!Number.isFinite(current)) continue
        if (weightSum === 0) {
          out[b] = current
          continue
        }
        let sum = 0
        // nz(src[i], src): a tap before the first bar falls back to the current
        // source value, so the average emits from bar 0 with no warmup gap.
        for (let i = 0; i < length; i++) {
          const idx = b - i
          const v = idx >= 0 && Number.isFinite(src[idx]) ? src[idx] : current
          sum += v * weights[i]
        }
        out[b] = sum / weightSum
      }

      return { hwma: nulls(out) }
    },

    barColors({ bars, values, settings }) {
      if (settings.applyBarColors === false) return bars.map(() => null)
      // Pine uses color.new(c, 50), a 50 percent transparency.
      return bars.map((_bar, i) =>
        withAlpha(isBullishAt(values, i) ? BULLISH_COLOR : BEARISH_COLOR, 0.5),
      )
    },

    background({ bars, values, settings }) {
      if (settings.applyBgColors !== true) return bars.map(() => null)
      // Pine uses color.new(c, 88), a 88 percent transparency.
      return bars.map((_bar, i) =>
        withAlpha(isBullishAt(values, i) ? BULLISH_COLOR : BEARISH_COLOR, 0.12),
      )
    },

    alerts: [
      {
        id: 'hwma-bullish-color-change',
        title: 'HWMA - Bullish Color Change',
        message: 'HWMA turned bullish',
        when({ values, settings, index }) {
          if (index < 1) return false
          return (
            maColorAt(values, index, settings) === BULLISH_COLOR &&
            maColorAt(values, index - 1, settings) !== BULLISH_COLOR
          )
        },
      },
      {
        id: 'hwma-bearish-color-change',
        title: 'HWMA - Bearish Color Change',
        message: 'HWMA turned bearish',
        when({ values, settings, index }) {
          if (index < 1) return false
          return (
            maColorAt(values, index, settings) === BEARISH_COLOR &&
            maColorAt(values, index - 1, settings) !== BEARISH_COLOR
          )
        },
      },
      {
        id: 'hwma-any-color-change',
        title: 'HWMA - Any Color Change',
        message: 'HWMA changed direction',
        when({ values, settings, index }) {
          if (index < 1) return false
          return maColorAt(values, index, settings) !== maColorAt(values, index - 1, settings)
        },
      },
    ],
  })
}
