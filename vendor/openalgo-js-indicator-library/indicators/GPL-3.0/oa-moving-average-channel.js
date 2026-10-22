/**
 * Moving Average Channel (MAC) - ported to openalgo-charts from Pine Script v4.
 *
 * Source: https://github.com/everget/tradingview-pinescript-indicators/blob/60c93d3711d222b8f2db96160defe568429348e0/bands_and_channels/moving_average_channel.pine
 * Repo:   everget/tradingview-pinescript-indicators
 * License: GPL-3.0, Copyright (c) 2017-present, Alex Orekhov (everget)
 * SPDX-FileCopyrightText: (c) 2018-present Alex Orekhov (everget)
 * SPDX-FileCopyrightText: (c) 2026 marketcalls (port to openalgo-charts)
 * SPDX-License-Identifier: GPL-3.0-only
 *
 * Two independent simple moving averages, one of the highs and one of the lows,
 * form a channel around price. Bars are recoloured green above the upper
 * average, red below the lower one and grey inside the channel.
 */

export default function ({ registerIndicator, sourceValues, sma, nulls }) {
  // Pine's plot(..., offset=N) shifts the drawn line N bars to the right, so
  // the value shown on bar i is the one computed N bars earlier.
  const shift = (values, offset, length) => {
    if (offset === 0) return values
    const out = new Array(length).fill(NaN)
    for (let i = 0; i < length; i++) {
      const j = i - offset
      if (j < 0 || j >= length) continue
      const v = values[j]
      if (Number.isFinite(v)) out[i] = v
    }
    return out
  }

  registerIndicator({
    id: 'oa-moving-average-channel',
    name: 'Moving Average Channel (MAC)',
    category: 'Channels',
    placement: 'onchart',

    inputs: [
      { key: 'upperSrc', type: 'source', label: 'Upper Source', default: 'high' },
      { key: 'upperLength', type: 'number', label: 'Upper Length', default: 20, min: 1, max: 5000, step: 1 },
      {
        key: 'upperOffset',
        type: 'number',
        label: 'Upper Offset',
        default: 0,
        min: -500,
        max: 500,
        step: 1,
        tooltip: 'Bars to shift the upper average. Values pushed past the last bar cannot be drawn.',
      },
      { key: 'lowerSrc', type: 'source', label: 'Lower Source', default: 'low' },
      { key: 'lowerLength', type: 'number', label: 'Lower Length', default: 20, min: 1, max: 5000, step: 1 },
      {
        key: 'lowerOffset',
        type: 'number',
        label: 'Lower Offset',
        default: 0,
        min: -500,
        max: 500,
        step: 1,
        tooltip: 'Bars to shift the lower average. Values pushed past the last bar cannot be drawn.',
      },
    ],

    plots: [
      { key: 'upper', type: 'line', title: 'Upper', style: { color: '#3c78d8', lineWidth: 2 } },
      { key: 'lower', type: 'line', title: 'Lower', style: { color: '#f57c00', lineWidth: 2 } },
    ],

    fills: [{ between: ['upper', 'lower'], colorUp: '#ffd966', colorDown: '#ffd966', opacity: 0.1 }],

    // Pine's barcolor() reads the UNSHIFTED averages, so it uses the raw
    // columns rather than the plotted ones.
    barColors: ({ bars, values }) =>
      bars.map((bar, i) => {
        const up = values.upperRaw[i]
        const dn = values.lowerRaw[i]
        // Pine compares against na as false, so a warmup bar falls through to
        // the grey branch exactly as it does on TradingView.
        if (Number.isFinite(up) && bar.close > up) return '#00ff00'
        if (Number.isFinite(dn) && bar.close < dn) return '#ff0000'
        return '#787b86'
      }),

    calc(bars, settings) {
      // A cleared number field arrives as '', and Number('') is 0.
      const upperLength = Math.max(1, Math.min(5000, Math.floor(Number(settings.upperLength) || 20)))
      const lowerLength = Math.max(1, Math.min(5000, Math.floor(Number(settings.lowerLength) || 20)))
      const upperOffset = Math.max(-500, Math.min(500, Math.floor(Number(settings.upperOffset) || 0)))
      const lowerOffset = Math.max(-500, Math.min(500, Math.floor(Number(settings.lowerOffset) || 0)))

      const upperSrc = sourceValues(bars, settings.upperSrc ?? 'high')
      const lowerSrc = sourceValues(bars, settings.lowerSrc ?? 'low')

      const upperRaw = sma(upperSrc, upperLength)
      const lowerRaw = sma(lowerSrc, lowerLength)

      return {
        upper: nulls(shift(upperRaw, upperOffset, bars.length)),
        lower: nulls(shift(lowerRaw, lowerOffset, bars.length)),
        // Plotted by nothing; the bar colouring reads them, and a column a hook
        // reads still has to be returned.
        upperRaw: nulls(upperRaw.slice()),
        lowerRaw: nulls(lowerRaw.slice()),
      }
    },
  })
}
