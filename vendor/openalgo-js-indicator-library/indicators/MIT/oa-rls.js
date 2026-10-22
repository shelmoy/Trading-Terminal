/**
 * Recursive Least Squares Adaptive Filter (RLS) - ported to openalgo-charts from Pine Script v6.
 *
 * Source: https://github.com/mihakralj/pinescript/blob/c4e91b962be09733d8fc76caa5191e9e586c5cee/indicators/filters/rls.pine
 * Repo:   mihakralj/pinescript
 * License: MIT (c) mihakralj
 * SPDX-FileCopyrightText: (c) mihakralj
 * SPDX-FileCopyrightText: (c) 2026 marketcalls (port to openalgo-charts)
 * SPDX-License-Identifier: MIT
 *
 * An adaptive FIR filter whose taps are re-estimated every bar by recursive
 * least squares, so the smoothed line tracks price faster than a fixed-weight
 * average while the forgetting factor decides how much history still counts.
 */

export default function ({ registerIndicator, sourceValues, nulls }) {
  registerIndicator({
    id: 'oa-rls',
    name: 'Recursive Least Squares Adaptive Filter (RLS)',
    category: 'Filters',
    placement: 'onchart',

    inputs: [
      {
        key: 'order',
        type: 'number',
        label: 'Filter Order (taps)',
        default: 16,
        min: 2,
        max: 64,
        step: 1,
        tooltip: 'Number of adaptive FIR weights. More taps model a longer memory of past bars.',
      },
      {
        key: 'lambda',
        type: 'number',
        label: 'Forgetting Factor (Lambda)',
        default: 0.99,
        min: 0.9,
        max: 1,
        step: 0.005,
        tooltip: 'Closer to 1 remembers more history; lower values adapt faster to a regime change.',
      },
      { key: 'source', type: 'source', label: 'Source', default: 'close' },
    ],

    plots: [{ key: 'rls', type: 'line', title: 'RLS', style: { color: '#ff9800', lineWidth: 2 } }],

    calc(bars, settings) {
      // A cleared number field arrives as '', and Number('') is 0.
      const order = Math.max(2, Math.min(64, Math.floor(Number(settings.order) || 16)))
      let lambda = Number(settings.lambda)
      // Pine raises when lambda leaves (0, 1]; fall back to the default instead.
      if (!Number.isFinite(lambda) || lambda <= 0 || lambda > 1) lambda = 0.99
      const src = sourceValues(bars, settings.source ?? 'close')
      const n = bars.length
      const out = new Array(n).fill(NaN)

      // Weight vector, and the inverse correlation matrix P seeded to delta * I
      // (row-major). delta = 100 is the Pine source's initial uncertainty.
      const w = new Array(order).fill(0)
      const P = new Array(order * order).fill(0)
      for (let i = 0; i < order; i++) P[i * order + i] = 100
      const x = new Array(order).fill(0)
      const Px = new Array(order).fill(0)
      const k = new Array(order).fill(0)
      const invLambda = 1 / lambda
      // The weights only leave zero once a gain vector is non-zero, and while
      // they are all zero the prediction is a literal 0.
      let armed = false

      for (let b = 0; b < n; b++) {
        // Input vector x = [src[1], src[2], ... src[order]], nz() to 0 before
        // the chart has that many bars.
        for (let i = 0; i < order; i++) {
          const v = src[b - (i + 1)]
          x[i] = Number.isFinite(v) ? v : 0
        }

        // Step 1: a priori prediction y = w^T x. This is what the source plots,
        // taken before the weights are updated on this bar.
        let y = 0
        for (let i = 0; i < order; i++) y += w[i] * x[i]
        const predicted = armed

        // Step 2: a priori error.
        const e = (Number.isFinite(src[b]) ? src[b] : 0) - y

        // Step 3: gain vector k = P x / (lambda + x^T P x).
        for (let i = 0; i < order; i++) {
          const base = i * order
          let rowSum = 0
          for (let j = 0; j < order; j++) rowSum += P[base + j] * x[j]
          Px[i] = rowSum
        }
        let denom = lambda
        for (let i = 0; i < order; i++) denom += x[i] * Px[i]
        const invDenom = denom > 1e-30 ? 1 / denom : 0
        for (let i = 0; i < order; i++) k[i] = Px[i] * invDenom

        // Step 4: weight update w = w + k e.
        for (let i = 0; i < order; i++) w[i] += k[i] * e
        if (!armed) {
          for (let i = 0; i < order; i++) {
            if (w[i] !== 0) {
              armed = true
              break
            }
          }
        }

        // Step 5: P = (1 / lambda) (P - k Px^T).
        for (let i = 0; i < order; i++) {
          const ki = k[i]
          const base = i * order
          for (let j = 0; j < order; j++) P[base + j] = invLambda * (P[base + j] - ki * Px[j])
        }

        // The source plots the prediction from the first bar. On the two bars
        // before any weight has moved off zero that prediction is an exact 0,
        // which would sit at the bottom of the price pane, so those are left as
        // a gap; every later bar carries the source's own value.
        if (predicted && Number.isFinite(y)) out[b] = y
      }

      return { rls: nulls(out) }
    },
  })
}
