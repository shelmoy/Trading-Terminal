/**
 * Kaiser Window Moving Average (KAISER) - ported to openalgo-charts from Pine Script v6.
 *
 * Source: https://github.com/mihakralj/pinescript/blob/c4e91b962be09733d8fc76caa5191e9e586c5cee/indicators/trends_FIR/kaiser.pine
 * Repo:   mihakralj/pinescript
 * License: MIT (c) mihakralj
 * SPDX-FileCopyrightText: (c) mihakralj
 * SPDX-FileCopyrightText: (c) 2026 marketcalls (port to openalgo-charts)
 * SPDX-License-Identifier: MIT
 *
 * A symmetric FIR smoother whose taps come from the Kaiser-Bessel window, so
 * the beta parameter trades main-lobe width against sidelobe attenuation:
 * beta 0 collapses to a plain SMA, higher beta gives a smoother, laggier line.
 */

export default function ({ registerIndicator, sourceValues, nulls }) {
  /**
   * Modified Bessel function of the first kind, order 0, as the 25-term power
   * series the Pine helper uses. Keeping the same truncation keeps the taps
   * numerically identical to the source rather than merely close.
   */
  const besselI0 = (x) => {
    let sum = 1
    let term = 1
    const halfX = x / 2
    for (let m = 1; m <= 25; m++) {
      term *= halfX / m
      sum += term * term
    }
    return sum
  }

  /**
   * w(k) = I0(beta * sqrt(1 - ((2k/(N-1)) - 1)^2)) / I0(beta), normalised to
   * sum to 1. Pine computes these once on the first bar; the settings are fixed
   * for the whole calc here, so once per call is the same thing.
   */
  const kaiserWeights = (period, beta) => {
    const i0Beta = besselI0(beta)
    const n = period - 1
    const weights = new Array(period)
    let wsum = 0
    for (let k = 0; k < period; k++) {
      const t = n > 0 ? (2 * k) / n - 1 : 0
      const argSq = 1 - t * t
      // Clamp to avoid a sqrt of a negative from floating-point drift.
      const arg = argSq > 0 ? Math.sqrt(argSq) : 0
      const w = i0Beta > 0 ? besselI0(beta * arg) / i0Beta : 1
      weights[k] = w
      wsum += w
    }
    if (wsum > 0) {
      for (let k = 0; k < period; k++) weights[k] /= wsum
    }
    return weights
  }

  registerIndicator({
    id: 'oa-kaiser',
    name: 'Kaiser Window Moving Average (KAISER)',
    category: 'Trends FIR',
    placement: 'onchart',

    inputs: [
      { key: 'source', type: 'source', label: 'Source', default: 'close' },
      { key: 'period', type: 'number', label: 'Period', default: 14, min: 2, max: 5000, step: 1 },
      {
        key: 'beta',
        type: 'number',
        label: 'Beta (shape)',
        default: 3,
        min: 0,
        max: 20,
        step: 0.1,
        tooltip: '0=rectangular(SMA), 3=good general, 5.65 approximates Blackman, 8.6=Hamming-like',
      },
    ],

    plots: [{ key: 'kaiser', type: 'line', title: 'KAISER', style: { color: '#ffeb3b', lineWidth: 2 } }],

    calc(bars, settings) {
      // A cleared number field arrives as '', and Number('') is 0.
      const period = Math.max(2, Math.floor(Number(settings.period) || 14))
      // Beta 0 is a legal setting (rectangular window), so a plain `|| 3`
      // fallback would silently rewrite it. Only a cleared or unusable field
      // falls back to the default.
      const rawBeta = settings.beta
      const parsedBeta = rawBeta === '' || rawBeta == null ? 3 : Number(rawBeta)
      const beta = Number.isFinite(parsedBeta) ? Math.min(20, Math.max(0, parsedBeta)) : 3

      const src = sourceValues(bars, settings.source ?? 'close')
      const weights = kaiserWeights(period, beta)

      const n = bars.length
      const out = new Array(n).fill(NaN)

      for (let i = 0; i < n; i++) {
        // Pine stores nz(source) in the buffer, so a missing value reads as 0.
        const price = Number.isFinite(src[i]) ? src[i] : 0
        // count = min(bar_index + 1, period). Until the window is full the Pine
        // function returns the raw price rather than na, so the line starts at
        // the first bar and sits on the source through the warmup.
        if (i < period - 1) {
          out[i] = price
          continue
        }
        // weights[0] is the oldest bar in the window, weights[period-1] the newest.
        let result = 0
        for (let j = 0; j < period; j++) {
          const v = src[i - period + 1 + j]
          result += (Number.isFinite(v) ? v : 0) * weights[j]
        }
        out[i] = result
      }

      return { kaiser: nulls(out) }
    },
  })
}
