/**
 * Gaussian Filter (GF) - ported to openalgo-charts from Pine Script v4.
 *
 * Source: https://github.com/everget/tradingview-pinescript-indicators/blob/60c93d3711d222b8f2db96160defe568429348e0/movings/gaussian_filter.pine
 * Repo:   everget/tradingview-pinescript-indicators
 * License: GPL-3.0 (c) 2018-present, Alex Orekhov (everget)
 * SPDX-FileCopyrightText: (c) 2018-present Alex Orekhov (everget)
 * SPDX-FileCopyrightText: (c) 2026 marketcalls (port to openalgo-charts)
 * SPDX-License-Identifier: GPL-3.0-only
 *
 * Ehlers' pole-stacked smoother: one to four single-pole lag filters cascaded
 * into a single recursion, so each extra pole buys a steeper roll-off of the
 * high-frequency noise at the cost of more lag.
 */

export default function ({ registerIndicator, sourceValues, nulls }) {
  const HIGHLIGHT_UP = '#4caf50'
  const HIGHLIGHT_DOWN = '#ff5252'
  const FLAT = '#6d1e7f'

  // Pine: highlight ? (gf > gf[1] ? green : red) : #6d1e7f. A na comparison is
  // false in Pine, so the warmup side of the gap reads as the down colour.
  const colourAt = (values, settings, index) => {
    if (settings.highlight === false) return FLAT
    const series = values?.gf
    if (!series) return HIGHLIGHT_DOWN
    const current = series[index]
    const previous = index > 0 ? series[index - 1] : null
    if (!Number.isFinite(current) || !Number.isFinite(previous)) return HIGHLIGHT_DOWN
    return current > previous ? HIGHLIGHT_UP : HIGHLIGHT_DOWN
  }

  registerIndicator({
    id: 'oa-gaussian-filter',
    name: 'Gaussian Filter (GF)',
    category: 'Moving Averages',
    placement: 'onchart',

    inputs: [
      {
        key: 'cyclePeriod',
        type: 'number',
        label: 'Cycle Period',
        default: 14,
        min: 1,
        max: 5000,
        step: 1,
      },
      {
        key: 'polesNumber',
        type: 'select',
        label: 'Number of Poles',
        default: '4',
        options: [
          { label: '1', value: '1' },
          { label: '2', value: '2' },
          { label: '3', value: '3' },
          { label: '4', value: '4' },
        ],
      },
      { key: 'source', type: 'source', label: 'Source', default: 'close' },
      { key: 'highlight', type: 'boolean', label: 'Highlight', default: true },
    ],

    plots: [
      {
        key: 'gf',
        type: 'line',
        title: 'GF',
        style: { color: FLAT, lineWidth: 2 },
        colorBy({ index, values, settings }) {
          return colourAt(values, settings, index)
        },
      },
    ],

    calc(bars, settings) {
      // A cleared number field arrives as '', and Number('') is 0.
      const cyclePeriod = Math.max(1, Math.floor(Number(settings.cyclePeriod) || 14))
      let poles = Math.floor(Number(settings.polesNumber) || 4)
      if (!(poles >= 1 && poles <= 4)) poles = 4

      const src = sourceValues(bars, settings.source ?? 'close')

      const PI = 2 * Math.asin(1)
      // 2^(1/poles) - 1 is at least 1 for poles >= 1, so the divide is safe.
      const denominator = Math.pow(2, 1 / poles) - 1
      const beta = denominator !== 0 ? (1 - Math.cos((2 * PI) / cyclePeriod)) / denominator : 0
      const alpha = -beta + Math.sqrt(beta * beta + 2 * beta)
      const b = 1 - alpha

      const filter = new Array(bars.length).fill(NaN)

      for (let i = 0; i < bars.length; i++) {
        const s = src[i]
        if (!Number.isFinite(s)) continue

        // Pine: filter1 = nz(filter[1], src), then each deeper lag falls back
        // to the one above it, so all four collapse onto src on the first bar.
        const f1 = i >= 1 && Number.isFinite(filter[i - 1]) ? filter[i - 1] : s
        const f2 = i >= 2 && Number.isFinite(filter[i - 2]) ? filter[i - 2] : f1
        const f3 = i >= 3 && Number.isFinite(filter[i - 3]) ? filter[i - 3] : f2
        const f4 = i >= 4 && Number.isFinite(filter[i - 4]) ? filter[i - 4] : f3

        let value
        if (poles === 1) {
          value = alpha * s + b * f1
        } else if (poles === 2) {
          value = Math.pow(alpha, 2) * s + 2 * b * f1 - Math.pow(b, 2) * f2
        } else if (poles === 3) {
          value =
            Math.pow(alpha, 3) * s + 3 * b * f1 - 3 * Math.pow(b, 2) * f2 + Math.pow(b, 3) * f3
        } else {
          value =
            Math.pow(alpha, 4) * s +
            4 * b * f1 -
            6 * Math.pow(b, 2) * f2 +
            4 * Math.pow(b, 3) * f3 -
            Math.pow(b, 4) * f4
        }

        // A cycle period of 1 drives beta to 0 and leaves the recursion only
        // marginally stable, so an overflow becomes a gap rather than Infinity.
        filter[i] = Number.isFinite(value) ? value : NaN
      }

      return { gf: nulls(filter) }
    },
  })
}
