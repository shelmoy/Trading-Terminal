/**
 * Ehlers Sine Wave (SINE) - ported to openalgo-charts from Pine Script v6.
 *
 * Source: https://github.com/mihakralj/pinescript/blob/c4e91b962be09733d8fc76caa5191e9e586c5cee/indicators/cycles/sine.pine
 * Repo:   mihakralj/pinescript
 * License: MIT (c) mihakralj
 * SPDX-FileCopyrightText: (c) mihakralj
 * SPDX-FileCopyrightText: (c) 2026 marketcalls (port to openalgo-charts)
 * SPDX-License-Identifier: MIT
 *
 * Detrends price with a two-pole high-pass filter, smooths the result with a
 * Super Smoother, then normalises the in-phase component against a Hilbert
 * quadrature pair, giving a cycle phase bounded to -1 .. +1.
 */

export default function ({ registerIndicator, sourceValues, nulls }) {
  registerIndicator({
    id: 'oa-sine',
    name: 'Ehlers Sine Wave (SINE)',
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
        tooltip: 'Detrending period: cycles longer than this are removed.',
      },
      {
        key: 'ssfLength',
        type: 'number',
        label: 'Super-Smoother Filter Length',
        default: 10,
        min: 1,
        max: 5000,
        step: 1,
        tooltip: 'Cycle smoothing period applied after detrending.',
      },
    ],

    plots: [{ key: 'sine', type: 'line', title: 'SINE', style: { color: '#ffeb3b', lineWidth: 2 } }],

    levels: () => [{ price: 0, title: 'Zero Line', color: '#787b86', dashed: true }],

    calc(bars, settings) {
      // A cleared number field arrives as '', and Number('') is 0.
      const hpLength = Math.max(1, Math.floor(Number(settings.hpLength) || 40))
      const ssfLength = Math.max(1, Math.floor(Number(settings.ssfLength) || 10))
      const src = sourceValues(bars, settings.source ?? 'close')

      const n = bars.length
      const out = new Array(n).fill(NaN)
      if (n === 0) return { sine: nulls(out) }

      const pi = Math.PI
      const angHP = (2 * pi) / hpLength
      const cosHP = Math.cos(angHP)
      // At hpLength = 4 the angle is pi/2, where (1 - sin) and cos both vanish.
      // The limit of the ratio there is 0, so return the limit rather than
      // letting a near-zero denominator produce a meaningless huge coefficient.
      const aHP = Math.abs(cosHP) > 1e-12 ? (1 - Math.sin(angHP)) / cosHP : 0

      const angSSF = (Math.SQRT2 * pi) / ssfLength
      const aSSF = Math.exp(-angSSF)
      const bSSF = 2 * aSSF * Math.cos(angSSF)
      const c2 = bSSF
      const c3 = -aSSF * aSSF
      const c1 = 1 - c2 - c3

      const hp = new Array(n).fill(0)
      const filt = new Array(n).fill(0)
      // Pine's nz(x[k]): out of range or not-a-number reads as zero.
      const nz = (arr, i) => (i >= 0 && Number.isFinite(arr[i]) ? arr[i] : 0)

      for (let i = 0; i < n; i++) {
        const s = Number.isFinite(src[i]) ? src[i] : 0
        const sPrev = i > 0 && Number.isFinite(src[i - 1]) ? src[i - 1] : 0

        hp[i] = 0.5 * (1 + aHP) * (s - sPrev) + aHP * nz(hp, i - 1)
        filt[i] = (c1 * (hp[i] + nz(hp, i - 1))) / 2 + c2 * nz(filt, i - 1) + c3 * nz(filt, i - 2)

        const q =
          0.0962 * nz(filt, i - 3) +
          0.5769 * nz(filt, i - 1) -
          0.5769 * nz(filt, i - 5) -
          0.0962 * nz(filt, i - 7)
        const inPhase = filt[i]
        const pwr = inPhase * inPhase + q * q
        const sineWave = pwr === 0 ? 0 : inPhase / Math.sqrt(pwr)
        if (!Number.isFinite(sineWave)) continue
        out[i] = Math.min(1, Math.max(-1, sineWave))
      }

      return { sine: nulls(out) }
    },
  })
}
