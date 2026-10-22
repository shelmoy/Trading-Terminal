/**
 * Autoregressive FIR Moving Average (AFIRMA) - ported to openalgo-charts from Pine Script v6.
 *
 * Source: https://github.com/mihakralj/pinescript/blob/c4e91b962be09733d8fc76caa5191e9e586c5cee/indicators/forecasts/afirma.pine
 * Repo:   mihakralj/pinescript
 * License: MIT
 * SPDX-FileCopyrightText: (c) mihakralj
 * SPDX-FileCopyrightText: (c) 2026 marketcalls (port to openalgo-charts)
 * SPDX-License-Identifier: MIT
 *
 * A finite impulse response smoother whose taps come from a cosine window
 * (Hanning, Hamming, Blackman or Blackman-Harris), with an optional least
 * squares straight-line fit over the newest half of the window that replaces
 * those samples with their fitted values before averaging.
 */

export default function ({ registerIndicator, sourceValues, nulls }) {
  // The source hard-codes this constant rather than using math.pi * 2.
  const TWO_PI = 6.28318530718

  // Window taps for a window of p samples. Note that the source only overrides
  // a0 and a1 for window types 1 and 2, and a0, a1 and a2 for type 3, so the
  // Blackman-Harris a2 and a3 terms stay in the sum for every window type.
  // Reproduced exactly as written so the values match the Pine plot.
  const windowCoefficients = (p, windowType) => {
    let a0 = 0.35875
    let a1 = -0.48829
    let a2 = 0.14128
    let a3 = -0.01168
    if (windowType === 1) {
      a0 = 0.5
      a1 = -0.5
    } else if (windowType === 2) {
      a0 = 0.54
      a1 = -0.46
    } else if (windowType === 3) {
      a0 = 0.42
      a1 = -0.5
      a2 = 0.08
    }
    const coefs = new Array(p)
    const twoPiDivP = TWO_PI / p
    for (let k = 0; k < p; k++) {
      const x = k * twoPiDivP
      let coef = a0 + a1 * Math.cos(x)
      if (a2 !== 0) coef += a2 * Math.cos(2 * x)
      if (a3 !== 0) coef += a3 * Math.cos(3 * x)
      coefs[k] = coef
    }
    return coefs
  }

  registerIndicator({
    id: 'oa-afirma',
    name: 'Autoregressive FIR Moving Average (AFIRMA)',
    category: 'Forecasts',
    placement: 'onchart',

    inputs: [
      { key: 'period', type: 'number', label: 'Period', default: 20, min: 1, max: 5000, step: 1 },
      { key: 'source', type: 'source', label: 'Source', default: 'close' },
      {
        key: 'windowType',
        type: 'number',
        label: 'Window Function',
        default: 4,
        min: 1,
        max: 4,
        step: 1,
        tooltip: '1:Hanning, 2:Hamming, 3:Blackman, 4:Blackman-Harris',
      },
      {
        key: 'leastSquares',
        type: 'boolean',
        label: 'Least Squares Method',
        default: false,
        tooltip: 'Enable cubic polynomial fitting for autoregressive prediction',
      },
    ],

    plots: [{ key: 'afirma', type: 'line', title: 'AFIRMA', style: { color: '#ffeb3b', lineWidth: 2 } }],

    calc(bars, settings) {
      // A cleared number field arrives as '', and Number('') is 0.
      const period = Math.max(1, Math.floor(Number(settings.period) || 20))
      const rawWindow = Number(settings.windowType)
      const windowType = Number.isFinite(rawWindow) && rawWindow >= 1 ? Math.min(4, Math.round(rawWindow)) : 4
      const leastSquares = settings.leastSquares === true
      const src = sourceValues(bars, settings.source ?? 'close')

      const out = new Array(bars.length).fill(NaN)
      let coefs = null
      let coefPeriod = 0

      for (let i = 0; i < bars.length; i++) {
        // Pine: int p = math.min(bar_index + 1, period). The window grows with
        // the chart, so AFIRMA emits a value from the very first bar.
        const p = Math.min(i + 1, period)
        let result = Number.isFinite(src[i]) ? src[i] : NaN

        if (p > 1) {
          if (p !== coefPeriod) {
            coefs = windowCoefficients(p, windowType)
            coefPeriod = p
          }

          let sum = 0
          let weightSum = 0
          let validCount = 0
          for (let k = 0; k < p; k++) {
            const price = src[i - k]
            if (!Number.isFinite(price)) continue
            sum += price * coefs[k]
            weightSum += coefs[k]
            validCount += 1
          }
          if (validCount > 0 && weightSum > 0) result = sum / weightSum

          if (leastSquares && p > 2) {
            const n = Math.min(Math.floor((p - 1) / 2), 50)
            if (n >= 2) {
              let sx = 0
              let sx2 = 0
              for (let k = 0; k < n; k++) {
                sx += k
                sx2 += k * k
              }
              let sy = 0
              let sxy = 0
              for (let k = 0; k < n; k++) {
                // Pine wraps the sample in nz(), so a missing price reads as 0.
                const yk = Number.isFinite(src[i - k]) ? src[i - k] : 0
                sy += yk
                sxy += k * yk
              }
              const denom = n * sx2 - sx * sx
              if (Math.abs(denom) > 1e-10) {
                const slope = (n * sxy - sx * sy) / denom
                const intercept = (sy - slope * sx) / n
                // The fitted values replace the newest n samples; the rest of
                // the window keeps its raw price. The source stages this in a
                // buffer, which is only read back at the same indices, so the
                // fitted value is computed inline here.
                let lsSum = 0
                let lsCount = 0
                for (let k = 0; k < p; k++) {
                  const val = k < n ? intercept + slope * k : Number.isFinite(src[i - k]) ? src[i - k] : 0
                  if (!Number.isFinite(val)) continue
                  lsSum += val
                  lsCount += 1
                }
                if (lsCount > 0) result = lsSum / lsCount
              }
            }
          }
        }

        out[i] = result
      }

      return { afirma: nulls(out) }
    },
  })
}
