/**
 * Ehlers Super Smoother Filter (ESSF) - ported to openalgo-charts from Pine Script v3.
 *
 * Source: https://github.com/everget/tradingview-pinescript-indicators/blob/60c93d3711d222b8f2db96160defe568429348e0/movings/ehlers_super_smoother_filter.pine
 * Repo:   everget/tradingview-pinescript-indicators
 * License: GPL-3.0 (c) 2018-present Alex Orekhov (everget)
 * SPDX-FileCopyrightText: (c) 2018-present Alex Orekhov (everget)
 * SPDX-FileCopyrightText: (c) 2026 marketcalls (port to openalgo-charts)
 * SPDX-License-Identifier: GPL-3.0-only
 *
 * A two or three pole Butterworth-style lowpass recursion: it strips the
 * cycles shorter than the length out of price with far less lag than a moving
 * average of the same length would cost.
 */

export default function ({ registerIndicator, sourceValues, nulls }) {
  registerIndicator({
    id: 'oa-ehlers-super-smoother-filter',
    name: 'Ehlers Super Smoother Filter (ESSF)',
    category: 'Moving Averages',
    placement: 'onchart',

    inputs: [
      { key: 'length', type: 'number', label: 'Length', default: 15, min: 1, max: 5000, step: 1 },
      {
        key: 'numberOfPoles',
        type: 'select',
        label: 'Number of Poles',
        default: 2,
        options: [
          { label: '2', value: 2 },
          { label: '3', value: 3 },
        ],
      },
      { key: 'source', type: 'source', label: 'Source', default: 'close' },
    ],

    plots: [{ key: 'essf', type: 'line', title: 'ESSF', style: { color: '#741b47', lineWidth: 2 } }],

    calc(bars, settings) {
      // A cleared number field arrives as '', and Number('') is 0.
      const length = Math.max(1, Math.floor(Number(settings.length) || 15))
      const poles = Math.floor(Number(settings.numberOfPoles) || 2) === 3 ? 3 : 2
      const src = sourceValues(bars, settings.source ?? 'close')

      const n = bars.length
      const out = new Array(n).fill(NaN)

      // The recursion reads its own history through nz(), so a bar before the
      // first one contributes 0. That is why the filter starts well below
      // price and climbs into it over the first few dozen bars, exactly as the
      // source does.
      const prev = (j) => (j >= 0 && Number.isFinite(out[j]) ? out[j] : 0)

      if (poles === 2) {
        const arg = (Math.SQRT2 * Math.PI) / length
        const a1 = Math.exp(-arg)
        const b1 = 2 * a1 * Math.cos(arg)
        const c2 = b1
        const c3 = -(a1 * a1)
        const c1 = 1 - c2 - c3

        for (let i = 0; i < n; i++) {
          const value = src[i]
          if (!Number.isFinite(value)) continue
          out[i] = c1 * value + c2 * prev(i - 1) + c3 * prev(i - 2)
        }
      } else {
        const arg = Math.PI / length
        const a1 = Math.exp(-arg)
        const b1 = 2 * a1 * Math.cos(1.738 * arg)
        const c1 = a1 * a1

        const coef2 = b1 + c1
        const coef3 = -(c1 + b1 * c1)
        const coef4 = c1 * c1
        const coef1 = 1 - coef2 - coef3 - coef4

        for (let i = 0; i < n; i++) {
          const value = src[i]
          if (!Number.isFinite(value)) continue
          out[i] = coef1 * value + coef2 * prev(i - 1) + coef3 * prev(i - 2) + coef4 * prev(i - 3)
        }
      }

      return { essf: nulls(out) }
    },
  })
}
