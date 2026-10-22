/**
 * Bulls Bears Index (BBI) - ported to openalgo-charts from Pine Script v6.
 *
 * Source: https://github.com/mihakralj/pinescript/blob/c4e91b962be09733d8fc76caa5191e9e586c5cee/indicators/oscillators/bbi.pine
 * Repo:   mihakralj/pinescript
 * License: MIT (c) mihakralj
 * SPDX-FileCopyrightText: (c) mihakralj
 * SPDX-FileCopyrightText: (c) 2026 marketcalls (port to openalgo-charts)
 * SPDX-License-Identifier: MIT
 *
 * The plain average of four simple moving averages of different lengths, so one
 * line carries the ultra-short, short, medium and long trend at once.
 */

export default function ({ registerIndicator, sourceValues, nulls }) {
  // Pine fills its circular buffer with na and divides by the count of filled
  // slots, so the average expands over the first `period` bars instead of being
  // na. ta.sma would be na there, so this cannot be the sma helper.
  const runningMean = (values, period) => {
    const p = Math.max(1, Math.floor(period))
    const buffer = new Array(p).fill(NaN)
    const out = new Array(values.length).fill(NaN)
    let head = 0
    let sum = 0
    let count = 0
    for (let i = 0; i < values.length; i++) {
      const oldest = buffer[head]
      if (Number.isFinite(oldest)) sum -= oldest
      else count += 1
      // Pine wraps the source in nz(), so a na source reads as 0 here.
      const val = Number.isFinite(values[i]) ? values[i] : 0
      sum += val
      buffer[head] = val
      head = (head + 1) % p
      out[i] = sum / Math.max(1, count)
    }
    return out
  }

  registerIndicator({
    id: 'oa-bbi',
    name: 'Bulls Bears Index (BBI)',
    category: 'Oscillators',
    placement: 'onchart',

    inputs: [
      { key: 'source', type: 'source', label: 'Source', default: 'close' },
      { key: 'p1', type: 'number', label: 'Period 1 (Ultra-Short)', default: 3, min: 1, max: 5000, step: 1 },
      { key: 'p2', type: 'number', label: 'Period 2 (Short)', default: 6, min: 1, max: 5000, step: 1 },
      { key: 'p3', type: 'number', label: 'Period 3 (Medium)', default: 12, min: 1, max: 5000, step: 1 },
      { key: 'p4', type: 'number', label: 'Period 4 (Long)', default: 24, min: 1, max: 5000, step: 1 },
    ],

    plots: [{ key: 'bbi', type: 'line', title: 'BBI', style: { color: '#ffeb3b', lineWidth: 2 } }],

    calc(bars, settings) {
      // A cleared number field arrives as '', and Number('') is 0.
      const p1 = Math.max(1, Math.min(5000, Math.floor(Number(settings.p1) || 3)))
      const p2 = Math.max(1, Math.min(5000, Math.floor(Number(settings.p2) || 6)))
      const p3 = Math.max(1, Math.min(5000, Math.floor(Number(settings.p3) || 12)))
      const p4 = Math.max(1, Math.min(5000, Math.floor(Number(settings.p4) || 24)))
      const src = sourceValues(bars, settings.source ?? 'close')

      const m1 = runningMean(src, p1)
      const m2 = runningMean(src, p2)
      const m3 = runningMean(src, p3)
      const m4 = runningMean(src, p4)

      const out = new Array(bars.length).fill(NaN)
      for (let i = 0; i < bars.length; i++) {
        if (!Number.isFinite(m1[i]) || !Number.isFinite(m2[i])) continue
        if (!Number.isFinite(m3[i]) || !Number.isFinite(m4[i])) continue
        out[i] = (m1[i] + m2[i] + m3[i] + m4[i]) / 4
      }

      return { bbi: nulls(out) }
    },
  })
}
