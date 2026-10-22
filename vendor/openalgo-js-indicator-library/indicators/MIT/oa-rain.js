/**
 * Rainbow Moving Average (RAIN) - ported to openalgo-charts from Pine Script v6.
 *
 * Source: https://github.com/mihakralj/pinescript/blob/c4e91b962be09733d8fc76caa5191e9e586c5cee/indicators/trends_FIR/rain.pine
 * Repo:   mihakralj/pinescript
 * License: MIT (c) mihakralj
 * SPDX-FileCopyrightText: (c) mihakralj
 * SPDX-FileCopyrightText: (c) 2026 marketcalls (port to openalgo-charts)
 * SPDX-License-Identifier: MIT
 *
 * Applies a simple moving average to itself ten times, then blends the ten
 * layers with Widner's weights (5,4,3,2 for layers 1-4 and 1 for layers 5-10,
 * divisor 20), so the faster, less smoothed layers dominate the result.
 */

export default function ({ registerIndicator, sourceValues, nulls }) {
  // Pine holds a circular buffer of `period` slots seeded with 0.0 and divides
  // by count = math.min(bar_index + 1, period), so the window expands over the
  // first `period` bars instead of returning na. Every layer feeds the next one
  // on the same bar, which is why this has to be chained rather than nested.
  const expandingSma = (values, period) => {
    const out = new Array(values.length).fill(NaN)
    const buf = new Array(period).fill(0)
    let sum = 0
    let head = 0
    for (let i = 0; i < values.length; i++) {
      const v = Number.isFinite(values[i]) ? values[i] : 0
      sum -= buf[head]
      sum += v
      buf[head] = v
      const n = Math.min(i + 1, period)
      out[i] = n > 0 ? sum / n : NaN
      head = (head + 1) % period
    }
    return out
  }

  registerIndicator({
    id: 'oa-rain',
    name: 'Rainbow Moving Average (RAIN)',
    category: 'Trends FIR',
    placement: 'onchart',

    inputs: [
      {
        key: 'period',
        type: 'number',
        label: 'Period',
        default: 2,
        min: 1,
        max: 5000,
        step: 1,
        tooltip: 'Lookback window used by each of the ten stacked moving average layers.',
      },
      { key: 'source', type: 'source', label: 'Source', default: 'close' },
    ],

    plots: [{ key: 'rain', type: 'line', title: 'RAIN', style: { color: '#ffeb3b', lineWidth: 2 } }],

    calc(bars, settings) {
      // A cleared number field arrives as '', and Number('') is 0.
      const period = Math.max(1, Math.floor(Number(settings.period) || 2))
      const src = sourceValues(bars, settings.source ?? 'close')

      // Layer 1 smooths nz(source); every later layer smooths the layer below it.
      const layers = []
      let input = src
      for (let layer = 0; layer < 10; layer++) {
        input = expandingSma(input, period)
        layers.push(input)
      }

      const weights = [5, 4, 3, 2, 1, 1, 1, 1, 1, 1]
      const out = new Array(bars.length).fill(NaN)
      for (let i = 0; i < bars.length; i++) {
        let acc = 0
        let ok = true
        for (let layer = 0; layer < 10; layer++) {
          const v = layers[layer][i]
          if (!Number.isFinite(v)) {
            ok = false
            break
          }
          acc += weights[layer] * v
        }
        if (ok) out[i] = acc / 20
      }

      return { rain: nulls(out) }
    },
  })
}
