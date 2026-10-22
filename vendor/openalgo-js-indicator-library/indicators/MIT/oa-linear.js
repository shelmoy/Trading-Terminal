/**
 * Linear Transformation (LINEAR) - ported to openalgo-charts from Pine Script v6.
 *
 * Source: https://github.com/mihakralj/pinescript/blob/c4e91b962be09733d8fc76caa5191e9e586c5cee/indicators/numerics/linear.pine
 * Repo:   mihakralj/pinescript
 * License: MIT (c) mihakralj
 * SPDX-FileCopyrightText: (c) mihakralj
 * SPDX-FileCopyrightText: (c) 2026 marketcalls (port to openalgo-charts)
 * SPDX-License-Identifier: MIT
 *
 * Rescales the source around its own moving average: y = a * (x - sma) + sma + b.
 * The scale factor exaggerates or damps every excursion from the mean while the
 * offset shifts the whole series vertically.
 */

export default function ({ registerIndicator, sourceValues, nulls }) {
  // A cleared field arrives as '' and must not turn a deliberate 0 into a default.
  const numberOr = (value, fallback) => {
    if (value === '' || value === null || value === undefined) return fallback
    const parsed = Number(value)
    return Number.isFinite(parsed) ? parsed : fallback
  }

  registerIndicator({
    id: 'oa-linear',
    name: 'Linear Transformation (LINEAR)',
    category: 'Numerics',
    placement: 'pane',

    inputs: [
      { key: 'source', type: 'source', label: 'Source', default: 'close' },
      { key: 'smaPeriod', type: 'number', label: 'SMA Period', default: 200, min: 1, max: 5000, step: 1 },
      { key: 'a', type: 'number', label: 'Scale (a)', default: 2, min: -100, max: 100, step: 0.1 },
      { key: 'b', type: 'number', label: 'Offset (b)', default: 20, min: -100000, max: 100000, step: 0.1 },
    ],

    plots: [
      { key: 'linear', type: 'line', title: 'Linear Transformation', style: { color: '#ffeb3b', lineWidth: 2 } },
    ],

    calc(bars, settings) {
      // Pine hardcodes its ring buffer to 200 slots and never reads its own SMA
      // Period input; the port wires that input to the window length instead.
      const period = Math.max(1, Math.floor(Number(settings.smaPeriod) || 200))
      const a = numberOr(settings.a, 2)
      const b = numberOr(settings.b, 20)
      const src = sourceValues(bars, settings.source ?? 'close')
      const out = new Array(bars.length).fill(NaN)

      // Pine's circular buffer starts full of na, so the mean expands with the
      // sample until the window fills and only then rolls.
      const buffer = new Array(period).fill(NaN)
      let head = 0
      let sum = 0
      let validCount = 0

      for (let i = 0; i < bars.length; i++) {
        const oldest = buffer[head]
        if (Number.isFinite(oldest)) {
          sum -= oldest
          validCount -= 1
        }
        const value = src[i]
        if (Number.isFinite(value)) {
          sum += value
          validCount += 1
        }
        buffer[head] = value
        head = (head + 1) % period

        if (!Number.isFinite(value)) continue
        // Pine: nz(sum / valid_count, source), so an empty window falls back to
        // the source itself rather than dividing by zero.
        const mean = validCount > 0 ? sum / validCount : NaN
        const smaValue = Number.isFinite(mean) ? mean : value
        out[i] = a * (value - smaValue) + smaValue + b
      }

      return { linear: nulls(out) }
    },
  })
}
