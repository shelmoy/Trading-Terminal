/**
 * Least Mean Squares Adaptive Filter (LMS) - ported to openalgo-charts from Pine Script v6.
 *
 * Source: https://github.com/mihakralj/pinescript/blob/c4e91b962be09733d8fc76caa5191e9e586c5cee/indicators/filters/lms.pine
 * Repo:   mihakralj/pinescript
 * License: MIT
 * SPDX-FileCopyrightText: (c) mihakralj
 * SPDX-FileCopyrightText: (c) 2026 marketcalls (port to openalgo-charts)
 * SPDX-License-Identifier: MIT
 *
 * A Widrow-Hoff adaptive FIR filter: it predicts the current price from the
 * previous taps and pushes its own weights toward whatever combination would
 * have been right, using a normalized step so the speed of adaptation does
 * not depend on the price level.
 */

export default function ({ registerIndicator, sourceValues, nulls }) {
  registerIndicator({
    id: 'oa-lms',
    name: 'Least Mean Squares Adaptive Filter (LMS)',
    category: 'Filters',
    placement: 'onchart',

    inputs: [
      {
        key: 'order',
        type: 'number',
        label: 'Filter Order (taps)',
        default: 16,
        min: 2,
        max: 128,
        step: 1,
        tooltip: 'Number of past bars the filter weighs. More taps track longer structure and adapt more slowly.',
      },
      {
        key: 'mu',
        type: 'number',
        label: 'Learning Rate (mu)',
        default: 0.5,
        min: 0.01,
        max: 1.99,
        step: 0.05,
        tooltip: 'Step size of each weight update. Higher follows price faster and noisier.',
      },
      { key: 'source', type: 'source', label: 'Source', default: 'close' },
    ],

    plots: [{ key: 'lms', type: 'line', title: 'LMS', style: { color: '#ffeb3b', lineWidth: 2 } }],

    calc(bars, settings) {
      // A cleared number field arrives as '', and Number('') is 0. Pine raises
      // a runtime error below order 2, so the floor stands in for that refusal.
      const order = Math.max(2, Math.min(128, Math.floor(Number(settings.order) || 16)))
      const mu = Math.max(0.01, Math.min(1.99, Number(settings.mu) || 0.5))
      const src = sourceValues(bars, settings.source ?? 'close')
      const len = bars.length
      const out = new Array(len).fill(NaN)

      // The tap weights are Pine `var` state: they start at zero and carry
      // forward across every bar.
      const w = new Float64Array(order)

      for (let i = 0; i < len; i++) {
        // Predict this bar from the previous `order` bars. nz(src[i + 1], 0.0)
        // means history that does not exist yet reads as zero.
        let y = 0
        let normSq = 0
        for (let k = 0; k < order; k++) {
          const j = i - (k + 1)
          const xi = j >= 0 && Number.isFinite(src[j]) ? src[j] : 0
          y += w[k] * xi
          normSq += xi * xi
        }

        const current = Number.isFinite(src[i]) ? src[i] : 0
        const err = current - y

        // Normalized step size, so convergence does not depend on input power.
        const muEff = mu / (1e-10 + normSq)

        for (let k = 0; k < order; k++) {
          const j = i - (k + 1)
          const xi = j >= 0 && Number.isFinite(src[j]) ? src[j] : 0
          const next = w[k] + muEff * err * xi
          w[k] = Number.isFinite(next) ? next : w[k]
        }

        // The weights are trained, so every bar feeds the recursion, but the
        // first `order` predictions rest on zero-padded history and are not yet
        // meaningful. They are left as gaps rather than plotted near zero,
        // which on a price pane would flatten the whole scale.
        if (i >= order && Number.isFinite(y)) out[i] = y
      }

      return { lms: nulls(out) }
    },
  })
}
