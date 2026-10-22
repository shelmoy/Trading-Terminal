/**
 * Polynomial Fitting (POLYFIT) - ported to openalgo-charts from Pine Script v6.
 *
 * Source: https://github.com/mihakralj/pinescript/blob/c4e91b962be09733d8fc76caa5191e9e586c5cee/indicators/statistics/polyfit.pine
 * Repo:   mihakralj/pinescript
 * License: MIT (c) mihakralj
 * SPDX-FileCopyrightText: (c) mihakralj
 * SPDX-FileCopyrightText: (c) 2026 marketcalls (port to openalgo-charts)
 * SPDX-License-Identifier: MIT
 *
 * Least-squares fits a polynomial of the chosen degree to the last N values by
 * the normal equations, then plots the curve evaluated at the current bar.
 * Degree 1 is the endpoint of a linear regression, degree 2 bends with it.
 */

export default function ({ registerIndicator, sourceValues, nulls }) {
  registerIndicator({
    id: 'oa-polyfit',
    name: 'Polynomial Fitting (POLYFIT)',
    category: 'Statistics',
    placement: 'onchart',

    inputs: [
      {
        key: 'period',
        type: 'number',
        label: 'Period',
        default: 20,
        min: 2,
        max: 1000,
        step: 1,
        tooltip: 'Number of data points in the fitting window',
      },
      {
        key: 'degree',
        type: 'number',
        label: 'Degree',
        default: 2,
        min: 1,
        max: 6,
        step: 1,
        tooltip: 'Polynomial degree: 1=linear, 2=quadratic, 3=cubic',
      },
      { key: 'source', type: 'source', label: 'Source', default: 'close' },
    ],

    plots: [
      { key: 'polyfit', type: 'line', title: 'POLYFIT', style: { color: '#ffeb3b', lineWidth: 2 } },
    ],

    calc(bars, settings) {
      // A cleared number field arrives as '', and Number('') is 0. Pine refuses
      // a period below 2 or a degree below 1.
      const period = Math.max(2, Math.min(1000, Math.floor(Number(settings.period) || 20)))
      const degree = Math.max(1, Math.min(6, Math.floor(Number(settings.degree) || 2)))
      const src = sourceValues(bars, settings.source ?? 'close')

      const d = Math.min(degree, period - 1)
      const m = d + 1
      const n0 = bars.length
      const out = new Array(n0).fill(NaN)

      // The fitting window, oldest first, exactly as Pine walks its ring buffer.
      const buf = []
      let lastValid = NaN

      // X'X depends only on the window size, so it is rebuilt only while the
      // window is still filling, then reused. The values themselves live in rhs.
      let template = null
      let templateN = -1
      const mat = new Float64Array(m * m)
      const rhs = new Float64Array(m)

      for (let bar = 0; bar < n0; bar++) {
        let curr = src[bar]
        // Pine carries the last good value forward over an na source.
        if (!Number.isFinite(curr) && Number.isFinite(lastValid)) curr = lastValid
        if (Number.isFinite(curr)) {
          lastValid = curr
          buf.push(curr)
          if (buf.length > period) buf.shift()
        }

        const n = buf.length
        if (n < m + 1) continue

        const invN = 1.0 / (n - 1.0)

        if (templateN !== n) {
          template = new Float64Array(m * m)
          for (let i = 0; i < n; i++) {
            const x = i * invN
            let xp = 1.0
            for (let r = 0; r <= d; r++) {
              let xq = xp
              for (let c = r; c <= d; c++) {
                const add = xp * xq
                template[r * m + c] += add
                if (c !== r) template[c * m + r] += add
                xq *= x
              }
              xp *= x
            }
          }
          templateN = n
        }

        mat.set(template)
        rhs.fill(0)
        for (let i = 0; i < n; i++) {
          const y = buf[i]
          const x = i * invN
          let xp = 1.0
          for (let r = 0; r <= d; r++) {
            rhs[r] += xp * y
            xp *= x
          }
        }

        // Gauss-Jordan elimination with partial pivoting.
        for (let col = 0; col <= d; col++) {
          let pivRow = col
          let pivMax = Math.abs(mat[col * m + col])
          for (let row = col + 1; row <= d; row++) {
            const absVal = Math.abs(mat[row * m + col])
            if (absVal > pivMax) {
              pivMax = absVal
              pivRow = row
            }
          }
          if (pivRow !== col) {
            for (let k = 0; k <= d; k++) {
              const p1 = col * m + k
              const p2 = pivRow * m + k
              const tmp = mat[p1]
              mat[p1] = mat[p2]
              mat[p2] = tmp
            }
            const tmpR = rhs[col]
            rhs[col] = rhs[pivRow]
            rhs[pivRow] = tmpR
          }

          const piv = mat[col * m + col]
          // A singular window leaves the remaining coefficients unsolved, which
          // is what the source does rather than dividing by a near-zero pivot.
          if (!(Math.abs(piv) >= 1e-30)) break

          const invPiv = 1.0 / piv
          for (let k = col; k <= d; k++) mat[col * m + k] *= invPiv
          rhs[col] *= invPiv

          for (let row = 0; row <= d; row++) {
            if (row === col) continue
            const factor = mat[row * m + col]
            for (let k = col; k <= d; k++) mat[row * m + k] -= factor * mat[col * m + k]
            rhs[row] -= factor * rhs[col]
          }
        }

        // The window is normalized to x in [0, 1], so the current bar is P(1.0),
        // which is simply the sum of the coefficients.
        let result = 0.0
        for (let r = 0; r <= d; r++) result += rhs[r]
        if (Number.isFinite(result)) out[bar] = result
      }

      return { polyfit: nulls(out) }
    },
  })
}
