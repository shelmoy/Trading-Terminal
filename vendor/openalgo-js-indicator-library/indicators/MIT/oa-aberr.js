/**
 * Aberration (ABBER) - ported to openalgo-charts from Pine Script v6.
 *
 * Source: https://github.com/mihakralj/pinescript/blob/c4e91b96/indicators/channels/aberr.pine
 * Repo:   mihakralj/pinescript
 * License: MIT (c) mihakralj
 * SPDX-FileCopyrightText: (c) mihakralj
 * SPDX-FileCopyrightText: (c) 2026 marketcalls (port to openalgo-charts)
 * SPDX-License-Identifier: MIT
 *
 * Bands set a fixed multiple of the average absolute deviation away from a
 * moving average, so the channel widens with dispersion rather than with
 * variance.
 */

export default function ({ registerIndicator, sourceValues, sma, ema, wma, rma, nulls }) {
  // Pine's ta.wma(src, period / 2) uses integer division, and the HMA smoothing
  // length is math.round(math.sqrt(period)).
  const hma = (values, period) => {
    const half = Math.max(1, Math.floor(period / 2))
    const root = Math.max(1, Math.round(Math.sqrt(period)))
    const fast = wma(values, half)
    const slow = wma(values, period)
    const raw = new Array(values.length).fill(NaN)
    for (let i = 0; i < values.length; i++) {
      if (!Number.isFinite(fast[i]) || !Number.isFinite(slow[i])) continue
      raw[i] = 2 * fast[i] - slow[i]
    }
    return wma(raw, root)
  }

  registerIndicator({
    id: 'oa-aberr',
    name: 'Aberration (ABBER)',
    category: 'Channels',
    placement: 'onchart',

    inputs: [
      { key: 'source', type: 'source', label: 'Source', default: 'close' },
      { key: 'period', type: 'number', label: 'Period', default: 20, min: 1, max: 5000, step: 1 },
      {
        key: 'maType',
        type: 'select',
        label: 'Moving Average Type',
        default: 'SMA',
        options: [
          { label: 'SMA', value: 'SMA' },
          { label: 'EMA', value: 'EMA' },
          { label: 'WMA', value: 'WMA' },
          { label: 'RMA', value: 'RMA' },
          { label: 'HMA', value: 'HMA' },
        ],
      },
      {
        key: 'multiplier',
        type: 'number',
        label: 'Deviation Multiplier',
        default: 2,
        min: 0.1,
        max: 100,
        step: 0.1,
        tooltip: 'Band distance as a multiple of the average absolute deviation from the moving average.',
      },
      { key: 'showMa', type: 'boolean', label: 'Show Moving Average Line', default: true },
    ],

    plots: [
      { key: 'upper', type: 'line', title: 'Upper Band', style: { color: '#ffeb3b', lineWidth: 2 } },
      { key: 'lower', type: 'line', title: 'Lower Band', style: { color: '#ffeb3b', lineWidth: 2 } },
      { key: 'ma', type: 'line', title: 'MA', style: { color: '#ffeb3b', lineWidth: 2 } },
    ],

    fills: [{ between: ['upper', 'lower'], colorUp: '#2962ff', colorDown: '#2962ff', opacity: 0.1 }],

    calc(bars, settings) {
      // A cleared number field arrives as '', and Number('') is 0.
      const period = Math.max(1, Math.floor(Number(settings.period) || 20))
      const multiplier = Math.max(0.1, Number(settings.multiplier) || 2)
      const showMa = settings.showMa !== false
      const src = sourceValues(bars, settings.source ?? 'close')

      let maLine
      switch (settings.maType) {
        case 'EMA': maLine = ema(src, period); break
        case 'WMA': maLine = wma(src, period); break
        case 'RMA': maLine = rma(src, period); break
        case 'HMA': maLine = hma(src, period); break
        default: maLine = sma(src, period)
      }

      // Pine wraps both operands in nz(), so a warmup NaN reads as 0 here.
      const deviation = new Array(bars.length)
      for (let i = 0; i < bars.length; i++) {
        const s = Number.isFinite(src[i]) ? src[i] : 0
        const m = Number.isFinite(maLine[i]) ? maLine[i] : 0
        deviation[i] = Math.abs(s - m)
      }
      const avgDeviation = sma(deviation, period)

      const upper = new Array(bars.length).fill(NaN)
      const lower = new Array(bars.length).fill(NaN)
      const ma = new Array(bars.length).fill(NaN)
      for (let i = 0; i < bars.length; i++) {
        if (!Number.isFinite(maLine[i])) continue
        if (showMa) ma[i] = maLine[i]
        if (!Number.isFinite(avgDeviation[i])) continue
        upper[i] = maLine[i] + multiplier * avgDeviation[i]
        lower[i] = maLine[i] - multiplier * avgDeviation[i]
      }

      return { upper: nulls(upper), lower: nulls(lower), ma: nulls(ma) }
    },
  })
}
