/**
 * Moving Geometric Mean (MGM) - ported to openalgo-charts from Pine Script v3.
 *
 * Source: https://github.com/everget/tradingview-pinescript-indicators/blob/60c93d3711d222b8f2db96160defe568429348e0/movings/moving_geometric_mean.pine
 * Repo:   everget/tradingview-pinescript-indicators
 * License: GPL-3.0, Copyright (c) 2018-present, Alex Orekhov (everget)
 * SPDX-FileCopyrightText: (c) 2018-present Alex Orekhov (everget)
 * SPDX-FileCopyrightText: (c) 2026 marketcalls (port to openalgo-charts)
 * SPDX-License-Identifier: GPL-3.0-only
 *
 * The geometric mean of the last N prices, taken as exp of the mean of their
 * logarithms, so a run of proportional moves averages multiplicatively rather
 * than additively and outliers pull the line less than in an SMA.
 */

export default function ({ registerIndicator, sourceValues, nulls }) {
  registerIndicator({
    id: 'oa-moving-geometric-mean',
    name: 'Moving Geometric Mean (MGM)',
    category: 'Moving Averages',
    placement: 'onchart',

    inputs: [
      { key: 'length', type: 'number', label: 'Length', default: 14, min: 1, max: 5000, step: 1 },
      { key: 'source', type: 'source', label: 'Source', default: 'close' },
    ],

    plots: [{ key: 'mgm', type: 'line', title: 'MGM', style: { color: '#6d1e7f', lineWidth: 2 } }],

    calc(bars, settings) {
      // A cleared number field arrives as '', and Number('') is 0.
      const length = Math.max(1, Math.floor(Number(settings.length) || 14))
      const src = sourceValues(bars, settings.source ?? 'close')

      // log() of a non-positive price is not a number, so those bars carry no
      // value and any window containing one carries none either. The rolling
      // sum is done in a window rather than through a running accumulator so a
      // single bad bar cannot poison every later value.
      const logs = new Array(bars.length).fill(NaN)
      for (let i = 0; i < bars.length; i += 1) {
        const v = src[i]
        if (!Number.isFinite(v) || v <= 0) continue
        logs[i] = Math.log(v)
      }

      const mgm = new Array(bars.length).fill(NaN)
      for (let i = length - 1; i < bars.length; i += 1) {
        let sum = 0
        let ok = true
        for (let k = i - length + 1; k <= i; k += 1) {
          if (!Number.isFinite(logs[k])) { ok = false; break }
          sum += logs[k]
        }
        if (!ok) continue
        const value = Math.exp(sum / length)
        if (!Number.isFinite(value)) continue
        mgm[i] = value
      }

      return { mgm: nulls(mgm) }
    },
  })
}
