/**
 * Keltner Channel (KCHANNEL) - ported to openalgo-charts from Pine Script v6.
 *
 * Source: https://github.com/mihakralj/pinescript/blob/c4e91b962be09733d8fc76caa5191e9e586c5cee/indicators/channels/kchannel.pine
 * Repo:   mihakralj/pinescript
 * License: MIT
 * SPDX-FileCopyrightText: (c) mihakralj
 * SPDX-FileCopyrightText: (c) 2026 marketcalls (port to openalgo-charts)
 * SPDX-License-Identifier: MIT
 *
 * An exponential moving average with bands set a multiple of the average true
 * range away from it, so the channel breathes with realised range rather than
 * with the dispersion of closes.
 */

export default function ({ registerIndicator, sourceValues, nulls }) {
  registerIndicator({
    id: 'oa-kchannel',
    name: 'Keltner Channel (KCHANNEL)',
    category: 'Channels',
    placement: 'onchart',

    inputs: [
      { key: 'source', type: 'source', label: 'Source', default: 'close' },
      { key: 'length', type: 'number', label: 'Length', default: 20, min: 1, max: 5000, step: 1 },
      {
        key: 'mult',
        type: 'number',
        label: 'ATR Multiplier',
        default: 2,
        min: 0.001,
        max: 100,
        step: 0.1,
        tooltip: 'Band distance as a multiple of the average true range.',
      },
    ],

    plots: [
      { key: 'middle', type: 'line', title: 'Middle', style: { color: '#ffeb3b', lineWidth: 2 } },
      { key: 'upper', type: 'line', title: 'Upper', style: { color: '#ffeb3b', lineWidth: 2 } },
      { key: 'lower', type: 'line', title: 'Lower', style: { color: '#ffeb3b', lineWidth: 2 } },
    ],

    fills: [{ between: ['upper', 'lower'], colorUp: '#2962ff', colorDown: '#2962ff', opacity: 0.1 }],

    calc(bars, settings) {
      // A cleared number field arrives as '', and Number('') is 0.
      const length = Math.max(1, Math.floor(Number(settings.length) || 20))
      const mult = Math.max(0.001, Number(settings.mult) || 2)
      const src = sourceValues(bars, settings.source ?? 'close')
      const len = bars.length

      const middle = new Array(len).fill(NaN)
      const upper = new Array(len).fill(NaN)
      const lower = new Array(len).fill(NaN)
      if (len === 0) return { middle: nulls(middle), upper: nulls(upper), lower: nulls(lower) }

      const alpha = 2 / (length + 1)
      const alphaAtr = 1 / length
      const EPSILON = 1e-10

      // Bias-corrected EMA: the running sum and its weight both decay, so the
      // ratio equals the source on the very first bar and needs no seed window.
      let sum = 0
      let weight = 0
      // Wilder ATR carried from 0 with the same exponential warmup compensator.
      let rawRma = 0
      let e = 1
      // Pine: var float prevClose = close, so the first bar compares against itself.
      let prevClose = Number.isFinite(bars[0].close) ? bars[0].close : NaN

      for (let i = 0; i < len; i++) {
        const bar = bars[i]
        const high = Number(bar.high)
        const low = Number(bar.low)
        const close = Number(bar.close)

        let atrValue = NaN
        if (Number.isFinite(high) && Number.isFinite(low) && Number.isFinite(prevClose)) {
          const tr1 = high - low
          const tr2 = Math.abs(high - prevClose)
          const tr3 = Math.abs(low - prevClose)
          const trueRange = Math.max(tr1, tr2, tr3)
          rawRma = (rawRma * (length - 1) + trueRange) / length
          e = (1 - alphaAtr) * e
          const d = 1 - e
          atrValue = e > EPSILON && d !== 0 ? rawRma / d : rawRma
        }
        if (Number.isFinite(close)) prevClose = close

        const s = src[i]
        if (!Number.isFinite(s)) continue
        sum = sum * (1 - alpha) + s * alpha
        weight = weight * (1 - alpha) + alpha
        if (weight === 0) continue
        const ema = sum / weight
        if (!Number.isFinite(ema)) continue

        // Pine: width = mult * nz(atrValue, 0.0)
        const width = mult * (Number.isFinite(atrValue) ? atrValue : 0)
        middle[i] = ema
        upper[i] = ema + width
        lower[i] = ema - width
      }

      return { middle: nulls(middle), upper: nulls(upper), lower: nulls(lower) }
    },
  })
}
