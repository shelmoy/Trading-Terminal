/**
 * Ehlers Phasor Analysis (PHASOR) - ported to openalgo-charts from Pine Script v6.
 *
 * Source: https://github.com/mihakralj/pinescript/blob/c4e91b962be09733d8fc76caa5191e9e586c5cee/indicators/cycles/phasor.pine
 * Repo:   mihakralj/pinescript
 * License: MIT (c) mihakralj
 * SPDX-FileCopyrightText: (c) mihakralj
 * SPDX-FileCopyrightText: (c) 2026 marketcalls (port to openalgo-charts)
 * SPDX-License-Identifier: MIT
 *
 * Correlates the recent window against a cosine and a negative sine of a fixed
 * cycle length, then reads the resulting complex vector as an angle. The angle
 * rotates steadily through a cycle and stalls in a trend, which also yields a
 * derived cycle period and a trend state.
 */

export default function ({ registerIndicator, sourceValues, nulls }) {
  registerIndicator({
    id: 'oa-phasor',
    name: 'Ehlers Phasor Analysis (PHASOR)',
    category: 'Cycles',
    placement: 'pane',

    inputs: [
      {
        key: 'period',
        type: 'number',
        label: 'Period',
        default: 28,
        min: 1,
        max: 5000,
        step: 1,
        group: 'Phasor Settings',
      },
      { key: 'source', type: 'source', label: 'Source', default: 'close', group: 'Phasor Settings' },
      {
        key: 'showDerivedPeriod',
        type: 'boolean',
        label: 'Show Derived Period',
        default: false,
        group: 'Optional Plots',
      },
      {
        key: 'showTrendState',
        type: 'boolean',
        label: 'Show Trend State Variable',
        default: false,
        group: 'Optional Plots',
      },
    ],

    plots: [
      { key: 'angle', type: 'line', title: 'Phasor Angle', style: { color: '#ffeb3b', lineWidth: 2 } },
      { key: 'derivedPeriod', type: 'line', title: 'Derived Period', style: { color: '#ffeb3b', lineWidth: 2 } },
      { key: 'trendState', type: 'histogram', title: 'Trend State', style: { color: '#ffeb3b', lineWidth: 2 } },
    ],

    calc(bars, settings) {
      // A cleared number field arrives as '', and Number('') is 0.
      const period = Math.max(1, Math.floor(Number(settings.period) || 28))
      const showDerivedPeriod = settings.showDerivedPeriod === true
      const showTrendState = settings.showTrendState === true
      const src = sourceValues(bars, settings.source ?? 'close')

      // The two reference waves and their own sums depend only on i and the
      // period, so they are hoisted out of the per-bar loop. Accumulation order
      // is kept at i = 0 .. period - 1 to match the source exactly.
      const yCos = new Array(period)
      const ySin = new Array(period)
      let syCos = 0
      let syyCos = 0
      let sySin = 0
      let syySin = 0
      for (let i = 0; i < period; i++) {
        const c = Math.cos((2 * Math.PI * i) / period)
        // Negative sine, as per Ehlers.
        const s = -Math.sin((2 * Math.PI * i) / period)
        yCos[i] = c
        ySin[i] = s
        syCos += c
        syyCos += c * c
        sySin += s
        syySin += s * s
      }

      const angleOut = new Array(bars.length).fill(NaN)
      const periodOut = new Array(bars.length).fill(NaN)
      const stateOut = new Array(bars.length).fill(NaN)

      // var state carried bar to bar.
      let prevUnwrapped = NaN
      let prevFinal = NaN
      let prevDerived = NaN

      for (let b = 0; b < bars.length; b++) {
        // Pine reads src[i] back over the window, and nz() turns a bar that does
        // not exist yet into 0, so the early window is zero padded.
        let sx = 0
        let sxx = 0
        let sxyCos = 0
        let sxySin = 0
        for (let i = 0; i < period; i++) {
          const idx = b - i
          const x = idx >= 0 && Number.isFinite(src[idx]) ? src[idx] : 0
          sx += x
          sxx += x * x
          sxyCos += x * yCos[i]
          sxySin += x * ySin[i]
        }

        let realPart = 0
        const denCos = (period * sxx - sx * sx) * (period * syyCos - syCos * syCos)
        if (denCos > 0) realPart = (period * sxyCos - sx * syCos) / Math.sqrt(denCos)

        let imagPart = 0
        const denSin = (period * sxx - sx * sx) * (period * syySin - sySin * sySin)
        if (denSin > 0) imagPart = (period * sxySin - sx * sySin) / Math.sqrt(denSin)

        let rawPhase = 0
        if (realPart !== 0) {
          rawPhase = 90 - (Math.atan(imagPart / realPart) * 180) / Math.PI
          if (realPart < 0) rawPhase -= 180
        } else if (imagPart !== 0) {
          rawPhase = imagPart > 0 ? 0 : 180
        }

        // Unwrap against the previous bar so the angle runs continuously
        // instead of jumping a full turn.
        if (Number.isFinite(prevUnwrapped)) {
          const diff = rawPhase - prevUnwrapped
          if (diff > 180) rawPhase -= 360
          else if (diff < -180) rawPhase += 360
        }
        const unwrapped = rawPhase

        // The published angle ratchets: a backward step inside the stated
        // windows is held at the previous value rather than followed.
        let finalPhase
        if (!Number.isFinite(prevFinal)) {
          finalPhase = unwrapped
        } else if (
          unwrapped < prevFinal &&
          ((unwrapped > -135 && prevFinal < 135) || (unwrapped < -90 && prevFinal < -90))
        ) {
          finalPhase = prevFinal
        } else {
          finalPhase = unwrapped
        }

        // Derived period: 360 degrees divided by this bar's angular step, with
        // the previous period reused whenever the step stalls or runs backward.
        const reference = Number.isFinite(prevFinal) ? prevFinal : finalPhase
        let angleChange = finalPhase - reference
        if (angleChange === 0 && Number.isFinite(prevDerived)) {
          angleChange = prevDerived !== 0 ? 360 / prevDerived : 0
        }
        if (angleChange <= 0 && Number.isFinite(prevDerived)) {
          angleChange = prevDerived !== 0 ? 360 / prevDerived : 0
        }
        let derived
        if (angleChange !== 0) derived = 360 / angleChange
        else if (Number.isFinite(prevDerived)) derived = prevDerived
        else derived = 60
        derived = Math.max(1, Math.min(derived, 60))

        // Trend state: a near-stalled angle out at the extremes reads as trend,
        // a near-stalled angle in the middle reads as cycle.
        const angleChangeState = finalPhase - reference
        let trendState = 0
        if (angleChangeState <= 6) {
          if (finalPhase >= 90 || finalPhase <= -90) trendState = 1
          else if (finalPhase > -90 && finalPhase < 90) trendState = -1
        }

        angleOut[b] = finalPhase
        if (showDerivedPeriod) periodOut[b] = derived
        if (showTrendState) stateOut[b] = trendState

        prevUnwrapped = unwrapped
        prevFinal = finalPhase
        prevDerived = derived
      }

      return {
        angle: nulls(angleOut),
        derivedPeriod: nulls(periodOut),
        trendState: nulls(stateOut),
      }
    },
  })
}
