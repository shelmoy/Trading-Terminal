/**
 * Volume Weighted Moving Average (VWMA) - ported to openalgo-charts from Pine Script v6.
 *
 * Source: https://github.com/mihakralj/pinescript/blob/c4e91b962be09733d8fc76caa5191e9e586c5cee/indicators/volume/vwma.pine
 * Repo:   mihakralj/pinescript
 * License: MIT
 * SPDX-FileCopyrightText: (c) mihakralj
 * SPDX-FileCopyrightText: (c) 2026 marketcalls (port to openalgo-charts)
 * SPDX-License-Identifier: MIT
 *
 * A moving average that weights each bar by the volume traded on it, so the
 * bars the market actually participated in pull the average towards them and
 * quiet bars barely move it.
 */

export default function ({ registerIndicator, sourceValues, nulls }) {
  registerIndicator({
    id: 'oa-vwma',
    name: 'Volume Weighted Moving Average (VWMA)',
    category: 'Volume',
    placement: 'onchart',

    inputs: [
      { key: 'period', type: 'number', label: 'Period', default: 20, min: 1, max: 5000, step: 1 },
      { key: 'source', type: 'source', label: 'Source', default: 'close' },
    ],

    plots: [{ key: 'vwma', type: 'line', title: 'VWMA', style: { color: '#ffeb3b', lineWidth: 2 } }],

    calc(bars, settings) {
      // A cleared number field arrives as '', and Number('') is 0.
      const period = Math.max(1, Math.floor(Number(settings.period) || 20))
      const src = sourceValues(bars, settings.source ?? 'close')
      const n = bars.length
      const out = new Array(n).fill(NaN)

      // The source keeps a circular buffer of the last `period` bars and a pair
      // of running sums, so it emits from the very first bar on a partial
      // window rather than waiting out a warmup. Only bars whose volume is
      // above zero are added to either sum; a zero volume bar still occupies a
      // slot in the window and still ages out of it, which is what the price
      // and volume buffers are for. Subtracting a stored zero is a no-op, so
      // one pair of running sums reproduces the buffer exactly.
      let sumPv = 0
      let sumVol = 0
      for (let i = 0; i < n; i++) {
        const drop = i - period
        if (drop >= 0) {
          // Pine's nz() on the stored pair: a non-finite price or volume was
          // written into the buffer as 0 and leaves it as 0.
          const oldPrice = Number.isFinite(src[drop]) ? src[drop] : 0
          const oldVolume = Number.isFinite(bars[drop].volume) ? bars[drop].volume : 0
          if (oldVolume > 0) {
            sumPv -= oldPrice * oldVolume
            sumVol -= oldVolume
          }
        }

        const price = Number.isFinite(src[i]) ? src[i] : 0
        const volume = Number.isFinite(bars[i].volume) ? bars[i].volume : 0
        if (volume > 0) {
          sumPv += price * volume
          sumVol += volume
        }

        // Pine falls back to the raw source when the window carries no volume
        // at all, which is what an index series without volume produces.
        out[i] = sumVol > 0 ? sumPv / sumVol : src[i]
      }

      return { vwma: nulls(out) }
    },
  })
}
