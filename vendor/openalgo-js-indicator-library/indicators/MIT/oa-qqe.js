/**
 * Quantitative Qualitative Estimation (QQE) - ported to openalgo-charts from Pine Script v6.
 *
 * Source: https://github.com/mihakralj/pinescript/blob/c4e91b962be09733d8fc76caa5191e9e586c5cee/indicators/oscillators/qqe.pine
 * Repo:   mihakralj/pinescript
 * License: MIT
 * SPDX-FileCopyrightText: (c) mihakralj
 * SPDX-FileCopyrightText: (c) 2026 marketcalls (port to openalgo-charts)
 * SPDX-License-Identifier: MIT
 *
 * A Wilder RSI is smoothed with an EMA, then a doubly smoothed average of its
 * own absolute change sets a volatility band whose trailing edge ratchets in the
 * direction of momentum, so the crossing of the two lines marks a momentum shift.
 */

export default function ({ registerIndicator, sourceValues, nulls }) {
  registerIndicator({
    id: 'oa-qqe',
    name: 'Quantitative Qualitative Estimation (QQE)',
    category: 'Oscillators',
    placement: 'pane',

    inputs: [
      { key: 'source', type: 'source', label: 'Source', default: 'close' },
      { key: 'rsiPeriod', type: 'number', label: 'RSI Period', default: 14, min: 1, max: 5000, step: 1 },
      {
        key: 'smoothFactor',
        type: 'number',
        label: 'Smooth Factor',
        default: 5,
        min: 1,
        max: 500,
        step: 1,
        tooltip: 'EMA length applied to the RSI, and the basis of the 2*SF-1 length used for the dynamic average range.',
      },
      {
        key: 'qqeFactor',
        type: 'number',
        label: 'QQE Factor',
        default: 4.236,
        min: 0.001,
        max: 100,
        step: 0.001,
        tooltip: 'Wilder multiplier applied to the dynamic average range to place the trailing band.',
      },
    ],

    plots: [
      { key: 'qqe', type: 'line', title: 'QQE', style: { color: '#ffeb3b', lineWidth: 2 } },
      { key: 'trail', type: 'line', title: 'Trailing', style: { color: '#00bcd4', lineWidth: 1 } },
    ],

    levels: () => [
      { price: 70, title: 'Overbought', color: '#ef5350', dashed: true },
      { price: 50, title: 'Midline', color: '#787b86', dashed: true },
      { price: 30, title: 'Oversold', color: '#26a69a', dashed: true },
    ],

    calc(bars, settings) {
      // A cleared number field arrives as '', and Number('') is 0.
      const rsiPeriod = Math.max(1, Math.floor(Number(settings.rsiPeriod) || 14))
      const smoothFactor = Math.max(1, Math.floor(Number(settings.smoothFactor) || 5))
      const qqeFactor = Math.max(0.001, Number(settings.qqeFactor) || 4.236)
      const src = sourceValues(bars, settings.source ?? 'close')

      const EPSILON = 1e-10
      const n = bars.length
      const qqeCol = new Array(n).fill(NaN)
      const trailCol = new Array(n).fill(NaN)

      const rmaAlpha = 1 / rsiPeriod
      const rmaBeta = 1 - rmaAlpha
      const sfAlpha = 2 / (smoothFactor + 1)
      const sfBeta = 1 - sfAlpha
      // The dynamic average range uses period 2*SF-1, so alpha collapses to 1/SF.
      const darAlpha = 2 / (2 * smoothFactor - 1 + 1)
      const darBeta = 1 - darAlpha

      // Every stage seeds its raw accumulator at zero and divides out the
      // remaining seed weight (1 - beta^n), which is what lets the source emit
      // a value from the very first bar instead of waiting out a warmup.
      let prevSrc = NaN
      let rmaGain = 0
      let rmaLoss = 0
      let eRma = 1
      let rawRsiMa = 0
      let eRsiMa = 1
      let prevRsiMa = NaN
      let rawDar1 = 0
      let eDar1 = 1
      let rawDar2 = 0
      let eDar2 = 1
      let trail = 0
      let prevRsiMa2 = 50

      for (let i = 0; i < n; i++) {
        // Stage 1: Wilder RSI through a compensated RMA.
        const s = Number.isFinite(src[i]) ? src[i] : 0
        const chg = Number.isFinite(prevSrc) ? s - prevSrc : 0
        prevSrc = s
        const gain = chg > 0 ? chg : 0
        const loss = chg < 0 ? -chg : 0

        rmaGain = rmaGain * rmaBeta + gain * rmaAlpha
        rmaLoss = rmaLoss * rmaBeta + loss * rmaAlpha
        eRma *= rmaBeta
        const cRma = eRma > EPSILON ? 1 / (1 - eRma) : 1
        const avgGain = rmaGain * cRma
        const avgLoss = rmaLoss * cRma
        const rs = avgLoss === 0 ? 100 : avgGain / avgLoss
        const rsiVal = 100 - 100 / (1 + rs)

        // Stage 2: compensated EMA of the RSI.
        rawRsiMa = rawRsiMa * sfBeta + rsiVal * sfAlpha
        eRsiMa *= sfBeta
        const cRsiMa = eRsiMa > EPSILON ? 1 / (1 - eRsiMa) : 1
        const rsiMa = rawRsiMa * cRsiMa

        // Stage 3: double compensated EMA of |delta(rsiMa)| gives the range.
        const absDelta = Number.isFinite(prevRsiMa) ? Math.abs(rsiMa - prevRsiMa) : 0
        prevRsiMa = rsiMa

        rawDar1 = rawDar1 * darBeta + absDelta * darAlpha
        eDar1 *= darBeta
        const cDar1 = eDar1 > EPSILON ? 1 / (1 - eDar1) : 1
        const dar1 = rawDar1 * cDar1

        rawDar2 = rawDar2 * darBeta + dar1 * darAlpha
        eDar2 *= darBeta
        const cDar2 = eDar2 > EPSILON ? 1 / (1 - eDar2) : 1
        const dar = rawDar2 * cDar2

        // Stage 4: the trailing level only ever ratchets toward the RSI line
        // while the last two readings sit on the same side of it, otherwise it
        // flips outright to the opposite band.
        const band = qqeFactor * dar
        const upperBand = rsiMa + band
        const lowerBand = rsiMa - band

        let newTrail = trail
        if (rsiMa > trail && prevRsiMa2 > trail) newTrail = Math.max(trail, lowerBand)
        else if (rsiMa < trail && prevRsiMa2 < trail) newTrail = Math.min(trail, upperBand)
        else newTrail = rsiMa > trail ? lowerBand : upperBand

        prevRsiMa2 = rsiMa
        trail = newTrail

        qqeCol[i] = Number.isFinite(rsiMa) ? rsiMa : NaN
        trailCol[i] = Number.isFinite(trail) ? trail : NaN
      }

      return { qqe: nulls(qqeCol), trail: nulls(trailCol) }
    },
  })
}
