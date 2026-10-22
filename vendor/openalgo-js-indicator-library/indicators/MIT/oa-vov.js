/**
 * Volatility of Volatility (VOV) - ported to openalgo-charts from Pine Script v6.
 *
 * Source: https://github.com/mihakralj/pinescript/blob/c4e91b962be09733d8fc76caa5191e9e586c5cee/indicators/volatility/vov.pine
 * Repo:   mihakralj/pinescript
 * License: MIT (c) mihakralj
 * SPDX-FileCopyrightText: (c) mihakralj
 * SPDX-FileCopyrightText: (c) 2026 marketcalls (port to openalgo-charts)
 * SPDX-License-Identifier: MIT
 *
 * A rolling standard deviation of the source, then a second rolling standard
 * deviation of that series, so the line rises when the market's volatility is
 * itself unstable rather than merely high.
 */

export default function ({ registerIndicator, sourceValues, nulls }) {
  // The Pine helper's embedded rolling standard deviation: a circular buffer of
  // `period` slots, running sum and sum of squares, population variance floored
  // at zero. The window grows until it is full, and a window holding fewer than
  // two samples reports 0.0 rather than na, which is what the source plots on
  // the very first bar.
  const rollingStdev = (values, period) => {
    const n = values.length
    const out = new Array(n).fill(0)
    const buffer = new Array(period).fill(NaN)
    let head = 0
    let count = 0
    let sum = 0
    let sumSq = 0
    for (let i = 0; i < n; i++) {
      const oldest = buffer[head]
      if (Number.isFinite(oldest)) {
        sum -= oldest
        sumSq -= oldest * oldest
        if (count === period) count -= 1
      }
      // Pine wraps the sample in nz(), so a missing value counts as zero.
      const val = Number.isFinite(values[i]) ? values[i] : 0
      sum += val
      sumSq += val * val
      if (count < period) count += 1
      buffer[head] = val
      head = (head + 1) % period
      if (count > 1) {
        const mean = sum / count
        out[i] = Math.sqrt(Math.max(0, sumSq / count - mean * mean))
      } else {
        out[i] = 0
      }
    }
    return out
  }

  registerIndicator({
    id: 'oa-vov',
    name: 'Volatility of Volatility (VOV)',
    category: 'Volatility',
    placement: 'pane',

    inputs: [
      { key: 'source', type: 'source', label: 'Source', default: 'close' },
      {
        key: 'volatilityPeriod',
        type: 'number',
        label: 'Volatility Period',
        default: 20,
        min: 1,
        max: 5000,
        step: 1,
        tooltip: 'Period for the initial volatility calculation.',
      },
      {
        key: 'vovPeriod',
        type: 'number',
        label: 'VOV Period',
        default: 10,
        min: 1,
        max: 5000,
        step: 1,
        tooltip: 'Period for the standard deviation of the volatility series.',
      },
    ],

    plots: [{ key: 'vov', type: 'line', title: 'VOV', style: { color: '#ffeb3b', lineWidth: 2 } }],

    calc(bars, settings) {
      // A cleared number field arrives as '', and Number('') is 0.
      const volatilityPeriod = Math.max(1, Math.floor(Number(settings.volatilityPeriod) || 20))
      const vovPeriod = Math.max(1, Math.floor(Number(settings.vovPeriod) || 10))
      const src = sourceValues(bars, settings.source || 'close')

      const volatility = rollingStdev(src, volatilityPeriod)
      const vov = rollingStdev(volatility, vovPeriod)

      return { vov: nulls(vov) }
    },
  })
}
