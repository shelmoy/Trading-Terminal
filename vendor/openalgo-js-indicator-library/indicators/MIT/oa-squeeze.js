/**
 * Squeeze Momentum (SQUEEZE) - ported to openalgo-charts from Pine Script v6.
 *
 * Source: https://github.com/mihakralj/pinescript/blob/c4e91b962be09733d8fc76caa5191e9e586c5cee/indicators/oscillators/squeeze.pine
 * Repo:   mihakralj/pinescript
 * License: MIT (c) mihakralj
 * SPDX-FileCopyrightText: (c) mihakralj
 * SPDX-FileCopyrightText: (c) 2026 marketcalls (port to openalgo-charts)
 * SPDX-License-Identifier: MIT
 *
 * Marks the low-volatility compressions where the Bollinger Bands sit wholly
 * inside the Keltner Channel, and measures the direction of the coming release
 * with a linear regression of price against the Donchian and SMA midpoint.
 */

export default function ({ registerIndicator, sourceValues, nulls }) {
  // Pine v6 named colour constants.
  const LIME = '#00e676'
  const GREEN = '#4caf50'
  const RED = '#ff5252'
  const MAROON = '#880e4f'
  const GRAY = '#787b86'

  // Rolling max or min over the last `period` bars, partial windows included,
  // which is what the circular buffer scan in the source produces.
  const rollingExtreme = (values, period, isMax) => {
    const out = new Array(values.length).fill(NaN)
    const deque = []
    for (let i = 0; i < values.length; i++) {
      const current = values[i]
      while (deque.length > 0 && deque[0] <= i - period) deque.shift()
      if (Number.isFinite(current)) {
        while (
          deque.length > 0 &&
          (isMax
            ? values[deque[deque.length - 1]] <= current
            : values[deque[deque.length - 1]] >= current)
        ) {
          deque.pop()
        }
        deque.push(i)
      }
      out[i] = deque.length > 0 ? values[deque[0]] : NaN
    }
    return out
  }

  registerIndicator({
    id: 'oa-squeeze',
    name: 'Squeeze Momentum (SQUEEZE)',
    category: 'Oscillators',
    placement: 'pane',

    inputs: [
      { key: 'source', type: 'source', label: 'Source', default: 'close' },
      { key: 'period', type: 'number', label: 'Period', default: 20, min: 1, max: 5000, step: 1 },
      { key: 'bbMult', type: 'number', label: 'BB Multiplier', default: 2, min: 0.001, max: 100, step: 0.1 },
      { key: 'kcMult', type: 'number', label: 'KC Multiplier', default: 1.5, min: 0.001, max: 100, step: 0.1 },
    ],

    plots: [
      {
        key: 'momentum',
        type: 'histogram',
        title: 'Momentum',
        style: { color: GREEN, lineWidth: 2, base: 0 },
        colorBy({ value, index, values }) {
          if (!Number.isFinite(value)) return GREEN
          // Pine nz(mom[1]): the first bar compares against zero.
          const raw = index > 0 ? values.momentum[index - 1] : null
          const prev = Number.isFinite(raw) ? raw : 0
          if (value > 0) return value > prev ? LIME : GREEN
          return value < prev ? RED : MAROON
        },
      },
      {
        key: 'squeezeOn',
        type: 'line-markers',
        title: 'Squeeze On',
        style: { color: RED, markersOnly: true, markerRadius: 3 },
      },
      {
        key: 'squeezeOff',
        type: 'line-markers',
        title: 'Squeeze Off',
        style: { color: LIME, markersOnly: true, markerRadius: 3 },
      },
    ],

    levels: () => [{ price: 0, title: 'Zero', color: GRAY }],

    calc(bars, settings) {
      // A cleared number field arrives as '', and Number('') is 0.
      const period = Math.max(1, Math.floor(Number(settings.period) || 20))
      const bbMult = Math.max(0.001, Number(settings.bbMult) || 2)
      const kcMult = Math.max(0.001, Number(settings.kcMult) || 1.5)
      const src = sourceValues(bars, settings.source ?? 'close')

      const EPSILON = 1e-10
      const n = bars.length

      const highs = new Array(n)
      const lows = new Array(n)
      for (let i = 0; i < n; i++) {
        highs[i] = Number(bars[i].high)
        lows[i] = Number(bars[i].low)
      }
      const donHighest = rollingExtreme(highs, period, true)
      const donLowest = rollingExtreme(lows, period, false)

      const momentum = new Array(n).fill(NaN)
      const squeezeOn = new Array(n).fill(NaN)
      const squeezeOff = new Array(n).fill(NaN)

      // SMA and variance from running sums over a circular buffer.
      const smaBuf = new Array(period).fill(NaN)
      let smaHead = 0
      let smaSum = 0
      let smaSumSq = 0
      let smaCount = 0

      // EMA and Wilder RMA, each with the exponential warmup compensator the
      // source uses so both read correctly from the very first bar.
      let rawEma = 0
      let eEma = 1
      const emaAlpha = 2 / (period + 1)
      const emaBeta = 1 - emaAlpha

      let prevClose = NaN
      let rawRma = 0
      let eRma = 1
      const rmaAlpha = 1 / period
      const rmaBeta = 1 - rmaAlpha

      // Linear regression of the delta series from incremental running sums.
      const lrBuf = new Array(period).fill(NaN)
      let lrHead = 0
      let sumY = 0
      let sumXY = 0
      let lrCount = 0

      const squares = (m) => (m < 0 ? 0 : (m * (m + 1) * (2 * m + 1)) / 6)

      for (let i = 0; i < n; i++) {
        const high = highs[i]
        const low = lows[i]
        const close = Number(bars[i].close)
        const srcVal = Number.isFinite(src[i]) ? src[i] : 0

        const oldSma = smaBuf[smaHead]
        if (Number.isFinite(oldSma)) {
          smaSum -= oldSma
          smaSumSq -= oldSma * oldSma
        } else {
          smaCount += 1
        }
        smaSum += srcVal
        smaSumSq += srcVal * srcVal
        smaBuf[smaHead] = srcVal
        smaHead = (smaHead + 1) % period

        const count = Math.max(1, smaCount)
        const smaVal = smaSum / count
        const variance = Math.max(0, smaSumSq / count - smaVal * smaVal)
        const stddev = Math.sqrt(variance)
        const bbUpper = smaVal + bbMult * stddev
        const bbLower = smaVal - bbMult * stddev

        rawEma = rawEma * emaBeta + srcVal * emaAlpha
        eEma *= emaBeta
        const cEma = eEma > EPSILON && eEma < 1 ? 1 / (1 - eEma) : 1
        const emaVal = rawEma * cEma

        let tr = high - low
        if (Number.isFinite(prevClose)) {
          tr = Math.max(tr, Math.max(Math.abs(high - prevClose), Math.abs(low - prevClose)))
        }
        prevClose = close
        // A bar with no usable range leaves the average holding its last value
        // rather than poisoning every later bar with NaN.
        if (Number.isFinite(tr)) {
          rawRma = rawRma * rmaBeta + tr * rmaAlpha
          eRma *= rmaBeta
        }
        const cRma = eRma > EPSILON && eRma < 1 ? 1 / (1 - eRma) : 1
        const atrVal = rawRma * cRma

        const kcUpper = emaVal + kcMult * atrVal
        const kcLower = emaVal - kcMult * atrVal
        const isSqueezed = bbUpper < kcUpper && bbLower > kcLower

        const donMid = (donHighest[i] + donLowest[i]) / 2
        const delta = srcVal - (donMid + smaVal) / 2

        const oldLr = lrBuf[lrHead]
        if (Number.isFinite(oldLr)) {
          const oldIdx = lrCount - period
          sumY -= oldLr
          sumXY -= oldIdx * oldLr
        }
        sumY += delta
        sumXY += lrCount * delta
        lrBuf[lrHead] = delta
        lrHead = (lrHead + 1) % period
        lrCount += 1

        const pn = Math.min(lrCount, period)
        const startIdx = lrCount - pn
        const sumX = (pn * (startIdx + startIdx + pn - 1)) / 2
        // Closed form of the loop the source runs over the window x values.
        const sumX2 = squares(startIdx + pn - 1) - squares(startIdx - 1)

        const denomX = pn * sumX2 - sumX * sumX
        const slope = denomX === 0 ? 0 : (pn * sumXY - sumX * sumY) / denomX
        const intercept = (sumY - slope * sumX) / pn
        const mom = slope * (lrCount - 1) + intercept

        momentum[i] = Number.isFinite(mom) ? mom : NaN
        squeezeOn[i] = isSqueezed ? 0 : NaN
        squeezeOff[i] = isSqueezed ? NaN : 0
      }

      return {
        momentum: nulls(momentum),
        squeezeOn: nulls(squeezeOn),
        squeezeOff: nulls(squeezeOff),
      }
    },
  })
}
