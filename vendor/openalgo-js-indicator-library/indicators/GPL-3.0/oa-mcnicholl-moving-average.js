/**
 * McNicholl Moving Average (MNMA) - ported to openalgo-charts from Pine Script v3.
 *
 * Source: https://github.com/everget/tradingview-pinescript-indicators/blob/60c93d3711d222b8f2db96160defe568429348e0/movings/mcnicholl_moving_average.pine
 * Repo:   everget/tradingview-pinescript-indicators
 * License: GPL-3.0 (c) 1998-present Dennis McNicholl, (c) 2019-present Alex Orekhov (everget)
 * SPDX-FileCopyrightText: (c) 2018-present Alex Orekhov (everget)
 * SPDX-FileCopyrightText: (c) 2026 marketcalls (port to openalgo-charts)
 * SPDX-License-Identifier: GPL-3.0-only
 *
 * A zero-lag double exponential average: the single and double EMAs are
 * recombined as ((2 - alpha) * EMA1 - EMA2) / (1 - alpha), which cancels the
 * first-order lag of a plain EMA of the same length.
 */

export default function ({ registerIndicator, sourceValues, nulls }) {
  // Pine's ema(): seeded with the simple average of the first `length` values and
  // na until that window is clean, then recursive. Chaining it onto a series that
  // is still na is why the second pass starts roughly `length` bars later again.
  const pineEma = (values, length) => {
    const alpha = 2 / (length + 1)
    const out = new Array(values.length).fill(NaN)
    let prev = NaN
    for (let i = 0; i < values.length; i++) {
      if (Number.isFinite(prev) && Number.isFinite(values[i])) {
        prev = alpha * values[i] + (1 - alpha) * prev
        out[i] = prev
        continue
      }
      // Re-seed: the simple average of the window, na if any bar in it is na.
      prev = NaN
      if (i < length - 1) continue
      let sum = 0
      let clean = true
      for (let k = 0; k < length; k++) {
        const v = values[i - k]
        if (!Number.isFinite(v)) {
          clean = false
          break
        }
        sum += v
      }
      if (!clean) continue
      prev = sum / length
      out[i] = prev
    }
    return out
  }

  registerIndicator({
    id: 'oa-mcnicholl-moving-average',
    name: 'McNicholl Moving Average (MNMA)',
    category: 'Moving Averages',
    placement: 'onchart',

    inputs: [
      {
        key: 'length',
        type: 'number',
        label: 'Length',
        default: 20,
        min: 2,
        max: 5000,
        step: 1,
        tooltip: 'A length of 1 makes alpha 1 and the recombination divide by zero, so 2 is the floor.',
      },
      { key: 'highlightMovements', type: 'boolean', label: 'Highlight Movements ?', default: true },
      { key: 'source', type: 'source', label: 'Source', default: 'close' },
    ],

    plots: [
      {
        key: 'mnma',
        type: 'line',
        title: 'MNMA',
        style: { color: '#6d1e7f', lineWidth: 2 },
        colorBy({ index, values, settings }) {
          if (settings.highlightMovements === false) return '#6d1e7f'
          const series = values.mnma
          const cur = series[index]
          const prev = index >= 1 ? series[index - 1] : null
          // Pine compares against na as false, so the first drawn bar is not "up".
          if (!Number.isFinite(cur) || !Number.isFinite(prev)) return '#FF5252'
          return cur > prev ? '#4CAF50' : '#FF5252'
        },
      },
    ],

    calc(bars, settings) {
      // A cleared number field arrives as '', and Number('') is 0.
      const length = Math.max(2, Math.floor(Number(settings.length) || 20))
      const src = sourceValues(bars, settings.source ?? 'close')

      const alpha = 2 / (length + 1)
      const ema1 = pineEma(src, length)
      const ema2 = pineEma(ema1, length)

      const out = new Array(bars.length).fill(NaN)
      const denom = 1 - alpha
      if (Math.abs(denom) > 1e-12) {
        for (let i = 0; i < bars.length; i++) {
          if (!Number.isFinite(ema1[i]) || !Number.isFinite(ema2[i])) continue
          out[i] = ((2 - alpha) * ema1[i] - ema2[i]) / denom
        }
      }

      return { mnma: nulls(out) }
    },
  })
}
