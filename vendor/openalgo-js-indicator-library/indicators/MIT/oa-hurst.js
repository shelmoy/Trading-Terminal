/**
 * Hurst Exponent (HURST) - ported to openalgo-charts from Pine Script v6.
 *
 * Source: https://github.com/mihakralj/pinescript/blob/c4e91b962be09733d8fc76caa5191e9e586c5cee/indicators/statistics/hurst.pine
 * Repo:   mihakralj/pinescript
 * License: MIT (c) mihakralj
 * SPDX-FileCopyrightText: (c) mihakralj
 * SPDX-FileCopyrightText: (c) 2026 marketcalls (port to openalgo-charts)
 * SPDX-License-Identifier: MIT
 *
 * Rescaled range (R/S) analysis of the log returns over the lookback. The
 * window is cut into sub-periods of every length from 10 up to half the
 * lookback, the average R/S of each size is taken, and the exponent is the
 * slope of log(R/S) against log(size). Above 0.5 reads as trending, below 0.5
 * as mean reverting, and 0.5 as a random walk.
 */

export default function ({ registerIndicator, sourceValues, nulls }) {
  registerIndicator({
    id: 'oa-hurst',
    name: 'Hurst Exponent (HURST)',
    category: 'Statistics',
    placement: 'pane',

    inputs: [
      { key: 'source', type: 'source', label: 'Source', default: 'close' },
      {
        key: 'length',
        type: 'number',
        label: 'Length',
        default: 100,
        min: 20,
        max: 500,
        step: 1,
        tooltip: 'Lookback period for the Hurst Exponent. Minimum 20, since sub-periods start at 10. Long lookbacks are slow: the work per bar grows with the square of this number.',
      },
    ],

    plots: [{ key: 'hurst', type: 'line', title: 'Hurst Exponent', style: { color: '#ffeb3b', lineWidth: 2 } }],

    calc(bars, settings) {
      // A cleared number field arrives as '', and Number('') is 0. Pine raises
      // below 20 (sub-periods start at 10 and run to length / 2), and the upper
      // bound is this port's own guard on an O(length^2) inner loop.
      const length = Math.max(20, Math.min(500, Math.floor(Number(settings.length) || 100)))
      const src = sourceValues(bars, settings.source ?? 'close')
      const barCount = bars.length
      const out = new Array(barCount).fill(NaN)

      const minN = 10
      // Pine divides two integers here, which truncates.
      const maxN = Math.floor(length / 2)
      if (maxN < minN) return { hurst: nulls(out) }

      // log_returns = math.log(source / source[1])
      const lr = new Array(barCount).fill(NaN)
      for (let i = 1; i < barCount; i++) {
        const cur = src[i]
        const prev = src[i - 1]
        if (Number.isFinite(cur) && Number.isFinite(prev) && cur > 0 && prev > 0) {
          lr[i] = Math.log(cur / prev)
        }
      }

      const logN = []
      const logRs = []

      // Pine evaluates this on every bar. A sub-period that reaches back before
      // the first log return carries na through its mean, so its standard
      // deviation is na and `na > 0` is false: that one sub-period contributes
      // nothing while the average still divides by the full sub-period count.
      // The result is a (thin) reading from the first bar where two window
      // sizes both find at least one complete sub-period, which is how the Pine
      // line starts well before the lookback is full.
      for (let i = 0; i < barCount; i++) {
        logN.length = 0
        logRs.length = 0

        for (let n = minN; n <= maxN; n++) {
          const numSub = Math.floor(length / n)
          if (numSub === 0) continue

          let rsSum = 0
          for (let s = 0; s < numSub; s++) {
            const start = s * n
            // Pine reads log_returns[start + n - 1] here; before bar 0 that is
            // na, so the whole sub-period drops out. Checking the index first
            // also keeps every array read below in bounds.
            if (i - start - (n - 1) < 0) continue

            // Sub-period mean. Pine walks j from 0 to n - 1 over
            // log_returns[start_index + j], so the walk runs backwards in time
            // and the order matters to the cumulative deviation below.
            let sum = 0
            let complete = true
            for (let j = 0; j < n; j++) {
              const v = lr[i - start - j]
              if (!Number.isFinite(v)) {
                complete = false
                break
              }
              sum += v
            }
            // na anywhere in the sub-period: Pine adds nothing for it.
            if (!complete) continue
            const mean = sum / n

            // Range of the cumulative deviation, and the population standard
            // deviation, in one pass.
            let run = 0
            let hi = -Infinity
            let lo = Infinity
            let varSum = 0
            for (let j = 0; j < n; j++) {
              const d = lr[i - start - j] - mean
              run += d
              if (run > hi) hi = run
              if (run < lo) lo = run
              varSum += d * d
            }

            const sd = Math.sqrt(varSum / n)
            // A flat sub-period contributes nothing, which is also how Pine
            // keeps this divide safe.
            if (sd > 0) rsSum += (hi - lo) / sd
          }

          // Pine averages over every sub-period, including the ones skipped for
          // a zero standard deviation or an incomplete window.
          const avgRs = rsSum / numSub
          if (avgRs > 0) {
            logN.push(Math.log(n))
            logRs.push(Math.log(avgRs))
          }
        }

        if (logN.length < 2) continue

        // Least squares slope of log(R/S) on log(n).
        const m = logN.length
        let sumX = 0
        let sumY = 0
        let sumXy = 0
        let sumXsq = 0
        for (let k = 0; k < m; k++) {
          const xi = logN[k]
          const yi = logRs[k]
          sumX += xi
          sumY += yi
          sumXy += xi * yi
          sumXsq += xi * xi
        }
        const denominator = m * sumXsq - sumX * sumX
        if (denominator === 0) continue
        out[i] = (m * sumXy - sumX * sumY) / denominator
      }

      return { hurst: nulls(out) }
    },
  })
}
