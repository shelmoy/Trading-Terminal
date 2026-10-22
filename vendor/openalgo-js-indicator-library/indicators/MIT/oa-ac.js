/**
 * Accelerator Oscillator (AC) - ported to openalgo-charts from Pine Script v6.
 *
 * Source: https://github.com/mihakralj/pinescript/blob/c4e91b962be09733d8fc76caa5191e9e586c5cee/indicators/oscillators/ac.pine
 * Repo:   mihakralj/pinescript
 * License: MIT
 * SPDX-FileCopyrightText: (c) mihakralj
 * SPDX-FileCopyrightText: (c) 2026 marketcalls (port to openalgo-charts)
 * SPDX-License-Identifier: MIT
 *
 * Bill Williams' measure of momentum acceleration: the Awesome Oscillator
 * (fast minus slow simple average of the bar midpoint) less its own 5-bar
 * average, so it turns before the driving momentum does.
 */

export default function ({ registerIndicator, nulls }) {
  // Pine fills each circular buffer with na and keeps a running sum and a count
  // of the filled slots, so the average is over the bars available so far and
  // the series emits from the very first bar instead of after a warmup gap.
  const runningMean = (values, length) => {
    const out = new Array(values.length).fill(NaN)
    const buf = new Array(length).fill(NaN)
    let head = 0
    let sum = 0
    let count = 0
    for (let i = 0; i < values.length; i++) {
      const oldest = buf[head]
      if (Number.isFinite(oldest)) {
        sum -= oldest
        count -= 1
      }
      const cur = values[i]
      if (Number.isFinite(cur)) {
        sum += cur
        count += 1
      }
      buf[head] = cur
      head = (head + 1) % length
      out[i] = count > 0 ? sum / count : NaN
    }
    return out
  }

  registerIndicator({
    id: 'oa-ac',
    name: 'Accelerator Oscillator (AC)',
    category: 'Oscillators',
    placement: 'pane',

    inputs: [
      { key: 'fastLength', type: 'number', label: 'Fast Length', default: 5, min: 1, max: 5000, step: 1 },
      { key: 'slowLength', type: 'number', label: 'Slow Length', default: 34, min: 2, max: 5000, step: 1 },
    ],

    plots: [
      {
        key: 'ac',
        type: 'line',
        title: 'AC',
        style: { color: '#26a69a', lineWidth: 2 },
        colorBy({ value }) {
          return value >= 0 ? '#26a69a' : '#ef5350'
        },
      },
    ],

    calc(bars, settings) {
      // A cleared number field arrives as '', and Number('') is 0.
      const fastLength = Math.max(1, Math.floor(Number(settings.fastLength) || 5))
      // Pine raises when the fast length is not shorter than the slow one; hold
      // the relationship instead of producing an undefined series.
      const slowLength = Math.max(fastLength + 1, Math.floor(Number(settings.slowLength) || 34))

      const mp = bars.map((b) => (b.high + b.low) / 2)
      const fastMA = runningMean(mp, fastLength)
      const slowMA = runningMean(mp, slowLength)

      const ao = new Array(bars.length).fill(NaN)
      for (let i = 0; i < bars.length; i++) {
        if (!Number.isFinite(fastMA[i]) || !Number.isFinite(slowMA[i])) continue
        ao[i] = fastMA[i] - slowMA[i]
      }

      // The AO smoothing window is a fixed 5 bars in the source.
      const aoSMA = runningMean(ao, 5)

      const out = new Array(bars.length).fill(NaN)
      for (let i = 0; i < bars.length; i++) {
        if (!Number.isFinite(ao[i]) || !Number.isFinite(aoSMA[i])) continue
        out[i] = ao[i] - aoSMA[i]
      }

      return { ac: nulls(out) }
    },
  })
}
