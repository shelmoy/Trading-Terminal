/**
 * Non-Lag Moving Average (NLMA) - ported to openalgo-charts from Pine Script v6.
 *
 * Source: https://github.com/mihakralj/pinescript/blob/c4e91b962be09733d8fc76caa5191e9e586c5cee/indicators/trends_FIR/nlma.pine
 * Repo:   mihakralj/pinescript
 * License: MIT (c) mihakralj
 * SPDX-FileCopyrightText: (c) mihakralj
 * SPDX-FileCopyrightText: (c) 2026 marketcalls (port to openalgo-charts)
 * SPDX-License-Identifier: MIT
 *
 * The Igorad (TrendLaboratory) NonLagMA kernel: a two-phase cosine window,
 * damped by 1/(3*pi*t + 1) past its half point, convolved over 5*period - 1
 * bars and normalised by its signed weight sum so the DC gain stays at one.
 */

export default function ({ registerIndicator, sourceValues, nulls }) {
  registerIndicator({
    id: 'oa-nlma',
    name: 'Non-Lag Moving Average (NLMA)',
    category: 'Trends FIR',
    placement: 'onchart',

    inputs: [
      {
        key: 'period',
        type: 'number',
        label: 'Period',
        default: 14,
        min: 2,
        max: 200,
        step: 1,
        tooltip: 'Conceptual averaging period. The kernel itself spans 5 * period - 1 bars.',
      },
      { key: 'source', type: 'source', label: 'Source', default: 'close' },
    ],

    plots: [{ key: 'nlma', type: 'line', title: 'NLMA', style: { color: '#ffeb3b', lineWidth: 2 } }],

    calc(bars, settings) {
      // A cleared number field arrives as '', and Number('') is 0.
      const period = Math.max(2, Math.min(200, Math.floor(Number(settings.period) || 14)))
      const src = sourceValues(bars, settings.source ?? 'close')

      const phase = period - 1
      const cycle = 4
      const flen = period * 4 + phase
      const coeff = 3 * Math.PI

      // Kernel weights, built once per call. weights[k] multiplies the bar k
      // bars back, so weights[0] is the newest bar.
      const weights = new Array(flen).fill(0)
      let weightSum = 0
      for (let i = 0; i <= flen - 2; i++) {
        let t = 0
        if (i <= phase - 1) {
          // Focus zone: t ramps from 0 to 1.
          t = phase > 1 ? i / (phase - 1) : 0
        } else {
          // Cycle zone: t continues upward from 1.
          const numer = (i - phase + 1) * (2 * cycle - 1)
          const denom = cycle * period - 1
          t = 1 + (denom > 0 ? numer / denom : 0)
        }
        const beta = Math.cos(Math.PI * t)
        const g = t <= 0.5 ? 1 : 1 / (coeff * t + 1)
        const w = g * beta
        weights[i] = w
        weightSum += w
      }
      // The source's loop stops at flen - 2, so the last tap weighs nothing.
      weights[flen - 1] = 0

      const usable = Math.abs(weightSum) > 1e-15
      const out = new Array(bars.length).fill(NaN)
      for (let i = 0; i < bars.length; i++) {
        // Pine: float price = nz(source).
        const price = Number.isFinite(src[i]) ? src[i] : 0
        // Fewer bars than the kernel is long: the source returns the price
        // itself rather than na, so the line starts on the first bar.
        if (i + 1 < flen) {
          out[i] = price
          continue
        }
        let sum = 0
        for (let k = 0; k < flen; k++) {
          const v = Number.isFinite(src[i - k]) ? src[i - k] : 0
          sum += v * weights[k]
        }
        out[i] = usable ? sum / weightSum : price
      }

      return { nlma: nulls(out) }
    },
  })
}
