/**
 * Relative Squared Error (RSE) - ported to openalgo-charts from Pine Script v6.
 *
 * Source: https://github.com/mihakralj/pinescript/blob/c4e91b962be09733d8fc76caa5191e9e586c5cee/indicators/errors/rse.pine
 * Repo:   mihakralj/pinescript
 * License: MIT
 * SPDX-FileCopyrightText: (c) mihakralj
 * SPDX-FileCopyrightText: (c) 2026 marketcalls (port to openalgo-charts)
 * SPDX-License-Identifier: MIT
 *
 * Compares the source against its own EMA and divides the rolling sum of the
 * squared prediction error by the rolling sum of the squared error of a plain
 * rolling mean, so 1.0 means the EMA is no better than the mean of the window.
 */

export default function ({ registerIndicator, sourceValues, smaSeededEma, nulls }) {
  registerIndicator({
    id: 'oa-rse',
    name: 'Relative Squared Error (RSE)',
    category: 'Errors',
    // The Pine indicator() call carries no overlay flag, so the study owns a
    // pane; only the EMA comparison line is force_overlay onto price.
    placement: 'pane',

    inputs: [
      { key: 'source', type: 'source', label: 'Source', default: 'close' },
      { key: 'period', type: 'number', label: 'Period', default: 100, min: 1, max: 4000, step: 1 },
    ],

    plots: [
      { key: 'rse', type: 'area', title: 'RSE', style: { color: '#ff5252', lineWidth: 2 } },
      { key: 'ema', type: 'line', title: 'EMA', overlay: true, style: { color: '#ffeb3b', lineWidth: 1 } },
    ],

    calc(bars, settings) {
      // A cleared number field arrives as '', and Number('') is 0.
      const period = Math.max(1, Math.floor(Number(settings.period) || 100))
      // Pine clamps the window with math.min(math.max(1, period), 4000).
      const p = Math.min(Math.max(1, period), 4000)
      const src = sourceValues(bars, settings.source ?? 'close')
      // Pine's ta.ema seeds from the SMA of the first period values.
      const emaLine = smaSeededEma(src, period)

      const n = bars.length
      const rse = new Array(n).fill(NaN)
      const emaOut = new Array(n).fill(NaN)

      // Three circular buffers, exactly as the Pine function keeps them: a
      // running sum plus a count of the non-na entries currently in the window.
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
        const s1 = src[i]
        const s2 = emaLine[i]
        emaOut[i] = Number.isFinite(s2) ? s2 : NaN

        const oldestSrc = bufSrc[headSrc]
        if (Number.isFinite(oldestSrc)) {
          sumSrc -= oldestSrc
          countSrc -= 1
        }
        if (Number.isFinite(s1)) {
          sumSrc += s1
          countSrc += 1
        }
        bufSrc[headSrc] = Number.isFinite(s1) ? s1 : NaN
        headSrc = (headSrc + 1) % p

        // Expanding mean until the window fills, then the rolling mean.
        const meanSrc = countSrc > 0 ? sumSrc / countSrc : s1

        // na propagates: the EMA is na through its own warmup, so the squared
        // error is na there and never enters the running sum.
        const sqErr = Number.isFinite(s1) && Number.isFinite(s2) ? (s1 - s2) * (s1 - s2) : NaN
        const sqBase = Number.isFinite(s1) && Number.isFinite(meanSrc) ? (s1 - meanSrc) * (s1 - meanSrc) : NaN

        const oldestErr = bufErr[headErr]
        if (Number.isFinite(oldestErr)) {
          sumErr -= oldestErr
          countErr -= 1
        }
        if (Number.isFinite(sqErr)) {
          sumErr += sqErr
          countErr += 1
        }
        bufErr[headErr] = sqErr
        headErr = (headErr + 1) % p

        const oldestBase = bufBase[headBase]
        if (Number.isFinite(oldestBase)) {
          sumBase -= oldestBase
          countBase -= 1
        }
        if (Number.isFinite(sqBase)) {
          sumBase += sqBase
          countBase += 1
        }
        bufBase[headBase] = sqBase
        headBase = (headBase + 1) % p

        const totalErr = countErr > 0 ? sumErr : sqErr
        const totalBase = countBase > 0 ? sumBase : sqBase

        // Pine: total_baseline_error != 0 ? total_squared_error / total_baseline_error : 1.0
        // A na baseline also fails that comparison, so it too yields 1.0. This
        // is what makes the very first bar, and a completely flat series, 1.0.
        if (!Number.isFinite(totalBase) || totalBase === 0) {
          rse[i] = 1.0
        } else if (Number.isFinite(totalErr)) {
          rse[i] = totalErr / totalBase
        }
      }

      return { rse: nulls(rse), ema: nulls(emaOut) }
    },
  })
}
