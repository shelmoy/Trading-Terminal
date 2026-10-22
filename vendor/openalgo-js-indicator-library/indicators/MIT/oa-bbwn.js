/**
 * Bollinger Band Width Normalized (BBWN) - ported to openalgo-charts from Pine Script v6.
 *
 * Source: https://github.com/mihakralj/pinescript/blob/c4e91b962be09733d8fc76caa5191e9e586c5cee/indicators/volatility/bbwn.pine
 * Repo:   mihakralj/pinescript
 * License: MIT (c) mihakralj
 * SPDX-FileCopyrightText: (c) mihakralj
 * SPDX-FileCopyrightText: (c) 2026 marketcalls (port to openalgo-charts)
 * SPDX-License-Identifier: MIT
 *
 * Bollinger band width rescaled against its own highest and lowest reading over
 * a lookback window, so a squeeze reads near zero and an expansion near one on
 * any instrument.
 */

export default function ({ registerIndicator, sourceValues, nulls }) {
  registerIndicator({
    id: 'oa-bbwn',
    name: 'Bollinger Band Width Normalized (BBWN)',
    category: 'Volatility',
    placement: 'pane',

    inputs: [
      { key: 'period', type: 'number', label: 'Period', default: 20, min: 1, max: 5000, step: 1 },
      { key: 'source', type: 'source', label: 'Source', default: 'close' },
      { key: 'multiplier', type: 'number', label: 'StdDev Multiplier', default: 2, min: 0.001, max: 100, step: 0.1 },
      {
        key: 'lookback',
        type: 'number',
        label: 'Lookback Period',
        default: 252,
        min: 1,
        max: 5000,
        step: 1,
        tooltip: 'Window of past band widths the current width is rescaled against.',
      },
    ],

    plots: [
      { key: 'bbwn', type: 'line', title: 'BBWN', style: { color: '#ffeb3b', lineWidth: 2 } },
    ],

    calc(bars, settings) {
      // A cleared number field arrives as '', and Number('') is 0.
      const period = Math.max(1, Math.floor(Number(settings.period) || 20))
      const multiplier = Math.max(0.001, Number(settings.multiplier) || 2)
      const lookback = Math.max(1, Math.floor(Number(settings.lookback) || 252))
      const src = sourceValues(bars, settings.source ?? 'close')

      const out = new Array(bars.length).fill(NaN)

      // Pine keeps two circular buffers of var state: one of source values for
      // the band width, one of band widths for the normalisation window.
      const p = Math.max(1, period)
      const buffer = new Array(p).fill(NaN)
      let head = 0
      let count = 0
      let sum = 0
      let sumSq = 0

      const l = Math.max(1, lookback)
      const histBuffer = new Array(l).fill(NaN)
      let histHead = 0
      let histCount = 0
      let minVal = NaN
      let maxVal = NaN

      for (let i = 0; i < bars.length; i++) {
        const oldest = buffer[head]
        if (Number.isFinite(oldest)) {
          sum -= oldest
          sumSq -= oldest * oldest
          count -= 1
        }

        const current = Number.isFinite(src[i]) ? src[i] : 0
        sum += current
        sumSq += current * current
        count += 1
        buffer[head] = current
        head = (head + 1) % p

        const basis = count > 0 ? sum / count : current
        // Population variance, exactly as the source computes it.
        const variance = count > 0 ? sumSq / count - basis * basis : 0
        const dev = count > 1 ? multiplier * Math.sqrt(Math.max(0, variance)) : 0
        const bbw = 2 * dev

        const histOldest = histBuffer[histHead]
        if (Number.isFinite(histOldest)) histCount -= 1
        if (Number.isFinite(bbw)) histCount += 1
        histBuffer[histHead] = bbw
        histHead = (histHead + 1) % l

        if (histCount >= 1) {
          // The source rescans slots 0..histCount-1, which covers exactly the
          // filled slots while the buffer fills and all of them once it wraps.
          minVal = bbw
          maxVal = bbw
          for (let k = 0; k < histCount; k++) {
            const val = histBuffer[k]
            if (!Number.isFinite(val)) continue
            if (val < minVal) minVal = val
            if (val > maxVal) maxVal = val
          }
        }

        const rangeVal = maxVal - minVal
        out[i] = Number.isFinite(rangeVal) && rangeVal > 0 ? (bbw - minVal) / rangeVal : 0.5
      }

      return { bbwn: nulls(out) }
    },
  })
}
