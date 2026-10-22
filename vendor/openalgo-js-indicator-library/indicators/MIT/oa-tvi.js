/**
 * Trade Volume Index (TVI) - ported to openalgo-charts from Pine Script v6.
 *
 * Source: https://github.com/mihakralj/pinescript/blob/c4e91b962be09733d8fc76caa5191e9e586c5cee/indicators/volume/tvi.pine
 * Repo:   mihakralj/pinescript
 * License: MIT
 * SPDX-FileCopyrightText: (c) mihakralj
 * SPDX-FileCopyrightText: (c) 2026 marketcalls (port to openalgo-charts)
 * SPDX-License-Identifier: MIT
 *
 * Volume is added while price ticks up by more than a minimum move and
 * subtracted while it ticks down by more than that, with moves inside the
 * threshold leaving the last direction in place.
 */

export default function ({ registerIndicator, sourceValues, nulls }) {
  registerIndicator({
    id: 'oa-tvi',
    name: 'Trade Volume Index (TVI)',
    category: 'Volume',
    placement: 'pane',

    inputs: [
      {
        key: 'source',
        type: 'source',
        label: 'Price Field',
        default: 'close',
        tooltip: 'Open, High, Low or Closing price',
      },
      {
        key: 'minTick',
        type: 'number',
        label: 'Min. Move',
        default: 0.125,
        min: 0.0001,
        step: 0.0001,
        tooltip: 'Minimum price change to register direction',
      },
    ],

    plots: [{ key: 'tvi', type: 'line', title: 'TVI', style: { color: '#ffeb3b', lineWidth: 2 } }],

    calc(bars, settings) {
      // A cleared number field arrives as '', and Number('') is 0.
      const minTick = Math.max(0.0001, Number(settings.minTick) || 0.125)
      const src = sourceValues(bars, settings.source ?? 'close')
      const n = bars.length
      const out = new Array(n).fill(NaN)

      // Pine seeds direction at 1, so the first bar always adds its volume.
      let direction = 1
      let tviSum = 0.0

      for (let i = 0; i < n; i++) {
        // nz(price, close): an unusable source value falls back to the close.
        const p = Number.isFinite(src[i]) ? src[i] : bars[i].close
        // Index series carry no volume, and nz(vol, 0.0) reads that as 0.
        const v = Number.isFinite(bars[i].volume) ? bars[i].volume : 0
        if (!Number.isFinite(p)) {
          out[i] = tviSum
          continue
        }

        // nz(p[1], p): the first bar compares against itself, so change is 0
        // and the seeded direction carries.
        const prevRaw = i > 0 ? (Number.isFinite(src[i - 1]) ? src[i - 1] : bars[i - 1].close) : NaN
        const prev = Number.isFinite(prevRaw) ? prevRaw : p
        const priceChange = p - prev

        if (priceChange > minTick) direction = 1
        else if (priceChange < -minTick) direction = 0

        tviSum += direction === 1 ? v : -v
        out[i] = tviSum
      }

      return { tvi: nulls(out) }
    },
  })
}
