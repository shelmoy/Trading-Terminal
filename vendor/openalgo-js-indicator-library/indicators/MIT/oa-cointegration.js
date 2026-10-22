/**
 * Cointegration (COINTEGRATION) - ported to openalgo-charts from Pine Script v6.
 *
 * Source: https://github.com/mihakralj/pinescript/blob/c4e91b962be09733d8fc76caa5191e9e586c5cee/indicators/statistics/cointegration.pine
 * Repo:   mihakralj/pinescript
 * License: MIT (c) mihakralj
 * SPDX-FileCopyrightText: (c) mihakralj
 * SPDX-FileCopyrightText: (c) 2026 marketcalls (port to openalgo-charts)
 * SPDX-License-Identifier: MIT
 *
 * Engle-Granger in two steps: regress series A on series B over the lookback,
 * then run an Augmented Dickey-Fuller test on the residuals. The plot is that
 * test statistic, so the more negative it is the stronger the evidence that the
 * two series are cointegrated rather than merely drifting together.
 *
 * Pine pulls series B from another ticker with request.security (default SPY).
 * A chart study is handed the bars of one symbol only, so series B is a second
 * price source on the current symbol here and the cross-symbol test is not
 * expressible. Everything downstream of the two series is the source maths,
 * unchanged.
 */

export default function ({ registerIndicator, sourceValues, nulls }) {
  // The source ships its own rolling helpers rather than using ta.*, and they
  // differ from ta.sma / ta.stdev / ta.correlation in warmup: each emits from
  // the first bar over however many values it has so far, instead of holding na
  // until the window is full. The ports below keep that behaviour.

  /** Mean of the last `period` values, falling back to the raw value. */
  const rollingMean = (values, period) => {
    const p = Math.max(1, Math.floor(period))
    const buffer = new Array(p).fill(NaN)
    const out = new Array(values.length).fill(NaN)
    let head = 0
    let sum = 0
    let validCount = 0
    for (let i = 0; i < values.length; i++) {
      const oldest = buffer[head]
      if (Number.isFinite(oldest)) {
        sum -= oldest
        validCount -= 1
      }
      const value = values[i]
      if (Number.isFinite(value)) {
        sum += value
        validCount += 1
      }
      buffer[head] = value
      head = (head + 1) % p
      const mean = validCount > 0 ? sum / validCount : NaN
      // Pine: nz(sum / valid_count, source)
      out[i] = Number.isFinite(mean) ? mean : value
    }
    return out
  }

  /** Population standard deviation over the window, 0 until two values are in. */
  const rollingStdev = (values, period) => {
    const p = Math.max(1, Math.floor(period))
    const buffer = new Array(p).fill(NaN)
    const out = new Array(values.length).fill(NaN)
    let head = 0
    let count = 0
    let sum = 0
    let sumSq = 0
    for (let i = 0; i < values.length; i++) {
      const oldest = buffer[head]
      if (Number.isFinite(oldest)) {
        sum -= oldest
        sumSq -= oldest * oldest
        count -= 1
      }
      // Pine: nz(src), so a missing value counts as a zero here.
      const value = Number.isFinite(values[i]) ? values[i] : 0
      sum += value
      sumSq += value * value
      count += 1
      buffer[head] = value
      head = (head + 1) % p
      out[i] = count > 1 ? Math.sqrt(Math.max(0, sumSq / count - Math.pow(sum / count, 2))) : 0
    }
    return out
  }

  /** Population correlation over the window, na until two paired values are in. */
  const rollingCorrelation = (first, second, period) => {
    const p = Math.max(1, Math.floor(period))
    const bufferA = new Array(p).fill(NaN)
    const bufferB = new Array(p).fill(NaN)
    const out = new Array(first.length).fill(NaN)
    let head = 0
    let count = 0
    let sumA = 0
    let sumB = 0
    let sumSqA = 0
    let sumSqB = 0
    let sumProd = 0
    for (let i = 0; i < first.length; i++) {
      const oldA = bufferA[head]
      const oldB = bufferB[head]
      if (Number.isFinite(oldA) && Number.isFinite(oldB)) {
        sumA -= oldA
        sumB -= oldB
        sumSqA -= oldA * oldA
        sumSqB -= oldB * oldB
        sumProd -= oldA * oldB
        count -= 1
      }
      const a = first[i]
      const b = second[i]
      if (Number.isFinite(a) && Number.isFinite(b)) {
        sumA += a
        sumB += b
        sumSqA += a * a
        sumSqB += b * b
        sumProd += a * b
        count += 1
        bufferA[head] = a
        bufferB[head] = b
      } else {
        bufferA[head] = NaN
        bufferB[head] = NaN
      }
      head = (head + 1) % p
      if (count > 1) {
        const meanA = sumA / count
        const meanB = sumB / count
        const covariance = sumProd / count - meanA * meanB
        const sdA = Math.sqrt(Math.max(0, sumSqA / count - meanA * meanA))
        const sdB = Math.sqrt(Math.max(0, sumSqB / count - meanB * meanB))
        const denominator = sdA * sdB
        out[i] = denominator !== 0 ? covariance / denominator : NaN
      }
    }
    return out
  }

  registerIndicator({
    id: 'oa-cointegration',
    name: 'Cointegration (COINTEGRATION)',
    category: 'Statistics',
    placement: 'pane',

    inputs: [
      { key: 'source1', type: 'source', label: 'Source 1', default: 'close' },
      {
        key: 'source2',
        type: 'source',
        label: 'Source 2',
        default: 'open',
        tooltip:
          'Series B of the pair. Pine reads this from a second ticker, which a chart study cannot fetch, so it is a second source on this symbol.',
      },
      { key: 'period', type: 'number', label: 'Period', default: 20, min: 2, max: 5000, step: 1 },
    ],

    plots: [
      {
        key: 'coint',
        type: 'line',
        title: 'Cointegration ADF Stat',
        style: { color: '#ffeb3b', lineWidth: 2 },
      },
    ],

    calc(bars, settings) {
      // A cleared number field arrives as '', and Number('') is 0. Pine requires
      // a period above 1 because the ADF regression runs over period - 1 values.
      const period = Math.max(2, Math.floor(Number(settings.period) || 20))
      const window = period - 1
      const seriesA = sourceValues(bars, settings.source1 ?? 'close')
      const seriesB = sourceValues(bars, settings.source2 ?? 'open')

      const correlation = rollingCorrelation(seriesA, seriesB, period)
      const sdA = rollingStdev(seriesA, period)
      const sdB = rollingStdev(seriesB, period)
      const meanA = rollingMean(seriesA, period)
      const meanB = rollingMean(seriesB, period)

      const residuals = new Array(bars.length).fill(NaN)
      for (let i = 0; i < bars.length; i++) {
        if (!Number.isFinite(correlation[i]) || !Number.isFinite(sdA[i])) continue
        // A flat series B leaves beta undefined rather than infinite.
        if (!Number.isFinite(sdB[i]) || sdB[i] === 0) continue
        if (!Number.isFinite(meanA[i]) || !Number.isFinite(meanB[i])) continue
        const beta = correlation[i] * (sdA[i] / sdB[i])
        const alpha = meanA[i] - beta * meanB[i]
        residuals[i] = seriesA[i] - (alpha + beta * seriesB[i])
      }

      // Pine: delta = residuals - nz(residuals[1]), lagged = nz(residuals[1]).
      const delta = new Array(bars.length).fill(NaN)
      const lagged = new Array(bars.length).fill(NaN)
      for (let i = 0; i < bars.length; i++) {
        const previous = i > 0 && Number.isFinite(residuals[i - 1]) ? residuals[i - 1] : 0
        lagged[i] = previous
        delta[i] = Number.isFinite(residuals[i]) ? residuals[i] - previous : NaN
      }

      const deltaTimesLagged = new Array(bars.length).fill(NaN)
      const laggedSquared = new Array(bars.length).fill(NaN)
      for (let i = 0; i < bars.length; i++) {
        deltaTimesLagged[i] = delta[i] * lagged[i]
        laggedSquared[i] = lagged[i] * lagged[i]
      }

      const meanDeltaLagged = rollingMean(deltaTimesLagged, window)
      const meanDelta = rollingMean(delta, window)
      const meanLagged = rollingMean(lagged, window)
      const meanLaggedSquared = rollingMean(laggedSquared, window)

      const gamma = new Array(bars.length).fill(NaN)
      const gammaDenominator = new Array(bars.length).fill(NaN)
      const regressionError = new Array(bars.length).fill(NaN)
      for (let i = 0; i < bars.length; i++) {
        const numerator = meanDeltaLagged[i] - meanDelta[i] * meanLagged[i]
        const denominator = meanLaggedSquared[i] - Math.pow(meanLagged[i], 2)
        gammaDenominator[i] = denominator
        if (!Number.isFinite(numerator) || !Number.isFinite(denominator)) continue
        if (denominator === 0) continue
        gamma[i] = numerator / denominator
        regressionError[i] = delta[i] - gamma[i] * lagged[i]
      }

      const squaredError = new Array(bars.length).fill(NaN)
      for (let i = 0; i < bars.length; i++) {
        squaredError[i] = regressionError[i] * regressionError[i]
      }
      const meanSquaredError = rollingMean(squaredError, window)

      const out = new Array(bars.length).fill(NaN)
      for (let i = 0; i < bars.length; i++) {
        const denominator = gammaDenominator[i]
        if (!Number.isFinite(meanSquaredError[i])) continue
        if (!Number.isFinite(denominator) || denominator === 0) continue
        const seGammaSquared = meanSquaredError[i] / denominator
        // Pine: na or a non-positive variance leaves the statistic undefined.
        if (!Number.isFinite(seGammaSquared) || seGammaSquared <= 0) continue
        const seGamma = Math.sqrt(seGammaSquared)
        if (!Number.isFinite(seGamma) || seGamma === 0) continue
        if (!Number.isFinite(gamma[i])) continue
        out[i] = gamma[i] / seGamma
      }

      return { coint: nulls(out) }
    },
  })
}
