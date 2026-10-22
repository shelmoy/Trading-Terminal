/**
 * Composite Fractal Behavior (CFB) - ported to openalgo-charts from Pine Script v6.
 *
 * Source: https://github.com/mihakralj/pinescript/blob/c4e91b962be09733d8fc76caa5191e9e586c5cee/indicators/momentum/cfb.pine
 * Repo:   mihakralj/pinescript
 * License: MIT (c) mihakralj
 * SPDX-FileCopyrightText: (c) mihakralj
 * SPDX-FileCopyrightText: (c) 2026 marketcalls (port to openalgo-charts)
 * SPDX-License-Identifier: MIT
 *
 * Measures how price fills space over a ladder of lookbacks and blends the
 * ladder into one dominant cycle length in bars, double smoothed with a Jurik
 * moving average.
 */

export default function ({ registerIndicator, sourceValues, nulls }) {
  // Pine's hlcc4 is not one of the chart's canonical sources, so it is built
  // here and the rest are read from the library.
  const sourceColumn = (bars, key) => {
    if (key !== 'hlcc4') return sourceValues(bars, key)
    const out = new Array(bars.length).fill(NaN)
    for (let i = 0; i < bars.length; i++) {
      const h = Number(bars[i].high)
      const l = Number(bars[i].low)
      const c = Number(bars[i].close)
      if (!Number.isFinite(h) || !Number.isFinite(l) || !Number.isFinite(c)) continue
      out[i] = (h + l + c + c) / 4
    }
    return out
  }

  /**
   * Jurik moving average, one independent state per call, as a Pine call site
   * would have. The power parameter is the Pine default of 0.45.
   */
  const jma = (values, period, phase) => {
    const power = 0.45
    const phaseRatio = Math.min(Math.max(phase * 0.01 + 1.5, 0.5), 2.5)
    const beta = (power * (period - 1)) / (power * (period - 1) + 2)
    const len1 = Math.max(Math.log(Math.sqrt(0.5 * (period - 1))) / Math.log(2.0) + 2.0, 0.0)
    const pow1 = Math.max(len1 - 2.0, 0.5)
    const len2 = Math.sqrt(0.5 * (period - 1)) * len1
    const alphaVolty = 2.0 / (Math.max(4.0 * period, 65.0) + 1.0)
    const div = 1.0 / (10.0 + (10.0 * Math.min(Math.max(period - 10, 0), 100)) / 100.0)
    const rvoltyCap = Math.pow(len1, 1.0 / pow1)

    let upperBand = NaN
    let lowerBand = NaN
    let ma1 = NaN
    let jmaVal = NaN
    let vSum = 0.0
    let det0 = 0.0
    let det1 = 0.0
    let avgVolty = NaN
    const voltyArray = new Array(11).fill(0.0)

    const out = new Array(values.length).fill(NaN)
    for (let i = 0; i < values.length; i++) {
      const src = values[i]
      if (!Number.isFinite(src)) {
        // Pine updates the state only when the source is not na, and returns
        // whatever the running value already was.
        out[i] = jmaVal
        continue
      }

      const del1 = src - (Number.isFinite(upperBand) ? upperBand : src)
      const del2 = src - (Number.isFinite(lowerBand) ? lowerBand : src)
      const volty = Math.abs(del1) === Math.abs(del2) ? 0.0 : Math.max(Math.abs(del1), Math.abs(del2))

      voltyArray.unshift(volty)
      voltyArray.pop()
      // Index 10 now holds the volty of ten bars ago.
      vSum = vSum + (volty - voltyArray[10]) * div
      avgVolty = Number.isFinite(avgVolty) ? avgVolty + alphaVolty * (vSum - avgVolty) : vSum

      const ratio = avgVolty > 0 ? volty / avgVolty : 1.0
      const rvolty = Math.min(Math.max(ratio, 1.0), rvoltyCap)
      const pow2 = Math.pow(rvolty, pow1)
      const kv = Math.pow(len2 / (len2 + 1), Math.sqrt(pow2))

      upperBand = del1 > 0 ? src : src - kv * del1
      lowerBand = del2 < 0 ? src : src - kv * del2

      const alphaAdapt = Math.pow(beta, pow2)
      const prevMa1 = Number.isFinite(ma1) ? ma1 : src
      ma1 = src + alphaAdapt * (prevMa1 - src)
      det0 = (src - ma1) * (1 - beta) + beta * det0
      const ma2 = ma1 + phaseRatio * det0
      const prevJma = Number.isFinite(jmaVal) ? jmaVal : src
      det1 = (ma2 - prevJma) * (1 - alphaAdapt) * (1 - alphaAdapt) + alphaAdapt * alphaAdapt * det1
      jmaVal = prevJma + det1
      out[i] = jmaVal
    }
    return out
  }

  registerIndicator({
    id: 'oa-cfb',
    name: 'Composite Fractal Behavior (CFB)',
    category: 'Momentum',
    placement: 'pane',

    inputs: [
      {
        key: 'source',
        type: 'select',
        label: 'Source',
        default: 'hlcc4',
        options: [
          { label: 'HLCC4', value: 'hlcc4' },
          { label: 'Close', value: 'close' },
          { label: 'Open', value: 'open' },
          { label: 'High', value: 'high' },
          { label: 'Low', value: 'low' },
          { label: 'HL2', value: 'hl2' },
          { label: 'HLC3', value: 'hlc3' },
          { label: 'OHLC4', value: 'ohlc4' },
        ],
        tooltip: 'The Pine default is hlcc4, which the standard source picker does not carry.',
      },
      { key: 'depth', type: 'number', label: 'CFB Depth', default: 10, min: 1, max: 10, step: 1 },
      { key: 'length', type: 'number', label: 'Smooth Length', default: 8, min: 1, max: 5000, step: 1 },
      { key: 'jmaPeriod', type: 'number', label: 'JMA Period', default: 5, min: 1, max: 5000, step: 1 },
      { key: 'jmaPhase', type: 'number', label: 'JMA Phase', default: 0, min: -100, max: 100, step: 1 },
    ],

    plots: [{ key: 'cfb', type: 'line', title: 'CFB', style: { color: '#ffeb3b', lineWidth: 2 } }],

    calc(bars, settings) {
      // A cleared number field arrives as '', and Number('') is 0.
      const depth = Math.min(10, Math.max(1, Math.floor(Number(settings.depth) || 10)))
      const length = Math.max(1, Math.floor(Number(settings.length) || 8))
      const jmaPeriod = Math.max(1, Math.floor(Number(settings.jmaPeriod) || 5))
      const jmaPhase = Math.min(100, Math.max(-100, Math.floor(Number(settings.jmaPhase) || 0)))
      const src = sourceColumn(bars, settings.source ?? 'hlcc4')

      const n = bars.length
      // Pine stores nz(source) in the ring buffer, so a missing value is 0.
      const s = new Float64Array(n)
      for (let i = 0; i < n; i++) s[i] = Number.isFinite(src[i]) ? src[i] : 0

      const numDepths = depth * 2
      const maxSize = Math.trunc(2 + Math.pow(2, depth - 1) * depth * 2)

      const periods = new Array(numDepths).fill(0)
      let cumSum = 2
      for (let i = 0; i < numDepths; i++) {
        periods[i] = cumSum
        cumSum += Math.pow(2, Math.floor(i / 2))
      }

      // var arrays in Pine: they start at 0.0 and carry across bars.
      const smoothed = new Float64Array(numDepths)
      const weighted = new Float64Array(numDepths)
      const alpha = 2.0 / (length + 1)

      const raw = new Array(n).fill(NaN)

      for (let k = 0; k < n; k++) {
        // Pine pushes the bar into the ring buffer before reading it, so after
        // the push the head sits one past the current bar and count is how many
        // slots have ever been written.
        const pushed = k + 1
        const count = Math.min(pushed, maxSize)

        for (let d = 0; d < numDepths; d++) {
          const period = periods[d]
          const effectiveDepth = Math.min(period, count - 1)
          let aux = 0.0
          if (effectiveDepth > 0) {
            let sumWeighted = 0.0
            let sumLevel = 0.0
            for (let i = 0; i < effectiveDepth; i++) {
              // Slot (head - effectiveDepth + i) holds bar b1, and the slot
              // after it holds bar b1 + 1 until the read runs one past the
              // current bar, where it finds the oldest surviving value.
              const b1 = pushed - effectiveDepth + i
              const b2 = b1 + 1
              const val1 = s[b1]
              const val2 = b2 < pushed ? s[b2] : pushed >= maxSize ? s[pushed - maxSize] : 0
              const absDiff = Math.abs(val1 - val2)
              sumWeighted += absDiff * (effectiveDepth - i)
              sumLevel += val2
            }
            const levelCompare = Math.abs(effectiveDepth * s[k] - sumLevel)
            const result = sumWeighted > 0.0 ? levelCompare / sumWeighted : 0.0
            aux = result * ((effectiveDepth + 1) / (period + 1))
          }
          // The previous smoothed value is seeded at 0.0, never na, so this is
          // always the exponential branch of the Pine source.
          smoothed[d] = alpha * aux + (1 - alpha) * smoothed[d]
        }

        let factorA = 1.0
        let factorB = 1.0
        for (let d = 0; d < numDepths; d++) {
          const smoothVal = smoothed[d]
          if (d % 2 === 0) {
            weighted[d] = factorB * smoothVal
            factorB = factorB * (1.0 - smoothVal)
          } else {
            weighted[d] = factorA * smoothVal
            factorA = factorA * (1.0 - smoothVal)
          }
        }

        let sumSq = 0.0
        let sumWeightedSq = 0.0
        for (let d = 0; d < numDepths; d++) {
          const w = weighted[d]
          const wSq = w * w
          sumSq += wSq
          sumWeightedSq += wSq * periods[d]
        }

        const blended = sumSq > 0.0 ? sumWeightedSq / sumSq : 0.0
        raw[k] = Math.max(1.0, blended)
      }

      // Two separate Pine call sites, so two independent JMA states.
      const smoothedOnce = jma(raw, jmaPeriod, jmaPhase)
      const smoothedTwice = jma(smoothedOnce, jmaPeriod, jmaPhase)

      const out = new Array(n).fill(NaN)
      for (let i = 0; i < n; i++) {
        if (!Number.isFinite(smoothedTwice[i])) continue
        out[i] = Math.max(1, Math.ceil(smoothedTwice[i]))
      }

      return { cfb: nulls(out) }
    },
  })
}
