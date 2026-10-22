/**
 * Butterworth 2nd Order Filter (BUTTER) - ported to openalgo-charts from Pine Script v6.
 *
 * Source: https://github.com/mihakralj/pinescript/blob/c4e91b962be09733d8fc76caa5191e9e586c5cee/indicators/filters/butter.pine
 * Repo:   mihakralj/pinescript
 * License: MIT
 * SPDX-FileCopyrightText: (c) mihakralj
 * SPDX-FileCopyrightText: (c) 2026 marketcalls (port to openalgo-charts)
 * SPDX-License-Identifier: MIT
 *
 * A two-pole lowpass filter with a maximally flat passband, so it removes the
 * chop above its cutoff period without the ripple a sharper filter introduces.
 */

export default function ({ registerIndicator, sourceValues, nulls }) {
  registerIndicator({
    id: 'oa-butter',
    name: 'Butterworth 2nd Order Filter (BUTTER)',
    category: 'Filters',
    placement: 'onchart',

    inputs: [
      { key: 'length', type: 'number', label: 'Length', default: 20, min: 2, max: 5000, step: 1 },
      { key: 'source', type: 'source', label: 'Source', default: 'close' },
    ],

    plots: [
      { key: 'butter', type: 'line', title: 'Butterworth', style: { color: '#ffeb3b', lineWidth: 2 } },
    ],

    calc(bars, settings) {
      // A cleared number field arrives as '', and Number('') is 0.
      const length = Math.max(2, Math.floor(Number(settings.length) || 20))
      const src = sourceValues(bars, settings.source ?? 'close')
      const n = bars.length
      const out = new Array(n).fill(NaN)

      const safeLength = Math.max(length, 2)
      const omega = (2 * Math.PI) / safeLength
      const sinOmega = Math.sin(omega)
      const cosOmega = Math.cos(omega)
      const alpha = sinOmega / Math.sqrt(2)
      const a0 = 1 + alpha
      const a1 = -2 * cosOmega
      const a2 = 1 - alpha
      const b0 = (1 - cosOmega) / 2
      const b1 = 1 - cosOmega
      const b2 = (1 - cosOmega) / 2

      // omega never exceeds pi for safeLength >= 2, so sinOmega >= 0 and a0 >= 1.
      // The guard is here because a zero denominator would blank the whole plot.
      if (!Number.isFinite(a0) || a0 === 0) return { butter: nulls(out) }

      // filt[1] and filt[2]: the two previous filter outputs.
      let filt1 = NaN
      let filt2 = NaN

      for (let i = 0; i < n; i++) {
        let filt
        if (i < 2) {
          filt = Number.isFinite(src[i]) ? src[i] : 0
        } else {
          const prev1 = src[i - 1]
          const prev2 = src[i - 2]
          // nz(src, src[1]): the fallback may itself be na, and Pine lets that through.
          const ssrc = Number.isFinite(src[i]) ? src[i] : prev1
          const s1 = Number.isFinite(prev1) ? prev1 : ssrc
          const s2 = Number.isFinite(prev2) ? prev2 : s1
          const f1 = Number.isFinite(filt1) ? filt1 : ssrc
          const f2 = Number.isFinite(filt2) ? filt2 : f1
          filt = (b0 * ssrc + b1 * s1 + b2 * s2 - a1 * f1 - a2 * f2) / a0
        }

        if (Number.isFinite(filt)) out[i] = filt
        filt2 = filt1
        filt1 = filt
      }

      return { butter: nulls(out) }
    },
  })
}
