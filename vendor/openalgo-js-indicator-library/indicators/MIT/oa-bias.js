/**
 * Bias (BIAS) - ported to openalgo-charts from Pine Script v6.
 *
 * Source: https://github.com/mihakralj/pinescript/blob/c4e91b962be09733d8fc76caa5191e9e586c5cee/indicators/momentum/bias.pine
 * Repo:   mihakralj/pinescript
 * License: MIT
 * SPDX-FileCopyrightText: (c) mihakralj
 * SPDX-FileCopyrightText: (c) 2026 marketcalls (port to openalgo-charts)
 * SPDX-License-Identifier: MIT
 *
 * The distance of price from its own moving average, expressed as a fraction of
 * that average. Positive readings mean price is stretched above the mean,
 * negative readings mean it is stretched below.
 */

export default function ({ registerIndicator, sourceValues, nulls }) {
  registerIndicator({
    id: 'oa-bias',
    name: 'Bias (BIAS)',
    category: 'Momentum',
    placement: 'pane',

    inputs: [
      { key: 'source', type: 'source', label: 'Source', default: 'close' },
      { key: 'length', type: 'number', label: 'Length', default: 20, min: 1, max: 5000, step: 1 },
    ],

    plots: [{ key: 'bias', type: 'line', title: 'BIAS', style: { color: '#ffeb3b', lineWidth: 2 } }],

    calc(bars, settings) {
      // A cleared number field arrives as '', and Number('') is 0.
      const length = Math.max(1, Math.floor(Number(settings.length) || 20))
      const src = sourceValues(bars, settings.source ?? 'close')
      const n = bars.length
      const out = new Array(n).fill(NaN)

      // The source keeps its own circular-buffer mean rather than calling
      // ta.sma, so that a gap in the data drops out of the sum instead of
      // blanking the window. Ported as written, including the partial average
      // it emits before the buffer is full.
      const buffer = new Array(length).fill(NaN)
      let sum = 0
      let head = 0
      let validCount = 0

      for (let i = 0; i < n; i++) {
        const value = src[i]
        const oldest = buffer[head]
        if (Number.isFinite(oldest)) sum -= oldest
        else if (Number.isFinite(value)) validCount += 1
        sum += Number.isFinite(value) ? value : 0
        buffer[head] = value
        head = (head + 1) % length

        let movingAverage = NaN
        if (validCount >= length || i + 1 >= length) movingAverage = sum / Math.max(validCount, 1)
        // Before the window is full Pine overrides with the running mean of the
        // bars seen so far, so the study plots from the very first bar.
        if (i < length - 1) movingAverage = sum / Math.max(i + 1, 1)

        if (Number.isFinite(movingAverage) && movingAverage !== 0 && Number.isFinite(value)) {
          out[i] = (value - movingAverage) / movingAverage
        }
      }

      return { bias: nulls(out) }
    },
  })
}
