/**
 * Percentage Price Oscillator (PPO) - ported to openalgo-charts from Pine Script v6.
 *
 * Source: https://github.com/mihakralj/pinescript/blob/c4e91b962be09733d8fc76caa5191e9e586c5cee/indicators/momentum/ppo.pine
 * Repo:   mihakralj/pinescript
 * License: MIT (c) mihakralj
 * SPDX-FileCopyrightText: (c) mihakralj
 * SPDX-FileCopyrightText: (c) 2026 marketcalls (port to openalgo-charts)
 * SPDX-License-Identifier: MIT
 *
 * The gap between a fast and a slow exponential average expressed as a
 * percentage of the slow one, so the same reading means the same thing across
 * instruments and across price levels.
 */

export default function ({ registerIndicator, sourceValues, nulls }) {
  /**
   * The source's own bias-compensated EMA.
   *
   * It seeds the accumulator at zero, carries the compensation factor e as
   * (1 - alpha) raised to the bar count, and divides by (1 - e) until the seed
   * bias has decayed below 1e-10. The first bar returns the raw value, and the
   * result is a var: it holds across a bar whose input is not available.
   *
   * Note the source uses alpha = 2 / length, not the usual 2 / (length + 1).
   */
  const compensatedEma = (values, length) => {
    const alpha = 2 / Math.max(length, 1)
    const out = new Array(values.length).fill(NaN)
    let acc = NaN
    let result = NaN
    let e = 1
    let warmup = true

    for (let i = 0; i < values.length; i++) {
      const value = values[i]
      if (Number.isFinite(value)) {
        if (!Number.isFinite(acc)) {
          acc = 0
          result = value
        } else {
          acc = alpha * (value - acc) + acc
          if (warmup) {
            e *= 1 - alpha
            // A length of 1 makes alpha 2, so (1 - e) can reach exactly 0.
            // Pine would hand back an infinity there; leave the uncompensated
            // accumulator instead rather than poisoning the whole column.
            const denom = 1 - e
            result = Math.abs(denom) > 1e-12 ? acc / denom : acc
            if (e <= 1e-10) warmup = false
          } else {
            result = acc
          }
        }
      }
      out[i] = result
    }
    return out
  }

  registerIndicator({
    id: 'oa-ppo',
    name: 'Percentage Price Oscillator (PPO)',
    category: 'Momentum',
    placement: 'pane',

    inputs: [
      { key: 'source', type: 'source', label: 'Source', default: 'close' },
      { key: 'fastLength', type: 'number', label: 'Fast Length', default: 12, min: 1, max: 5000, step: 1 },
      { key: 'slowLength', type: 'number', label: 'Slow Length', default: 26, min: 1, max: 5000, step: 1 },
      { key: 'signalLength', type: 'number', label: 'Signal Length', default: 9, min: 1, max: 5000, step: 1 },
    ],

    plots: [
      { key: 'ppo', type: 'line', title: 'PPO', style: { color: '#2962ff', lineWidth: 2 } },
      { key: 'signal', type: 'line', title: 'Signal', style: { color: '#ff5252', lineWidth: 2 } },
      { key: 'histogram', type: 'histogram', title: 'Histogram', style: { color: '#787b86' } },
    ],

    calc(bars, settings) {
      // A cleared number field arrives as '', and Number('') is 0.
      const fastLength = Math.max(1, Math.floor(Number(settings.fastLength) || 12))
      const slowLength = Math.max(1, Math.floor(Number(settings.slowLength) || 26))
      const signalLength = Math.max(1, Math.floor(Number(settings.signalLength) || 9))
      const src = sourceValues(bars, settings.source ?? 'close')

      const fast = compensatedEma(src, fastLength)
      const slow = compensatedEma(src, slowLength)

      const ppo = new Array(bars.length).fill(NaN)
      for (let i = 0; i < bars.length; i++) {
        const f = fast[i]
        const s = slow[i]
        if (!Number.isFinite(f) || !Number.isFinite(s) || s === 0) continue
        ppo[i] = (100 * (f - s)) / s
      }

      // Pine only advances the signal EMA on bars where the PPO line exists,
      // which is exactly what the helper does with a non-finite input.
      const signal = compensatedEma(ppo, signalLength)

      const histogram = new Array(bars.length).fill(NaN)
      for (let i = 0; i < bars.length; i++) {
        if (!Number.isFinite(ppo[i]) || !Number.isFinite(signal[i])) continue
        histogram[i] = ppo[i] - signal[i]
      }

      return { ppo: nulls(ppo), signal: nulls(signal), histogram: nulls(histogram) }
    },
  })
}
