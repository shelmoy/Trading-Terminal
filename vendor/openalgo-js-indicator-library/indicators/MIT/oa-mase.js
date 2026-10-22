/**
 * Mean Absolute Scaled Error (MASE) - ported to openalgo-charts from Pine Script v6.
 *
 * Source: https://github.com/mihakralj/pinescript/blob/c4e91b962be09733d8fc76caa5191e9e586c5cee/indicators/errors/mase.pine
 * Repo:   mihakralj/pinescript
 * License: MIT
 * SPDX-FileCopyrightText: (c) mihakralj
 * SPDX-FileCopyrightText: (c) 2026 marketcalls (port to openalgo-charts)
 * SPDX-License-Identifier: MIT
 *
 * Measures how far the source runs from its own EMA, as a rolling mean of the
 * absolute error scaled by a naive-forecast baseline. A rising reading means
 * price is pulling away from its average faster than it usually does.
 */

export default function ({ registerIndicator, sourceValues, smaSeededEma, nulls }) {
  registerIndicator({
    id: 'oa-mase',
    name: 'Mean Absolute Scaled Error (MASE)',
    category: 'Errors',
    // The Pine indicator() call carries no overlay flag, so the study itself
    // sits in its own pane; only the EMA is forced onto the price chart with
    // force_overlay = true, which is the per-plot `overlay: true` below.
    placement: 'pane',

    inputs: [
      { key: 'source', type: 'source', label: 'Source', default: 'close' },
      {
        key: 'period',
        type: 'number',
        label: 'Period',
        default: 100,
        min: 1,
        max: 5000,
        step: 1,
        tooltip: 'Lookback for both the comparison EMA and the error averaging.',
      },
    ],

    plots: [
      { key: 'mase', type: 'area', title: 'MASE', style: { color: '#ef5350', lineWidth: 2 } },
      {
        key: 'ema',
        type: 'line',
        title: 'EMA',
        overlay: true,
        style: { color: '#ffeb3b', lineWidth: 1 },
      },
    ],

    calc(bars, settings) {
      // A cleared number field arrives as '', and Number('') is 0.
      const period = Math.max(1, Math.floor(Number(settings.period) || 100))
      const n = bars.length

      const src1 = sourceValues(bars, settings.source ?? 'close')
      // Pine's ta.ema seeds from the SMA of the first `period` values.
      const src2 = smaSeededEma(src1, period)

      // The source clamps the error window to 4000 while leaving the EMA on the
      // raw period, so keep the two separate.
      const p = Math.min(Math.max(1, period), 4000)

      const out = new Array(n).fill(NaN)
      const buffer = new Array(p).fill(NaN)
      let head = 0
      let sum = 0
      let validCount = 0

      // `var float scale = na` is filled on the first bar the study ever sees,
      // where every historical reference is still na. The count therefore comes
      // out zero and the scale settles on 1.0 for the whole chart. The loop is
      // kept verbatim so the arithmetic matches the source rather than an
      // idealised version of it.
      let scale = NaN

      for (let i = 0; i < n; i++) {
        if (!Number.isFinite(scale)) {
          let scaleSum = 0
          let scaleCount = 0
          for (let j = 1; j <= p; j++) {
            const older = src1[i - j]
            const newer = src1[i - j + 1]
            if (Number.isFinite(older) && Number.isFinite(newer)) {
              scaleSum += Math.abs(older - newer)
              scaleCount += 1
            }
          }
          scale = scaleCount > 0 ? scaleSum / scaleCount : 1
        }

        const a = src1[i]
        const b = src2[i]
        const absError =
          Number.isFinite(a) && Number.isFinite(b) ? Math.abs(a - b) : NaN
        const divisor = scale === 0 ? 1 : scale
        const scaledError = Number.isFinite(absError) ? absError / divisor : NaN

        const oldest = buffer[head]
        if (Number.isFinite(oldest)) {
          sum -= oldest
          validCount -= 1
        }
        if (Number.isFinite(scaledError)) {
          sum += scaledError
          validCount += 1
        }
        buffer[head] = scaledError
        head = (head + 1) % p

        out[i] = validCount > 0 ? sum / validCount : scaledError
      }

      const emaOut = new Array(n).fill(NaN)
      for (let i = 0; i < n; i++) {
        if (Number.isFinite(src2[i])) emaOut[i] = src2[i]
      }

      return { mase: nulls(out), ema: nulls(emaOut) }
    },
  })
}
