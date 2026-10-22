/**
 * Symmetric Mean Absolute %Error (SMAPE) - ported to openalgo-charts from Pine Script v6.
 *
 * Source: https://github.com/mihakralj/pinescript/blob/c4e91b962be09733d8fc76caa5191e9e586c5cee/indicators/errors/smape.pine
 * Repo:   mihakralj/pinescript
 * License: MIT (c) mihakralj
 * SPDX-FileCopyrightText: (c) mihakralj
 * SPDX-FileCopyrightText: (c) 2026 marketcalls (port to openalgo-charts)
 * SPDX-License-Identifier: MIT
 *
 * Averages the symmetric absolute percentage gap between the source and its own
 * EMA, so the pane reads as how far price is running from its trend in
 * percentage terms that are bounded and treat overshoot and undershoot alike.
 */

export default function ({ registerIndicator, sourceValues, smaSeededEma, nulls }) {
  registerIndicator({
    id: 'oa-smape',
    name: 'Symmetric Mean Absolute %Error (SMAPE)',
    category: 'Errors',
    // indicator("Symmetric Mean Absolute %Error (SMAPE)") passes no overlay
    // argument, so Pine puts the study in its own pane. Only the EMA carries
    // force_overlay = true, which is the plot-level overlay flag below.
    placement: 'pane',

    inputs: [
      { key: 'source', type: 'source', label: 'Source', default: 'close' },
      { key: 'period', type: 'number', label: 'Period', default: 100, min: 1, max: 5000, step: 1 },
    ],

    plots: [
      { key: 'smape', type: 'area', title: 'SMAPE', style: { color: '#ff5252', lineWidth: 2 } },
      { key: 'ema', type: 'line', title: 'EMA', style: { color: '#ffeb3b', lineWidth: 1 }, overlay: true },
    ],

    calc(bars, settings) {
      // A cleared number field arrives as '', and Number('') is 0.
      const period = Math.max(1, Math.floor(Number(settings.period) || 100))
      const src = sourceValues(bars, settings.source ?? 'close')

      // ta.ema seeds from the SMA of the first period values and is na before
      // that, which is what smaSeededEma reproduces.
      const emaLine = smaSeededEma(src, period)

      // The source clamps only the averaging buffer, not the EMA length.
      const p = Math.min(Math.max(1, period), 4000)

      const n = bars.length
      const out = new Array(n).fill(NaN)

      const buffer = new Array(p).fill(NaN)
      let head = 0
      let sum = 0
      let validCount = 0

      for (let i = 0; i < n; i++) {
        const s1 = src[i]
        const s2 = emaLine[i]

        // While the EMA is na, Pine's sum_abs != 0 test is false and the
        // symmetric error is 0, so those zeros really do enter the average.
        let symmetricError = 0
        if (Number.isFinite(s1) && Number.isFinite(s2)) {
          const absDiff = Math.abs(s1 - s2)
          const sumAbs = Math.abs(s1) + Math.abs(s2)
          symmetricError = sumAbs !== 0 ? (200 * absDiff) / sumAbs : 0
        }

        const oldest = buffer[head]
        if (Number.isFinite(oldest)) {
          sum -= oldest
          validCount -= 1
        }
        sum += symmetricError
        validCount += 1
        buffer[head] = symmetricError
        head = (head + 1) % p

        out[i] = validCount > 0 ? sum / validCount : symmetricError
      }

      return { smape: nulls(out), ema: nulls(emaLine) }
    },
  })
}
