/**
 * Ehlers Correlation Cycle (CCOR) - ported to openalgo-charts from Pine Script v6.
 *
 * Source: https://github.com/mihakralj/pinescript/blob/c4e91b962be09733d8fc76caa5191e9e586c5cee/indicators/cycles/ccor.pine
 * Repo:   mihakralj/pinescript
 * License: MIT (c) mihakralj
 * SPDX-FileCopyrightText: (c) mihakralj
 * SPDX-FileCopyrightText: (c) 2026 marketcalls (port to openalgo-charts)
 * SPDX-License-Identifier: MIT
 *
 * Correlates the last `period` prices against a cosine wave (Real) and a
 * negative sine wave (Imag) of the presumed dominant cycle, so the pair reads
 * as a phasor whose rotation tracks the cycle phase.
 */

export default function ({ registerIndicator, sourceValues, nulls }) {
  registerIndicator({
    id: 'oa-ccor',
    name: 'Ehlers Correlation Cycle (CCOR)',
    category: 'Cycles',
    placement: 'pane',

    inputs: [
      {
        key: 'period',
        type: 'number',
        label: 'Period',
        default: 20,
        min: 2,
        max: 2000,
        step: 1,
        tooltip: 'Presumed dominant cycle wavelength the reference waves are built from.',
      },
      {
        key: 'threshold',
        type: 'number',
        label: 'State Threshold (degrees)',
        default: 9,
        min: 0.1,
        max: 360,
        step: 0.5,
        tooltip: 'Angle rate of change below which the market reads as trending rather than cycling.',
      },
      { key: 'source', type: 'source', label: 'Source', default: 'close' },
    ],

    plots: [
      {
        key: 'real',
        type: 'line',
        title: 'Real (x100)',
        style: { color: '#26a69a', lineWidth: 2 },
        // Pine colours the Real line green while it leads Imag, red otherwise.
        colorBy: ({ index, values }) => {
          const r = values?.real?.[index]
          const im = values?.imag?.[index]
          return Number.isFinite(r) && Number.isFinite(im) && r > im ? '#26a69a' : '#ef5350'
        },
      },
      { key: 'imag', type: 'line', title: 'Imag (x100)', style: { color: '#787b86', lineWidth: 1 } },
    ],

    levels: () => [{ price: 0, title: 'Zero', color: '#787b86', dashed: true }],

    calc(bars, settings) {
      // A cleared number field arrives as '', and Number('') is 0.
      const period = Math.max(2, Math.floor(Number(settings.period) || 20))
      const threshold = Math.max(0.1, Number(settings.threshold) || 9)
      const src = sourceValues(bars, settings.source ?? 'close')
      const len = bars.length

      const real = new Array(len).fill(NaN)
      const imag = new Array(len).fill(NaN)
      // The Pine function also returns the phasor angle and the market state.
      // The indicator plots neither, so they are carried as plain columns.
      const angleCol = new Array(len).fill(NaN)
      const stateCol = new Array(len).fill(0)

      // The reference waves never change from bar to bar, so their own sums are
      // constant and only the price sums have to be rebuilt each bar.
      const cosWave = new Array(period)
      const sinWave = new Array(period)
      let syR = 0
      let syyR = 0
      let syI = 0
      let syyI = 0
      for (let c = 0; c < period; c++) {
        const a = (2 * Math.PI * c) / period
        cosWave[c] = Math.cos(a)
        sinWave[c] = -Math.sin(a)
        syR += cosWave[c]
        syyR += cosWave[c] * cosWave[c]
        syI += sinWave[c]
        syyI += sinWave[c] * sinWave[c]
      }
      const n = period
      const spreadR = n * syyR - syR * syR
      const spreadI = n * syyI - syI * syI

      // Pine's `var float prev_angle` carries across bars from 0.0.
      let prevAngle = 0

      for (let i = 0; i < len; i++) {
        // nz(source): a non-finite source reads as 0 and also seeds the
        // nz(source[count], price) fallback used before enough history exists.
        const price = Number.isFinite(src[i]) ? src[i] : 0

        let sx = 0
        let sxx = 0
        let sxyR = 0
        let sxyI = 0
        for (let c = 0; c < period; c++) {
          const j = i - c
          const x = j >= 0 && Number.isFinite(src[j]) ? src[j] : price
          sx += x
          sxx += x * x
          sxyR += x * cosWave[c]
          sxyI += x * sinWave[c]
        }
        const spreadX = n * sxx - sx * sx

        const denomR = spreadX * spreadR
        const realVal =
          Number.isFinite(denomR) && denomR > 0 ? (n * sxyR - sx * syR) / Math.sqrt(denomR) : 0

        const denomI = spreadX * spreadI
        const imagVal =
          Number.isFinite(denomI) && denomI > 0 ? (n * sxyI - sx * syI) / Math.sqrt(denomI) : 0

        // Phasor angle in degrees, with the quadrant resolved from Imag.
        let angle = 0
        if (imagVal !== 0) angle = 90 + (Math.atan(realVal / imagVal) * 180) / Math.PI
        if (imagVal > 0) angle -= 180

        // Monotonic constraint: the angle is never allowed to walk backward.
        const savedPrev = prevAngle
        if (angle < prevAngle) angle = prevAngle
        prevAngle = angle

        // Small angle change means trending, large means cycling.
        const angleChange = Math.abs(angle - savedPrev)
        let state = 0
        if (angleChange < threshold && angle <= 0) state = -1
        if (angleChange < threshold && angle >= 0) state = 1

        // Display scaling maps [-1, +1] onto [-100, +100].
        real[i] = realVal * 100
        imag[i] = imagVal * 100
        angleCol[i] = angle
        stateCol[i] = state
      }

      return { real: nulls(real), imag: nulls(imag), angle: nulls(angleCol), state: stateCol }
    },
  })
}
