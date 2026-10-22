/**
 * Williams Gator Oscillator (GATOR) - ported to openalgo-charts from Pine Script v6.
 *
 * Source: https://github.com/mihakralj/pinescript/blob/c4e91b962be09733d8fc76caa5191e9e586c5cee/indicators/oscillators/gator.pine
 * Repo:   mihakralj/pinescript
 * License: MIT (c) mihakralj
 * SPDX-FileCopyrightText: (c) mihakralj
 * SPDX-FileCopyrightText: (c) 2026 marketcalls (port to openalgo-charts)
 * SPDX-License-Identifier: MIT
 *
 * Two histograms measure how far apart the three displaced Alligator SMMA lines
 * have travelled: the upper bar is the Jaw-to-Teeth gap and the lower bar is the
 * Teeth-to-Lips gap, so an opening mouth reads as both bars growing away from
 * zero and a sleeping one as both bars collapsing onto it.
 */

export default function ({ registerIndicator, sourceValues, nulls }) {
  // Wilder's SMMA written the way the source writes it: a plain recursive EMA
  // with alpha = 1/period seeded at zero, divided by the exponential warmup
  // compensator 1 - (1-alpha)^(i+1) until that compensator is within 1e-10 of 1.
  // The compensation is what makes bar 0 equal the source rather than
  // alpha * source, so this line emits from the first bar with no NaN warmup.
  const smma = (values, period) => {
    const alpha = 1 / period
    const out = new Array(values.length).fill(NaN)
    let acc = 0
    let e = 1
    let warmup = true
    for (let i = 0; i < values.length; i++) {
      const v = Number.isFinite(values[i]) ? values[i] : 0
      acc = alpha * (v - acc) + acc
      if (warmup) {
        e *= 1 - alpha
        const denom = 1 - e
        out[i] = denom > 0 ? acc / denom : acc
        warmup = e > 1e-10
      } else {
        out[i] = acc
      }
    }
    return out
  }

  // Pine reads jaw[jawOffset], which is the value a forward-displaced line shows
  // at the current bar: the sample from `offset` bars ago.
  const shift = (values, offset) => {
    const out = new Array(values.length).fill(NaN)
    for (let i = offset; i < values.length; i++) out[i] = values[i - offset]
    return out
  }

  const GREEN = '#4CAF50'
  const RED = '#FF5252'

  // upper >= upper[1] grows, so green; anything else, including the first bar
  // where the previous value does not exist, is red. Pine's na comparison is
  // false there, and an unguarded JavaScript compare would have made it green.
  const expandingColor = (col, index, rising) => {
    const cur = col[index]
    const prev = index > 0 ? col[index - 1] : undefined
    if (!Number.isFinite(cur) || !Number.isFinite(prev)) return RED
    return (rising ? cur >= prev : cur <= prev) ? GREEN : RED
  }

  registerIndicator({
    id: 'oa-gator',
    name: 'Williams Gator Oscillator',
    category: 'Oscillators',
    placement: 'pane',

    inputs: [
      { key: 'source', type: 'source', label: 'Source', default: 'hlc3' },
      { key: 'jawPeriod', type: 'number', label: 'Jaw Period', default: 13, min: 1, max: 5000, step: 1 },
      {
        key: 'jawOffset',
        type: 'number',
        label: 'Jaw Offset',
        default: 8,
        min: 0,
        max: 500,
        step: 1,
        tooltip: 'Bars the Jaw line is displaced forward by, so the histogram reads it from this many bars ago.',
      },
      { key: 'teethPeriod', type: 'number', label: 'Teeth Period', default: 8, min: 1, max: 5000, step: 1 },
      { key: 'teethOffset', type: 'number', label: 'Teeth Offset', default: 5, min: 0, max: 500, step: 1 },
      { key: 'lipsPeriod', type: 'number', label: 'Lips Period', default: 5, min: 1, max: 5000, step: 1 },
      { key: 'lipsOffset', type: 'number', label: 'Lips Offset', default: 3, min: 0, max: 500, step: 1 },
    ],

    plots: [
      {
        key: 'upper',
        type: 'histogram',
        title: 'Upper',
        style: { color: GREEN, lineWidth: 2 },
        colorBy: ({ index, values }) => expandingColor(values.upper, index, true),
      },
      {
        key: 'lower',
        type: 'histogram',
        title: 'Lower',
        style: { color: GREEN, lineWidth: 2 },
        colorBy: ({ index, values }) => expandingColor(values.lower, index, false),
      },
      { key: 'zero', type: 'line', title: 'Zero', style: { color: '#787b86', lineWidth: 1 } },
    ],

    calc(bars, settings) {
      // A cleared number field arrives as '', and Number('') is 0.
      const jawPeriod = Math.max(1, Math.floor(Number(settings.jawPeriod) || 13))
      const teethPeriod = Math.max(1, Math.floor(Number(settings.teethPeriod) || 8))
      const lipsPeriod = Math.max(1, Math.floor(Number(settings.lipsPeriod) || 5))
      // Offset 0 is legal here, so an empty field has to fall back to 0 and not
      // to the default: Number('') || 8 would resurrect the default instead.
      const jawOffset = Math.max(0, Math.floor(Number(settings.jawOffset) || 0))
      const teethOffset = Math.max(0, Math.floor(Number(settings.teethOffset) || 0))
      const lipsOffset = Math.max(0, Math.floor(Number(settings.lipsOffset) || 0))

      const src = sourceValues(bars, settings.source ?? 'hlc3')

      const jaw = shift(smma(src, jawPeriod), jawOffset)
      const teeth = shift(smma(src, teethPeriod), teethOffset)
      const lips = shift(smma(src, lipsPeriod), lipsOffset)

      const upper = new Array(bars.length).fill(NaN)
      const lower = new Array(bars.length).fill(NaN)
      const zero = new Array(bars.length).fill(0)

      for (let i = 0; i < bars.length; i++) {
        if (Number.isFinite(jaw[i]) && Number.isFinite(teeth[i])) {
          upper[i] = Math.abs(jaw[i] - teeth[i])
        }
        if (Number.isFinite(teeth[i]) && Number.isFinite(lips[i])) {
          lower[i] = -Math.abs(teeth[i] - lips[i])
        }
      }

      return { upper: nulls(upper), lower: nulls(lower), zero }
    },
  })
}
