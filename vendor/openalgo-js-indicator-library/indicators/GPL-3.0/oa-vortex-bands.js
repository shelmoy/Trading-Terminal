/**
 * Vortex Bands (VB) - ported to openalgo-charts from Pine Script v4.
 *
 * Source: https://github.com/everget/tradingview-pinescript-indicators/blob/60c93d3711d222b8f2db96160defe568429348e0/bands_and_channels/vortex_bands.pine
 * Repo:   everget/tradingview-pinescript-indicators
 * License: GPL-3.0 (c) 2020-present, Alex Orekhov (everget)
 * SPDX-FileCopyrightText: (c) 2018-present Alex Orekhov (everget)
 * SPDX-FileCopyrightText: (c) 2026 marketcalls (port to openalgo-charts)
 * SPDX-License-Identifier: GPL-3.0-only
 *
 * The basis is a lag-reduced double exponential average, and the band width is
 * that same average applied to the distance between price and the basis, so the
 * channel breathes with how far price has been straying rather than with variance.
 */

export default function ({ registerIndicator, sourceValues, ema, nulls }) {
  // Pine's _mnma: two chained EMAs recombined as
  // ((2 - alpha) * ema1 - ema2) / (1 - alpha), with alpha = 2 / (length + 1).
  // Pine's _ema seeds from the first bar's source value and emits from bar 0,
  // which is exactly what the shared ema() helper does.
  const mnma = (values, length) => {
    const n = values.length
    const out = new Array(n).fill(NaN)
    const alpha = 2 / (length + 1)
    const denom = 1 - alpha
    // length 1 makes alpha exactly 1, and the source then divides by zero.
    if (!(denom > 0)) return out
    const ema1 = ema(values, length)
    const ema2 = ema(ema1, length)
    for (let i = 0; i < n; i++) {
      if (!Number.isFinite(ema1[i]) || !Number.isFinite(ema2[i])) continue
      out[i] = ((2 - alpha) * ema1[i] - ema2[i]) / denom
    }
    return out
  }

  // Pine's color.lime and color.red.
  const UP = '#00E676'
  const DOWN = '#FF5252'

  registerIndicator({
    id: 'oa-vortex-bands',
    name: 'Vortex Bands (VB)',
    category: 'Channels',
    placement: 'onchart',

    inputs: [
      { key: 'length', type: 'number', label: 'Length', default: 20, min: 1, max: 5000, step: 1 },
      { key: 'mult', type: 'number', label: 'Multiplier', default: 2, min: 0.1, max: 100, step: 0.1 },
      { key: 'source', type: 'source', label: 'Source', default: 'hlc3' },
      {
        key: 'barColoring',
        type: 'select',
        label: 'Bar Coloring',
        default: 'None',
        options: [
          { label: 'None', value: 'None' },
          { label: 'Upper > Lower', value: 'Upper > Lower' },
          { label: 'Close Above/Below Basis', value: 'Close Above/Below Basis' },
          { label: 'Close Inside Cloud', value: 'Close Inside Cloud' },
          { label: 'Wicks Inside Cloud', value: 'Wicks Inside Cloud' },
        ],
        tooltip: 'Recolours the price candles. It overrides the usual up and down colours for every bar.',
      },
    ],

    plots: [
      { key: 'basis', type: 'line', title: 'Basis', style: { color: '#880E4F', lineWidth: 1 } },
      { key: 'upper', type: 'line', title: 'Upper', style: { color: '#2196F3', lineWidth: 2 } },
      { key: 'lower', type: 'line', title: 'Lower', style: { color: '#FF9800', lineWidth: 2 } },
    ],

    fills: [{ between: ['upper', 'lower'], colorUp: '#ffd966', colorDown: '#ffd966', opacity: 0.1 }],

    calc(bars, settings) {
      // A cleared number field arrives as '', and Number('') is 0.
      const length = Math.max(1, Math.floor(Number(settings.length) || 20))
      const mult = Math.max(0.1, Number(settings.mult) || 2)
      const src = sourceValues(bars, settings.source || 'hlc3')
      const n = bars.length

      const basis = mnma(src, length)

      const residual = new Array(n).fill(NaN)
      for (let i = 0; i < n; i++) {
        if (!Number.isFinite(src[i]) || !Number.isFinite(basis[i])) continue
        residual[i] = src[i] - basis[i]
      }
      const spread = mnma(residual, length)

      const upper = new Array(n).fill(NaN)
      const lower = new Array(n).fill(NaN)
      for (let i = 0; i < n; i++) {
        if (!Number.isFinite(basis[i]) || !Number.isFinite(spread[i])) continue
        const dev = mult * spread[i]
        upper[i] = basis[i] + dev
        lower[i] = basis[i] - dev
      }

      return { basis: nulls(basis), upper: nulls(upper), lower: nulls(lower) }
    },

    barColors({ bars, values, settings }) {
      const mode = settings.barColoring || 'None'
      const out = new Array(bars.length).fill(null)
      if (mode === 'None') return out
      const basis = values.basis
      const upper = values.upper
      const lower = values.lower
      for (let i = 0; i < bars.length; i++) {
        const b = basis[i]
        const u = upper[i]
        const l = lower[i]
        // Where the bands are not defined the source compares against na, so
        // leave the candle its own colour rather than painting a verdict.
        if (!Number.isFinite(b) || !Number.isFinite(u) || !Number.isFinite(l)) continue
        const bar = bars[i]
        // The spread can turn negative, so the source reads the cloud edges
        // through min and max rather than assuming upper sits on top.
        const top = Math.max(u, l)
        const bottom = Math.min(u, l)
        if (mode === 'Upper > Lower') {
          out[i] = u > l ? UP : DOWN
        } else if (mode === 'Close Above/Below Basis') {
          out[i] = bar.close > b ? UP : DOWN
        } else if (mode === 'Close Inside Cloud') {
          out[i] = bottom < bar.close && bar.close < top ? UP : DOWN
        } else if (mode === 'Wicks Inside Cloud') {
          out[i] = bottom < bar.low && bar.high < top ? UP : DOWN
        }
      }
      return out
    },
  })
}
