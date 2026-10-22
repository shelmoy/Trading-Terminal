/**
 * Bessel 2nd Order Filter (BESSEL) - ported to openalgo-charts from Pine Script v6.
 *
 * Source: https://github.com/mihakralj/pinescript/blob/c4e91b962be09733d8fc76caa5191e9e586c5cee/indicators/filters/bessel.pine
 * Repo:   mihakralj/pinescript
 * License: MIT
 * SPDX-FileCopyrightText: (c) mihakralj
 * SPDX-FileCopyrightText: (c) 2026 marketcalls (port to openalgo-charts)
 * SPDX-License-Identifier: MIT
 *
 * A two-pole IIR lowpass whose coefficients come from a Bessel prototype, so
 * the passband keeps close to a linear phase and the smoothed line lags the
 * price by an almost constant amount instead of by a length that changes with
 * how fast the market is moving.
 */

export default function ({ registerIndicator, sourceValues, nulls }) {
  registerIndicator({
    id: 'oa-bessel',
    name: 'Bessel 2nd Order Filter (BESSEL)',
    category: 'Filters',
    placement: 'onchart',

    inputs: [
      { key: 'length', type: 'number', label: 'Length', default: 20, min: 2, max: 5000, step: 1 },
      { key: 'source', type: 'source', label: 'Source', default: 'close' },
    ],

    plots: [{ key: 'bessel', type: 'line', title: 'Bessel', style: { color: '#ffeb3b', lineWidth: 2 } }],

    calc(bars, settings) {
      // A cleared number field arrives as '', and Number('') is 0.
      const length = Math.max(2, Math.floor(Number(settings.length) || 20))
      const src = sourceValues(bars, settings.source ?? 'close')

      // Pine: safe_length = math.max(length, 2); the coefficients are constant
      // for the whole series, so they are computed once here.
      const safeLength = Math.max(length, 2)
      const a = Math.exp(-Math.PI / safeLength)
      const c2 = 2 * a * Math.cos((1.738 * Math.PI) / safeLength)
      const c3 = -a * a
      const c1 = 1 - c2 - c3

      const filt = new Array(bars.length).fill(NaN)
      for (let i = 0; i < bars.length; i++) {
        // Pine seeds the recursion on the first two bars with nz(src, 0.0).
        if (i < 2) {
          filt[i] = Number.isFinite(src[i]) ? src[i] : 0
          continue
        }
        // ssrc = nz(src, src[1]), filt1 = nz(filt[1], ssrc), filt2 = nz(filt[2], filt1)
        let ssrc = src[i]
        if (!Number.isFinite(ssrc)) ssrc = Number.isFinite(src[i - 1]) ? src[i - 1] : 0
        const filt1 = Number.isFinite(filt[i - 1]) ? filt[i - 1] : ssrc
        const filt2 = Number.isFinite(filt[i - 2]) ? filt[i - 2] : filt1
        filt[i] = c1 * ssrc + c2 * filt1 + c3 * filt2
      }

      return { bessel: nulls(filt) }
    },
  })
}
