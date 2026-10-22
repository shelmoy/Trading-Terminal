/**
 * Elastic Volume Weighted Moving Average (EVWMA) - ported to openalgo-charts from Pine Script v6.
 *
 * Source: https://github.com/mihakralj/pinescript/blob/c4e91b962be09733d8fc76caa5191e9e586c5cee/indicators/volume/evwma.pine
 * Repo:   mihakralj/pinescript
 * License: MIT (c) mihakralj
 * SPDX-FileCopyrightText: (c) mihakralj
 * SPDX-FileCopyrightText: (c) 2026 marketcalls (port to openalgo-charts)
 * SPDX-License-Identifier: MIT
 *
 * The average is displaced towards the current price in proportion to this
 * bar's share of the last N bars of volume, so heavy bars move the line far
 * and quiet bars barely move it at all.
 */

export default function ({ registerIndicator, sourceValues, nulls }) {
  registerIndicator({
    id: 'oa-evwma',
    name: 'Elastic Volume Weighted Moving Average (EVWMA)',
    category: 'Volume',
    placement: 'onchart',

    inputs: [
      { key: 'period', type: 'number', label: 'Period', default: 20, min: 1, max: 5000, step: 1 },
      { key: 'source', type: 'source', label: 'Source', default: 'close' },
    ],

    plots: [{ key: 'evwma', type: 'line', title: 'EVWMA', style: { color: '#ffeb3b', lineWidth: 2 } }],

    calc(bars, settings) {
      // A cleared number field arrives as '', and Number('') is 0.
      const period = Math.max(1, Math.floor(Number(settings.period) || 20))
      const src = sourceValues(bars, settings.source ?? 'close')

      const out = new Array(bars.length).fill(NaN)

      // Circular buffer of the last `period` volumes, and their running sum.
      const volBuffer = new Array(period).fill(0)
      let head = 0
      let count = 0
      let sumVol = 0
      let result = NaN

      for (let i = 0; i < bars.length; i += 1) {
        // Pine reads nz(volume, 0), so an index series with no volume at all
        // contributes nothing and the line simply holds its last value.
        const rawVol = bars[i].volume
        const curVol = Math.max(Number.isFinite(rawVol) ? rawVol : 0, 0)
        const curPrice = Number.isFinite(src[i]) ? src[i] : 0

        const oldVol = volBuffer[head]
        if (count >= period) sumVol -= oldVol
        else count += 1

        sumVol += curVol
        volBuffer[head] = curVol
        head = (head + 1) % period

        if (!Number.isFinite(result)) {
          // First bar: the average starts at the price rather than at zero.
          result = curPrice
        } else if (sumVol > 0) {
          result = ((sumVol - curVol) * result + curVol * curPrice) / sumVol
        }

        out[i] = result
      }

      return { evwma: nulls(out) }
    },
  })
}
