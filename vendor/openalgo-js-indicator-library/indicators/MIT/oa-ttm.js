/**
 * TTM Trend - ported to openalgo-charts from Pine Script v6.
 *
 * Source: https://github.com/mihakralj/pinescript/blob/c4e91b962be09733d8fc76caa5191e9e586c5cee/indicators/dynamics/ttm.pine
 * Repo:   mihakralj/pinescript
 * License: MIT (c) mihakralj
 * SPDX-FileCopyrightText: (c) mihakralj
 * SPDX-FileCopyrightText: (c) 2026 marketcalls (port to openalgo-charts)
 * SPDX-License-Identifier: MIT
 *
 * A short exponential average coloured by the sign of its own slope, wrapped in
 * a band whose width is the percentage size of that slope. The colour flips mark
 * where the short-term drift changes direction.
 */

export default function ({ registerIndicator, sourceValues, nulls }) {
  const UP = '#4caf50'
  const DOWN = '#ff5252'
  const NEUTRAL = '#787b86'

  registerIndicator({
    id: 'oa-ttm',
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
          const t = values.trend?.[index]
          if (!Number.isFinite(t)) return NEUTRAL
          return t > 0 ? UP : t < 0 ? DOWN : NEUTRAL
        },
      },
      { key: 'upper', type: 'line', title: 'Upper Strength', style: { color: '#2962ff', lineWidth: 1 } },
      { key: 'lower', type: 'line', title: 'Lower Strength', style: { color: '#2962ff', lineWidth: 1 } },
    ],

    fills: [{ between: ['upper', 'lower'], colorUp: '#2962ff', colorDown: '#2962ff', opacity: 0.1 }],

    calc(bars, settings) {
      // A cleared number field arrives as '', and Number('') is 0.
      const period = Math.max(1, Math.floor(Number(settings.period) || 6))
      const showStrength = settings.showStrength !== false
      const src = sourceValues(bars, settings.source ?? 'hlc3')

      const alpha = 2 / (period + 1)

      const ttm = new Array(bars.length).fill(NaN)
      const trend = new Array(bars.length).fill(NaN)
      const upper = new Array(bars.length).fill(NaN)
      const lower = new Array(bars.length).fill(NaN)

      // Pine seeds both `var` values from the first bar's source, so bar 0 has a
      // zero slope and therefore a neutral trend and zero strength. A non-finite
      // source carries the running state forward rather than poisoning it.
      let ema = NaN
      let emaPrev = NaN

      for (let i = 0; i < bars.length; i++) {
        const s = src[i]
        if (!Number.isFinite(s)) continue

        if (!Number.isFinite(ema)) {
          ema = s
          emaPrev = s
        }

        ema = alpha * (s - ema) + ema

        const delta = ema - emaPrev
        trend[i] = Math.sign(delta)
        // Pine floors the denominator at 1e-10, so a non-positive previous value
        // produces a very large percentage rather than a divide by zero.
        const strength = (Math.abs(delta) / Math.max(emaPrev, 1e-10)) * 100
        emaPrev = ema

        ttm[i] = ema
        if (showStrength && Number.isFinite(strength)) {
          const half = ema * strength * 0.01
          upper[i] = ema + half
          lower[i] = ema - half
        }
      }

      return { ttm: nulls(ttm), upper: nulls(upper), lower: nulls(lower), trend: nulls(trend) }
    },

    markers({ bars, values }) {
      const out = []
      if (!bars.length) return out

      // atPrice adds no padding of its own, so scale the offset to the
      // instrument rather than using a fixed number of points.
      let rangeSum = 0
      let rangeCount = 0
      for (let i = 0; i < bars.length; i++) {
        const r = bars[i].high - bars[i].low
        if (Number.isFinite(r)) {
          rangeSum += r
          rangeCount += 1
        }
      }
      const meanRange = rangeCount > 0 ? rangeSum / rangeCount : 0
      const lastClose = Number(bars[bars.length - 1].close) || 0
      const pad = Math.max(meanRange * 0.5, Math.abs(lastClose) * 0.0005)

      const trend = values.trend ?? []
      for (let i = 1; i < bars.length; i++) {
        const cur = trend[i]
        if (!Number.isFinite(cur)) continue
        // Pine compares against nz(trend[1], 0), so a missing previous value
        // reads as 0 rather than blocking the comparison.
        const prevRaw = trend[i - 1]
        const prev = Number.isFinite(prevRaw) ? prevRaw : 0
        if (cur === prev) continue

        if (cur > 0) {
          out.push({
            time: bars[i].time,
            position: 'atPrice',
            price: bars[i].low - pad,
            shape: 'triangleUp',
            size: 'tiny',
            color: UP,
          })
        } else if (cur < 0) {
          out.push({
            time: bars[i].time,
            position: 'atPrice',
            price: bars[i].high + pad,
            shape: 'triangleDown',
            size: 'tiny',
            color: DOWN,
          })
        }
      }
      return out
    },
  })
}
