/**
 * Recursive Gaussian Moving Average (RGMA) - ported to openalgo-charts from Pine Script v6.
 *
 * Source: https://github.com/mihakralj/pinescript/blob/c4e91b962be09733d8fc76caa5191e9e586c5cee/indicators/trends_IIR/rgma.pine
 * Repo:   mihakralj/pinescript
 * License: MIT
 * SPDX-FileCopyrightText: (c) mihakralj
 * SPDX-FileCopyrightText: (c) 2026 marketcalls (port to openalgo-charts)
 * SPDX-License-Identifier: MIT
 *
 * A cascade of single-pole exponential filters, each fed by the one before it.
 * More passes push the impulse response towards a Gaussian, so the line is
 * smoother at the cost of more lag.
 */

export default function ({ registerIndicator, sourceValues, nulls }) {
  registerIndicator({
    id: 'oa-rgma',
    name: 'Recursive Gaussian Moving Average (RGMA)',
    category: 'Trends IIR',
    placement: 'onchart',

    inputs: [
      { key: 'period', type: 'number', label: 'Period', default: 10, min: 1, max: 5000, step: 1 },
      {
        key: 'passes',
        type: 'number',
        label: 'Passes',
        default: 3,
        min: 1,
        max: 10,
        step: 1,
        tooltip: 'More passes create more Gaussian-like smoothing',
      },
      { key: 'source', type: 'source', label: 'Source', default: 'close' },
    ],

    plots: [{ key: 'rgma', type: 'line', title: 'RGMA', style: { color: '#ffeb3b', lineWidth: 2 } }],

    calc(bars, settings) {
      // A cleared number field arrives as '', and Number('') is 0.
      const period = Math.max(1, Math.floor(Number(settings.period) || 10))
      const passes = Math.min(10, Math.max(1, Math.floor(Number(settings.passes) || 3)))
      const src = sourceValues(bars, settings.source ?? 'close')

      // The period is divided by sqrt(passes) so a deeper cascade keeps roughly
      // the same effective smoothing length.
      const alpha = 2 / (period / Math.sqrt(passes) + 1)

      const filters = new Array(passes).fill(NaN)
      let seeded = false
      const out = new Array(bars.length).fill(NaN)

      for (let i = 0; i < bars.length; i++) {
        const value = src[i]
        // Pine leaves the result na and the cascade untouched on a missing bar.
        if (!Number.isFinite(value)) continue

        if (!seeded) {
          // First usable bar seeds every stage with the source, so RGMA starts
          // on the price itself rather than at zero.
          filters.fill(value)
          seeded = true
          out[i] = value
          continue
        }

        filters[0] = alpha * (value - filters[0]) + filters[0]
        for (let k = 1; k < passes; k++) {
          // Each stage reads the stage before it as already updated this bar.
          filters[k] = alpha * (filters[k - 1] - filters[k]) + filters[k]
        }
        out[i] = filters[passes - 1]
      }

      return { rgma: nulls(out) }
    },
  })
}
