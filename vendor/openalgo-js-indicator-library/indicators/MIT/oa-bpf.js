/**
 * Bandpass Filter (BPF) - ported to openalgo-charts from Pine Script v6.
 *
 * Source: https://github.com/mihakralj/pinescript/blob/c4e91b962be09733d8fc76caa5191e9e586c5cee/indicators/filters/bpf.pine
 * Repo:   mihakralj/pinescript
 * License: MIT (c) mihakralj
 * SPDX-FileCopyrightText: (c) mihakralj
 * SPDX-FileCopyrightText: (c) 2026 marketcalls (port to openalgo-charts)
 * SPDX-License-Identifier: MIT
 *
 * A two-pole highpass feeding a two-pole lowpass, so only the cycle band
 * between the two cutoff periods survives. The plotted line is the source with
 * that band removed, which is what the Pine script draws on the price pane.
 */

export default function ({ registerIndicator, sourceValues, nulls }) {
  registerIndicator({
    id: 'oa-bpf',
    name: 'Bandpass Filter (BPF)',
    category: 'Filters',
    placement: 'onchart',

    inputs: [
      { key: 'lower', type: 'number', label: 'Lower Cutoff', default: 10, min: 1, max: 5000, step: 1 },
      { key: 'upper', type: 'number', label: 'Higher Cutoff', default: 20, min: 1, max: 5000, step: 1 },
      { key: 'source', type: 'source', label: 'Source', default: 'close' },
    ],

    plots: [{ key: 'bandpass', type: 'line', title: 'Bandpass', style: { color: '#ffeb3b', lineWidth: 2 } }],

    calc(bars, settings) {
      // A cleared number field arrives as '', and Number('') is 0.
      const lp = Math.max(1, Math.floor(Number(settings.lower) || 10))
      const up = Math.max(1, Math.floor(Number(settings.upper) || 20))
      const src = sourceValues(bars, settings.source ?? 'close')

      const SQRT2_PI = Math.sqrt(2) * Math.PI

      // Highpass coefficients. Pine recomputes these only when the length
      // changes; the settings are fixed for a calc, so once per call matches.
      const hpArg = SQRT2_PI / lp
      const hpExpArg = Math.exp(-hpArg)
      const hpC2 = 2 * hpExpArg * Math.cos(hpArg)
      const hpC3 = -hpExpArg * hpExpArg
      const hpC1 = (1 + hpC2 - hpC3) / 4

      // Lowpass coefficients.
      const lpArg = SQRT2_PI / up
      const lpExpArg = Math.exp(-lpArg)
      const lpC2 = 2 * lpExpArg * Math.cos(lpArg)
      const lpC3 = -lpExpArg * lpExpArg
      const lpC1 = 1 - lpC2 - lpC3

      const n = bars.length
      const hp = new Array(n).fill(NaN)
      const bp = new Array(n).fill(NaN)
      const out = new Array(n).fill(NaN)

      for (let i = 0; i < n; i++) {
        // ssrc = nz(src, src[1]): a missing value borrows the previous one.
        const raw = src[i]
        const prevRaw = i >= 1 ? src[i - 1] : NaN
        const ssrc = Number.isFinite(raw) ? raw : Number.isFinite(prevRaw) ? prevRaw : NaN
        // With neither finite the Pine result is na for this bar, and the next
        // bar's nz(hp[1], 0) picks the recursion back up from zero.
        if (!Number.isFinite(ssrc)) continue

        const src1 = i >= 1 && Number.isFinite(src[i - 1]) ? src[i - 1] : ssrc
        const src2 = i >= 2 && Number.isFinite(src[i - 2]) ? src[i - 2] : src1
        const hp1 = i >= 1 && Number.isFinite(hp[i - 1]) ? hp[i - 1] : 0
        const hp2 = i >= 2 && Number.isFinite(hp[i - 2]) ? hp[i - 2] : 0

        hp[i] = hpC1 * (ssrc - 2 * src1 + src2) + hpC2 * hp1 + hpC3 * hp2

        // bp1 seeds from the current highpass value on the very first bar,
        // exactly as nz(bpf_val[1], hp) does.
        const bp1 = i >= 1 && Number.isFinite(bp[i - 1]) ? bp[i - 1] : hp[i]
        const bp2 = i >= 2 && Number.isFinite(bp[i - 2]) ? bp[i - 2] : bp1

        bp[i] = lpC1 * hp[i] + lpC2 * bp1 + lpC3 * bp2

        // The source plots i_source - filt, with the raw (not nz-filled) source.
        if (Number.isFinite(raw)) out[i] = raw - bp[i]
      }

      return { bandpass: nulls(out) }
    },
  })
}
