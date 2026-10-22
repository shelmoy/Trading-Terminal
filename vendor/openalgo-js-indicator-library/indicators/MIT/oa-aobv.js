/**
 * AOBV - Archer On-Balance Volume (AOBV) - ported to openalgo-charts from Pine Script v6.
 *
 * Source: https://github.com/mihakralj/pinescript/blob/c4e91b962be09733d8fc76caa5191e9e586c5cee/indicators/volume/aobv.pine
 * Repo:   mihakralj/pinescript
 * License: MIT (c) mihakralj
 * SPDX-FileCopyrightText: (c) mihakralj
 * SPDX-FileCopyrightText: (c) 2026 marketcalls (port to openalgo-charts)
 * SPDX-License-Identifier: MIT
 *
 * Runs a fast and a slow bias-compensated exponential average over On-Balance
 * Volume, so the two lines read accumulation and distribution without the long
 * dead start a raw EMA of OBV would have.
 */

export default function ({ registerIndicator, sourceValues, nulls }) {
  // The source hard-codes the two smoothing lengths.
  const PERIODS = [4, 14]

  registerIndicator({
    id: 'oa-aobv',
    name: 'AOBV - Archer On-Balance Volume (AOBV)',
    category: 'Volume',
    placement: 'pane',

    inputs: [
      { key: 'source', type: 'source', label: 'Source', default: 'close' },
      { key: 'volumeSource', type: 'source', label: 'Volume', default: 'volume' },
    ],

    plots: [
      { key: 'fast', type: 'line', title: 'AOBV Fast', style: { color: '#2196f3', lineWidth: 2 } },
      { key: 'slow', type: 'line', title: 'AOBV Slow', style: { color: '#ff5252', lineWidth: 2 } },
    ],

    calc(bars, settings) {
      const src = sourceValues(bars, settings.source ?? 'close')
      const vol = sourceValues(bars, settings.volumeSource ?? 'volume')

      // Per-period smoothing state, carried across bars exactly as the Pine
      // var arrays do: alpha is 2 / period here, not 2 / (period + 1).
      const alpha = PERIODS.map((p) => 2 / Math.max(p, 1))
      const beta = alpha.map((a) => 1 - a)
      const emaVal = PERIODS.map(() => NaN)
      const decay = PERIODS.map(() => 1)
      const warmup = PERIODS.map(() => true)

      const fast = new Array(bars.length).fill(NaN)
      const slow = new Array(bars.length).fill(NaN)
      const out = [fast, slow]

      let prevSrc = NaN
      let obv = 0

      for (let i = 0; i < bars.length; i++) {
        const rawSrc = src[i]
        const rawVol = vol[i]
        const hasSrc = Number.isFinite(rawSrc)
        // Volume is genuinely absent on index series; Pine reads na as 0.
        const safeVol = Number.isFinite(rawVol) ? rawVol : 0
        const safeSrc = hasSrc ? rawSrc : (Number.isFinite(prevSrc) ? prevSrc : 0)
        const safePrev = Number.isFinite(prevSrc) ? prevSrc : safeSrc

        let delta = 0
        if (safeSrc > safePrev) delta = safeVol
        else if (safeSrc < safePrev) delta = -safeVol

        obv = i === 0 ? delta : obv + delta
        if (hasSrc) prevSrc = rawSrc

        for (let k = 0; k < PERIODS.length; k++) {
          if (!Number.isFinite(emaVal[k])) {
            // First bar: seed the average at zero and publish raw OBV.
            emaVal[k] = 0
            out[k][i] = obv
            continue
          }
          emaVal[k] = alpha[k] * (obv - emaVal[k]) + emaVal[k]
          if (warmup[k]) {
            const e = decay[k] * beta[k]
            decay[k] = e
            const denom = 1 - e
            // 1 - beta^n is only zero if beta is exactly 1, which 2 / period
            // never produces, but a divide still gets a guard.
            out[k][i] = Number.isFinite(denom) && denom !== 0 ? emaVal[k] / denom : emaVal[k]
            if (e <= 1e-10) warmup[k] = false
          } else {
            out[k][i] = emaVal[k]
          }
        }
      }

      return { fast: nulls(fast), slow: nulls(slow) }
    },
  })
}
