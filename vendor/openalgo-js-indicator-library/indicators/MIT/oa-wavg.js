/**
 * Weighted Average (WAVG) - ported to openalgo-charts from Pine Script v6.
 *
 * Source: https://github.com/mihakralj/pinescript/blob/c4e91b962be09733d8fc76caa5191e9e586c5cee/indicators/statistics/wavg.pine
 * Repo:   mihakralj/pinescript
 * License: MIT (c) mihakralj
 * SPDX-FileCopyrightText: (c) mihakralj
 * SPDX-FileCopyrightText: (c) 2026 marketcalls (port to openalgo-charts)
 * SPDX-License-Identifier: MIT
 *
 * A rolling linearly-weighted average: the oldest bar in the window carries weight
 * 1 and the newest carries weight equal to the window fill, divided by
 * count * (count + 1) / 2, so it emits from the first bar on a partial window.
 *
 * Deviation from the source, deliberate: the Pine circular-buffer update removes
 * the departing value from runningSum BEFORE subtracting runningSum from
 * weightedSum, so the departing bar's weight-1 contribution is never taken out of
 * weightedSum. The error compounds by one departing value per bar, which makes the
 * published version drift away from price without bound (a constant series does not
 * even return that constant). This port applies the weight shift against the full
 * window sum, which is the formula the source documents in its own header:
 *   WAVG = sum(weight_i * value_i) / sum(weight_i), weight_i = 1 (oldest) .. count.
 */

export default function ({ registerIndicator, sourceValues, nulls }) {
  registerIndicator({
    id: 'oa-wavg',
    name: 'Weighted Average (WAVG)',
    category: 'Statistics',
    placement: 'onchart',

    inputs: [
      { key: 'source', type: 'source', label: 'Source', default: 'close' },
      { key: 'period', type: 'number', label: 'Period', default: 14, min: 1, max: 5000, step: 1 },
    ],

    plots: [{ key: 'wavg', type: 'line', title: 'WAVG', style: { color: '#ffeb3b', lineWidth: 2 } }],

    calc(bars, settings) {
      const n = bars.length
      // A cleared number field arrives as '', and Number('') is 0.
      const period = Math.max(1, Math.floor(Number(settings.period) || 14))
      const src = sourceValues(bars, settings.source ?? 'close')

      const out = new Array(n).fill(NaN)
      const buffer = new Array(period).fill(NaN)
      let head = 0
      let weightedSum = 0
      let runningSum = 0
      let count = 0

      for (let i = 0; i < n; i++) {
        // nz(source): a missing value enters the window as zero, as in the source.
        const raw = src[i]
        const value = Number.isFinite(raw) ? raw : 0

        const oldest = buffer[head]
        if (Number.isFinite(oldest)) {
          // Window is full: shift every weight down by one, which drops the
          // departing bar (weight 1) and demotes the rest.
          weightedSum -= runningSum
          runningSum -= oldest
        } else {
          // Still filling: the oldest bar keeps weight 1, so nothing shifts.
          count += 1
        }

        runningSum += value
        weightedSum += count * value

        buffer[head] = value
        head = (head + 1) % period

        const denom = (count * (count + 1)) / 2
        out[i] = denom > 0 ? weightedSum / denom : value
      }

      return { wavg: nulls(out) }
    },
  })
}
