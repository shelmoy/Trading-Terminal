/**
 * TTM Trend - ported to openalgo-charts from Pine Script v6.
 *
 * Source: https://github.com/mihakralj/pinescript/blob/c4e91b962be09733d8fc76caa5191e9e586c5cee/indicators/dynamics/ttmtrend.pine
 * Repo:   mihakralj/pinescript
 * License: MIT (c) mihakralj
 * SPDX-FileCopyrightText: (c) mihakralj
 * SPDX-FileCopyrightText: (c) 2026 marketcalls (port to openalgo-charts)
 * SPDX-License-Identifier: MIT
 *
 * A short exponential average that is coloured by its own slope, with an
 * optional band whose width is the size of that slope as a percentage of the
 * previous value, so an accelerating move shows as a widening ribbon.
 */

export default function ({ registerIndicator, sourceValues, nulls, withAlpha }) {
  const UP = '#4caf50'
  const DOWN = '#ff5252'
  const NEUTRAL = '#787b86'
  const BAND = '#2196f3'

  const trendColour = (values, index) => {
    const trend = values?.trend
    const t = Array.isArray(trend) ? trend[index] : NaN
    if (!Number.isFinite(t)) return withAlpha(NEUTRAL, 0.5)
    if (t > 0) return UP
    if (t < 0) return DOWN
    return withAlpha(NEUTRAL, 0.5)
  }

  registerIndicator({
    id: 'oa-ttmtrend',
    name: 'TTM Trend',
    category: 'Dynamics',
    placement: 'onchart',

    inputs: [
      { key: 'period', type: 'number', label: 'Period', default: 6, min: 1, max: 5000, step: 1 },
      { key: 'source', type: 'source', label: 'Source', default: 'hlc3' },
      { key: 'showStrength', type: 'boolean', label: 'Show Trend Strength %', default: true },
    ],

    plots: [
      {
        key: 'ttm',
        type: 'line',
        title: 'TTM Trend',
        style: { color: UP, lineWidth: 3 },
        colorBy({ index, values }) {
          return trendColour(values, index)
        },
      },
      {
        key: 'upper',
        type: 'line',
        title: 'Upper Strength',
        style: { color: withAlpha(BAND, 0.2), lineWidth: 1 },
      },
      {
        key: 'lower',
        type: 'line',
        title: 'Lower Strength',
        style: { color: withAlpha(BAND, 0.2), lineWidth: 1 },
      },
    ],

    fills: [{ between: ['upper', 'lower'], colorUp: BAND, colorDown: BAND, opacity: 0.1 }],

    calc(bars, settings) {
      // A cleared number field arrives as '', and Number('') is 0.
      const period = Math.max(1, Math.floor(Number(settings.period) || 6))
      const showStrength = settings.showStrength !== false
      const src = sourceValues(bars, settings.source ?? 'hlc3')

      const n = bars.length
      const alpha = 2 / (period + 1)
      const ttm = new Array(n).fill(NaN)
      const upper = new Array(n).fill(NaN)
      const lower = new Array(n).fill(NaN)
      const trendCol = new Array(n).fill(NaN)

      // Pine declares `var float ema = source`, so the average is seeded with
      // the first bar's source rather than warming up over `period` bars, and
      // `ema_prev` starts at the same value: bar zero therefore has zero slope.
      let ema = NaN
      let emaPrev = NaN

      for (let i = 0; i < n; i++) {
        const s = src[i]
        if (!Number.isFinite(s)) continue
        if (!Number.isFinite(ema)) {
          ema = s
          emaPrev = s
        }

        ema = alpha * (s - ema) + ema
        const diff = ema - emaPrev
        const trend = Math.sign(diff)
        // Pine floors the divisor at 1e-10, so the divide is always safe.
        const strength = (Math.abs(diff) / Math.max(emaPrev, 1e-10)) * 100

        ttm[i] = ema
        trendCol[i] = trend
        if (showStrength && Number.isFinite(strength)) {
          const halfWidth = ema * strength * 0.01
          upper[i] = ema + halfWidth
          lower[i] = ema - halfWidth
        }

        emaPrev = ema
      }

      return { ttm: nulls(ttm), upper: nulls(upper), lower: nulls(lower), trend: trendCol }
    },

    markers({ bars, values }) {
      const out = []
      const trend = values.trend
      if (!Array.isArray(trend) || bars.length === 0) return out

      // atPrice adds no padding of its own, so scale the offset to the
      // instrument rather than using a fixed number of points.
      let sumRange = 0
      let counted = 0
      for (let i = 0; i < bars.length; i++) {
        const r = bars[i].high - bars[i].low
        if (Number.isFinite(r)) {
          sumRange += r
          counted += 1
        }
      }
      const meanRange = counted > 0 ? sumRange / counted : 0
      const lastClose = bars[bars.length - 1].close
      const ref = Number.isFinite(lastClose) ? Math.abs(lastClose) : 0
      const pad = Math.max(meanRange * 0.5, ref * 0.0005)

      for (let i = 1; i < bars.length; i++) {
        const cur = trend[i]
        if (!Number.isFinite(cur)) continue
        // Pine compares against nz(trend[1], 0) and requires bar_index > 0.
        const prevRaw = trend[i - 1]
        const prev = Number.isFinite(prevRaw) ? prevRaw : 0
        if (cur === prev) continue

        if (cur > 0 && Number.isFinite(bars[i].low)) {
          out.push({
            time: bars[i].time,
            position: 'atPrice',
            price: bars[i].low - pad,
            shape: 'triangleUp',
            size: 'small',
            color: UP,
          })
        } else if (cur < 0 && Number.isFinite(bars[i].high)) {
          out.push({
            time: bars[i].time,
            position: 'atPrice',
            price: bars[i].high + pad,
            shape: 'triangleDown',
            size: 'small',
            color: DOWN,
          })
        }
      }
      return out
    },
  })
}
