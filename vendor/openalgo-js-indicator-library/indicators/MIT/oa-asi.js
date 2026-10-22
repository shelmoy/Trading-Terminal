/**
 * Accumulation Swing Index (ASI) - ported to openalgo-charts from Pine Script v6.
 *
 * Source: https://github.com/mihakralj/pinescript/blob/c4e91b962be09733d8fc76caa5191e9e586c5cee/indicators/momentum/asi.pine
 * Repo:   mihakralj/pinescript
 * License: MIT (c) mihakralj
 * SPDX-FileCopyrightText: (c) mihakralj
 * SPDX-FileCopyrightText: (c) 2026 marketcalls (port to openalgo-charts)
 * SPDX-License-Identifier: MIT
 *
 * Wilder's Swing Index accumulated bar by bar: each bar contributes a signed
 * score built from the current close against the previous close and open,
 * scaled by the widest of the bar's own ranges and by a limit move constant.
 */

export default function ({ registerIndicator, nulls }) {
  registerIndicator({
    id: 'oa-asi',
    name: 'Accumulation Swing Index (ASI)',
    category: 'Momentum',
    placement: 'pane',

    inputs: [
      {
        key: 'limitMove',
        type: 'number',
        label: 'Limit Move',
        default: 3,
        min: 0.001,
        max: 1000000,
        step: 0.1,
        tooltip: 'Maximum daily price change (T). Use 3.0 for stocks, adjust for futures or forex.',
      },
    ],

    plots: [{ key: 'asi', type: 'line', title: 'ASI', style: { color: '#ffeb3b', lineWidth: 2 } }],

    levels: () => [{ price: 0, title: 'Zero Line', color: '#787b86', dashed: true }],

    calc(bars, settings) {
      const n = bars.length
      // A cleared number field arrives as '', and Number('') is 0, which would
      // divide by zero in the K / T term.
      const limitMove = Math.max(0.001, Number(settings.limitMove) || 3)

      const out = new Array(n).fill(NaN)
      let acc = 0

      for (let i = 0; i < n; i++) {
        const bar = bars[i]
        const high = bar.high
        const low = bar.low
        const close = bar.close
        const open = bar.open
        if (!Number.isFinite(high) || !Number.isFinite(low) || !Number.isFinite(close) || !Number.isFinite(open)) {
          out[i] = acc
          continue
        }

        // nz(close[1], close) on the first bar, so the swing of bar 0 is zero
        // anyway: Pine forces si to 0 there.
        const prevClose = i > 0 && Number.isFinite(bars[i - 1].close) ? bars[i - 1].close : close
        const prevOpen = i > 0 && Number.isFinite(bars[i - 1].open) ? bars[i - 1].open : open

        let si = 0
        if (i > 0) {
          const absHC = Math.abs(high - prevClose)
          const absLC = Math.abs(low - prevClose)
          const absHL = Math.abs(high - low)
          const absC1O1 = Math.abs(prevClose - prevOpen)
          const K = Math.max(absHC, absLC)

          let R
          if (absHC >= absLC && absHC >= absHL) R = absHC - 0.5 * absLC + 0.25 * absC1O1
          else if (absLC >= absHC && absLC >= absHL) R = absLC - 0.5 * absHC + 0.25 * absC1O1
          else R = absHL + 0.25 * absC1O1

          if (R !== 0) {
            const swing = (close - prevClose) + 0.5 * (close - open) + 0.25 * (prevClose - prevOpen)
            si = ((50 * swing) / R) * (K / limitMove)
          }
        }

        if (!Number.isFinite(si)) si = 0
        acc += si
        out[i] = acc
      }

      return { asi: nulls(out) }
    },
  })
}
