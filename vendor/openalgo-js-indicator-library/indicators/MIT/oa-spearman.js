/**
 * Spearman Rank Correlation (SPEARMAN) - ported to openalgo-charts from Pine Script v6.
 *
 * Source: https://github.com/mihakralj/pinescript/blob/c4e91b962be09733d8fc76caa5191e9e586c5cee/indicators/statistics/spearman.pine
 * Repo:   mihakralj/pinescript
 * License: MIT (c) mihakralj
 * SPDX-FileCopyrightText: (c) mihakralj
 * SPDX-FileCopyrightText: (c) 2026 marketcalls (port to openalgo-charts)
 * SPDX-License-Identifier: MIT
 *
 * Pearson correlation computed on the ranks of two series rather than on their
 * values, so it measures whether they move together in order rather than in
 * proportion. It is unmoved by outliers and by any monotonic rescaling of
 * either series, and reads +1 for perfect agreement, -1 for perfect opposition.
 *
 * Gap against the source: the second series arrives through
 * request.security(ticker, ...), which has no equivalent here, so Source 2 is a
 * second series of the chart's own symbol instead of another instrument.
 * Comparing a symbol with itself on the same source reads a constant +1, which
 * is why Source 2 defaults to open rather than close.
 */

export default function ({ registerIndicator, sourceValues, nulls }) {
  /**
   * One-based ranks with ties averaged, which is exactly the source's
   * count_smaller + (count_equal - 1) / 2 + 1, taken at O(n log n) rather than
   * the source's O(n^2) so the 60-bar cap is not a performance ceiling.
   */
  function ranksOf(window, ranks, order) {
    const n = window.length
    for (let i = 0; i < n; i++) order[i] = i
    order.sort((a, b) => window[a] - window[b])
    let k = 0
    while (k < n) {
      let j = k
      while (j + 1 < n && window[order[j + 1]] === window[order[k]]) j++
      // Positions k..j are tied: every one of them takes the mean rank.
      const avg = (k + j) / 2 + 1
      for (let m = k; m <= j; m++) ranks[order[m]] = avg
      k = j + 1
    }
  }

  /** Pearson correlation over two equal-length arrays; 0 where either is flat. */
  function pearson(x, y) {
    const n = x.length
    if (n < 2 || y.length !== n) return NaN
    let sumX = 0
    let sumY = 0
    for (let i = 0; i < n; i++) {
      sumX += x[i]
      sumY += y[i]
    }
    const meanX = sumX / n
    const meanY = sumY / n
    let sumXY = 0
    let sumXX = 0
    let sumYY = 0
    for (let i = 0; i < n; i++) {
      const dx = x[i] - meanX
      const dy = y[i] - meanY
      sumXY += dx * dy
      sumXX += dx * dx
      sumYY += dy * dy
    }
    // A constant series has no variance, so the correlation is undefined. The
    // source returns 0 there, and that also guards the divide.
    if (sumXX === 0 || sumYY === 0) return 0
    const denom = Math.sqrt(sumXX * sumYY)
    if (!(denom > 0)) return 0
    return sumXY / denom
  }

  registerIndicator({
    id: 'oa-spearman',
    name: 'Spearman Rank Correlation (SPEARMAN)',
    category: 'Statistics',
    placement: 'pane',

    inputs: [
      { key: 'source1', type: 'source', label: 'Source 1', default: 'close' },
      {
        key: 'source2',
        type: 'source',
        label: 'Source 2',
        default: 'open',
        tooltip: 'Second series of this symbol. The Pine original read another ticker, which a chart study cannot request.',
      },
      {
        key: 'length',
        type: 'number',
        label: 'Lookback Period',
        default: 20,
        min: 2,
        max: 60,
        step: 1,
        tooltip: 'Number of bars for calculation. Max 60, as ranking is quadratic in the window.',
      },
    ],

    plots: [{ key: 'rho', type: 'line', title: "Spearman's Rho", style: { color: '#ffeb3b', lineWidth: 2 } }],

    // The source's six hlines: zero, the two moderate-correlation marks and the
    // two bounds.
    levels: () => [
      { price: 1, title: 'Max Positive Correlation', color: '#26a69a' },
      { price: 0.5, title: 'Moderate Positive Correlation', color: '#26a69a', dashed: true },
      { price: 0, title: 'Zero Line', color: '#8892a6', dashed: true },
      { price: -0.5, title: 'Moderate Negative Correlation', color: '#ef5350', dashed: true },
      { price: -1, title: 'Max Negative Correlation', color: '#ef5350' },
    ],

    calc(bars, settings) {
      // A cleared number field arrives as '', and Number('') is 0.
      const length = Math.min(60, Math.max(2, Math.floor(Number(settings.length) || 20)))
      const s1 = sourceValues(bars, settings.source1 ?? 'close')
      const s2 = sourceValues(bars, settings.source2 ?? 'open')

      const n = bars.length
      const out = new Array(n).fill(NaN)

      const w1 = new Array(length)
      const w2 = new Array(length)
      const r1 = new Array(length)
      const r2 = new Array(length)
      const order = new Array(length)

      for (let i = length - 1; i < n; i++) {
        // The source aborts the whole window on a single na, so a gap in either
        // series leaves a gap in the reading rather than a shorter window.
        let hasGap = false
        for (let k = 0; k < length; k++) {
          const v1 = s1[i - length + 1 + k]
          const v2 = s2[i - length + 1 + k]
          if (!Number.isFinite(v1) || !Number.isFinite(v2)) {
            hasGap = true
            break
          }
          w1[k] = v1
          w2[k] = v2
        }
        if (hasGap) continue

        ranksOf(w1, r1, order)
        ranksOf(w2, r2, order)
        const rho = pearson(r1, r2)
        if (Number.isFinite(rho)) out[i] = rho
      }

      return { rho: nulls(out) }
    },
  })
}
