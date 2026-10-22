/**
 * Bull-Bear Power Ratio (BRAR) - ported to openalgo-charts from Pine Script v6.
 *
 * Source: https://github.com/mihakralj/pinescript/blob/c4e91b962be09733d8fc76caa5191e9e586c5cee/indicators/oscillators/brar.pine
 * Repo:   mihakralj/pinescript
 * License: MIT (c) mihakralj
 * SPDX-FileCopyrightText: (c) mihakralj
 * SPDX-FileCopyrightText: (c) 2026 marketcalls (port to openalgo-charts)
 * SPDX-License-Identifier: MIT
 *
 * BR compares the strength above the previous close with the strength below it,
 * AR does the same against the current open, both as rolling sums scaled to 100
 * so that a reading above the equilibrium line means buyers are in control.
 */

export default function ({ registerIndicator, nulls }) {
  registerIndicator({
    id: 'oa-brar',
    name: 'Bull-Bear Power Ratio (BRAR)',
    category: 'Oscillators',
    placement: 'pane',

    inputs: [
      {
        key: 'period',
        type: 'number',
        label: 'Period',
        default: 26,
        min: 1,
        max: 5000,
        step: 1,
        tooltip: 'Rolling window for summation (traditional: 26)',
      },
    ],

    plots: [
      { key: 'br', type: 'line', title: 'BR', style: { color: '#00bcd4', lineWidth: 2 } },
      { key: 'ar', type: 'line', title: 'AR', style: { color: '#ffeb3b', lineWidth: 2 } },
    ],

    levels: () => [{ price: 100, title: 'Equilibrium', color: '#787b86', lineStyle: 'dotted' }],

    calc(bars, settings) {
      // A cleared number field arrives as '', and Number('') is 0.
      const period = Math.max(1, Math.min(5000, Math.floor(Number(settings.period) || 26)))

      const n = bars.length
      const br = new Array(n).fill(NaN)
      const ar = new Array(n).fill(NaN)

      // Pine keeps four circular buffers seeded with 0.0, so before a full
      // window exists the sums simply cover the bars seen so far.
      const brNumBuf = new Array(n).fill(0)
      const brDenBuf = new Array(n).fill(0)
      const arNumBuf = new Array(n).fill(0)
      const arDenBuf = new Array(n).fill(0)

      let brNumSum = 0
      let brDenSum = 0
      let arNumSum = 0
      let arDenSum = 0

      for (let i = 0; i < n; i++) {
        const high = bars[i].high
        const low = bars[i].low
        const open = bars[i].open
        const usable = Number.isFinite(high) && Number.isFinite(low) && Number.isFinite(open)

        if (usable) {
          // nz(close[1], open): the open stands in for the missing prior close.
          const prevClose = i > 0 && Number.isFinite(bars[i - 1].close) ? bars[i - 1].close : open
          brNumBuf[i] = Math.max(0.0, high - prevClose)
          brDenBuf[i] = Math.max(0.0, prevClose - low)
          arNumBuf[i] = Math.max(0.0, high - open)
          arDenBuf[i] = Math.max(0.0, open - low)
        }

        brNumSum += brNumBuf[i]
        brDenSum += brDenBuf[i]
        arNumSum += arNumBuf[i]
        arDenSum += arDenBuf[i]
        if (i >= period) {
          brNumSum -= brNumBuf[i - period]
          brDenSum -= brDenBuf[i - period]
          arNumSum -= arNumBuf[i - period]
          arDenSum -= arDenBuf[i - period]
        }

        if (!usable) continue
        br[i] = brDenSum !== 0 ? (brNumSum / brDenSum) * 100.0 : 100.0
        ar[i] = arDenSum !== 0 ? (arNumSum / arDenSum) * 100.0 : 100.0
      }

      return { br: nulls(br), ar: nulls(ar) }
    },
  })
}
