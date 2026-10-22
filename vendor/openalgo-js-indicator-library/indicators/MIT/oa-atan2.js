/**
 * Two-Argument Arctangent (ATAN2) - ported to openalgo-charts from Pine Script v6.
 *
 * Source: https://github.com/mihakralj/pinescript/blob/c4e91b962be09733d8fc76caa5191e9e586c5cee/indicators/numerics/atan2.pine
 * Repo:   mihakralj/pinescript
 * License: MIT (c) mihakralj
 * SPDX-FileCopyrightText: (c) mihakralj
 * SPDX-FileCopyrightText: (c) 2026 marketcalls (port to openalgo-charts)
 * SPDX-License-Identifier: MIT
 *
 * The angle in radians from the positive x-axis to the point (x, y), resolved
 * for all four quadrants, so the sign of each operand is kept instead of being
 * lost to a plain atan(y / x). Output runs from -pi to pi.
 *
 * Pine takes both operands as input.source with defaults high - low and
 * (high + low) / 2. The bar range is not one of the chart's eight price
 * sources, so each operand is a select carrying the eight sources plus that
 * range, and both Pine defaults are preserved.
 */

export default function ({ registerIndicator, sourceValues, withAlpha, nulls }) {
  const OPERANDS = [
    { label: 'High - Low (Range)', value: 'range' },
    { label: 'Open', value: 'open' },
    { label: 'High', value: 'high' },
    { label: 'Low', value: 'low' },
    { label: 'Close', value: 'close' },
    { label: 'HL2 (Median)', value: 'hl2' },
    { label: 'HLC3 (Typical)', value: 'hlc3' },
    { label: 'OHLC4 (Average)', value: 'ohlc4' },
    { label: 'Volume', value: 'volume' },
  ]

  const operandValues = (bars, choice, fallback) => {
    const key = OPERANDS.some((o) => o.value === choice) ? choice : fallback
    if (key === 'range') return bars.map((bar) => bar.high - bar.low)
    return sourceValues(bars, key)
  }

  registerIndicator({
    id: 'oa-atan2',
    name: 'Two-Argument Arctangent (ATAN2)',
    category: 'Numerics',
    placement: 'pane',

    inputs: [
      { key: 'y', type: 'select', label: 'Y (Numerator)', default: 'range', options: OPERANDS },
      { key: 'x', type: 'select', label: 'X (Denominator)', default: 'hl2', options: OPERANDS },
    ],

    plots: [{ key: 'atan2', type: 'line', title: 'ATAN2', style: { color: '#ffeb3b', lineWidth: 2 } }],

    calc(bars, settings) {
      const ys = operandValues(bars, settings.y, 'range')
      const xs = operandValues(bars, settings.x, 'hl2')
      const out = new Array(bars.length).fill(NaN)

      for (let i = 0; i < bars.length; i++) {
        const y = ys[i]
        const x = xs[i]
        if (!Number.isFinite(y) || !Number.isFinite(x)) continue
        // Pine raises when both operands are zero. A chart study cannot stop, so
        // that bar is left as a gap: the angle is genuinely undefined there.
        if (y === 0 && x === 0) continue

        const ay = Math.abs(y)
        const ax = Math.abs(x)
        // The larger operand is always the divisor, so neither ratio can blow up.
        let angle = ax > ay ? Math.atan(ay / ax) : Math.PI / 2 - Math.atan(ax / ay)
        if (x < 0) angle = Math.PI - angle
        if (y < 0) angle = -angle
        out[i] = angle
      }

      return { atan2: nulls(out) }
    },

    levels() {
      const faint = withAlpha('#787b86', 0.3)
      return [
        { price: 0, title: 'Zero', color: '#787b86' },
        { price: 1.5708, title: 'pi/2', color: faint },
        { price: -1.5708, title: '-pi/2', color: faint },
        { price: 3.1416, title: 'pi', color: faint },
        { price: -3.1416, title: '-pi', color: faint },
      ]
    },
  })
}
