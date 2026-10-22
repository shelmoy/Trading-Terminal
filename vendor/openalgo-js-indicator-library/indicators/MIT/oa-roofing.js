/**
 * Ehlers Roofing Filter (ROOFING) - ported to openalgo-charts from Pine Script v6.
 *
 * Source: https://github.com/mihakralj/pinescript/blob/c4e91b962be09733d8fc76caa5191e9e586c5cee/indicators/filters/roofing.pine
 * Repo:   mihakralj/pinescript
 * License: MIT
 * SPDX-FileCopyrightText: (c) mihakralj
 * SPDX-FileCopyrightText: (c) 2026 marketcalls (port to openalgo-charts)
 * SPDX-License-Identifier: MIT
 *
 * A 2-pole Butterworth highpass strips the trend below the HP cutoff, then a
 * Super Smoother strips the noise above the SS cutoff, leaving a bandpassed
 * series that oscillates around zero.
 */

export default function ({ registerIndicator, sourceValues, nulls }) {
  registerIndicator({
    id: 'oa-roofing',
    name: 'Ehlers Roofing Filter (ROOFING)',
    category: 'Filters',
    placement: 'pane',

    inputs: [
      {
        key: 'hpLength',
        type: 'number',
        label: 'HP Length',
        default: 48,
        min: 1,
        max: 5000,
        step: 1,
        tooltip: 'Highpass cutoff period: removes cycles longer than this',
      },
      {
        key: 'ssLength',
        type: 'number',
        label: 'SS Length',
        default: 10,
        min: 1,
        max: 5000,
        step: 1,
        tooltip: 'Super Smoother cutoff period: removes cycles shorter than this',
      },
      { key: 'source', type: 'source', label: 'Source', default: 'close' },
    ],

    plots: [{ key: 'roofing', type: 'line', title: 'Roofing', style: { color: '#ffeb3b', lineWidth: 2 } }],

    levels: () => [{ price: 0, title: 'Zero', color: '#787b86', dashed: true }],

    calc(bars, settings) {
      // A cleared number field arrives as '', and Number('') is 0.
      const hpLength = Math.max(1, Math.floor(Number(settings.hpLength) || 48))
      const ssLength = Math.max(1, Math.floor(Number(settings.ssLength) || 10))
      const src = sourceValues(bars, settings.source ?? 'close')

      const SQRT2_PI = Math.sqrt(2) * Math.PI

      // Stage 1 coefficients: 2-pole Butterworth highpass.
      const hpArg = SQRT2_PI / hpLength
      const hpExp = Math.exp(-hpArg)
      const hpC2 = 2 * hpExp * Math.cos(hpArg)
      const hpC3 = -hpExp * hpExp
      const hpC1 = (1 + hpC2 - hpC3) / 4

      // Stage 2 coefficients: Super Smoother.
      const ssArg = SQRT2_PI / ssLength
      const ssExp = Math.exp(-ssArg)
      const ssC2 = 2 * ssExp * Math.cos(ssArg)
      const ssC3 = -ssExp * ssExp
      const ssC1 = 1 - ssC2 - ssC3

      const hp = new Array(bars.length).fill(0)
      const roof = new Array(bars.length).fill(0)
      const out = new Array(bars.length).fill(NaN)

      for (let i = 0; i < bars.length; i++) {
        // nz(src, src[1]) then nz(src[1], ssrc) then nz(src[2], src1): the first
        // bars fold back onto the current price, so the highpass starts at zero.
        const raw = src[i]
        const prevRaw = i >= 1 ? src[i - 1] : NaN
        const ssrc = Number.isFinite(raw) ? raw : Number.isFinite(prevRaw) ? prevRaw : 0
        const src1 = i >= 1 && Number.isFinite(src[i - 1]) ? src[i - 1] : ssrc
        const src2 = i >= 2 && Number.isFinite(src[i - 2]) ? src[i - 2] : src1

        // nz(hp[1], 0.0) and nz(hp[2], 0.0).
        const hp1 = i >= 1 ? hp[i - 1] : 0
        const hp2 = i >= 2 ? hp[i - 2] : 0
        let hpCur = hpC1 * (ssrc - 2 * src1 + src2) + hpC2 * hp1 + hpC3 * hp2
        if (!Number.isFinite(hpCur)) hpCur = 0
        hp[i] = hpCur

        // nz(hp[1], hp_cur): at the first bar the highpass has no history.
        const hpPrev1 = i >= 1 ? hp[i - 1] : hpCur
        // nz(roof[1], hp_prev1) and nz(roof[2], nz(hp[2], hp_prev1)).
        const roof1 = i >= 1 ? roof[i - 1] : hpPrev1
        const roof2 = i >= 2 ? roof[i - 2] : hpPrev1
        let roofCur = ssC1 * hpCur + ssC2 * roof1 + ssC3 * roof2
        if (!Number.isFinite(roofCur)) roofCur = 0
        roof[i] = roofCur
        out[i] = roofCur
      }

      return { roofing: nulls(out) }
    },
  })
}
