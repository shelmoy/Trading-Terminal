/**
 * Linear Transformation (LINEAR) - ported to openalgo-charts from Pine Script v6.
 *
 * Source: https://github.com/mihakralj/pinescript/blob/c4e91b962be09733d8fc76caa5191e9e586c5cee/indicators/numerics/lineartrans.pine
 * Repo:   mihakralj/pinescript
 * License: MIT (c) mihakralj
 * SPDX-FileCopyrightText: (c) mihakralj
 * SPDX-FileCopyrightText: (c) 2026 marketcalls (port to openalgo-charts)
 * SPDX-License-Identifier: MIT
 *
 * Rescales a series about its own moving average: y = a * (x - sma) + sma + b.
 * The scale exaggerates or damps the distance from the average, the offset
 * shifts the whole result, and the average itself is left where it was.
 */

export default function ({ registerIndicator, sourceValues, nulls }) {
  // A cleared field arrives as '', and Number('') is 0, which would silently
  // replace a legitimate zero. Keep 0 and reject only the empty and the broken.
  const num = (value, fallback) => {
    const n = Number(value)
    return value === '' || value == null || !Number.isFinite(n) ? fallback : n
  }

  registerIndicator({
    id: 'oa-lineartrans',
    name: 'Linear Transformation (LINEAR)',
    category: 'Numerics',
    placement: 'pane',

    inputs: [
      { key: 'source', type: 'source', label: 'Source', default: 'close' },
      { key: 'period', type: 'number', label: 'SMA Period', default: 200, min: 1, max: 5000, step: 1 },
      { key: 'a', type: 'number', label: 'Scale (a)', default: 2, min: -1000, max: 1000, step: 0.1 },
      { key: 'b', type: 'number', label: 'Offset (b)', default: 20, min: -1000000, max: 1000000, step: 1 },
    ],

    plots: [
      {
        key: 'linear',
        type: 'line',
        title: 'Linear Transformation',
        style: { color: '#ffeb3b', lineWidth: 2 },
      },
    ],

    calc(bars, settings) {
      const period = Math.max(1, Math.floor(Number(settings.period) || 200))
      const a = num(settings.a, 2)
      const b = num(settings.b, 20)
      const src = sourceValues(bars, settings.source ?? 'close')

      // The source keeps a circular buffer rather than calling ta.sma, so the
      // average is over however many valid samples the window holds so far.
      // That means it emits from bar 0 with a partial window, not after a warmup.
      const buffer = new Array(period).fill(NaN)
      let head = 0
      let sum = 0
      let validCount = 0

      const out = new Array(bars.length).fill(NaN)

      for (let i = 0; i < bars.length; i++) {
        const value = src[i]
        const oldest = buffer[head]
        if (Number.isFinite(oldest)) {
          sum -= oldest
          validCount -= 1
        }
        if (Number.isFinite(value)) {
          sum += value
          validCount += 1
        }
        buffer[head] = Number.isFinite(value) ? value : NaN
        head = (head + 1) % period

        // nz(sum / valid_count, source): an empty window falls back to the source.
        const mean = validCount > 0 ? sum / validCount : NaN
        const smaValue = Number.isFinite(mean) ? mean : value
        if (!Number.isFinite(value) || !Number.isFinite(smaValue)) continue

        const result = a * (value - smaValue) + smaValue + b
        if (Number.isFinite(result)) out[i] = result
      }

      return { linear: nulls(out) }
    },
  })
}
