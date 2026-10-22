/**
 * Kendall Rank Correlation (KENDALL) - ported to openalgo-charts from Pine Script v6.
 *
 * Source: https://github.com/mihakralj/pinescript/blob/c4e91b962be09733d8fc76caa5191e9e586c5cee/indicators/statistics/kendall.pine
 * Repo:   mihakralj/pinescript
 * License: MIT
 * SPDX-FileCopyrightText: (c) mihakralj
 * SPDX-FileCopyrightText: (c) 2026 marketcalls (port to openalgo-charts)
 * SPDX-License-Identifier: MIT
 *
 * Kendall's Tau-a over the lookback window: every pair of bars in the window
 * is checked, and a pair counts as concordant when both series moved the same
 * way between them and discordant when they moved opposite ways. The score is
 * the net count divided by the number of pairs, so +1 is perfect rank
 * agreement, -1 perfect disagreement and 0 no rank relationship at all.
 *
 * Gap against the source: the second series there is another ticker, pulled in
 * with request.security(i_source2_ticker, timeframe.period, close). A chart
 * study is handed one instrument's bars and there is no request.security here,
 * so the second series is a second price source on the current instrument
 * instead. The coefficient itself is ported exactly.
 */

export default function ({ registerIndicator, sourceValues, nulls }) {
  registerIndicator({
    id: 'oa-kendall',
    name: 'Kendall Rank Correlation (KENDALL)',
    category: 'Statistics',
    placement: 'pane',

    inputs: [
      { key: 'source1', type: 'source', label: 'Source 1', default: 'close' },
      {
        key: 'source2',
        type: 'source',
        label: 'Source 2',
        default: 'volume',
        tooltip: 'The Pine source reads a second ticker here, which a chart study cannot fetch. Both series are the current instrument.',
      },
      {
        key: 'period',
        type: 'number',
        label: 'Period',
        default: 20,
        min: 2,
        max: 60,
        step: 1,
        tooltip: 'Bars in the window. The source function documents a maximum of 60; every pair in the window is compared, so the work grows with its square.',
      },
    ],

    plots: [{ key: 'tau', type: 'line', title: "Kendall's Tau", style: { color: '#ffeb3b', lineWidth: 2, precision: 4 } }],

    calc(bars, settings) {
      // A cleared number field arrives as '', and Number('') is 0. Pine's
      // minval is 2, below which the coefficient has no pairs to count.
      const period = Math.min(60, Math.max(2, Math.floor(Number(settings.period) || 20)))
      const s1 = sourceValues(bars, settings.source1 ?? 'close')
      const s2 = sourceValues(bars, settings.source2 ?? 'volume')
      const n = bars.length
      const out = new Array(n).fill(NaN)

      const w1 = new Array(period)
      const w2 = new Array(period)
      // The number of pairs, length * (length - 1) / 2, which is at least 1
      // because the period floor above is 2.
      const denominator = (period * (period - 1)) / 2

      for (let i = period - 1; i < n; i++) {
        // Pine fills the window oldest first and abandons the whole bar on the
        // first unavailable value, so a single gap in either series blanks the
        // reading rather than shrinking the window.
        const start = i - period + 1
        let windowHasNa = false
        for (let k = 0; k < period; k++) {
          const a = s1[start + k]
          const b = s2[start + k]
          if (!Number.isFinite(a) || !Number.isFinite(b)) {
            windowHasNa = true
            break
          }
          w1[k] = a
          w2[k] = b
        }
        if (windowHasNa) continue

        let concordant = 0
        let discordant = 0
        for (let a = 0; a < period - 1; a++) {
          for (let b = a + 1; b < period; b++) {
            const product = (w1[a] - w1[b]) * (w2[a] - w2[b])
            if (product > 0) concordant += 1
            else if (product < 0) discordant += 1
          }
        }

        out[i] = (concordant - discordant) / denominator
      }

      return { tau: nulls(out) }
    },
  })
}
