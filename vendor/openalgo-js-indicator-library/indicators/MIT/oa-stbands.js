/**
 * Super Trend Bands (STBANDS) - ported to openalgo-charts from Pine Script v6.
 *
 * Source: https://github.com/mihakralj/pinescript/blob/c4e91b962be09733d8fc76caa5191e9e586c5cee/indicators/channels/stbands.pine
 * Repo:   mihakralj/pinescript
 * License: MIT (c) mihakralj
 * SPDX-FileCopyrightText: (c) mihakralj
 * SPDX-FileCopyrightText: (c) 2026 marketcalls (port to openalgo-charts)
 * SPDX-License-Identifier: MIT
 *
 * Ratcheting support and resistance built from hl2 plus and minus a multiple of
 * a simple-mean ATR: each band only tightens towards price until the source
 * closes through it, at which point it resets.
 */

export default function ({ registerIndicator, sourceValues, nulls }) {
  registerIndicator({
    id: 'oa-stbands',
    name: 'Super Trend Bands (STBANDS)',
    category: 'Channels',
    placement: 'onchart',

    inputs: [
      { key: 'period', type: 'number', label: 'ATR Period', default: 10, min: 1, max: 5000, step: 1 },
      { key: 'source', type: 'source', label: 'Source', default: 'close' },
      {
        key: 'multiplier',
        type: 'number',
        label: 'ATR Multiplier',
        default: 3,
        min: 0.001,
        max: 100,
        step: 0.1,
      },
    ],

    plots: [
      { key: 'upper', type: 'line', title: 'Upper Band', style: { color: '#ffeb3b', lineWidth: 2 } },
      { key: 'lower', type: 'line', title: 'Lower Band', style: { color: '#ffeb3b', lineWidth: 2 } },
    ],

    fills: [{ between: ['upper', 'lower'], colorUp: '#2962ff', colorDown: '#2962ff', opacity: 0.1 }],

    calc(bars, settings) {
      // A cleared number field arrives as '', and Number('') is 0.
      const period = Math.max(1, Math.floor(Number(settings.period) || 10))
      const multiplier = Math.max(0.001, Number(settings.multiplier) || 3)
      const src = sourceValues(bars, settings.source ?? 'close')

      const n = bars.length
      const upper = new Array(n).fill(NaN)
      const lower = new Array(n).fill(NaN)

      // Pine averages the true ranges held in a circular buffer of `period`
      // slots, dividing by however many are filled: a simple mean, not Wilder.
      const trBuf = new Array(period).fill(NaN)
      let trSum = 0
      let head = 0
      let count = 0

      let finalUpper = NaN
      let finalLower = NaN
      let trend = 1

      for (let i = 0; i < n; i++) {
        // nz() on every leg: a missing price reads as zero, not as a gap.
        const rawHigh = Number(bars[i].high)
        const rawLow = Number(bars[i].low)
        const highVal = Number.isFinite(rawHigh) ? rawHigh : 0
        const lowVal = Number.isFinite(rawLow) ? rawLow : 0
        const closeVal = Number.isFinite(src[i]) ? src[i] : 0

        // nz(source[1], source): on the first bar the previous close is this one.
        const prevSrc = i > 0 ? src[i - 1] : NaN
        const prevClose = Number.isFinite(prevSrc) ? prevSrc : closeVal

        const tr = Math.max(
          highVal - lowVal,
          Math.max(Math.abs(highVal - prevClose), Math.abs(lowVal - prevClose)),
        )

        const oldestTr = trBuf[head]
        if (Number.isFinite(oldestTr)) {
          trSum -= oldestTr
          count -= 1
        }
        trSum += tr
        count += 1
        trBuf[head] = tr
        head = (head + 1) % period

        const atr = count > 0 ? trSum / count : tr
        const hl2Val = (highVal + lowVal) / 2
        const basicUpper = hl2Val + multiplier * atr
        const basicLower = hl2Val - multiplier * atr

        if (i === 0) {
          finalUpper = basicUpper
          finalLower = basicLower
          trend = 1
        } else {
          const prevUpper = Number.isFinite(finalUpper) ? finalUpper : basicUpper
          const prevLower = Number.isFinite(finalLower) ? finalLower : basicLower
          const prevTrend = Number.isFinite(trend) ? trend : 1

          finalUpper = basicUpper < prevUpper || prevClose > prevUpper ? basicUpper : prevUpper
          finalLower = basicLower > prevLower || prevClose < prevLower ? basicLower : prevLower

          // The trend test reads the previous bar's finals, not the ones just
          // written, so a flip needs the close to clear the old band.
          trend = closeVal <= prevLower ? 1 : closeVal >= prevUpper ? -1 : prevTrend
        }

        upper[i] = finalUpper
        lower[i] = finalLower
      }

      return { upper: nulls(upper), lower: nulls(lower) }
    },
  })
}
