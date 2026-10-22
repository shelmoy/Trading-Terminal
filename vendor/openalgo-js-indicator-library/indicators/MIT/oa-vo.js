/**
 * Volume Oscillator (VO) - ported to openalgo-charts from Pine Script v6.
 *
 * Source: https://github.com/mihakralj/pinescript/blob/c4e91b962be09733d8fc76caa5191e9e586c5cee/indicators/volume/vo.pine
 * Repo:   mihakralj/pinescript
 * License: MIT (c) mihakralj
 * SPDX-FileCopyrightText: (c) mihakralj
 * SPDX-FileCopyrightText: (c) 2026 marketcalls (port to openalgo-charts)
 * SPDX-License-Identifier: MIT
 *
 * The percentage gap between a fast and a slow average of volume, plotted with
 * its own averaged signal line, so volume expansion and contraction read as an
 * oscillator around zero.
 */

export default function ({ registerIndicator, nulls }) {
  // Pine keeps a circular buffer seeded with na and divides by the number of
  // filled slots, so the window expands from a single bar until it reaches the
  // period. There is no na warmup: bar 0 already carries a value.
  const expandingMean = (values, period) => {
    const out = new Array(values.length).fill(NaN)
    let sum = 0
    for (let i = 0; i < values.length; i++) {
      sum += values[i]
      if (i >= period) sum -= values[i - period]
      const count = Math.min(i + 1, period)
      out[i] = count > 0 ? sum / count : values[i]
    }
    return out
  }

  registerIndicator({
    id: 'oa-vo',
    name: 'Volume Oscillator (VO)',
    category: 'Volume',
    placement: 'pane',

    inputs: [
      {
        key: 'shortPeriod',
        type: 'number',
        label: 'Short Period',
        default: 5,
        min: 1,
        max: 50,
        step: 1,
        tooltip: 'Period for short-term volume moving average',
      },
      {
        key: 'longPeriod',
        type: 'number',
        label: 'Long Period',
        default: 10,
        min: 2,
        max: 100,
        step: 1,
        tooltip: 'Period for long-term volume moving average',
      },
      {
        key: 'signalPeriod',
        type: 'number',
        label: 'Signal Period',
        default: 10,
        min: 1,
        max: 50,
        step: 1,
        tooltip: 'Period for signal line moving average',
      },
    ],

    plots: [
      { key: 'vo', type: 'line', title: 'Volume Oscillator', style: { color: '#ffeb3b', lineWidth: 2 } },
      { key: 'signal', type: 'line', title: 'Signal Line', style: { color: '#2196f3', lineWidth: 2 } },
    ],

    calc(bars, settings) {
      // A cleared number field arrives as '', and Number('') is 0.
      const shortPeriod = Math.max(1, Math.floor(Number(settings.shortPeriod) || 5))
      const longPeriod = Math.max(2, Math.floor(Number(settings.longPeriod) || 10))
      const signalPeriod = Math.max(1, Math.floor(Number(settings.signalPeriod) || 10))

      // Pine: volume_val = math.max(nz(vol, 0.0), 1.0). A chart with no volume
      // at all therefore contributes 1.0 per bar rather than dividing by zero.
      const volumeVal = new Array(bars.length)
      for (let i = 0; i < bars.length; i++) {
        const v = Number.isFinite(bars[i].volume) ? bars[i].volume : 0
        volumeVal[i] = Math.max(v, 1)
      }

      const shortMa = expandingMean(volumeVal, shortPeriod)
      const longMa = expandingMean(volumeVal, longPeriod)

      const vo = new Array(bars.length).fill(NaN)
      for (let i = 0; i < bars.length; i++) {
        vo[i] = longMa[i] > 0 ? ((shortMa[i] - longMa[i]) / longMa[i]) * 100 : 0
      }

      const signal = expandingMean(vo, signalPeriod)

      return { vo: nulls(vo), signal: nulls(signal) }
    },
  })
}
