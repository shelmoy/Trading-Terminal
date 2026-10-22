/**
 * Historical Volatility (HV) - ported to openalgo-charts from Pine Script v6.
 *
 * Source: https://github.com/mihakralj/pinescript/blob/c4e91b962be09733d8fc76caa5191e9e586c5cee/indicators/volatility/hv.pine
 * Repo:   mihakralj/pinescript
 * License: MIT (c) mihakralj
 * SPDX-FileCopyrightText: (c) mihakralj
 * SPDX-FileCopyrightText: (c) 2026 marketcalls (port to openalgo-charts)
 * SPDX-License-Identifier: MIT
 *
 * Close-to-close realised volatility: the population standard deviation of the
 * log returns over the window, optionally scaled to an annual figure.
 */

export default function ({ registerIndicator, sourceValues, nulls }) {
  registerIndicator({
    id: 'oa-hv',
    name: 'Historical Volatility (HV)',
    category: 'Volatility',
    placement: 'pane',

    inputs: [
      { key: 'source', type: 'source', label: 'Source', default: 'close' },
      {
        key: 'length',
        type: 'number',
        label: 'Length',
        default: 20,
        min: 2,
        max: 5000,
        step: 1,
        tooltip: 'Period for calculating standard deviation of returns.',
      },
      {
        key: 'annualize',
        type: 'boolean',
        label: 'Annualize Volatility',
        default: true,
        tooltip: 'Annualize the volatility output.',
      },
      {
        key: 'annualPeriods',
        type: 'number',
        label: 'Annual Periods',
        default: 252,
        min: 1,
        max: 100000,
        step: 1,
        tooltip: 'Number of periods in a year for annualization (252 for daily, 52 for weekly).',
      },
    ],

    plots: [{ key: 'hv', type: 'line', title: 'HV', style: { color: '#ffeb3b', lineWidth: 2 } }],

    calc(bars, settings) {
      // A cleared number field arrives as '', and Number('') is 0.
      const length = Math.max(2, Math.floor(Number(settings.length) || 20))
      const annualPeriods = Math.max(1, Math.floor(Number(settings.annualPeriods) || 252))
      const annualize = settings.annualize !== false
      const src = sourceValues(bars, settings.source ?? 'close')
      const out = new Array(bars.length).fill(NaN)

      // Pine keeps a circular buffer of log returns with running sums, so the
      // window only ever holds the returns that actually existed.
      const buffer = new Array(length).fill(NaN)
      let head = 0
      let count = 0
      let sum = 0
      let sumSq = 0
      const annualFactor = Math.sqrt(annualPeriods)

      for (let i = 0; i < bars.length; i++) {
        const prev = i > 0 ? src[i - 1] : NaN
        const cur = src[i]

        // na(src[1]) or src[1] == 0 leaves the return unavailable, and so does
        // a ratio Pine's math.log would answer with na.
        let logReturn = NaN
        if (Number.isFinite(prev) && prev !== 0 && Number.isFinite(cur)) {
          const ratio = cur / prev
          if (ratio > 0) logReturn = Math.log(ratio)
        }
        // With no return this bar the buffer does not advance and HV stays na.
        if (!Number.isFinite(logReturn)) continue

        const oldest = buffer[head]
        if (Number.isFinite(oldest)) {
          sum -= oldest
          sumSq -= oldest * oldest
          count -= 1
        }
        sum += logReturn
        sumSq += logReturn * logReturn
        count += 1
        buffer[head] = logReturn
        head = (head + 1) % length

        // Population variance from the running sums, floored at zero because
        // the subtraction can go slightly negative on a flat series.
        let stdDev = 0
        if (count > 1) {
          const mean = sum / count
          stdDev = Math.sqrt(Math.max(0, sumSq / count - mean * mean))
        }
        out[i] = annualize ? stdDev * annualFactor : stdDev
      }

      return { hv: nulls(out) }
    },
  })
}
