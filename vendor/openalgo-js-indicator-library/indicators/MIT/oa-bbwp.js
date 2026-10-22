/**
 * Bollinger Band Width Percentile (BBWP) - ported to openalgo-charts from Pine Script v6.
 *
 * Source: https://github.com/mihakralj/pinescript/blob/c4e91b962be09733d8fc76caa5191e9e586c5cee/indicators/volatility/bbwp.pine
 * Repo:   mihakralj/pinescript
 * License: MIT (c) mihakralj
 * SPDX-FileCopyrightText: (c) mihakralj
 * SPDX-FileCopyrightText: (c) 2026 marketcalls (port to openalgo-charts)
 * SPDX-License-Identifier: MIT
 *
 * Measures where the current Bollinger band width sits inside its own recent
 * history: the fraction of the lookback window whose width was narrower than
 * now. Near zero marks the tightest squeeze of the window, near one marks the
 * widest expansion, so it reads volatility as a rank rather than as a price
 * distance.
 */

export default function ({ registerIndicator, sourceValues, nulls }) {
  registerIndicator({
    id: 'oa-bbwp',
    name: 'Bollinger Band Width Percentile (BBWP)',
    category: 'Volatility',
    placement: 'pane',

    inputs: [
      { key: 'period', type: 'number', label: 'Period', default: 20, min: 1, max: 5000, step: 1 },
      { key: 'source', type: 'source', label: 'Source', default: 'close' },
      { key: 'multiplier', type: 'number', label: 'StdDev Multiplier', default: 2, min: 0.001, max: 100, step: 0.1 },
      { key: 'lookback', type: 'number', label: 'Lookback Period', default: 252, min: 1, max: 20000, step: 1 },
    ],

    plots: [
      {
        key: 'bbwp',
        type: 'line',
        title: 'BBWP',
        // The source declares format.percent, which suffixes a % without
        // rescaling, so the fraction is shown as it is computed.
        priceFormat: { type: 'percent' },
        style: { color: '#ffeb3b', lineWidth: 2 },
      },
    ],

    // The value is a fraction of the lookback window, so the pane is fixed to
    // 0 .. 1 rather than autoscaling to whatever slice is on screen.
    range: () => ({ min: 0, max: 1 }),

    calc(bars, settings) {
      // A cleared number field arrives as '', and Number('') is 0.
      const period = Math.max(1, Math.floor(Number(settings.period) || 20))
      const multiplier = Math.max(0.001, Number(settings.multiplier) || 2)
      const lookback = Math.max(1, Math.floor(Number(settings.lookback) || 252))
      const src = sourceValues(bars, settings.source ?? 'close')
      const n = bars.length
      const out = new Array(n).fill(NaN)

      // Pine keeps a circular buffer and carries the running sums across bars,
      // so the port accumulates the same way rather than re-summing the window:
      // the rounding then matches bar for bar.
      const buffer = new Array(period).fill(NaN)
      let head = 0
      let count = 0
      let sum = 0
      let sumSq = 0

      const hist = new Array(lookback).fill(NaN)
      let histHead = 0
      let histCount = 0

      for (let i = 0; i < n; i++) {
        const oldest = buffer[head]
        if (Number.isFinite(oldest)) {
          sum -= oldest
          sumSq -= oldest * oldest
          count -= 1
        }
        // Pine: float current_val = nz(source)
        const current = Number.isFinite(src[i]) ? src[i] : 0
        sum += current
        sumSq += current * current
        count += 1
        buffer[head] = current
        head = (head + 1) % period

        // count is at least 1 here, so the mean never divides by zero.
        let basis = count > 0 ? sum / count : NaN
        if (!Number.isFinite(basis)) basis = current
        // Population variance, clamped at zero: the running form can go a shade
        // negative on a flat series through floating-point cancellation.
        const variance = Math.max(0, sumSq / count - basis * basis)
        const dev = count > 1 ? multiplier * Math.sqrt(variance) : 0
        const bbw = 2 * dev

        const histOldest = hist[histHead]
        if (Number.isFinite(histOldest)) histCount -= 1
        if (Number.isFinite(bbw)) histCount += 1
        hist[histHead] = bbw
        histHead = (histHead + 1) % lookback

        if (histCount < 2) {
          // The source returns a real 0.5 on the opening bar, not a gap.
          out[i] = 0.5
        } else {
          // Slots 0 .. histCount - 1 are exactly the filled ones, both before
          // the buffer wraps and after it is full.
          let below = 0
          for (let k = 0; k < histCount; k++) {
            const val = hist[k]
            if (Number.isFinite(val) && val < bbw) below += 1
          }
          out[i] = below / histCount
        }
      }

      return { bbwp: nulls(out) }
    },
  })
}
