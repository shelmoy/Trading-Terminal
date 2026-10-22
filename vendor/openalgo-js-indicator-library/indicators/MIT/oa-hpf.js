/**
 * Highpass Filter (2-Pole) (HPF) - ported to openalgo-charts from Pine Script v6.
 *
 * Source: https://github.com/mihakralj/pinescript/blob/c4e91b962be09733d8fc76caa5191e9e586c5cee/indicators/filters/hpf.pine
 * Repo:   mihakralj/pinescript
 * License: MIT
 * SPDX-FileCopyrightText: (c) mihakralj
 * SPDX-FileCopyrightText: (c) 2026 marketcalls (port to openalgo-charts)
 * SPDX-License-Identifier: MIT
 *
 * A 2-pole IIR highpass removes everything slower than the cutoff period; what
 * the study draws is the remainder, source minus highpass, which is the trend
 * component left behind once the fast oscillation is stripped out.
 */

export default function ({ registerIndicator, sourceValues, nulls }) {
  registerIndicator({
    id: 'oa-hpf',
    name: 'Highpass Filter (2-Pole) (HPF)',
    category: 'Filters',
    placement: 'onchart',

    inputs: [
      {
        key: 'length',
        type: 'number',
        label: 'Length',
        default: 40,
        min: 1,
        max: 5000,
        step: 1,
        tooltip: 'Cutoff period: cycles faster than this are removed from the drawn line.',
      },
      { key: 'source', type: 'source', label: 'Source', default: 'close' },
    ],

    plots: [
      {
        key: 'trend',
        type: 'line',
        title: 'Trend Component',
        style: { color: '#ffeb3b', lineWidth: 2 },
      },
    ],

    calc(bars, settings) {
      // A cleared number field arrives as '', and Number('') is 0.
      const length = Math.max(1, Math.floor(Number(settings.length) || 40))
      const src = sourceValues(bars, settings.source ?? 'close')
      const n = bars.length

      const omega = (2 * Math.PI) / length
      const cosOmega = Math.cos(omega)
      // cos(omega) is never exactly zero for an integer length in double
      // precision, but guard the divide anyway rather than emit Infinity.
      let alpha = cosOmega !== 0 ? (cosOmega + Math.sin(omega) - 1) / cosOmega : 0
      if (!Number.isFinite(alpha)) alpha = 0

      const gain = (1 - alpha / 2) * (1 - alpha / 2)
      const oneMinusAlpha = 1 - alpha

      const hp = new Array(n).fill(0)
      const trend = new Array(n).fill(NaN)

      for (let i = 0; i < n; i++) {
        const raw = src[i]
        const raw1 = i >= 1 ? src[i - 1] : NaN
        const raw2 = i >= 2 ? src[i - 2] : NaN

        // nz(src, src[1]), then nz(src[1], ssrc), then nz(src[2], src1).
        const ssrc = Number.isFinite(raw) ? raw : Number.isFinite(raw1) ? raw1 : 0
        const s1 = Number.isFinite(raw1) ? raw1 : ssrc
        const s2 = Number.isFinite(raw2) ? raw2 : s1

        const hp1 = i >= 1 ? hp[i - 1] : 0
        const hp2 = i >= 2 ? hp[i - 2] : 0

        hp[i] =
          gain * (ssrc - 2 * s1 + s2) +
          2 * oneMinusAlpha * hp1 -
          oneMinusAlpha * oneMinusAlpha * hp2

        // The source plots the raw input minus the highpass component.
        trend[i] = Number.isFinite(raw) && Number.isFinite(hp[i]) ? raw - hp[i] : NaN
      }

      return { trend: nulls(trend) }
    },
  })
}
