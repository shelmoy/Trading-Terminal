/**
 * Deviation-Scaled Moving Average (DSMA) - ported to openalgo-charts from Pine Script v6.
 *
 * Source: https://github.com/mihakralj/pinescript/blob/c4e91b962be09733d8fc76caa5191e9e586c5cee/indicators/trends_IIR/dsma.pine
 * Repo:   mihakralj/pinescript
 * License: MIT
 * SPDX-FileCopyrightText: (c) mihakralj
 * SPDX-FileCopyrightText: (c) 2026 marketcalls (port to openalgo-charts)
 * SPDX-License-Identifier: MIT
 *
 * Ehlers' adaptive average: a two-pole super-smoother runs on the tracking error
 * and its RMS sets the smoothing factor, so the line accelerates when the error
 * is large relative to its own recent size and crawls when it is small.
 */

export default function ({ registerIndicator, sourceValues, nulls }) {
  registerIndicator({
    id: 'oa-dsma',
    name: 'Deviation-Scaled Moving Average (DSMA)',
    category: 'Trends IIR',
    placement: 'onchart',

    inputs: [
      { key: 'source', type: 'source', label: 'Source', default: 'close' },
      { key: 'period', type: 'number', label: 'Period', default: 25, min: 2, max: 5000, step: 1 },
      {
        key: 'scale',
        type: 'number',
        label: 'Scale Factor',
        default: 0.9,
        min: 0.01,
        max: 0.9,
        step: 0.01,
        tooltip: 'Combined scaling and smoothing factor. Higher reacts faster to the deviation-scaled error.',
      },
    ],

    plots: [{ key: 'dsma', type: 'line', title: 'DSMA', style: { color: '#ffeb3b', lineWidth: 2 } }],

    calc(bars, settings) {
      // A cleared number field arrives as '', and Number('') is 0.
      const period = Math.max(2, Math.floor(Number(settings.period) || 25))
      const scaleFactor = Math.min(0.9, Math.max(0.01, Number(settings.scale) || 0.9))
      const src = sourceValues(bars, settings.source ?? 'close')
      const n = bars.length

      const a1 = Math.exp((-1.414 * Math.PI) / (period * 0.5))
      const b1 = 2 * a1 * Math.cos((1.414 * Math.PI) / (period * 0.5))
      const c1 = 1 - b1 + a1 * a1
      const c1Half = c1 * 0.5
      const periodRecip = 1 / period
      const scaleAdjustment = scaleFactor * 5 * periodRecip
      const a1Sq = a1 * a1

      const out = new Array(n).fill(NaN)

      // All of these are `var` in Pine: they carry across bars.
      let result = NaN
      let filt1 = 0
      let filt2 = 0
      let zeros1 = 0
      let sumSquared = 0
      const filtSquared = new Array(period).fill(0)
      let bufferIndex = 0

      for (let i = 0; i < n; i++) {
        const s = src[i]
        if (!Number.isFinite(s)) {
          // Pine returns the carried result untouched on a na source bar.
          out[i] = result
          continue
        }

        if (!Number.isFinite(result)) {
          result = s
        } else {
          const zeros = s - result
          const filt = c1Half * (zeros + zeros1) + b1 * filt1 - a1Sq * filt2
          const filtSq = filt * filt
          sumSquared = sumSquared + filtSq - filtSquared[bufferIndex]
          filtSquared[bufferIndex] = filtSq
          bufferIndex = (bufferIndex + 1) % period
          // The 1e-10 floor is what keeps this divide safe on a flat series.
          const rms = Math.sqrt(Math.max(sumSquared * periodRecip, 1e-10))
          const alpha = Math.min(scaleAdjustment * Math.abs(filt / rms), 1)
          result = alpha * s + (1 - alpha) * result
          zeros1 = zeros
          filt2 = filt1
          filt1 = filt
        }
        out[i] = result
      }

      return { dsma: nulls(out) }
    },
  })
}
