/**
 * Cubic Regression Moving Average (CRMA) - ported to openalgo-charts from Pine Script v6.
 *
 * Source: https://github.com/mihakralj/pinescript/blob/c4e91b962be09733d8fc76caa5191e9e586c5cee/indicators/trends_FIR/crma.pine
 * Repo:   mihakralj/pinescript
 * License: MIT (c) mihakralj
 * SPDX-FileCopyrightText: (c) mihakralj
 * SPDX-FileCopyrightText: (c) 2026 marketcalls (port to openalgo-charts)
 * SPDX-License-Identifier: MIT
 *
 * Fits a degree-3 polynomial to the lookback window by least squares and plots
 * the fitted value at the newest bar, so the curve can follow an acceleration
 * in trend that a linear fit would lag.
 */

export default function ({ registerIndicator, sourceValues, nulls }) {
  // Solves the 4x4 normal equations by Gaussian elimination with partial
  // pivoting, exactly as the source does, and returns null when it is singular.
  const solveCubic = (s0, s1, s2, s3, s4, s5, s6, r0, r1, r2, r3) => {
    let a00 = s0, a01 = s1, a02 = s2, a03 = s3, b0 = r0
    let a10 = s1, a11 = s2, a12 = s3, a13 = s4, b1 = r1
    let a20 = s2, a21 = s3, a22 = s4, a23 = s5, b2 = r2
    let a30 = s3, a31 = s4, a32 = s5, a33 = s6, b3 = r3

    // Column 0: partial pivoting among rows 0 to 3.
    let best0 = Math.abs(a00)
    let piv0 = 0
    if (Math.abs(a10) > best0) { best0 = Math.abs(a10); piv0 = 1 }
    if (Math.abs(a20) > best0) { best0 = Math.abs(a20); piv0 = 2 }
    if (Math.abs(a30) > best0) { best0 = Math.abs(a30); piv0 = 3 }

    if (piv0 === 1) {
      const t0 = a00, t1 = a01, t2 = a02, t3 = a03, t4 = b0
      a00 = a10; a01 = a11; a02 = a12; a03 = a13; b0 = b1
      a10 = t0; a11 = t1; a12 = t2; a13 = t3; b1 = t4
    } else if (piv0 === 2) {
      const t0 = a00, t1 = a01, t2 = a02, t3 = a03, t4 = b0
      a00 = a20; a01 = a21; a02 = a22; a03 = a23; b0 = b2
      a20 = t0; a21 = t1; a22 = t2; a23 = t3; b2 = t4
    } else if (piv0 === 3) {
      const t0 = a00, t1 = a01, t2 = a02, t3 = a03, t4 = b0
      a00 = a30; a01 = a31; a02 = a32; a03 = a33; b0 = b3
      a30 = t0; a31 = t1; a32 = t2; a33 = t3; b3 = t4
    }

    let singular = best0 < 1e-12
    if (!singular) {
      // Eliminate column 0 from rows 1, 2 and 3.
      const f1 = a10 / a00
      a11 -= f1 * a01; a12 -= f1 * a02; a13 -= f1 * a03; b1 -= f1 * b0; a10 = 0

      const f2 = a20 / a00
      a21 -= f2 * a01; a22 -= f2 * a02; a23 -= f2 * a03; b2 -= f2 * b0; a20 = 0

      const f3 = a30 / a00
      a31 -= f3 * a01; a32 -= f3 * a02; a33 -= f3 * a03; b3 -= f3 * b0; a30 = 0

      // Column 1: partial pivoting among rows 1 to 3.
      let best1 = Math.abs(a11)
      let piv1 = 1
      if (Math.abs(a21) > best1) { best1 = Math.abs(a21); piv1 = 2 }
      if (Math.abs(a31) > best1) { best1 = Math.abs(a31); piv1 = 3 }

      if (piv1 === 2) {
        const t1 = a11, t2 = a12, t3 = a13, t4 = b1
        a11 = a21; a12 = a22; a13 = a23; b1 = b2
        a21 = t1; a22 = t2; a23 = t3; b2 = t4
      } else if (piv1 === 3) {
        const t1 = a11, t2 = a12, t3 = a13, t4 = b1
        a11 = a31; a12 = a32; a13 = a33; b1 = b3
        a31 = t1; a32 = t2; a33 = t3; b3 = t4
      }

      singular = best1 < 1e-12
    }

    if (!singular) {
      // Eliminate column 1 from rows 2 and 3.
      const g2 = a21 / a11
      a22 -= g2 * a12; a23 -= g2 * a13; b2 -= g2 * b1; a21 = 0

      const g3 = a31 / a11
      a32 -= g3 * a12; a33 -= g3 * a13; b3 -= g3 * b1; a31 = 0

      // Column 2: partial pivoting among rows 2 and 3.
      if (Math.abs(a32) > Math.abs(a22)) {
        const t2 = a22, t3 = a23, t4 = b2
        a22 = a32; a23 = a33; b2 = b3
        a32 = t2; a33 = t3; b3 = t4
      }

      singular = Math.abs(a22) < 1e-12
    }

    if (!singular) {
      // Eliminate column 2 from row 3.
      const h3 = a32 / a22
      a33 -= h3 * a23; b3 -= h3 * b2; a32 = 0

      singular = Math.abs(a33) < 1e-12
    }

    if (singular) return null

    // Back-substitution; c0 is the fit evaluated at x = 0, the newest bar.
    const c3 = b3 / a33
    const c2 = (b2 - a23 * c3) / a22
    const c1 = (b1 - a12 * c2 - a13 * c3) / a11
    const c0 = (b0 - a01 * c1 - a02 * c2 - a03 * c3) / a00
    return Number.isFinite(c0) ? c0 : null
  }

  registerIndicator({
    id: 'oa-crma',
    name: 'Cubic Regression Moving Average (CRMA)',
    category: 'Trends FIR',
    placement: 'onchart',

    inputs: [
      {
        key: 'period',
        type: 'number',
        label: 'Period',
        default: 14,
        min: 4,
        max: 1000,
        step: 1,
        tooltip: 'Lookback window for the cubic regression. At least 4 bars are needed to fit a cubic.',
      },
      { key: 'source', type: 'source', label: 'Source', default: 'close' },
    ],

    plots: [{ key: 'crma', type: 'line', title: 'CRMA', style: { color: '#ffeb3b', lineWidth: 2 } }],

    calc(bars, settings) {
      // A cleared number field arrives as '', and Number('') is 0. The source
      // refuses anything below 4, so that is the floor here too.
      const period = Math.max(4, Math.floor(Number(settings.period) || 14))
      const src = sourceValues(bars, settings.source ?? 'close')

      // Pine stores nz(source) in the ring buffer, so a gap reads as zero.
      const price = new Array(bars.length)
      for (let i = 0; i < bars.length; i++) {
        price[i] = Number.isFinite(src[i]) ? src[i] : 0
      }

      const out = new Array(bars.length).fill(NaN)
      for (let i = 0; i < bars.length; i++) {
        // The window grows with the chart until it reaches the period.
        const p = Math.min(i + 1, period)
        if (p < 4) {
          out[i] = price[i]
          continue
        }

        let s0 = 0, s1 = 0, s2 = 0, s3 = 0, s4 = 0, s5 = 0, s6 = 0
        let r0 = 0, r1 = 0, r2 = 0, r3 = 0
        for (let j = 0; j < p; j++) {
          const v = price[i - j]
          const x = j
          const x2 = x * x
          const x3 = x2 * x

          s0 += 1
          s1 += x
          s2 += x2
          s3 += x3
          s4 += x2 * x2
          s5 += x2 * x3
          s6 += x3 * x3

          r0 += v
          r1 += x * v
          r2 += x2 * v
          r3 += x3 * v
        }

        const fitted = solveCubic(s0, s1, s2, s3, s4, s5, s6, r0, r1, r2, r3)
        // A singular system falls back to the raw price, as the source does.
        out[i] = fitted === null ? price[i] : fitted
      }

      return { crma: nulls(out) }
    },
  })
}
