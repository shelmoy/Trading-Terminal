/**
 * Price Volume Divergence (PVD) - ported to openalgo-charts from Pine Script v6.
 *
 * Source: https://github.com/mihakralj/pinescript/blob/c4e91b962be09733d8fc76caa5191e9e586c5cee/indicators/volume/pvd.pine
 * Repo:   mihakralj/pinescript
 * License: MIT
 * SPDX-FileCopyrightText: (c) mihakralj
 * SPDX-FileCopyrightText: (c) 2026 marketcalls (port to openalgo-charts)
 * SPDX-License-Identifier: MIT
 *
 * Compares the sign of price momentum against the sign of volume momentum and
 * scales the disagreement by how large both moves were, so the line is positive
 * when price and volume pull in opposite directions and negative when they agree.
 */

export default function ({ registerIndicator, nulls }) {
  registerIndicator({
    id: 'oa-pvd',
    name: 'Price Volume Divergence (PVD)',
    category: 'Volume',
    placement: 'pane',

    inputs: [
      { key: 'pricePeriod', type: 'number', label: 'Price Period', default: 14, min: 1, max: 100, step: 1 },
      { key: 'volumePeriod', type: 'number', label: 'Volume Period', default: 14, min: 1, max: 100, step: 1 },
      {
        key: 'divergenceThreshold',
        type: 'number',
        label: 'Divergence Threshold',
        default: 50,
        min: 0,
        max: 100000,
        step: 1,
        tooltip: 'Carried over from the source script, which declares it but does not use it in the plotted line.',
      },
      { key: 'smoothing', type: 'number', label: 'Smoothing Period', default: 3, min: 1, max: 20, step: 1 },
    ],

    plots: [
      { key: 'pvd', type: 'line', title: 'PVD', style: { color: '#ffeb3b', lineWidth: 2 } },
    ],

    calc(bars, settings) {
      // A cleared number field arrives as '', and Number('') is 0.
      const pricePeriod = Math.min(100, Math.max(1, Math.floor(Number(settings.pricePeriod) || 14)))
      const volumePeriod = Math.min(100, Math.max(1, Math.floor(Number(settings.volumePeriod) || 14)))
      const smoothing = Math.min(20, Math.max(1, Math.floor(Number(settings.smoothing) || 3)))
      const n = bars.length

      // Pine: nz(c, close) for price, math.max(nz(vol, 0.0), 1.0) for volume.
      // The volume floor of 1 is what keeps this usable on a series that
      // carries no volume at all.
      const close = new Array(n)
      const vol = new Array(n)
      for (let i = 0; i < n; i++) {
        const c = bars[i].close
        close[i] = Number.isFinite(c) ? c : 0
        const v = bars[i].volume
        vol[i] = Math.max(Number.isFinite(v) ? v : 0, 1)
      }

      const out = new Array(n).fill(NaN)

      // The smoother is a circular buffer seeded with na, so it averages
      // however many values it has seen and emits from the first bar.
      const buf = new Array(smoothing).fill(NaN)
      let head = 0
      let sum = 0
      let count = 0

      for (let i = 0; i < n; i++) {
        // Pine: bar_index < period ? x[math.max(bar_index, 1)] : x[period].
        // On bar 0 that reads one bar back, which does not exist, so the
        // reference is na and the rate of change falls through to 0.
        const priceLag = i < pricePeriod ? Math.max(i, 1) : pricePeriod
        const volumeLag = i < volumePeriod ? Math.max(i, 1) : volumePeriod
        const pIdx = i - priceLag
        const vIdx = i - volumeLag

        const prevClose = pIdx >= 0 ? close[pIdx] : NaN
        const prevVolume = vIdx >= 0 ? vol[vIdx] : NaN

        const priceRoc =
          Number.isFinite(prevClose) && prevClose > 0 ? ((close[i] - prevClose) / prevClose) * 100 : 0
        const volumeRoc =
          Number.isFinite(prevVolume) && prevVolume > 0 ? ((vol[i] - prevVolume) / prevVolume) * 100 : 0

        const priceMomentum = priceRoc > 0 ? 1 : priceRoc < 0 ? -1 : 0
        const volumeMomentum = volumeRoc > 0 ? 1 : volumeRoc < 0 ? -1 : 0
        const magnitude = Math.abs(priceRoc) + Math.abs(volumeRoc)

        // Opposite signs give a positive product, which is the divergence.
        const raw = priceMomentum * -volumeMomentum * magnitude

        const oldest = buf[head]
        if (Number.isFinite(oldest)) {
          sum -= oldest
          count -= 1
        }
        if (Number.isFinite(raw)) {
          sum += raw
          count += 1
        }
        buf[head] = raw
        head = (head + 1) % smoothing

        out[i] = count > 0 ? sum / count : raw
      }

      return { pvd: nulls(out) }
    },
  })
}
