/**
 * Ehlers MESA Adaptive Moving Averages (MAMA & FAMA) - ported to
 * openalgo-charts from Pine Script v3.
 *
 * Source: https://github.com/everget/tradingview-pinescript-indicators/blob/60c93d3711d222b8f2db96160defe568429348e0/movings/ehlers_mesa_adaptive_moving_averages.pine
 * Repo:   everget/tradingview-pinescript-indicators
 * License: GPL-3.0
 * SPDX-FileCopyrightText: (c) 2018-present Alex Orekhov (everget)
 * SPDX-FileCopyrightText: (c) 2026 marketcalls (port to openalgo-charts)
 * SPDX-License-Identifier: GPL-3.0-only
 *
 * A Hilbert transform measures the dominant cycle in price and turns the rate
 * of phase change into the smoothing factor, so MAMA steps quickly when the
 * phase rotates and crawls when it stalls. FAMA follows MAMA at half that
 * factor, and the pair crossing is the classic trend signal.
 */

export default function ({ registerIndicator, sourceValues, nulls }) {
  // A cleared field arrives as '', and Number('') is 0, which would silently
  // replace a deliberate value. Fall back only when the field is truly empty.
  const numOr = (v, fallback) => {
    if (v === '' || v === null || v === undefined) return fallback
    const n = Number(v)
    return Number.isFinite(n) ? n : fallback
  }

  // Pine's nz(): a not-available value reads as zero.
  const nz = (v) => (Number.isFinite(v) ? v : 0)

  registerIndicator({
    id: 'oa-ehlers-mesa-adaptive-moving-averages',
    name: 'Ehlers MESA Adaptive Moving Averages (MAMA & FAMA)',
    category: 'Moving Averages',
    placement: 'onchart',

    inputs: [
      { key: 'source', type: 'source', label: 'Source', default: 'hl2' },
      {
        key: 'fastLimit',
        type: 'number',
        label: 'Fast Limit',
        default: 0.5,
        min: 0.01,
        max: 1,
        step: 0.01,
        tooltip: 'Upper bound on the adaptive smoothing factor.',
      },
      {
        key: 'slowLimit',
        type: 'number',
        label: 'Slow Limit',
        default: 0.05,
        min: 0.001,
        max: 1,
        step: 0.005,
        tooltip: 'Lower bound on the adaptive smoothing factor.',
      },
    ],

    plots: [
      { key: 'mama', type: 'line', title: 'MAMA', style: { color: '#674ea7', lineWidth: 2 } },
      { key: 'fama', type: 'line', title: 'FAMA', style: { color: '#f6b26b', lineWidth: 2 } },
    ],

    calc(bars, settings) {
      const n = bars.length
      const fastLimit = Math.max(0.001, numOr(settings.fastLimit, 0.5))
      const slowLimit = Math.max(0.0001, numOr(settings.slowLimit, 0.05))
      const src = sourceValues(bars, settings.source ?? 'hl2')

      const mamaOut = new Array(n).fill(NaN)
      const famaOut = new Array(n).fill(NaN)
      if (n === 0) return { mama: nulls(mamaOut), fama: nulls(famaOut) }

      // The six-tap Hilbert weights the source applies to smooth, detrender,
      // I1 and Q1 alike, scaled by the current period multiplier.
      const smoothHist = new Array(n).fill(0)
      const detrenderHist = new Array(n).fill(0)
      const i1Hist = new Array(n).fill(0)
      const q1Hist = new Array(n).fill(0)

      const hilbert = (hist, i, mult) =>
        (0.962 * hist[i] +
          0.5769 * (i >= 2 ? hist[i - 2] : 0) -
          0.5769 * (i >= 4 ? hist[i - 4] : 0) -
          0.0962 * (i >= 6 ? hist[i - 6] : 0)) *
        mult

      // Every one of these is read as its end-of-previous-bar value, which is
      // what a Pine series subscript gives.
      let prevI2 = 0
      let prevQ2 = 0
      let prevRe = 0
      let prevIm = 0
      let prevMesaPeriod = 0
      let prevPhase = 0
      let prevMama = 0
      let prevFama = 0

      for (let i = 0; i < n; i++) {
        const s = Number.isFinite(src[i]) ? src[i] : 0
        const mesaPeriodMult = 0.075 * prevMesaPeriod + 0.54

        // Pine wraps each lag in nz(), so history missing at the head is zero.
        smoothHist[i] =
          (4 * s +
            3 * (i >= 1 ? nz(src[i - 1]) : 0) +
            2 * (i >= 2 ? nz(src[i - 2]) : 0) +
            (i >= 3 ? nz(src[i - 3]) : 0)) /
          10

        detrenderHist[i] = hilbert(smoothHist, i, mesaPeriodMult)

        // InPhase and Quadrature components.
        const I1 = i >= 3 ? detrenderHist[i - 3] : 0
        i1Hist[i] = I1
        const Q1 = hilbert(detrenderHist, i, mesaPeriodMult)
        q1Hist[i] = Q1

        // Advance the phase of I1 and Q1 by 90 degrees.
        const jI = hilbert(i1Hist, i, mesaPeriodMult)
        const jQ = hilbert(q1Hist, i, mesaPeriodMult)

        // Phasor addition for three bar averaging, then smoothing.
        let I2 = I1 - jQ
        let Q2 = Q1 + jI
        I2 = 0.2 * I2 + 0.8 * prevI2
        Q2 = 0.2 * Q2 + 0.8 * prevQ2

        // Homodyne discriminator.
        let Re = I2 * prevI2 + Q2 * prevQ2
        let Im = I2 * prevQ2 - Q2 * prevI2
        Re = 0.2 * Re + 0.8 * prevRe
        Im = 0.2 * Im + 0.8 * prevIm

        // The source declares mesaPeriod as 0.0 on every bar and only then
        // conditionally reassigns it, so an undetected cycle starts from zero.
        let mesaPeriod = 0
        if (Re !== 0 && Im !== 0) {
          // Ported as written: Pine's atan returns radians, not the degrees
          // Ehlers' original assumes, and the 360 numerator is kept as is.
          const angle = Math.atan(Im / Re)
          if (Number.isFinite(angle) && angle !== 0) mesaPeriod = 360 / angle
        }
        if (mesaPeriod > 1.5 * prevMesaPeriod) mesaPeriod = 1.5 * prevMesaPeriod
        if (mesaPeriod < 0.67 * prevMesaPeriod) mesaPeriod = 0.67 * prevMesaPeriod
        if (mesaPeriod < 6) mesaPeriod = 6
        if (mesaPeriod > 50) mesaPeriod = 50
        mesaPeriod = 0.2 * mesaPeriod + 0.8 * prevMesaPeriod

        // Phase, also in radians here, and reset to zero each bar like the
        // source does before its conditional assignment.
        let phase = 0
        if (I1 !== 0) {
          const p = Math.atan(Q1 / I1)
          if (Number.isFinite(p)) phase = p
        }
        let deltaPhase = prevPhase - phase
        if (deltaPhase < 1) deltaPhase = 1

        let alpha = fastLimit / deltaPhase
        if (alpha < slowLimit) alpha = slowLimit

        const mama = alpha * s + (1 - alpha) * prevMama
        const fama = (alpha / 2) * mama + (1 - alpha / 2) * prevFama

        mamaOut[i] = mama
        famaOut[i] = fama

        prevI2 = I2
        prevQ2 = Q2
        prevRe = Re
        prevIm = Im
        prevMesaPeriod = mesaPeriod
        prevPhase = phase
        prevMama = mama
        prevFama = fama
      }

      return { mama: nulls(mamaOut), fama: nulls(famaOut) }
    },
  })
}
