/**
 * Stoller Average Range Channel (STARCHANNEL) - ported to openalgo-charts from Pine Script v6.
 *
 * Source: https://github.com/mihakralj/pinescript/blob/c4e91b962be09733d8fc76caa5191e9e586c5cee/indicators/channels/starchannel.pine
 * Repo:   mihakralj/pinescript
 * License: MIT
 * SPDX-FileCopyrightText: (c) mihakralj
 * SPDX-FileCopyrightText: (c) 2026 marketcalls (port to openalgo-charts)
 * SPDX-License-Identifier: MIT
 *
 * A running mean of the source carries the centre line and a compensated Wilder
 * ATR sets the half-width, so the channel breathes with true range rather than
 * with closing-price variance.
 */

export default function ({ registerIndicator, sourceValues, nulls }) {
  registerIndicator({
    id: 'oa-starchannel',
    name: 'Stoller Average Range Channel (STARCHANNEL)',
    category: 'Channels',
    placement: 'onchart',

    inputs: [
      { key: 'source', type: 'source', label: 'Source', default: 'close' },
      { key: 'length', type: 'number', label: 'Length', default: 20, min: 1, max: 5000, step: 1 },
      {
        key: 'multiplier',
        type: 'number',
        label: 'ATR Multiplier',
        default: 2,
        min: 0.001,
        max: 100,
        step: 0.1,
        tooltip: 'Half-width of the channel as a multiple of the average true range.',
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
      const multiplier = Math.max(0.001, Number(settings.multiplier) || 2)
      const src = sourceValues(bars, settings.source ?? 'close')

      const n = bars.length
      const middle = new Array(n).fill(NaN)
      const upper = new Array(n).fill(NaN)
      const lower = new Array(n).fill(NaN)
      if (n === 0) return { middle: nulls(middle), upper: nulls(upper), lower: nulls(lower) }

      const EPSILON = 1e-10
      const period = length
      // The source keeps a circular buffer pre-filled with na, so the mean is
      // taken over min(barsSoFar, length) values and a value is emitted from the
      // very first bar rather than after a warmup.
      const buffer = new Array(period).fill(NaN)
      let head = 0
      let count = 0
      let sumSource = 0

      // `var float prevClose = close` seeds on the first bar with that bar's own
      // close, so the first true range is normally just high - low.
      let prevClose = bars[0].close
      let rawRma = 0
      let e = 1
      const alpha = 1 / length

      for (let i = 0; i < n; i++) {
        const bar = bars[i]
        const tr1 = bar.high - bar.low
        const tr2 = Math.abs(bar.high - prevClose)
        const tr3 = Math.abs(bar.low - prevClose)
        const trueRangeVal =
          Number.isFinite(tr1) && Number.isFinite(tr2) && Number.isFinite(tr3)
            ? Math.max(tr1, tr2, tr3)
            : NaN
        prevClose = bar.close

        // Compensated Wilder smoothing: the raw average starts at zero and the
        // remaining seed weight (1 - e) is divided back out.
        let atrValue = NaN
        if (Number.isFinite(trueRangeVal)) {
          rawRma = (rawRma * (length - 1) + trueRangeVal) / length
          e = (1 - alpha) * e
          atrValue = e > EPSILON ? rawRma / (1 - e) : rawRma
        }

        const oldest = buffer[head]
        if (Number.isFinite(oldest)) {
          sumSource -= oldest
          count -= 1
        }
        const currentSource = Number.isFinite(src[i]) ? src[i] : 0
        sumSource += currentSource
        count += 1
        buffer[head] = currentSource
        head = (head + 1) % period

        const middleBand = count > 0 ? sumSource / count : NaN
        const width = Number.isFinite(atrValue) ? atrValue * multiplier : 0
        if (!Number.isFinite(middleBand)) continue
        middle[i] = middleBand
        upper[i] = middleBand + width
        lower[i] = middleBand - width
      }

      return { middle: nulls(middle), upper: nulls(upper), lower: nulls(lower) }
    },
  })
}
