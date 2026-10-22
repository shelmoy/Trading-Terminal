/**
 * Volume Rate of Change (VROC) - ported to openalgo-charts from Pine Script v6.
 *
 * Source: https://github.com/mihakralj/pinescript/blob/c4e91b962be09733d8fc76caa5191e9e586c5cee/indicators/volume/vroc.pine
 * Repo:   mihakralj/pinescript
 * License: MIT (c) mihakralj
 * SPDX-FileCopyrightText: (c) mihakralj
 * SPDX-FileCopyrightText: (c) 2026 marketcalls (port to openalgo-charts)
 * SPDX-License-Identifier: MIT
 *
 * The change in volume over a lookback, reported either as a raw point
 * difference or as a percentage of the volume that many bars ago.
 */

export default function ({ registerIndicator, nulls }) {
  registerIndicator({
    id: 'oa-vroc',
    name: 'Volume Rate of Change (VROC)',
    category: 'Volume',
    placement: 'pane',

    inputs: [
      {
        key: 'period',
        type: 'number',
        label: 'Period',
        default: 12,
        min: 1,
        max: 5000,
        step: 1,
        tooltip: 'Number of periods for comparison',
      },
      {
        key: 'calcType',
        type: 'select',
        label: 'Calculation Type',
        default: 'Point',
        options: [
          { label: 'Point', value: 'Point' },
          { label: 'Percent', value: 'Percent' },
        ],
        tooltip: 'Point or Percent calculation',
      },
    ],

    plots: [{ key: 'vroc', type: 'line', title: 'VROC', style: { color: '#ffeb3b', lineWidth: 2 } }],

    calc(bars, settings) {
      // A cleared number field arrives as '', and Number('') is 0.
      const period = Math.max(1, Math.floor(Number(settings.period) || 12))
      const isPercent = settings.calcType === 'Percent'

      const out = new Array(bars.length).fill(NaN)

      for (let i = period; i < bars.length; i++) {
        // Index series carry no volume at all, so both reads can be missing.
        const current = bars[i].volume
        const historical = bars[i - period].volume
        if (!Number.isFinite(current) || !Number.isFinite(historical)) continue

        if (isPercent) {
          if (historical === 0) continue
          out[i] = ((current - historical) / historical) * 100
        } else {
          out[i] = current - historical
        }
      }

      return { vroc: nulls(out) }
    },
  })
}
