/**
 * Commodity Channel Index (CCI) - ported to openalgo-charts from Pine Script v6.
 *
 * Source: https://github.com/mihakralj/pinescript/blob/c4e91b962be09733d8fc76caa5191e9e586c5cee/indicators/momentum/cci.pine
 * Repo:   mihakralj/pinescript
 * License: MIT (c) mihakralj
 * SPDX-FileCopyrightText: (c) mihakralj
 * SPDX-FileCopyrightText: (c) 2026 marketcalls (port to openalgo-charts)
 * SPDX-License-Identifier: MIT
 *
 * Distance of the typical price from its own average, scaled by the mean
 * absolute deviation of that window, so roughly plus or minus 100 covers the
 * normal range and excursions beyond it mark a stretched move.
 */

export default function ({ registerIndicator, nulls }) {
  registerIndicator({
    id: 'oa-cci',
    name: 'Commodity Channel Index (CCI)',
    category: 'Momentum',
    placement: 'pane',

    inputs: [
      { key: 'length', type: 'number', label: 'Length', default: 20, min: 1, max: 5000, step: 1 },
    ],

    plots: [{ key: 'cci', type: 'line', title: 'CCI', style: { color: '#ffeb3b', lineWidth: 2 } }],

    calc(bars, settings) {
      // A cleared number field arrives as '', and Number('') is 0.
      const period = Math.max(1, Math.floor(Number(settings.length) || 20))

      const n = bars.length
      const out = new Array(n).fill(NaN)

      // Pine keeps a circular buffer whose count grows with the bar index, so
      // the average and the mean deviation both use a partial window and the
      // plot starts on the first bar rather than after a warmup.
      const buffer = new Array(period).fill(NaN)
      let head = 0
      let sum = 0
      let count = 0

      for (let i = 0; i < n; i++) {
        const bar = bars[i]
        const raw = (Number(bar.high) + Number(bar.low) + Number(bar.close)) / 3
        const tp = Number.isFinite(raw) ? raw : NaN

        const oldest = buffer[head]
        if (Number.isFinite(oldest)) {
          sum -= oldest
          count -= 1
        }
        if (Number.isFinite(tp)) {
          sum += tp
          count += 1
        }
        buffer[head] = tp
        head = (head + 1) % period

        const mean = count > 0 ? sum / count : tp

        let devSum = 0
        let devCount = 0
        for (let k = 0; k < period; k++) {
          const val = buffer[k]
          if (!Number.isFinite(val)) continue
          devSum += Math.abs(val - mean)
          devCount += 1
        }
        const meanDev = devCount > 0 ? devSum / devCount : 0

        // A flat window gives a zero mean deviation: Pine returns 0 there
        // rather than dividing.
        out[i] = meanDev > 0 ? (tp - mean) / (0.015 * meanDev) : 0
      }

      return { cci: nulls(out) }
    },
  })
}
