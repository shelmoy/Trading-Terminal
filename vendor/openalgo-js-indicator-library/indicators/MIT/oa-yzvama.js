/**
 * Yang-Zhang Volatility Adjusted Moving Average (YZVAMA) - ported to
 * openalgo-charts from Pine Script v6.
 *
 * Source: https://github.com/mihakralj/pinescript/blob/c4e91b962be09733d8fc76caa5191e9e586c5cee/indicators/trends_IIR/yzvama.pine
 * Repo:   mihakralj/pinescript
 * License: MIT (c) mihakralj
 * SPDX-FileCopyrightText: (c) mihakralj
 * SPDX-FileCopyrightText: (c) 2026 marketcalls (port to openalgo-charts)
 * SPDX-License-Identifier: MIT
 *
 * A simple moving average whose window is re-chosen every bar from where the
 * current Yang-Zhang volatility ranks inside its own recent history: calm
 * ranks stretch the window towards the maximum, agitated ranks shrink it
 * towards the minimum so the average turns faster.
 */

export default function ({ registerIndicator, sourceValues, nulls }) {
  registerIndicator({
    id: 'oa-yzvama',
    name: 'Yang-Zhang Volatility Adjusted Moving Average (YZVAMA)',
    category: 'Trends IIR',
    placement: 'onchart',

    inputs: [
      { key: 'source', type: 'source', label: 'Source', default: 'close' },
      {
        key: 'yzvShort',
        type: 'number',
        label: 'Short YZV Period',
        default: 3,
        min: 1,
        max: 5000,
        step: 1,
      },
      {
        key: 'yzvLong',
        type: 'number',
        label: 'Long YZV Period',
        default: 50,
        min: 1,
        max: 5000,
        step: 1,
      },
      {
        key: 'percentileLookback',
        type: 'number',
        label: 'Percentile Lookback',
        default: 100,
        min: 1,
        max: 5000,
        step: 1,
      },
      {
        key: 'minLength',
        type: 'number',
        label: 'Minimum Length',
        default: 5,
        min: 1,
        max: 5000,
        step: 1,
      },
      {
        key: 'maxLength',
        type: 'number',
        label: 'Maximum Length',
        default: 100,
        min: 1,
        max: 5000,
        step: 1,
      },
    ],

    plots: [{ key: 'yzvama', type: 'line', title: 'YZVAMA', style: { color: '#ffeb3b', lineWidth: 2 } }],

    calc(bars, settings) {
      // A cleared number field arrives as '', and Number('') is 0.
      const shortPeriod = Math.max(1, Math.floor(Number(settings.yzvShort) || 3))
      const longPeriod = Math.max(1, Math.floor(Number(settings.yzvLong) || 50))
      const lookback = Math.max(1, Math.floor(Number(settings.percentileLookback) || 100))
      const maxLength = Math.max(1, Math.floor(Number(settings.maxLength) || 100))
      // The source raises when min exceeds max; clamp instead of failing.
      const minLength = Math.min(
        maxLength,
        Math.max(1, Math.floor(Number(settings.minLength) || 5)),
      )

      const src = sourceValues(bars, settings.source ?? 'close')
      const n = bars.length
      const out = new Array(n).fill(NaN)
      if (n === 0) return { yzvama: nulls(out) }

      const EPSILON = 1e-10

      const ratioNShort = shortPeriod <= 1 ? 1 : (shortPeriod + 1) / (shortPeriod - 1)
      const kShort = 0.34 / (1.34 + ratioNShort)
      const betaShort = 1 - 1 / shortPeriod

      const ratioNLong = longPeriod <= 1 ? 1 : (longPeriod + 1) / (longPeriod - 1)
      const kLong = 0.34 / (1.34 + ratioNLong)
      const betaLong = 1 - 1 / longPeriod

      // Compensated Wilder state, seeded exactly as the source's var floats.
      let rawRmaShort = 0
      let eCompShort = 1
      let rawRmaLong = 0
      let eCompLong = 1

      // Pine's `var float prev_close = close` latches the first bar's own
      // close, so the first bar compares open against its own close.
      let prevClose = bars[0].close

      // The rolling window of short YZV readings the percentile ranks against.
      const yzvWindow = []

      // The source's circular source buffer, sized to the maximum length.
      const buffer = new Array(maxLength).fill(NaN)
      let head = 0
      let bufferSum = 0
      let validCount = 0

      const lengthRange = maxLength - minLength

      for (let i = 0; i < n; i++) {
        const bar = bars[i]
        const o = bar.open
        const h = bar.high
        const l = bar.low
        const c = bar.close

        const pc = Number.isFinite(prevClose) ? prevClose : o
        prevClose = c

        let sSqShort = NaN
        let sSqLong = NaN
        if (o > 0 && h > 0 && l > 0 && c > 0 && pc > 0) {
          const ro = Math.log(o / pc)
          const rc = Math.log(c / o)
          const rh = Math.log(h / o)
          const rl = Math.log(l / o)
          const sOSq = ro * ro
          const sCSq = rc * rc
          const sRsSq = rh * (rh - rc) + rl * (rl - rc)
          sSqShort = sOSq + kShort * sCSq + (1 - kShort) * sRsSq
          sSqLong = sOSq + kLong * sCSq + (1 - kLong) * sRsSq
        }

        let yzvShort = NaN
        if (Number.isFinite(sSqShort)) {
          rawRmaShort = (rawRmaShort * (shortPeriod - 1) + sSqShort) / shortPeriod
          eCompShort = betaShort * eCompShort
          // At period 1 the compensator is 0, which fails the epsilon test and
          // leaves the raw value alone, so there is no divide by zero.
          const smoothed =
            eCompShort > EPSILON ? rawRmaShort / (1 - eCompShort) : rawRmaShort
          yzvShort = Math.sqrt(smoothed)
        }

        // The long leg is carried because the source computes it every bar,
        // but the source never reads it back: nothing downstream uses it.
        if (Number.isFinite(sSqLong)) {
          rawRmaLong = (rawRmaLong * (longPeriod - 1) + sSqLong) / longPeriod
          eCompLong = betaLong * eCompLong
        }

        // The current reading is written to the buffer before it is ranked, so
        // it is part of its own comparison set and can never rank above itself.
        if (Number.isFinite(yzvShort)) {
          yzvWindow.push(yzvShort)
          if (yzvWindow.length > lookback) yzvWindow.shift()
        }

        let percentile = 50
        const nValid = yzvWindow.length
        if (nValid > 1 && Number.isFinite(yzvShort)) {
          let rankPos = 0
          for (let k = 0; k < nValid; k++) {
            if (yzvWindow[k] < yzvShort) rankPos += 1
          }
          percentile = (rankPos / (nValid - 1)) * 100
        }

        const adjustedLengthF = maxLength - (percentile / 100) * lengthRange
        // Pine's int() truncates towards zero.
        const adjustedLength = Math.trunc(
          Math.max(minLength, Math.min(maxLength, adjustedLengthF)),
        )

        const s = src[i]
        const oldest = buffer[head]
        if (Number.isFinite(oldest)) {
          bufferSum -= oldest
          validCount -= 1
        }
        if (Number.isFinite(s)) {
          bufferSum += s
          validCount += 1
        }
        buffer[head] = Number.isFinite(s) ? s : NaN
        head = (head + 1) % maxLength

        const avg = validCount > 0 ? bufferSum / validCount : s
        const actualCount = Math.min(validCount, adjustedLength)

        let partialSum = 0
        let partialCount = 0
        for (let k = 0; k < actualCount; k++) {
          const idx = (((head - 1 - k) % maxLength) + maxLength) % maxLength
          const v = buffer[idx]
          if (Number.isFinite(v)) {
            partialSum += v
            partialCount += 1
          }
        }

        const value = partialCount > 0 ? partialSum / partialCount : Number.isFinite(avg) ? avg : s
        if (Number.isFinite(value)) out[i] = value
      }

      return { yzvama: nulls(out) }
    },
  })
}
