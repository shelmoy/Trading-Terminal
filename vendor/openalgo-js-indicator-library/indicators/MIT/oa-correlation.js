/**
 * Pearson's Correlation (CORRELATION) - ported to openalgo-charts from Pine Script v6.
 *
 * Source: https://github.com/mihakralj/pinescript/blob/c4e91b962be09733d8fc76caa5191e9e586c5cee/indicators/statistics/correlation.pine
 * Repo:   mihakralj/pinescript
 * License: MIT (c) mihakralj
 * SPDX-FileCopyrightText: (c) mihakralj
 * SPDX-FileCopyrightText: (c) 2026 marketcalls (port to openalgo-charts)
 * SPDX-License-Identifier: MIT
 *
 * The Pearson correlation coefficient between two series over a lookback: +1
 * when they move together in fixed proportion, -1 when they move exactly
 * opposite, 0 when their moves are unrelated.
 *
 * Gap: the source takes its second series from request.security on another
 * ticker (default SPY). There is no cross-symbol request here, so the second
 * series is a source of the chart's own symbol.
 */

export default function ({ registerIndicator, sourceValues, nulls }) {
  registerIndicator({
    id: 'oa-correlation',
    name: 'Pearson\'s Correlation (CORRELATION)',
    category: 'Statistics',
    placement: 'pane',

    inputs: [
      { key: 'source1', type: 'source', label: 'Source 1', default: 'close' },
      {
        key: 'source2',
        type: 'source',
        label: 'Source 2',
        default: 'volume',
        tooltip: 'The source Pine read from another ticker. Only the chart symbol is available here, so pick a second series from it.',
      },
      { key: 'period', type: 'number', label: 'Period', default: 20, min: 2, max: 5000, step: 1 },
    ],

    plots: [{ key: 'correlation', type: 'line', title: 'Correlation', style: { color: '#ffeb3b', lineWidth: 2 } }],

    calc(bars, settings) {
      // A cleared number field arrives as '', and Number('') is 0.
      const period = Math.max(2, Math.floor(Number(settings.period) || 20))
      const v1 = sourceValues(bars, settings.source1 || 'close')
      const v2 = sourceValues(bars, settings.source2 || 'volume')
      const n = bars.length
      const p = Math.max(1, period)

      // The Pine version keeps running sums over a circular buffer of p slots. A
      // bar enters only when both series are present, so the window expands from
      // the first bar and the coefficient appears as soon as two pairs are held.
      const buf1 = new Array(p).fill(NaN)
      const buf2 = new Array(p).fill(NaN)
      let head = 0
      let count = 0
      let sum1 = 0
      let sum2 = 0
      let sumSq1 = 0
      let sumSq2 = 0
      let sumProd = 0

      const out = new Array(n).fill(NaN)
      for (let i = 0; i < n; i++) {
        const oldest1 = buf1[head]
        const oldest2 = buf2[head]
        if (Number.isFinite(oldest1) && Number.isFinite(oldest2)) {
          sum1 -= oldest1
          sum2 -= oldest2
          sumSq1 -= oldest1 * oldest1
          sumSq2 -= oldest2 * oldest2
          sumProd -= oldest1 * oldest2
          count -= 1
        }

        const a = v1[i]
        const b = v2[i]
        if (Number.isFinite(a) && Number.isFinite(b)) {
          sum1 += a
          sum2 += b
          sumSq1 += a * a
          sumSq2 += b * b
          sumProd += a * b
          count += 1
          buf1[head] = a
          buf2[head] = b
        } else {
          buf1[head] = NaN
          buf2[head] = NaN
        }
        head = (head + 1) % p

        if (count > 1) {
          const mean1 = sum1 / count
          const mean2 = sum2 / count
          const cov = sumProd / count - mean1 * mean2
          const var1 = sumSq1 / count - mean1 * mean1
          const var2 = sumSq2 / count - mean2 * mean2
          const stddev1 = Math.sqrt(Math.max(0, var1))
          const stddev2 = Math.sqrt(Math.max(0, var2))
          const denominator = stddev1 * stddev2
          // A flat series has zero deviation and no defined correlation.
          if (denominator !== 0) out[i] = cov / denominator
        }
      }

      return { correlation: nulls(out) }
    },
  })
}
