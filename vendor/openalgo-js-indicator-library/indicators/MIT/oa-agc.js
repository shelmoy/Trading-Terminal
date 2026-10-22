/**
 * Ehlers Automatic Gain Control (AGC) - ported to openalgo-charts from Pine Script v6.
 *
 * Source: https://github.com/mihakralj/pinescript/blob/c4e91b962be09733d8fc76caa5191e9e586c5cee/indicators/filters/agc.pine
 * Repo:   mihakralj/pinescript
 * License: MIT
 * SPDX-FileCopyrightText: (c) mihakralj
 * SPDX-FileCopyrightText: (c) 2026 marketcalls (port to openalgo-charts)
 * SPDX-License-Identifier: MIT
 *
 * A roofing filter (2-pole Butterworth highpass into a Super Smoother) detrends
 * price into a zero-mean oscillation, then an exponentially decaying peak
 * tracker normalises that oscillation into a constant-amplitude [-1, +1] signal.
 */

export default function ({ registerIndicator, sourceValues, nulls }) {
  registerIndicator({
    id: 'oa-agc',
    name: 'Ehlers Automatic Gain Control (AGC)',
    category: 'Filters',
    placement: 'pane',

    inputs: [
      {
        key: 'decay',
        type: 'number',
        label: 'Decay',
        default: 0.991,
        min: 0.9,
        max: 0.9999,
        step: 0.001,
        tooltip: 'Peak decay factor per bar (0.991 is roughly a 110-bar half-life).',
      },
      {
        key: 'hpLength',
        type: 'number',
        label: 'HP Length',
        default: 48,
        min: 1,
        max: 5000,
        step: 1,
        tooltip: 'Highpass cutoff period: removes trend cycles longer than this.',
      },
      {
        key: 'ssLength',
        type: 'number',
        label: 'SS Length',
        default: 10,
        min: 1,
        max: 5000,
        step: 1,
        tooltip: 'Super Smoother cutoff: removes noise cycles shorter than this.',
      },
      { key: 'source', type: 'source', label: 'Source', default: 'close' },
    ],

    plots: [
      { key: 'agc', type: 'line', title: 'AGC', style: { color: '#2962ff', lineWidth: 2 } },
      { key: 'filter', type: 'line', title: 'Filter', style: { color: '#9598a1', lineWidth: 1 } },
    ],

    levels: () => [
      { price: 1, title: '+1', color: '#9598a1', dashed: true },
      { price: 0, title: 'Zero', color: '#9598a1', dashed: true },
      { price: -1, title: '-1', color: '#9598a1', dashed: true },
    ],

    calc(bars, settings) {
      // A cleared number field arrives as '', and Number('') is 0.
      const decay = Math.min(0.9999, Math.max(0.9, Number(settings.decay) || 0.991))
      const hpLength = Math.max(1, Math.floor(Number(settings.hpLength) || 48))
      const ssLength = Math.max(1, Math.floor(Number(settings.ssLength) || 10))
      const src = sourceValues(bars, settings.source ?? 'close')
      const n = bars.length

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

      const hp = new Array(n).fill(0)
      const roof = new Array(n).fill(0)
      const filt = new Array(n).fill(NaN)
      const agc = new Array(n).fill(NaN)

      // Pine's `var float peak = 0.0000001` carries across bars inside one run.
      let peak = 0.0000001

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
        hp[i] = hpC1 * (ssrc - 2 * s1 + s2) + hpC2 * hp1 + hpC3 * hp2

        // nz(roof[1], hp) and nz(roof[2], nz(hp[1], hp)).
        const roof1 = i >= 1 ? roof[i - 1] : hp[i]
        const roof2 = i >= 2 ? roof[i - 2] : i >= 1 ? hp[i - 1] : hp[i]
        roof[i] = ssC1 * hp[i] + ssC2 * roof1 + ssC3 * roof2

        const value = Number.isFinite(roof[i]) ? roof[i] : 0
        peak = decay * peak
        const magnitude = Math.abs(value)
        if (magnitude > peak) peak = magnitude

        filt[i] = Number.isFinite(roof[i]) ? roof[i] : NaN
        agc[i] = peak > 0 ? value / peak : 0
      }

      return { agc: nulls(agc), filter: nulls(filt) }
    },
  })
}
