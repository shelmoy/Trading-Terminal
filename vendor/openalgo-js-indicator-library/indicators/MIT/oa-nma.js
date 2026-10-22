/**
 * NMA - Natural Moving Average - ported to openalgo-charts from Pine Script v6.
 *
 * Source: https://github.com/mihakralj/pinescript/blob/c4e91b962be09733d8fc76caa5191e9e586c5cee/indicators/trends_IIR/nma.pine
 * Repo:   mihakralj/pinescript
 * License: MIT (c) mihakralj
 * SPDX-FileCopyrightText: (c) mihakralj
 * SPDX-FileCopyrightText: (c) 2026 marketcalls (port to openalgo-charts)
 * SPDX-License-Identifier: MIT
 *
 * Jim Sloman's Ocean Theory average: the smoothing ratio is the volatility of
 * log price weighted by a square-root kernel, so the line tracks fast when the
 * movement is concentrated in the newest bars and smooths hard when it is not.
 */

export default function ({ registerIndicator, sourceValues, nulls }) {
  registerIndicator({
    id: 'oa-nma',
    name: 'NMA - Natural Moving Average',
    category: 'Trends IIR',
    placement: 'onchart',

    inputs: [
      {
        key: 'period',
        type: 'number',
        label: 'Period',
        default: 40,
        min: 1,
        max: 5000,
        step: 1,
        tooltip: 'Lookback window for the volatility analysis that sets the adaptive smoothing ratio.',
      },
      { key: 'source', type: 'source', label: 'Source', default: 'close' },
    ],

    plots: [{ key: 'nma', type: 'line', title: 'NMA', style: { color: '#ffeb3b', lineWidth: 2 } }],

    calc(bars, settings) {
      // A cleared number field arrives as '', and Number('') is 0.
      const period = Math.max(1, Math.floor(Number(settings.period) || 40))
      const src = sourceValues(bars, settings.source ?? 'close')
      const n = bars.length
      const out = new Array(n).fill(NaN)

      // Circular buffer of scaled log prices, period + 1 slots seeded to 0.0
      // exactly as the Pine source seeds array.new_float(period + 1, 0.0). The
      // seed matters: on the earliest bars the oldest slot is still 0.0 and
      // feeds a large oi term, which is part of the source's behaviour.
      const size = period + 1
      const lnBuf = new Array(size).fill(0)
      let head = 0
      let result = 0

      for (let b = 0; b < n; b++) {
        const s = Number.isFinite(src[b]) ? src[b] : 0

        // Step 1: scaled natural log of price.
        lnBuf[head] = s > 0 ? Math.log(s) * 1000 : 0

        // Step 2: volatility-weighted square-root kernel over the lookback.
        let num = 0
        let denom = 0
        const count = Math.min(b + 1, period)
        for (let i = 0; i < count; i++) {
          const idx0 = (head - i + size) % size
          const idx1 = (head - i - 1 + size) % size
          const oi = Math.abs(lnBuf[idx0] - lnBuf[idx1])
          num += oi * (Math.sqrt(i + 1) - Math.sqrt(i))
          denom += oi
        }
        head = (head + 1) % size

        // Step 3: adaptive ratio. Guard the divide for a run of identical bars.
        const ratio = denom !== 0 ? num / denom : 0

        // Step 4: IIR adaptive step, seeded from the first bar's source value.
        if (b === 0) result = s
        else result = result + ratio * (s - result)

        out[b] = Number.isFinite(result) ? result : NaN
      }

      return { nma: nulls(out) }
    },
  })
}
