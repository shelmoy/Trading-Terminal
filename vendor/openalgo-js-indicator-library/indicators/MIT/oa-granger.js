/**
 * Granger Causality Test (GRANGER) - ported to openalgo-charts from Pine Script v6.
 *
 * Source: https://github.com/mihakralj/pinescript/blob/c4e91b962be09733d8fc76caa5191e9e586c5cee/indicators/statistics/granger.pine
 * Repo:   mihakralj/pinescript
 * License: MIT (c) mihakralj
 * SPDX-FileCopyrightText: (c) mihakralj
 * SPDX-FileCopyrightText: (c) 2026 marketcalls (port to openalgo-charts)
 * SPDX-License-Identifier: MIT
 *
 * The F-statistic of a lag-1 Granger causality test: it compares how well
 * series 1 is predicted by its own previous value alone against how well it is
 * predicted once the previous value of series 2 is added. A larger value says
 * series 2 carries information about where series 1 goes next.
 *
 * Gap: the source takes its second series from request.security on another
 * ticker (default SPY). There is no cross-symbol request here, so the second
 * series is a source of the chart's own symbol.
 */

export default function ({ registerIndicator, sourceValues, nulls }) {
  // The source builds each statistic from its own circular buffer, so every
  // call site keeps a separate window. Each helper below is one such window.

  // _mean: the average of the values present in the last `len` bars. The window
  // expands from the first bar, and an na occupies a slot without counting.
  const rollingMean = (values, len) => {
    const n = values.length
    const out = new Array(n).fill(NaN)
    const buf = new Array(len).fill(NaN)
    let head = 0
    let count = 0
    let sum = 0
    for (let i = 0; i < n; i++) {
      const oldest = buf[head]
      if (Number.isFinite(oldest)) {
        sum -= oldest
        count -= 1
      }
      const v = values[i]
      if (Number.isFinite(v)) {
        sum += v
        count += 1
        buf[head] = v
      } else {
        buf[head] = NaN
      }
      head = (head + 1) % len
      out[i] = count > 0 ? sum / count : NaN
    }
    return out
  }

  // _variance: the buffer holds deviations measured against the mean as it stood
  // on the bar each one entered, not against the current mean. nz(src) makes a
  // missing value 0, and fewer than two deviations reports 0.0, not na.
  const rollingVariance = (values, len, means) => {
    const n = values.length
    const out = new Array(n).fill(0)
    const buf = new Array(len).fill(NaN)
    let head = 0
    let count = 0
    let sumSqDev = 0
    for (let i = 0; i < n; i++) {
      const val = Number.isFinite(values[i]) ? values[i] : 0
      const mean = means[i]
      const dev = Number.isFinite(mean) ? val - mean : NaN
      const oldest = buf[head]
      if (Number.isFinite(oldest)) {
        sumSqDev -= oldest * oldest
        count -= 1
      }
      if (Number.isFinite(dev)) {
        sumSqDev += dev * dev
        count += 1
        buf[head] = dev
      } else {
        buf[head] = NaN
      }
      head = (head + 1) % len
      out[i] = count > 1 ? sumSqDev / count : 0
    }
    return out
  }

  // _covariance: the same frozen-deviation window over a pair of series. A bar
  // enters only when both deviations are available.
  const rollingCovariance = (values1, values2, len, means1, means2) => {
    const n = values1.length
    const out = new Array(n).fill(NaN)
    const buf1 = new Array(len).fill(NaN)
    const buf2 = new Array(len).fill(NaN)
    let head = 0
    let count = 0
    let sumProdDev = 0
    for (let i = 0; i < n; i++) {
      const dev1 =
        Number.isFinite(values1[i]) && Number.isFinite(means1[i]) ? values1[i] - means1[i] : NaN
      const dev2 =
        Number.isFinite(values2[i]) && Number.isFinite(means2[i]) ? values2[i] - means2[i] : NaN

      const oldest1 = buf1[head]
      const oldest2 = buf2[head]
      if (Number.isFinite(oldest1) && Number.isFinite(oldest2)) {
        sumProdDev -= oldest1 * oldest2
        count -= 1
      }
      if (Number.isFinite(dev1) && Number.isFinite(dev2)) {
        sumProdDev += dev1 * dev2
        count += 1
        buf1[head] = dev1
        buf2[head] = dev2
      } else {
        buf1[head] = NaN
        buf2[head] = NaN
      }
      head = (head + 1) % len
      out[i] = count > 1 ? sumProdDev / count : NaN
    }
    return out
  }

  registerIndicator({
    id: 'oa-granger',
    name: 'Granger Causality Test (GRANGER)',
    category: 'Statistics',
    placement: 'pane',

    inputs: [
      { key: 'source1', type: 'source', label: 'Source 1', default: 'close' },
      {
        key: 'source2',
        type: 'source',
        label: 'Source 2',
        default: 'volume',
        tooltip:
          'The source Pine read from another ticker. Only the chart symbol is available here, so pick a second series from it.',
      },
      {
        key: 'period',
        type: 'number',
        label: 'Period',
        default: 20,
        min: 4,
        max: 5000,
        step: 1,
        tooltip: 'Lookback for the regressions. The test needs more than three observations for one lag.',
      },
    ],

    plots: [
      {
        key: 'fstat',
        type: 'line',
        title: 'F-Stat (X Granger-causes Y)',
        style: { color: '#ffeb3b', lineWidth: 2 },
      },
    ],

    calc(bars, settings) {
      // A cleared number field arrives as '', and Number('') is 0. The source
      // raises a runtime error at or below three observations, so the floor is 4.
      const period = Math.max(4, Math.floor(Number(settings.period) || 20))
      const y = sourceValues(bars, settings.source1 || 'close')
      const x = sourceValues(bars, settings.source2 || 'volume')
      const n = bars.length

      // Lag 1 of each series: na on the first bar, as x[1] is in Pine.
      const yLag1 = new Array(n).fill(NaN)
      const xLag1 = new Array(n).fill(NaN)
      for (let i = 1; i < n; i++) {
        yLag1[i] = y[i - 1]
        xLag1[i] = x[i - 1]
      }

      const meanY = rollingMean(y, period)
      const meanYLag1 = rollingMean(yLag1, period)
      const meanXLag1 = rollingMean(xLag1, period)

      const varYLag1 = rollingVariance(yLag1, period, meanYLag1)
      const varXLag1 = rollingVariance(xLag1, period, meanXLag1)

      const covYYlag1 = rollingCovariance(y, yLag1, period, meanY, meanYLag1)
      const covYXlag1 = rollingCovariance(y, xLag1, period, meanY, meanXLag1)
      const covYlag1Xlag1 = rollingCovariance(yLag1, xLag1, period, meanYLag1, meanXLag1)

      // The source declares its residual accumulators with `var`, so they are
      // created once and keep adding across every bar rather than resetting per
      // bar. Both sums of squares therefore run cumulatively and the F-ratio is
      // taken between the two running totals. The port carries that state the
      // same way, because that is what the published script plots.
      let sumSqResid1 = 0
      let countResid1 = 0
      let sumSqResid2 = 0
      let countResid2 = 0

      const out = new Array(n).fill(NaN)

      for (let i = 0; i < n; i++) {
        const varY = varYLag1[i]
        const varX = varXLag1[i]
        const covYX = covYlag1Xlag1[i]
        const covYY = covYYlag1[i]
        const covYXl = covYXlag1[i]

        // Restricted model: y_t = c0 + c1 * y_lag1_t
        let slopeRestricted = NaN
        if (Number.isFinite(varY) && varY > 1e-10) slopeRestricted = covYY / varY

        let interceptRestricted = NaN
        if (Number.isFinite(slopeRestricted)) {
          interceptRestricted = meanY[i] - slopeRestricted * meanYLag1[i]
        }

        let ssr1 = NaN
        if (Number.isFinite(interceptRestricted)) {
          for (let k = 0; k < period; k++) {
            const idx = i - k
            if (idx < 0) continue
            const yVal = y[idx]
            const yLagVal = yLag1[idx]
            if (!Number.isFinite(yVal) || !Number.isFinite(yLagVal)) continue
            const resid = yVal - (interceptRestricted + slopeRestricted * yLagVal)
            sumSqResid1 += resid * resid
            countResid1 += 1
          }
          if (countResid1 > 1) ssr1 = sumSqResid1
        }

        // Unrestricted model: y_t = d0 + d1 * y_lag1_t + d2 * x_lag1_t
        let b1 = NaN
        let b2 = NaN
        let interceptUnrestricted = NaN
        if (Number.isFinite(varY) && Number.isFinite(varX) && Number.isFinite(covYX)) {
          const denominator = varY * varX - covYX * covYX
          if (denominator > 1e-10 && Number.isFinite(covYY) && Number.isFinite(covYXl)) {
            b1 = (covYY * varX - covYXl * covYX) / denominator
            b2 = (covYXl * varY - covYY * covYX) / denominator
            if (Number.isFinite(b1) && Number.isFinite(b2)) {
              interceptUnrestricted = meanY[i] - b1 * meanYLag1[i] - b2 * meanXLag1[i]
            }
          }
        }

        let ssr2 = NaN
        if (Number.isFinite(interceptUnrestricted)) {
          for (let k = 0; k < period; k++) {
            const idx = i - k
            if (idx < 0) continue
            const yVal = y[idx]
            const yLagVal = yLag1[idx]
            const xLagVal = xLag1[idx]
            if (!Number.isFinite(yVal) || !Number.isFinite(yLagVal) || !Number.isFinite(xLagVal)) continue
            const resid = yVal - (interceptUnrestricted + b1 * yLagVal + b2 * xLagVal)
            sumSqResid2 += resid * resid
            countResid2 += 1
          }
          if (countResid2 > 1) ssr2 = sumSqResid2
        }

        // One restriction (d2 = 0) against three unrestricted parameters.
        if (Number.isFinite(ssr1) && Number.isFinite(ssr2) && ssr2 > 1e-10 && period - 3 > 0) {
          const f = (ssr1 - ssr2) / (ssr2 / (period - 3))
          out[i] = Math.max(0, f)
        }
      }

      return { fstat: nulls(out) }
    },
  })
}
