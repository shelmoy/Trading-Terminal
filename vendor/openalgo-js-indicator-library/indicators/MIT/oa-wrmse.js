/**
 * Weighted Root Mean Squared Error (WRMSE) - ported to openalgo-charts from Pine Script v6.
 *
 * Source: https://github.com/mihakralj/pinescript/blob/c4e91b962be09733d8fc76caa5191e9e586c5cee/indicators/errors/wrmse.pine
 * Repo:   mihakralj/pinescript
 * License: MIT (c) mihakralj
 * SPDX-FileCopyrightText: (c) mihakralj
 * SPDX-FileCopyrightText: (c) 2026 marketcalls (port to openalgo-charts)
 * SPDX-License-Identifier: MIT
 *
 * The root of the weight-weighted mean squared gap between two series over a
 * rolling window, in the units of the data. With uniform weights it is plain
 * RMSE; weighted by volume it lets busy bars dominate the error.
 */

export default function ({ registerIndicator, sourceValues, rollingSum, nulls }) {
  registerIndicator({
    id: 'oa-wrmse',
    name: 'Weighted Root Mean Squared Error',
    category: 'Errors',
    placement: 'pane',

    inputs: [
      { key: 'length', type: 'number', label: 'Length', default: 14, min: 1, max: 5000, step: 1 },
      {
        key: 'useVolumeWeights',
        type: 'boolean',
        label: 'Use Volume as Weights',
        default: false,
        tooltip: 'When enabled, errors are weighted by volume',
      },
      { key: 'actual', type: 'source', label: 'Actual', default: 'close' },
      { key: 'predicted', type: 'source', label: 'Predicted', default: 'open' },
    ],

    plots: [{ key: 'wrmse', type: 'line', title: 'WRMSE', style: { color: '#ffeb3b', lineWidth: 2 } }],

    levels: () => [{ price: 0, title: 'Perfect', color: '#26a69a', dashed: true }],

    calc(bars, settings) {
      // A cleared number field arrives as '', and Number('') is 0.
      const length = Math.max(1, Math.floor(Number(settings.length) || 14))
      const useVolume = settings.useVolumeWeights === true
      const actual = sourceValues(bars, settings.actual ?? 'close')
      const predicted = sourceValues(bars, settings.predicted ?? 'open')
      const epsilon = 1e-10

      const n = bars.length
      const weightedSqError = new Array(n).fill(0)
      const weightSeries = new Array(n).fill(0)
      for (let i = 0; i < n; i++) {
        // Pine: nz(actual, 0.0) - nz(predicted, 0.0).
        const a = Number.isFinite(actual[i]) ? actual[i] : 0
        const p = Number.isFinite(predicted[i]) ? predicted[i] : 0
        const diff = a - p
        // Pine: math.max(nz(weight, 1.0), 0.0). An index series carries no
        // volume, and na weight falls back to 1 rather than blanking the plot.
        const raw = useVolume ? bars[i].volume : 1
        const w = Math.max(Number.isFinite(raw) ? raw : 1, 0)
        weightSeries[i] = w
        weightedSqError[i] = w * diff * diff
      }

      const sumWeightedError = rollingSum(weightedSqError, length)
      const sumWeight = rollingSum(weightSeries, length)

      const out = new Array(n).fill(NaN)
      for (let i = 0; i < n; i++) {
        const sw = sumWeight[i]
        const se = sumWeightedError[i]
        // Warmup stays a gap. Pine would draw 0 there, because a comparison
        // against na is false and the source falls to its 0.0 branch; a zero
        // would sit in the pane and drag its autoscale down.
        if (!Number.isFinite(sw) || !Number.isFinite(se)) continue
        // A window whose weights all sum to zero is the source's real 0.0.
        out[i] = sw > epsilon ? Math.sqrt(se / sw) : 0
      }

      return { wrmse: nulls(out) }
    },
  })
}
