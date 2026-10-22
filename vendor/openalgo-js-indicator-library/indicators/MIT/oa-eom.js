/**
 * Ease of Movement (EOM) - ported to openalgo-charts from Pine Script v6.
 *
 * Source: https://github.com/mihakralj/pinescript/blob/c4e91b962be09733d8fc76caa5191e9e586c5cee/indicators/volume/eom.pine
 * Repo:   mihakralj/pinescript
 * License: MIT (c) mihakralj
 * SPDX-FileCopyrightText: (c) mihakralj
 * SPDX-FileCopyrightText: (c) 2026 marketcalls (port to openalgo-charts)
 * SPDX-License-Identifier: MIT
 *
 * How far the midpoint of a bar travelled per unit of volume: large moves on
 * light volume read high, grinding moves on heavy volume read near zero.
 */

export default function ({ registerIndicator, nulls }) {
  registerIndicator({
    id: 'oa-eom',
    name: 'Ease of Movement (EOM)',
    category: 'Volume',
    placement: 'pane',

    inputs: [
      { key: 'period', type: 'number', label: 'Period', default: 14, min: 1, max: 5000, step: 1 },
      { key: 'smoothing', type: 'number', label: 'Smoothing', default: 14, min: 1, max: 5000, step: 1 },
    ],

    plots: [
      { key: 'eom', type: 'line', title: 'EOM', style: { color: '#ffeb3b', lineWidth: 2 } },
    ],

    calc(bars, settings) {
      // The source calls eom(i_length, i_smoothing) against a signature of
      // (i_smoothing, i_vol_scale), so the "Period" input is the averaging
      // window and the "Smoothing" input is the volume divisor. Ported as
      // written rather than as the labels suggest.
      const window = Math.max(1, Math.floor(Number(settings.period) || 14))
      const volScale = Math.max(1, Math.floor(Number(settings.smoothing) || 14))

      const n = bars.length
      const out = new Array(n).fill(NaN)
      const buffer = new Array(window).fill(0)
      let head = 0
      let sum = 0
      // var float oldMidPoint = na, carried across bars.
      let oldMidPoint = NaN

      for (let i = 0; i < n; i++) {
        const b = bars[i]
        const hi = Number(b.high)
        const lo = Number(b.low)
        const midPoint = (hi + lo) * 0.5
        // nz(oldMidPoint, midPoint): the first bar has no previous midpoint, so
        // its change is zero rather than a spike.
        const midPointChange = midPoint - (Number.isFinite(oldMidPoint) ? oldMidPoint : midPoint)
        oldMidPoint = midPoint

        const priceRange = hi - lo
        const vol = Number(b.volume)
        // An index series carries no volume, and a halted bar has no range.
        // Either way boxRatio is na and the bar contributes zero.
        const hasBox = Number.isFinite(priceRange) && priceRange > 0 && Number.isFinite(vol) && vol > 0
        const boxRatio = hasBox ? (vol / volScale) / priceRange : NaN
        const rawEom = Number.isFinite(boxRatio) && boxRatio !== 0 ? midPointChange / boxRatio : 0

        // Circular buffer seeded with zeros: the oldest slot is only subtracted
        // once the window is full, so the first bars carry a partial mean
        // rather than a warmup gap. That is what the source plots.
        const oldest = buffer[head]
        if (i >= window) sum -= oldest
        const current = Number.isFinite(rawEom) ? rawEom : 0
        sum += current
        buffer[head] = current
        head = (head + 1) % window

        out[i] = i < window ? sum / (i + 1) : sum / window
      }

      return { eom: nulls(out) }
    },
  })
}
