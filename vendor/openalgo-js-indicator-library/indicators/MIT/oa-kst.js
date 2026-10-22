/**
 * KST Oscillator (KST) - ported to openalgo-charts from Pine Script v6.
 *
 * Source: https://github.com/mihakralj/pinescript/blob/c4e91b962be09733d8fc76caa5191e9e586c5cee/indicators/oscillators/kst.pine
 * Repo:   mihakralj/pinescript
 * License: MIT (c) mihakralj
 * SPDX-FileCopyrightText: (c) mihakralj
 * SPDX-FileCopyrightText: (c) 2026 marketcalls (port to openalgo-charts)
 * SPDX-License-Identifier: MIT
 *
 * Pring's Know Sure Thing: four rate-of-change series over increasing
 * lookbacks are each smoothed by a simple average and summed with weights
 * 1, 2, 3 and 4, then averaged again to give the signal line.
 */

export default function ({ registerIndicator, sourceValues, nulls }) {
  // Pine's sma_buf() is a circular buffer whose count grows with the bar
  // index, so it emits a partial average from the very first bar instead of
  // waiting out a warmup. Reproduce that growing window exactly.
  const runningMean = (values, period) => {
    const out = new Array(values.length).fill(NaN)
    const buf = new Array(period).fill(NaN)
    let head = 0
    let sum = 0
    let count = 0
    for (let i = 0; i < values.length; i++) {
      const oldest = buf[head]
      if (Number.isFinite(oldest)) sum -= oldest
      else count += 1
      // Pine feeds nz(source) into the buffer.
      const current = Number.isFinite(values[i]) ? values[i] : 0
      sum += current
      buf[head] = current
      head = (head + 1) % period
      out[i] = sum / Math.max(1, count)
    }
    return out
  }

  // roc = prev != 0 ? 100 * (src - prev) / prev : 0, with nz() on both legs,
  // so bars before the lookback exists read prev as 0 and the roc as 0.
  const rocSeries = (values, period) => {
    const out = new Array(values.length).fill(0)
    for (let i = 0; i < values.length; i++) {
      const src = Number.isFinite(values[i]) ? values[i] : 0
      const back = i - period >= 0 ? values[i - period] : NaN
      const prev = Number.isFinite(back) ? back : 0
      out[i] = prev !== 0 ? (100 * (src - prev)) / prev : 0
    }
    return out
  }

  const intInput = (value, fallback) =>
    Math.min(500, Math.max(1, Math.floor(Number(value) || fallback)))

  registerIndicator({
    id: 'oa-kst',
    name: 'KST Oscillator (KST)',
    category: 'Oscillators',
    placement: 'pane',

    inputs: [
      { key: 'source', type: 'source', label: 'Source', default: 'close' },
      { key: 'r1', type: 'number', label: 'ROC Period 1', default: 10, min: 1, max: 500, step: 1, tooltip: 'Shortest ROC lookback.' },
      { key: 'r2', type: 'number', label: 'ROC Period 2', default: 15, min: 1, max: 500, step: 1 },
      { key: 'r3', type: 'number', label: 'ROC Period 3', default: 20, min: 1, max: 500, step: 1 },
      { key: 'r4', type: 'number', label: 'ROC Period 4', default: 30, min: 1, max: 500, step: 1, tooltip: 'Longest ROC lookback.' },
      { key: 's1', type: 'number', label: 'SMA Smooth 1', default: 10, min: 1, max: 500, step: 1 },
      { key: 's2', type: 'number', label: 'SMA Smooth 2', default: 10, min: 1, max: 500, step: 1 },
      { key: 's3', type: 'number', label: 'SMA Smooth 3', default: 10, min: 1, max: 500, step: 1 },
      { key: 's4', type: 'number', label: 'SMA Smooth 4', default: 15, min: 1, max: 500, step: 1 },
      { key: 'signalPeriod', type: 'number', label: 'Signal Period', default: 9, min: 1, max: 500, step: 1, tooltip: 'SMA period for the signal line.' },
    ],

    plots: [
      { key: 'kst', type: 'line', title: 'KST', style: { color: '#ffeb3b', lineWidth: 2 } },
      { key: 'signal', type: 'line', title: 'Signal', style: { color: '#00bcd4', lineWidth: 1 } },
    ],

    levels: () => [{ price: 0, title: 'Zero', color: '#787b86', dashed: true }],

    calc(bars, settings) {
      // A cleared number field arrives as '', and Number('') is 0.
      const r1 = intInput(settings.r1, 10)
      const r2 = intInput(settings.r2, 15)
      const r3 = intInput(settings.r3, 20)
      const r4 = intInput(settings.r4, 30)
      const s1 = intInput(settings.s1, 10)
      const s2 = intInput(settings.s2, 10)
      const s3 = intInput(settings.s3, 10)
      const s4 = intInput(settings.s4, 15)
      const signalPeriod = intInput(settings.signalPeriod, 9)
      const src = sourceValues(bars, settings.source ?? 'close')

      const sm1 = runningMean(rocSeries(src, r1), s1)
      const sm2 = runningMean(rocSeries(src, r2), s2)
      const sm3 = runningMean(rocSeries(src, r3), s3)
      const sm4 = runningMean(rocSeries(src, r4), s4)

      const kst = new Array(bars.length).fill(NaN)
      for (let i = 0; i < bars.length; i++) {
        if (!Number.isFinite(sm1[i]) || !Number.isFinite(sm2[i]) || !Number.isFinite(sm3[i]) || !Number.isFinite(sm4[i])) continue
        kst[i] = 1 * sm1[i] + 2 * sm2[i] + 3 * sm3[i] + 4 * sm4[i]
      }
      const signal = runningMean(kst, signalPeriod)

      return { kst: nulls(kst), signal: nulls(signal) }
    },
  })
}
