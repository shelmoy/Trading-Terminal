/**
 * Coppock Curve (COPPOCK) - ported to openalgo-charts from Pine Script v6.
 *
 * Source: https://github.com/mihakralj/pinescript/blob/c4e91b962be09733d8fc76caa5191e9e586c5cee/indicators/oscillators/coppock.pine
 * Repo:   mihakralj/pinescript
 * License: MIT
 * SPDX-FileCopyrightText: (c) mihakralj
 * SPDX-FileCopyrightText: (c) 2026 marketcalls (port to openalgo-charts)
 * SPDX-License-Identifier: MIT
 *
 * Weighted moving average of two rate-of-change readings added together, built
 * as a long-horizon momentum gauge that turns up near the end of a decline.
 */

export default function ({ registerIndicator, sourceValues, nulls }) {
  registerIndicator({
    id: 'oa-coppock',
    name: 'Coppock Curve (COPPOCK)',
    category: 'Oscillators',
    placement: 'pane',

    inputs: [
      { key: 'source', type: 'source', label: 'Source', default: 'close' },
      { key: 'longRoc', type: 'number', label: 'Long ROC Period', default: 14, min: 1, max: 500, step: 1 },
      { key: 'shortRoc', type: 'number', label: 'Short ROC Period', default: 11, min: 1, max: 500, step: 1 },
      { key: 'wmaPeriod', type: 'number', label: 'WMA Period', default: 10, min: 1, max: 500, step: 1 },
    ],

    plots: [
      { key: 'coppock', type: 'line', title: 'Coppock', style: { color: '#ffeb3b', lineWidth: 2 } },
    ],

    levels: () => [{ price: 0, title: 'Zero', color: '#787b86', dashed: true }],

    calc(bars, settings) {
      // A cleared number field arrives as '', and Number('') is 0.
      const longRoc = Math.max(1, Math.min(500, Math.floor(Number(settings.longRoc) || 14)))
      const shortRoc = Math.max(1, Math.min(500, Math.floor(Number(settings.shortRoc) || 11)))
      const wmaPeriod = Math.max(1, Math.min(500, Math.floor(Number(settings.wmaPeriod) || 10)))
      const src = sourceValues(bars, settings.source ?? 'close')

      const maxRoc = Math.max(longRoc, shortRoc)

      // Circular buffer of past source values, na until written.
      const rocBuf = new Array(maxRoc).fill(NaN)
      let rocHead = 0
      let rocCount = 0

      // Running weighted sums for the WMA, which grow their window until full.
      const wmaBuf = new Array(wmaPeriod).fill(NaN)
      let wmaHead = 0
      let wmaCount = 0
      let wmaSum = 0
      let wmaWeightedSum = 0
      let wmaNorm = 0

      const out = new Array(bars.length).fill(NaN)

      for (let i = 0; i < bars.length; i++) {
        // Pine wraps the source in nz(), so a missing sample reads as zero.
        const current = Number.isFinite(src[i]) ? src[i] : 0

        const longIdx = (rocHead - longRoc + maxRoc) % maxRoc
        const shortIdx = (rocHead - shortRoc + maxRoc) % maxRoc
        const longClose = rocBuf[longIdx]
        const shortClose = rocBuf[shortIdx]

        if (!Number.isFinite(rocBuf[rocHead])) rocCount = Math.min(rocCount + 1, maxRoc)
        rocBuf[rocHead] = current
        rocHead = (rocHead + 1) % maxRoc

        // Either leg contributes zero until its own lookback is available.
        const longRocVal =
          Number.isFinite(longClose) && longClose !== 0 && rocCount >= longRoc
            ? ((current - longClose) / longClose) * 100
            : 0
        const shortRocVal =
          Number.isFinite(shortClose) && shortClose !== 0 && rocCount >= shortRoc
            ? ((current - shortClose) / shortClose) * 100
            : 0

        const combinedRoc = longRocVal + shortRocVal

        const wmaOldest = wmaBuf[wmaHead]
        if (Number.isFinite(wmaOldest)) {
          // Full window: slide the weights by one bar.
          const oldSum = wmaSum
          wmaSum -= wmaOldest
          wmaSum += combinedRoc
          wmaWeightedSum = wmaWeightedSum - oldSum + wmaPeriod * combinedRoc
        } else {
          // Growing window: the newest sample always carries the largest weight.
          wmaCount += 1
          wmaSum += combinedRoc
          wmaWeightedSum = wmaWeightedSum + wmaCount * combinedRoc
          wmaNorm = wmaCount * (wmaCount + 1) * 0.5
        }

        wmaBuf[wmaHead] = combinedRoc
        wmaHead = (wmaHead + 1) % wmaPeriod

        out[i] = wmaNorm !== 0 ? wmaWeightedSum / wmaNorm : 0
      }

      return { coppock: nulls(out) }
    },
  })
}
