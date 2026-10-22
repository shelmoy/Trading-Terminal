/**
 * Moving Average Variable Period (MAVP) - ported to openalgo-charts from Pine Script v6.
 *
 * Source: https://github.com/mihakralj/pinescript/blob/c4e91b962be09733d8fc76caa5191e9e586c5cee/indicators/trends_IIR/mavp.pine
 * Repo:   mihakralj/pinescript
 * License: MIT
 * SPDX-FileCopyrightText: (c) mihakralj
 * SPDX-FileCopyrightText: (c) 2026 marketcalls (port to openalgo-charts)
 * SPDX-License-Identifier: MIT
 *
 * An EMA whose alpha is recomputed each bar from a per-bar period clamped
 * between a floor and a ceiling, with a compensator that removes the zero-seed
 * bias so the line is usable from the first bar.
 */

export default function ({ registerIndicator, sourceValues, nulls }) {
  registerIndicator({
    id: 'oa-mavp',
    name: 'Moving Average Variable Period (MAVP)',
    category: 'Trends IIR',
    placement: 'onchart',

    inputs: [
      {
        key: 'period',
        type: 'number',
        label: 'Period',
        default: 10,
        min: 1,
        step: 1,
        tooltip: 'Base period for the variable-period EMA',
      },
      {
        key: 'minPeriod',
        type: 'number',
        label: 'Min Period',
        default: 2,
        min: 1,
        step: 1,
        tooltip: 'Minimum allowed period',
      },
      {
        key: 'maxPeriod',
        type: 'number',
        label: 'Max Period',
        default: 30,
        min: 2,
        step: 1,
        tooltip: 'Maximum allowed period',
      },
      { key: 'source', type: 'source', label: 'Source', default: 'close' },
    ],

    plots: [{ key: 'mavp', type: 'line', title: 'MAVP', style: { color: '#ffeb3b', lineWidth: 2 } }],

    calc(bars, settings) {
      // A cleared number field arrives as '', and Number('') is 0.
      const period = Math.max(1, Math.floor(Number(settings.period) || 10))
      const minPeriod = Math.max(1, Math.floor(Number(settings.minPeriod) || 2))
      // Pine raises when max_period < min_period; clamping keeps the plot alive.
      const maxPeriod = Math.max(minPeriod, Math.floor(Number(settings.maxPeriod) || 30))
      const src = sourceValues(bars, settings.source ?? 'close')
      const n = bars.length
      const out = new Array(n).fill(NaN)

      // The Pine source feeds a constant series here and says so in a comment:
      // the per-bar period is float(i_period) on every bar.
      let emaState = 0.0
      let e = 1.0
      let warmup = true

      for (let i = 0; i < n; i++) {
        const p = Math.max(minPeriod, Math.min(maxPeriod, Number.isFinite(period) ? period : minPeriod))
        const a = 2.0 / (p + 1.0)
        const beta = 1.0 - a

        // nz(source): a missing value folds to 0 rather than breaking the chain.
        const s = Number.isFinite(src[i]) ? src[i] : 0
        emaState = a * (s - emaState) + emaState

        if (warmup) {
          e *= beta
          const denom = 1.0 - e
          const c = denom > 0 ? 1.0 / denom : 1.0
          out[i] = c * emaState
          warmup = e > 1e-10
        } else {
          out[i] = emaState
        }
      }

      return { mavp: nulls(out) }
    },
  })
}
