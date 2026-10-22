/**
 * Ehlers MESA Stochastic (MSTOCH) - ported to openalgo-charts from Pine Script v6.
 *
 * Source: https://github.com/mihakralj/pinescript/blob/c4e91b962be09733d8fc76caa5191e9e586c5cee/indicators/oscillators/mstoch.pine
 * Repo:   mihakralj/pinescript
 * License: MIT
 * SPDX-FileCopyrightText: (c) mihakralj
 * SPDX-FileCopyrightText: (c) 2026 marketcalls (port to openalgo-charts)
 * SPDX-License-Identifier: MIT
 *
 * A roofing filter (two-pole highpass plus super smoother) strips trend and
 * noise out of the source, a stochastic is taken on what is left, and a second
 * super smoother cleans that up into a 0 to 1 oscillator.
 * Reference: John F. Ehlers, Cycle Analytics for Traders (2013), Chapter 6.
 */

export default function ({ registerIndicator, sourceValues, nulls }) {
  registerIndicator({
    id: 'oa-mstoch',
    name: 'Ehlers MESA Stochastic (MSTOCH)',
    category: 'Oscillators',
    placement: 'pane',

    inputs: [
      { key: 'stochLength', type: 'number', label: 'Stochastic Length', default: 20, min: 2, max: 500, step: 1 },
      {
        key: 'hpLength',
        type: 'number',
        label: 'HP Length',
        default: 48,
        min: 1,
        max: 5000,
        step: 1,
        tooltip: 'Highpass cutoff period: removes cycles longer than this.',
      },
      {
        key: 'ssLength',
        type: 'number',
        label: 'SS Length',
        default: 10,
        min: 1,
        max: 5000,
        step: 1,
        tooltip: 'Super Smoother cutoff period: removes cycles shorter than this.',
      },
      { key: 'source', type: 'source', label: 'Source', default: 'close' },
    ],

    plots: [
      { key: 'mstoch', type: 'line', title: 'MSTOCH', style: { color: '#ffeb3b', lineWidth: 2 } },
    ],

    levels: () => [
      { price: 0.8, title: 'Overbought', color: '#787b86', dashed: true },
      { price: 0.5, title: 'Midline', color: '#787b86', dashed: true },
      { price: 0.2, title: 'Oversold', color: '#787b86', dashed: true },
    ],

    calc(bars, settings) {
      // A cleared number field arrives as '', and Number('') is 0.
      const stochLength = Math.max(2, Math.min(500, Math.floor(Number(settings.stochLength) || 20)))
      const hpLength = Math.max(1, Math.floor(Number(settings.hpLength) || 48))
      const ssLength = Math.max(1, Math.floor(Number(settings.ssLength) || 10))
      const src = sourceValues(bars, settings.source ?? 'close')

      const n = bars.length
      const SQRT2_PI = Math.sqrt(2) * Math.PI

      // Stage 1a: two-pole Butterworth highpass.
      const hpArg = SQRT2_PI / hpLength
      const hpExp = Math.exp(-hpArg)
      const hpC2 = 2 * hpExp * Math.cos(hpArg)
      const hpC3 = -hpExp * hpExp
      const hpC1 = (1 + hpC2 - hpC3) / 4

      // Stage 1b: super smoother, reused again in stage 3.
      const ssArg = SQRT2_PI / ssLength
      const ssExp = Math.exp(-ssArg)
      const ssC2 = 2 * ssExp * Math.cos(ssArg)
      const ssC3 = -ssExp * ssExp
      const ssC1 = 1 - ssC2 - ssC3

      const hp = new Array(n).fill(0)
      const filt = new Array(n).fill(0)
      const stoc = new Array(n).fill(0)
      const mstoc = new Array(n).fill(0)
      const out = new Array(n).fill(NaN)

      for (let i = 0; i < n; i++) {
        // Pine folds the first two bars back onto themselves through nz(), which
        // also keeps the recursion finite if a sample is ever missing.
        const raw = src[i]
        const prev1 = i >= 1 ? src[i - 1] : NaN
        const prev2 = i >= 2 ? src[i - 2] : NaN
        const ssrc = Number.isFinite(raw) ? raw : Number.isFinite(prev1) ? prev1 : 0
        const src1 = Number.isFinite(prev1) ? prev1 : ssrc
        const src2 = Number.isFinite(prev2) ? prev2 : src1

        // The highpass state is a var seeded at zero, so hp[1] and hp[2] read 0.
        const hp1 = i >= 1 ? hp[i - 1] : 0
        const hp2 = i >= 2 ? hp[i - 2] : 0
        hp[i] = hpC1 * (ssrc - 2 * src1 + src2) + hpC2 * hp1 + hpC3 * hp2

        // The smoother instead seeds from the highpass output itself.
        const hpPrev = i >= 1 ? hp[i - 1] : hp[i]
        const filtPrev = i >= 1 ? filt[i - 1] : hp[i]
        const filtPrev2 = i >= 2 ? filt[i - 2] : hpPrev
        filt[i] = (ssC1 * (hp[i] + hpPrev)) / 2 + ssC2 * filtPrev + ssC3 * filtPrev2

        // Stage 2: stochastic across the filtered series. Bars before the start
        // of history read the current value, matching nz(filt[count], filt).
        let highestC = filt[i]
        let lowestC = filt[i]
        for (let count = 1; count <= stochLength - 1; count++) {
          const val = i - count >= 0 ? filt[i - count] : filt[i]
          if (val > highestC) highestC = val
          if (val < lowestC) lowestC = val
        }
        const rangeVal = highestC - lowestC
        stoc[i] = rangeVal > 0 ? (filt[i] - lowestC) / rangeVal : 0.5

        // Stage 3: a second super smoother over the stochastic.
        const stocPrev = i >= 1 ? stoc[i - 1] : stoc[i]
        const mstocPrev = i >= 1 ? mstoc[i - 1] : stoc[i]
        const mstocPrev2 = i >= 2 ? mstoc[i - 2] : stocPrev
        mstoc[i] = (ssC1 * (stoc[i] + stocPrev)) / 2 + ssC2 * mstocPrev + ssC3 * mstocPrev2

        out[i] = Math.max(0, Math.min(1, mstoc[i]))
      }

      return { mstoch: nulls(out) }
    },
  })
}
