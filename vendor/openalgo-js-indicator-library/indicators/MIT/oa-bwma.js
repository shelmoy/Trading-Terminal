/**
 * Bessel-Weighted Moving Average (BWMA) - ported to openalgo-charts from Pine Script v6.
 *
 * Source: https://github.com/mihakralj/pinescript/blob/c4e91b962be09733d8fc76caa5191e9e586c5cee/indicators/trends_FIR/bwma.pine
 * Repo:   mihakralj/pinescript
 * License: MIT
 * SPDX-FileCopyrightText: (c) mihakralj
 * SPDX-FileCopyrightText: (c) 2026 marketcalls (port to openalgo-charts)
 * SPDX-License-Identifier: MIT
 *
 * A finite impulse response average whose weights follow a Bessel window: zero
 * at both ends of the lookback and heaviest in the middle, so the curve is
 * smoother than a simple average and its taper is set by the Bessel order.
 */

export default function ({ registerIndicator, sourceValues, nulls }) {
  // A cleared field arrives as '', and Number('') is 0. The Bessel order is
  // legitimately 0, so it falls back to its default only when unparsable.
  const intInput = (raw, fallback, min, max) => {
    if (raw === '' || raw === null || raw === undefined) return fallback
    const n = Number(raw)
    if (!Number.isFinite(n)) return fallback
    return Math.min(max, Math.max(min, Math.floor(n)))
  }

  // Bessel window over p taps, normalised to sum to 1. With p = 1 the scale is
  // a divide by zero, exactly as in Pine: every weight comes out 0 and the
  // caller's fallback returns the raw source for that bar.
  const besselWeights = (p, order) => {
    const weights = new Array(p).fill(0)
    const scale = 2.0 / (p - 1)
    const power = order / 2.0 + 0.5
    let total = 0
    for (let i = 0; i < p; i++) {
      const x = i * scale - 1.0
      const arg = 1.0 - x * x
      let w = 0
      if (arg > 0.0) {
        if (order === 0) w = arg
        else if (order === 1) w = arg * Math.sqrt(arg)
        else w = Math.pow(arg, power)
      }
      weights[i] = w
      total += w
    }
    if (total > 0.0) {
      const inv = 1.0 / total
      for (let i = 0; i < p; i++) weights[i] *= inv
    }
    return weights
  }

  registerIndicator({
    id: 'oa-bwma',
    name: 'Bessel-Weighted Moving Average (BWMA)',
    category: 'Trends FIR',
    placement: 'onchart',

    inputs: [
      { key: 'period', type: 'number', label: 'Period', default: 10, min: 1, max: 5000, step: 1 },
      {
        key: 'order',
        type: 'number',
        label: 'Bessel Order',
        default: 0,
        min: 0,
        max: 3,
        step: 1,
        tooltip: 'Order of the Bessel function (0-3). Higher orders taper the window more sharply.',
      },
      { key: 'source', type: 'source', label: 'Source', default: 'close' },
    ],

    plots: [{ key: 'bwma', type: 'line', title: 'BWMA', style: { color: '#ffeb3b', lineWidth: 2 } }],

    calc(bars, settings) {
      const period = Math.max(1, Math.floor(Number(settings.period) || 10))
      const order = intInput(settings.order, 0, 0, 3)
      const src = sourceValues(bars, settings.source ?? 'close')
      const n = bars.length
      const out = new Array(n).fill(NaN)

      // Pine uses p = min(bar_index + 1, period), so the window grows from the
      // first bar and the weights are rebuilt each time p changes.
      let weights = null
      let lastP = -1
      for (let i = 0; i < n; i++) {
        const p = Math.min(i + 1, period)
        if (p !== lastP) {
          weights = besselWeights(p, order)
          lastP = p
        }
        let sum = 0
        let weightSum = 0
        for (let j = 0; j < p; j++) {
          const price = src[i - j]
          if (!Number.isFinite(price)) continue
          const w = weights[j]
          sum += price * w
          weightSum += w
        }
        // nz(sum / weight_sum, source): a degenerate window falls back to source.
        const value = sum / weightSum
        if (Number.isFinite(value)) out[i] = value
        else if (Number.isFinite(src[i])) out[i] = src[i]
      }

      return { bwma: nulls(out) }
    },
  })
}
