/**
 * Ulcer Index (UI) - ported to openalgo-charts from Pine Script v6.
 *
 * Source: https://github.com/mihakralj/pinescript/blob/c4e91b962be09733d8fc76caa5191e9e586c5cee/indicators/volatility/ui.pine
 * Repo:   mihakralj/pinescript
 * License: MIT (c) mihakralj
 * SPDX-FileCopyrightText: (c) mihakralj
 * SPDX-FileCopyrightText: (c) 2026 marketcalls (port to openalgo-charts)
 * SPDX-License-Identifier: MIT
 *
 * The root mean square of the percentage drawdown from the running high, so it
 * measures downside pain only: an instrument that rises steadily reads near
 * zero however fast it moves.
 */

export default function ({ registerIndicator, sourceValues, rollingSum, nulls }) {
  registerIndicator({
    id: 'oa-ui',
    name: 'Ulcer Index (UI)',
    category: 'Volatility',
    placement: 'pane',

    inputs: [
      { key: 'source', type: 'source', label: 'Source', default: 'close' },
      {
        key: 'period',
        type: 'number',
        label: 'Period',
        default: 14,
        min: 1,
        max: 5000,
        step: 1,
        tooltip: 'Lookback period for calculating the Ulcer Index.',
      },
    ],

    plots: [{ key: 'ui', type: 'line', title: 'UI', style: { color: '#ffeb3b', lineWidth: 2 } }],

    calc(bars, settings) {
      // A cleared number field arrives as '', and Number('') is 0. The source
      // refuses a period of 0 or less.
      const period = Math.max(1, Math.floor(Number(settings.period) || 14))
      const n = bars.length
      const src = sourceValues(bars, settings.source ?? 'close')

      // The source feeds its buffer with nz(src) but takes the drawdown from
      // the raw source, so both forms are kept apart here.
      const values = new Array(n).fill(0)
      for (let i = 0; i < n; i++) values[i] = Number.isFinite(src[i]) ? src[i] : 0

      // The source's monotonic deque: the highest value of the last `period`
      // bars, over a shorter window while fewer bars exist.
      const deque = []
      const squared = new Array(n).fill(0)

      for (let i = 0; i < n; i++) {
        const current = values[i]
        while (deque.length > 0 && deque[0] <= i - period) deque.shift()
        while (deque.length > 0 && values[deque[deque.length - 1]] <= current) deque.pop()
        deque.push(i)

        const highestClose = values[deque[0]]
        // A zero or non-finite high leaves the drawdown undefined; treat that
        // bar as no drawdown rather than poisoning the whole rolling window.
        const drawdown =
          Number.isFinite(src[i]) && Number.isFinite(highestClose) && highestClose !== 0
            ? ((src[i] - highestClose) / highestClose) * 100
            : 0
        squared[i] = drawdown * drawdown
      }

      // rollingSum is na for the first period-1 bars, so the line starts once a
      // full window exists rather than on a partial sum divided by the period.
      const sumSquared = rollingSum(squared, period)

      const out = new Array(n).fill(NaN)
      for (let i = 0; i < n; i++) {
        if (!Number.isFinite(sumSquared[i])) continue
        // rollingSum keeps a running total, so a window whose squared
        // drawdowns are genuinely all zero (price at a new high right across
        // the lookback) lands a few ulps below zero on the cancellation.
        // Math.sqrt of that is NaN, which would punch holes in the line at
        // exactly the bars where the index should read 0.
        const mean = sumSquared[i] / period
        out[i] = Math.sqrt(mean > 0 ? mean : 0)
      }

      return { ui: nulls(out) }
    },
  })
}
