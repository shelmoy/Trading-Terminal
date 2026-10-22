/**
 * Simple Moving Average (SMA) - ported to openalgo-charts from Pine Script v6.
 *
 * Source: https://github.com/mihakralj/pinescript/blob/c4e91b962be09733d8fc76caa5191e9e586c5cee/indicators/trends_FIR/sma.pine
 * Repo:   mihakralj/pinescript
 * License: MIT (c) mihakralj
 * SPDX-FileCopyrightText: (c) mihakralj
 * SPDX-FileCopyrightText: (c) 2026 marketcalls (port to openalgo-charts)
 * SPDX-License-Identifier: MIT
 *
 * The mean of the source over the lookback window, compensated during the first
 * bars so it divides by the number of bars actually seen instead of waiting for
 * the window to fill.
 */

export default function ({ registerIndicator, sourceValues, nulls }) {
  registerIndicator({
    id: 'oa-sma',
    name: 'Simple Moving Average (SMA)',
    category: 'Trends FIR',
    placement: 'onchart',

    inputs: [
      { key: 'period', type: 'number', label: 'Period', default: 10, min: 1, max: 5000, step: 1 },
      { key: 'source', type: 'source', label: 'Source', default: 'close' },
    ],

    plots: [{ key: 'sma', type: 'line', title: 'SMA', style: { color: '#ffeb3b', lineWidth: 2 } }],

    calc(bars, settings) {
      // A cleared number field arrives as '', and Number('') is 0.
      const period = Math.max(1, Math.floor(Number(settings.period) || 10))
      const src = sourceValues(bars, settings.source ?? 'close')
      const out = new Array(bars.length).fill(NaN)

      // Pine's circular buffer with a running sum: count only grows while the
      // slot about to be written is still na, so it settles at the period and
      // there is no na warmup.
      const buffer = new Array(period).fill(NaN)
      let head = 0
      let sum = 0
      let count = 0

      for (let i = 0; i < bars.length; i++) {
        const oldest = buffer[head]
        if (Number.isFinite(oldest)) sum -= oldest
        else count += 1

        const current = Number.isFinite(src[i]) ? src[i] : 0
        sum += current
        buffer[head] = current
        head = (head + 1) % period

        out[i] = sum / Math.max(1, count)
      }

      return { sma: nulls(out) }
    },
  })
}
