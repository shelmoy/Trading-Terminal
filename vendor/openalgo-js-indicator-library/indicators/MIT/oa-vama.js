/**
 * Volatility Adjusted Moving Average (VAMA) - ported to openalgo-charts from Pine Script v6.
 *
 * Source: https://github.com/mihakralj/pinescript/blob/c4e91b962be09733d8fc76caa5191e9e586c5cee/indicators/trends_IIR/vama.pine
 * Repo:   mihakralj/pinescript
 * License: MIT (c) mihakralj
 * SPDX-FileCopyrightText: (c) mihakralj
 * SPDX-FileCopyrightText: (c) 2026 marketcalls (port to openalgo-charts)
 * SPDX-License-Identifier: MIT
 *
 * A simple moving average whose lookback stretches and shrinks with the ratio of
 * a long-term ATR to a short-term ATR, so the average slows down when volatility
 * cools and speeds up when it expands.
 */

export default function ({ registerIndicator, sourceValues, nulls }) {
  registerIndicator({
    id: 'oa-vama',
    name: 'Volatility Adjusted Moving Average (VAMA)',
    category: 'Trends IIR',
    placement: 'onchart',

    inputs: [
      { key: 'baseLength', type: 'number', label: 'Base Length', default: 20, min: 1, max: 5000, step: 1 },
      { key: 'source', type: 'source', label: 'Source', default: 'close' },
      {
        key: 'shortAtr',
        type: 'number',
        label: 'Short ATR Period',
        default: 10,
        min: 1,
        max: 5000,
        step: 1,
        tooltip: 'Short-term ATR period used as the current volatility measurement.',
      },
      {
        key: 'longAtr',
        type: 'number',
        label: 'Long ATR Period',
        default: 50,
        min: 1,
        max: 5000,
        step: 1,
        tooltip: 'Long-term ATR period used as the reference volatility measurement.',
      },
      { key: 'minLength', type: 'number', label: 'Minimum Length', default: 5, min: 1, max: 5000, step: 1 },
      { key: 'maxLength', type: 'number', label: 'Maximum Length', default: 100, min: 1, max: 5000, step: 1 },
    ],

    plots: [{ key: 'vama', type: 'line', title: 'VAMA', style: { color: '#ffeb3b', lineWidth: 2 } }],

    calc(bars, settings) {
      const n = bars.length
      // A cleared number field arrives as '', and Number('') is 0.
      const baseLength = Math.max(1, Math.floor(Number(settings.baseLength) || 20))
      const shortPeriod = Math.max(1, Math.floor(Number(settings.shortAtr) || 10))
      const longPeriod = Math.max(1, Math.floor(Number(settings.longAtr) || 50))
      const maxLength = Math.max(1, Math.floor(Number(settings.maxLength) || 100))
      // Pine raises when minLength > maxLength; clamping keeps the study drawable.
      const minLength = Math.min(maxLength, Math.max(1, Math.floor(Number(settings.minLength) || 5)))
      const src = sourceValues(bars, settings.source ?? 'close')

      const EPSILON = 1e-10
      const betaShort = 1 - 1 / shortPeriod
      const betaLong = 1 - 1 / longPeriod

      const out = new Array(n).fill(NaN)
      const buffer = new Array(maxLength).fill(NaN)
      let head = 0
      let sum = 0
      let validCount = 0

      // Wilder smoothing with the warmup compensator of the source: raw_rma starts
      // at zero and is divided by (1 - beta^bars), so bar 0 already emits true range.
      let rawShort = 0
      let eShort = 1
      let rawLong = 0
      let eLong = 1

      // Pine seeds `var float prevClose = close` on the first bar, so bar 0 compares
      // its own high and low against its own close.
      let prevClose = n > 0 ? bars[0].close : NaN

      for (let i = 0; i < n; i++) {
        const bar = bars[i]
        const tr1 = bar.high - bar.low
        const tr2 = Math.abs(bar.high - prevClose)
        const tr3 = Math.abs(bar.low - prevClose)
        const trueRange = Math.max(tr1, tr2, tr3)
        prevClose = bar.close

        let shortAtr = NaN
        let longAtr = NaN
        if (Number.isFinite(trueRange)) {
          rawShort = (rawShort * (shortPeriod - 1) + trueRange) / shortPeriod
          eShort *= betaShort
          shortAtr = eShort > EPSILON ? rawShort / (1 - eShort) : rawShort
          rawLong = (rawLong * (longPeriod - 1) + trueRange) / longPeriod
          eLong *= betaLong
          longAtr = eLong > EPSILON ? rawLong / (1 - eLong) : rawLong
        }

        const ratio =
          Number.isFinite(shortAtr) && Number.isFinite(longAtr) && shortAtr !== 0 ? longAtr / shortAtr : 1
        const calcLength = baseLength * ratio
        const clamped = Math.max(minLength, Math.min(maxLength, calcLength))
        // Pine's int() truncates toward zero.
        const adjustedLength = Number.isFinite(clamped) ? Math.trunc(clamped) : minLength

        // Circular buffer holding the last maxLength source values.
        const oldest = buffer[head]
        if (Number.isFinite(oldest)) {
          sum -= oldest
          validCount -= 1
        }
        const value = src[i]
        const valid = Number.isFinite(value)
        if (valid) {
          sum += value
          validCount += 1
        }
        buffer[head] = valid ? value : NaN
        head = (head + 1) % maxLength

        const avg = validCount > 0 ? sum / validCount : value
        const actualCount = Math.min(validCount, adjustedLength)
        let partialSum = 0
        let partialCount = 0
        for (let k = 0; k < actualCount; k++) {
          const idx = ((head - 1 - k) % maxLength + maxLength) % maxLength
          const held = buffer[idx]
          if (Number.isFinite(held)) {
            partialSum += held
            partialCount += 1
          }
        }

        if (partialCount > 0) out[i] = partialSum / partialCount
        else if (Number.isFinite(avg)) out[i] = avg
        else if (valid) out[i] = value
      }

      return { vama: nulls(out) }
    },
  })
}
