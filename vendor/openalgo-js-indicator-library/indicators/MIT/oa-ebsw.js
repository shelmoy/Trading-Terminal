/**
 * Ehlers Even Better Sinewave (EBSW) - ported to openalgo-charts from Pine Script v6.
 *
 * Source: https://github.com/mihakralj/pinescript/blob/c4e91b962be09733d8fc76caa5191e9e586c5cee/indicators/cycles/ebsw.pine
 * Repo:   mihakralj/pinescript
 * License: MIT
 * SPDX-FileCopyrightText: (c) mihakralj
 * SPDX-FileCopyrightText: (c) 2026 marketcalls (port to openalgo-charts)
 * SPDX-License-Identifier: MIT
 *
 * A high-pass filter strips the trend, a super smoother keeps the cycle, and an
 * automatic gain control normalises the result into a bounded wave between -1
 * and +1.
 */

export default function ({ registerIndicator, sourceValues, nulls }) {
  registerIndicator({
    id: 'oa-ebsw',
    name: 'Ehlers Even Better Sinewave (EBSW)',
    category: 'Cycles',
    placement: 'pane',

    inputs: [
      { key: 'source', type: 'source', label: 'Source', default: 'close' },
      {
        key: 'hpLength',
        type: 'number',
        label: 'High-Pass Filter Length',
        default: 40,
        min: 1,
        max: 5000,
        step: 1,
        tooltip: 'Period for detrending the price data.',
      },
      {
        key: 'ssfLength',
        type: 'number',
        label: 'Super Smoother Filter Length',
        default: 10,
        min: 1,
        max: 5000,
        step: 1,
        tooltip: 'Period for smoothing the cycle component.',
      },
    ],

    plots: [{ key: 'ebsw', type: 'line', title: 'EBSW', style: { color: '#ffeb3b', lineWidth: 2 } }],

    levels() {
      return [{ price: 0, title: 'Zero Line', color: '#787b86', lineStyle: 'dashed' }]
    },

    calc(bars, settings) {
      // A cleared number field arrives as '', and Number('') is 0.
      const hpLength = Math.max(1, Math.floor(Number(settings.hpLength) || 40))
      const ssfLength = Math.max(1, Math.floor(Number(settings.ssfLength) || 10))
      const src = sourceValues(bars, settings.source ?? 'close')

      const n = bars.length
      const out = new Array(n).fill(NaN)

      const pi = 2 * Math.asin(1)

      // High-pass filter coefficient.
      const angleHp = (2 * pi) / hpLength
      const cosHp = Math.cos(angleHp)
      let alpha1Hp = cosHp === 0 ? 0 : (1 - Math.sin(angleHp)) / cosHp
      if (!Number.isFinite(alpha1Hp)) alpha1Hp = 0

      // Super smoother coefficients.
      const angleSsf = (Math.sqrt(2) * pi) / ssfLength
      const alpha2Ssf = Math.exp(-angleSsf)
      const betaSsf = 2 * alpha2Ssf * Math.cos(angleSsf)
      const c2 = betaSsf
      const c3 = -alpha2Ssf * alpha2Ssf
      const c1 = 1 - c2 - c3

      // var state: Pine initialises hp and filt to 0.0, so nz() of the first
      // bar's history reads as 0 and the series emits from index 0.
      let hpPrev = 0.0
      let filt1 = 0.0
      let filt2 = 0.0
      let srcPrev = 0.0
      let seeded = false

      for (let i = 0; i < n; i++) {
        const s = src[i]
        if (!Number.isFinite(s)) continue

        // nz(src[1]) is 0 on the very first bar.
        const prevSrc = seeded ? srcPrev : 0.0
        const hp = 0.5 * (1 + alpha1Hp) * (s - prevSrc) + alpha1Hp * hpPrev
        const hpBefore = seeded ? hpPrev : 0.0

        const filt = c1 * ((hp + hpBefore) / 2) + c2 * filt1 + c3 * filt2

        const waveVal = (filt + filt1 + filt2) / 3.0
        const pwr = (filt * filt + filt1 * filt1 + filt2 * filt2) / 3.0
        const sineWave = pwr === 0 || !Number.isFinite(pwr) ? 0 : waveVal / Math.sqrt(pwr)
        out[i] = Number.isFinite(sineWave) ? Math.min(1, Math.max(-1, sineWave)) : 0

        filt2 = filt1
        filt1 = filt
        hpPrev = hp
        srcPrev = s
        seeded = true
      }

      return { ebsw: nulls(out) }
    },
  })
}
