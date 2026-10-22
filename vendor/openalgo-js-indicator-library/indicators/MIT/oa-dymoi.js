/**
 * Dynamic Momentum Index (DYMOI) - ported to openalgo-charts from Pine Script v6.
 *
 * Source: https://github.com/mihakralj/pinescript/blob/c4e91b962be09733d8fc76caa5191e9e586c5cee/indicators/oscillators/dymoi.pine
 * Repo:   mihakralj/pinescript
 * License: MIT (c) mihakralj
 * SPDX-FileCopyrightText: (c) mihakralj
 * SPDX-FileCopyrightText: (c) 2026 marketcalls (port to openalgo-charts)
 * SPDX-License-Identifier: MIT
 *
 * Chande and Kroll's volatility adaptive RSI: the ratio of a short to a long
 * standard deviation shortens the lookback when price is moving and lengthens
 * it when price is quiet, and a Wilder RSI is run at that changing period.
 */

export default function ({ registerIndicator, sourceValues, nulls }) {
  // Population standard deviation over a circular buffer, exactly as Pine's
  // stddev_circ: before the window is full it uses however many bars exist.
  const stddevCirc = (values, period) => {
    const out = new Array(values.length).fill(NaN)
    const buf = new Array(period).fill(NaN)
    let head = 0
    let count = 0
    let sumV = 0
    let sumSq = 0

    for (let i = 0; i < values.length; i++) {
      const oldest = buf[head]
      if (Number.isFinite(oldest)) {
        sumV -= oldest
        sumSq -= oldest * oldest
      }
      const val = Number.isFinite(values[i]) ? values[i] : 0
      buf[head] = val
      sumV += val
      sumSq += val * val
      head = (head + 1) % period
      if (count < period) count += 1

      const mean = sumV / count
      const variance = sumSq / count - mean * mean
      out[i] = variance > 0 ? Math.sqrt(variance) : 0
    }
    return out
  }

  registerIndicator({
    id: 'oa-dymoi',
    name: 'Dynamic Momentum Index (DYMOI)',
    category: 'Oscillators',
    placement: 'pane',

    inputs: [
      { key: 'basePeriod', type: 'number', label: 'Base RSI Period', default: 14, min: 2, max: 500, step: 1 },
      { key: 'shortPeriod', type: 'number', label: 'Short StdDev Period', default: 5, min: 2, max: 500, step: 1 },
      { key: 'longPeriod', type: 'number', label: 'Long StdDev Period', default: 10, min: 2, max: 500, step: 1 },
      { key: 'minPeriod', type: 'number', label: 'Min Period', default: 3, min: 2, max: 500, step: 1 },
      { key: 'maxPeriod', type: 'number', label: 'Max Period', default: 30, min: 2, max: 500, step: 1 },
      { key: 'source', type: 'source', label: 'Source', default: 'close' },
    ],

    plots: [{ key: 'dymoi', type: 'line', title: 'DYMOI', style: { color: '#ffeb3b', lineWidth: 2 } }],

    // Pine draws all three hlines with linestyle=hline.style_dotted.
    levels: () => [
      { price: 70, title: 'Overbought', color: '#787b86', dashed: true },
      { price: 50, title: 'Midline', color: '#787b86', dashed: true },
      { price: 30, title: 'Oversold', color: '#787b86', dashed: true },
    ],

    calc(bars, settings) {
      // A cleared number field arrives as '', and Number('') is 0. Pine raises
      // on any of these combinations, so clamp into the legal range instead.
      const basePeriod = Math.max(2, Math.floor(Number(settings.basePeriod) || 14))
      const shortPeriod = Math.max(2, Math.floor(Number(settings.shortPeriod) || 5))
      const longPeriod = Math.max(shortPeriod + 1, Math.floor(Number(settings.longPeriod) || 10))
      const minPeriod = Math.max(2, Math.floor(Number(settings.minPeriod) || 3))
      const maxPeriod = Math.max(minPeriod, Math.floor(Number(settings.maxPeriod) || 30))
      const src = sourceValues(bars, settings.source ?? 'close')

      // Stage 1: dual standard deviation volatility ratio.
      const sdShort = stddevCirc(src, shortPeriod)
      const sdLong = stddevCirc(src, longPeriod)

      const out = new Array(bars.length).fill(NaN)

      // Pine `var` state of rsi_wilder, carried bar to bar inside this pass.
      let prevVal = NaN
      let avgGain = 0
      let avgLoss = 0
      let e = 1.0
      let warmup = true

      for (let i = 0; i < bars.length; i++) {
        // Pine re-declares result each bar, so a missing source reads as 50.
        let result = 50.0
        const source = src[i]

        if (Number.isFinite(source)) {
          // Stage 2: dynamic period from the volatility ratio.
          const v = sdLong[i] > 1e-10 ? sdShort[i] / sdLong[i] : 1.0
          const rawPeriod = v > 1e-10 ? Math.round(basePeriod / v) : maxPeriod
          const dynPeriod = Math.max(minPeriod, Math.min(maxPeriod, rawPeriod))

          // Stage 3: Wilder RSI at that adaptive period.
          if (!Number.isFinite(prevVal)) {
            prevVal = source
          } else {
            const alpha = 1.0 / dynPeriod
            const beta = 1.0 - alpha
            const change = source - prevVal
            const gain = change > 0.0 ? change : 0.0
            const loss = change < 0.0 ? -change : 0.0
            prevVal = source

            avgGain = alpha * gain + beta * avgGain
            avgLoss = alpha * loss + beta * avgLoss

            if (warmup) {
              e *= beta
              const c = e > 1e-10 ? 1.0 / (1.0 - e) : 1.0
              const aG = avgGain * c
              const aL = avgLoss * c
              const total = aG + aL
              result = total !== 0.0 ? (100.0 * aG) / total : 50.0
              if (e <= 1e-10) warmup = false
            } else {
              const total = avgGain + avgLoss
              result = total !== 0.0 ? (100.0 * avgGain) / total : 50.0
            }
          }
        }

        out[i] = Number.isFinite(result) ? Math.max(0.0, Math.min(100.0, result)) : NaN
      }

      return { dymoi: nulls(out) }
    },
  })
}
