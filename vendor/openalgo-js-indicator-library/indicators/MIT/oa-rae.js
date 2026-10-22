/**
 * Relative Absolute Error (RAE) - ported to openalgo-charts from Pine Script v6.
 *
 * Source: https://github.com/mihakralj/pinescript/blob/c4e91b962be09733d8fc76caa5191e9e586c5cee/indicators/errors/rae.pine
 * Repo:   mihakralj/pinescript
 * License: MIT (c) mihakralj
 * SPDX-FileCopyrightText: (c) mihakralj
 * SPDX-FileCopyrightText: (c) 2026 marketcalls (port to openalgo-charts)
 * SPDX-License-Identifier: MIT
 *
 * Compares a series against a forecast of itself (an EMA of the same period) by
 * dividing the rolling sum of absolute forecast errors by the rolling sum of
 * absolute deviations from the rolling mean. Below 1 the forecast beats the
 * naive mean; at or above 1 it does not.
 */

export default function ({ registerIndicator, sourceValues, smaSeededEma, nulls }) {
  registerIndicator({
    // The Pine indicator() call carries no overlay flag, so the study itself is
    // a pane study; only the EMA plot is marked force_overlay = true, which is
    // the per-plot `overlay: true` below.
    id: 'oa-rae',
    name: 'Relative Absolute Error (RAE)',
    category: 'Errors',
    placement: 'pane',

    inputs: [
      { key: 'source', type: 'source', label: 'Source', default: 'close' },
      {
        key: 'period',
        type: 'number',
        label: 'Period',
        default: 100,
        min: 1,
        max: 4000,
        step: 1,
        tooltip: 'Window for the error averaging, and the length of the EMA used as the forecast.',
      },
    ],

    plots: [
      { key: 'rae', type: 'area', title: 'RAE', style: { color: '#ef5350', lineWidth: 2 } },
      // force_overlay = true in the source: this one column is drawn on price.
      { key: 'ema', type: 'line', title: 'EMA', overlay: true, style: { color: '#ffeb3b', lineWidth: 1 } },
    ],

    calc(bars, settings) {
      // A cleared number field arrives as '', and Number('') is 0.
      const period = Math.max(1, Math.floor(Number(settings.period) || 100))
      const src1 = sourceValues(bars, settings.source ?? 'close')
      // ta.ema seeds from the SMA of the first `period` values and is na before
      // that, which is what smaSeededEma reproduces.
      const src2 = smaSeededEma(src1, period)

      // Pine clamps the ring-buffer length the same way.
      const p = Math.min(Math.max(1, period), 4000)
      const n = bars.length
      const rae = new Array(n).fill(NaN)
      const ema = new Array(n).fill(NaN)

      // Three circular buffers, each carrying its own running sum and a count of
      // the non-na entries currently inside it, exactly as the source does.
      const bufSrc = new Array(p).fill(NaN)
      const bufErr = new Array(p).fill(NaN)
      const bufBase = new Array(p).fill(NaN)
      let headSrc = 0
      let headErr = 0
      let headBase = 0
      let sumSrc = 0
      let sumErr = 0
      let sumBase = 0
      let countSrc = 0
      let countErr = 0
      let countBase = 0

      for (let i = 0; i < n; i++) {
        const s1 = src1[i]
        const s2 = src2[i]

        const oldSrc = bufSrc[headSrc]
        if (Number.isFinite(oldSrc)) {
          sumSrc -= oldSrc
          countSrc -= 1
        }
        if (Number.isFinite(s1)) {
          sumSrc += s1
          countSrc += 1
        }
        bufSrc[headSrc] = s1
        headSrc = (headSrc + 1) % p

        // The window holds the current bar too, so this is an expanding mean
        // until p bars have arrived and a rolling mean afterwards.
        const mean = countSrc > 0 ? sumSrc / countSrc : s1

        // NaN here stands in for Pine's na and propagates the same way.
        const absError = Math.abs(s1 - s2)
        const absBaseline = Math.abs(s1 - mean)

        const oldErr = bufErr[headErr]
        if (Number.isFinite(oldErr)) {
          sumErr -= oldErr
          countErr -= 1
        }
        if (Number.isFinite(absError)) {
          sumErr += absError
          countErr += 1
        }
        bufErr[headErr] = absError
        headErr = (headErr + 1) % p

        const oldBase = bufBase[headBase]
        if (Number.isFinite(oldBase)) {
          sumBase -= oldBase
          countBase -= 1
        }
        if (Number.isFinite(absBaseline)) {
          sumBase += absBaseline
          countBase += 1
        }
        bufBase[headBase] = absBaseline
        headBase = (headBase + 1) % p

        const totalError = countErr > 0 ? sumErr : absError
        const totalBaseline = countBase > 0 ? sumBase : absBaseline

        // Pine: total_baseline_error != 0 ? ratio : 1.0. A comparison against na
        // is false there, so a na baseline also takes the 1.0 branch.
        rae[i] =
          Number.isFinite(totalBaseline) && totalBaseline !== 0 ? totalError / totalBaseline : 1

        ema[i] = Number.isFinite(s2) ? s2 : NaN
      }

      return { rae: nulls(rae), ema: nulls(ema) }
    },
  })
}
