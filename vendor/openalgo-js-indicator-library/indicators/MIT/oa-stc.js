/**
 * Schaff Trend Cycle (STC) - ported to openalgo-charts from Pine Script v6.
 *
 * Source: https://github.com/mihakralj/pinescript/blob/c4e91b962be09733d8fc76caa5191e9e586c5cee/indicators/oscillators/stc.pine
 * Repo:   mihakralj/pinescript
 * License: MIT (c) mihakralj
 * SPDX-FileCopyrightText: (c) mihakralj
 * SPDX-FileCopyrightText: (c) 2026 marketcalls (port to openalgo-charts)
 * SPDX-License-Identifier: MIT
 *
 * A MACD line put through two rounds of stochastic normalisation, so the trend
 * signal of a MACD arrives with the 0 to 100 bounded, faster turning behaviour
 * of a cycle oscillator.
 */

export default function ({ registerIndicator, sourceValues, highest, lowest, nulls }) {
  // The source ships its own EMA: the raw exponential average is seeded at zero
  // and divided by 1 - (1-a)^n during warmup, which removes the seeding bias
  // instead of leaning on an SMA seed. Neither `ema` nor `smaSeededEma` matches
  // it, so it is reproduced here bar for bar.
  const biasCorrectedEma = (values, period) => {
    const a = 2 / Math.max(period, 1)
    const out = new Array(values.length).fill(NaN)
    let rawEma = NaN
    let emaValue = NaN
    let e = 1
    let warmup = true

    for (let i = 0; i < values.length; i++) {
      const source = values[i]
      // Pine skips an na bar entirely: the var state, and therefore the output,
      // holds its previous value.
      if (Number.isFinite(source)) {
        if (!Number.isFinite(rawEma)) {
          rawEma = 0
          emaValue = source
        } else {
          rawEma = a * (source - rawEma) + rawEma
          if (warmup) {
            e *= 1 - a
            const c = 1 / (1 - e)
            emaValue = c * rawEma
            if (e <= 1e-10) warmup = false
          } else {
            emaValue = rawEma
          }
        }
      }
      out[i] = emaValue
    }
    return out
  }

  registerIndicator({
    id: 'oa-stc',
    name: 'Schaff Trend Cycle (STC)',
    category: 'Oscillators',
    placement: 'pane',

    inputs: [
      { key: 'source', type: 'source', label: 'Source', default: 'close' },
      { key: 'cycleLength', type: 'number', label: 'Cycle Length', default: 12, min: 2, max: 5000, step: 1 },
      { key: 'fastLength', type: 'number', label: 'Fast Length', default: 26, min: 2, max: 5000, step: 1 },
      { key: 'slowLength', type: 'number', label: 'Slow Length', default: 50, min: 2, max: 5000, step: 1 },
      {
        key: 'smoothingType',
        type: 'number',
        label: 'Smoothing',
        default: 2,
        min: 0,
        max: 3,
        step: 1,
        tooltip: '0: none, 1: ema, 2: sigmoid, 3: digital',
      },
    ],

    plots: [{ key: 'stc', type: 'line', title: 'STC', style: { color: '#ffeb3b', lineWidth: 2 } }],

    calc(bars, settings) {
      // A cleared number field arrives as '', and Number('') is 0.
      const cycleLength = Math.max(2, Math.floor(Number(settings.cycleLength) || 12))
      const fastLength = Math.max(2, Math.floor(Number(settings.fastLength) || 26))
      const slowLength = Math.max(2, Math.floor(Number(settings.slowLength) || 50))
      // 0 is a legal smoothing choice, so a cleared field cannot be folded in
      // with `|| 2`: it is checked for emptiness before the number is taken.
      const smoothingRaw = settings.smoothingType
      const smoothingNumber = Number(smoothingRaw)
      const smoothingType =
        smoothingRaw === '' || smoothingRaw == null || !Number.isFinite(smoothingNumber)
          ? 2
          : Math.min(3, Math.max(0, Math.floor(smoothingNumber)))
      const src = sourceValues(bars, settings.source ?? 'close')

      const fastEma = biasCorrectedEma(src, fastLength)
      const slowEma = biasCorrectedEma(src, slowLength)

      const macdLine = new Array(bars.length).fill(NaN)
      for (let i = 0; i < bars.length; i++) {
        if (!Number.isFinite(fastEma[i]) || !Number.isFinite(slowEma[i])) continue
        macdLine[i] = fastEma[i] - slowEma[i]
      }

      const h1 = highest(macdLine, cycleLength)
      const l1 = lowest(macdLine, cycleLength)

      // Pine: (h1 - l1) > 0 ? ... : 0. During the rolling-extreme warmup the
      // comparison is against na and is false, so the raw stochastic is 0 there
      // rather than a gap. Guarding with Number.isFinite keeps that behaviour.
      const stoch1Raw = new Array(bars.length).fill(0)
      for (let i = 0; i < bars.length; i++) {
        const hi = h1[i]
        const lo = l1[i]
        if (!Number.isFinite(hi) || !Number.isFinite(lo) || !Number.isFinite(macdLine[i])) continue
        const span = hi - lo
        if (!(span > 0)) continue
        stoch1Raw[i] = (100 * (macdLine[i] - lo)) / span
      }

      const stoch1 = biasCorrectedEma(stoch1Raw, 3)

      const h2 = highest(stoch1, cycleLength)
      const l2 = lowest(stoch1, cycleLength)

      const stoch2 = new Array(bars.length).fill(0)
      for (let i = 0; i < bars.length; i++) {
        const hi = h2[i]
        const lo = l2[i]
        if (!Number.isFinite(hi) || !Number.isFinite(lo) || !Number.isFinite(stoch1[i])) continue
        const span = hi - lo
        if (!(span > 0)) continue
        stoch2[i] = (100 * (stoch1[i] - lo)) / span
      }

      const out = new Array(bars.length).fill(NaN)

      if (smoothingType === 1) {
        const smoothed = biasCorrectedEma(stoch2, 3)
        for (let i = 0; i < bars.length; i++) {
          if (Number.isFinite(smoothed[i])) out[i] = smoothed[i]
        }
      } else if (smoothingType === 2) {
        for (let i = 0; i < bars.length; i++) {
          out[i] = 100 / (1 + Math.exp(-0.1 * (stoch2[i] - 50)))
        }
      } else if (smoothingType === 3) {
        // Digital: latch to 100 above 75 and to 0 below 25, otherwise hold the
        // previous bar's published value, which is na on the very first bar.
        let previous = NaN
        for (let i = 0; i < bars.length; i++) {
          const value = stoch2[i] > 75 ? 100 : stoch2[i] < 25 ? 0 : previous
          out[i] = value
          previous = value
        }
      } else {
        for (let i = 0; i < bars.length; i++) out[i] = stoch2[i]
      }

      return { stc: nulls(out) }
    },
  })
}
