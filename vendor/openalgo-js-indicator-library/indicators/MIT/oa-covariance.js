/**
 * Covariance (COVARIANCE) - ported to openalgo-charts from Pine Script v6.
 *
 * Source: https://github.com/mihakralj/pinescript/blob/c4e91b962be09733d8fc76caa5191e9e586c5cee/indicators/statistics/covariance.pine
 * Repo:   mihakralj/pinescript
 * License: MIT (c) mihakralj
 * SPDX-FileCopyrightText: (c) mihakralj
 * SPDX-FileCopyrightText: (c) 2026 marketcalls (port to openalgo-charts)
 * SPDX-License-Identifier: MIT
 *
 * Rolling population covariance of two series over the lookback window: the
 * mean of their product minus the product of their means. Positive readings
 * mean the two move together, negative that they move against each other.
 *
 * GAP against the Pine source: the original pulls its second series from
 * ANOTHER ticker with request.security (default SPY). There is no cross-symbol
 * request in this engine, so both series are now sources on the current symbol
 * and Source 2 defaults to 'open'. The covariance maths itself is unchanged.
 */

export default function ({ registerIndicator, sourceValues, nulls }) {
  registerIndicator({
    id: 'oa-covariance',
    name: 'Covariance (COVARIANCE)',
    category: 'Statistics',
    placement: 'pane',

    inputs: [
      { key: 'source1', type: 'source', label: 'Source 1', default: 'close' },
      {
        key: 'source2',
        type: 'source',
        label: 'Source 2',
        default: 'open',
        tooltip: 'The Pine original read this series from a second ticker. Cross-symbol data is not available here, so it is a source on the current symbol.',
      },
      { key: 'period', type: 'number', label: 'Period', default: 20, min: 2, max: 5000, step: 1 },
    ],

    plots: [{ key: 'covariance', type: 'line', title: 'Covariance', style: { color: '#ffeb3b', lineWidth: 2 } }],

    calc(bars, settings) {
      // A cleared number field arrives as '', and Number('') is 0.
      const period = Math.max(2, Math.min(5000, Math.floor(Number(settings.period) || 20)))
      const s1 = sourceValues(bars, settings.source1 ?? 'close')
      const s2 = sourceValues(bars, settings.source2 ?? 'open')

      // Pine's circular buffer, single pass: running sums of each series and of
      // their product, with count tracking how many valid pairs are in the
      // window. The window is therefore allowed to be partly filled.
      const p = Math.max(1, period)
      const buf1 = new Array(p).fill(NaN)
      const buf2 = new Array(p).fill(NaN)
      let head = 0
      let count = 0
      let sum1 = 0
      let sum2 = 0
      let sumProd = 0

      const out = new Array(bars.length).fill(NaN)
      for (let i = 0; i < bars.length; i++) {
        const oldest1 = buf1[head]
        const oldest2 = buf2[head]
        if (Number.isFinite(oldest1) && Number.isFinite(oldest2)) {
          sum1 -= oldest1
          sum2 -= oldest2
          sumProd -= oldest1 * oldest2
          count -= 1
        }

        const v1 = s1[i]
        const v2 = s2[i]
        if (Number.isFinite(v1) && Number.isFinite(v2)) {
          sum1 += v1
          sum2 += v2
          sumProd += v1 * v2
          count += 1
          buf1[head] = v1
          buf2[head] = v2
        } else {
          buf1[head] = NaN
          buf2[head] = NaN
        }

        head = (head + 1) % p

        // count > 1 is Pine's own guard and is what keeps this divide safe.
        if (count > 1) out[i] = sumProd / count - (sum1 / count) * (sum2 / count)
      }

      return { covariance: nulls(out) }
    },
  })
}
