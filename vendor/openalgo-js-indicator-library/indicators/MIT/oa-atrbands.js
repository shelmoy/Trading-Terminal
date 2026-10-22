/**
 * ATR Bands (ATRBANDS) - ported to openalgo-charts from Pine Script v6.
 *
 * Source: https://github.com/mihakralj/pinescript/blob/c4e91b962be09733d8fc76caa5191e9e586c5cee/indicators/channels/atrbands.pine
 * Repo:   mihakralj/pinescript
 * License: MIT (c) mihakralj
 * SPDX-FileCopyrightText: (c) mihakralj
 * SPDX-FileCopyrightText: (c) 2026 marketcalls (port to openalgo-charts)
 * SPDX-License-Identifier: MIT
 *
 * A moving average of the source with bands a multiple of the Average True
 * Range away, so the channel tracks realised bar range instead of closing
 * dispersion.
 */

export default function ({ registerIndicator, sourceValues, nulls }) {
  registerIndicator({
    id: 'oa-atrbands',
    name: 'ATR Bands (ATRBANDS)',
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
        tooltip: 'Band distance as a multiple of the Average True Range.',
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
      if (n === 0) return { middle, upper, lower }

      // The source keeps a circular buffer of the source seeded with na and
      // divides by a live count, so the first `length` bars carry an expanding
      // mean rather than a warmup gap. It keeps a parallel true-range buffer
      // whose sum it never reads; only the count is shared, so leaving that
      // buffer out changes nothing.
      const period = length
      const bufSource = new Array(period).fill(NaN)
      let head = 0
      let count = 0
      let sumSource = 0

      // var float prevClose = close seeds from the first bar's own close, so
      // bar zero's true range collapses to high - low.
      let prevClose = Number.isFinite(bars[0].close) ? Number(bars[0].close) : NaN

      // Wilder smoothing of the true range with a warmup compensator: raw_rma
      // starts at zero and e decays from one, so raw_rma / (1 - e) is unbiased
      // from the very first bar instead of crawling up out of a zero seed.
      const EPSILON = 1e-10
      let rawRma = 0
      let e = 1
      const alpha = 1 / length

      for (let i = 0; i < n; i++) {
        const b = bars[i]
        const hi = Number(b.high)
        const lo = Number(b.low)
        const cl = Number(b.close)

        const tr1 = hi - lo
        const tr2 = Math.abs(hi - prevClose)
        const tr3 = Math.abs(lo - prevClose)
        const trueRangeValue = Math.max(tr1, tr2, tr3)
        prevClose = Number.isFinite(cl) ? cl : prevClose

        const oldestSource = bufSource[head]
        if (Number.isFinite(oldestSource)) {
          sumSource -= oldestSource
          count -= 1
        }
        // nz(source): a missing source value counts as zero.
        const currentSource = Number.isFinite(src[i]) ? src[i] : 0
        sumSource += currentSource
        count += 1
        bufSource[head] = currentSource
        head = (head + 1) % period

        let atrValue = NaN
        if (Number.isFinite(trueRangeValue)) {
          rawRma = (rawRma * (length - 1) + trueRangeValue) / length
          e = (1 - alpha) * e
          atrValue = e > EPSILON ? rawRma / (1 - e) : rawRma
        }

        const meanSource = count > 0 ? sumSource / count : NaN
        // nz(sumSource / count, source): fall back to the raw source value.
        const middleBand = Number.isFinite(meanSource)
          ? meanSource
          : (Number.isFinite(src[i]) ? src[i] : NaN)
        if (!Number.isFinite(middleBand)) continue

        // nz(atrValue * multiplier): a bar with no range yet gives zero width.
        const scaled = atrValue * multiplier
        const width = Number.isFinite(scaled) ? scaled : 0

        middle[i] = middleBand
        upper[i] = middleBand + width
        lower[i] = middleBand - width
      }

      return { middle: nulls(middle), upper: nulls(upper), lower: nulls(lower) }
    },
  })
}
