/**
 * One-Sample t-Test (ZTEST) - ported to openalgo-charts from Pine Script v6.
 *
 * Source: https://github.com/mihakralj/pinescript/blob/c4e91b962be09733d8fc76caa5191e9e586c5cee/indicators/statistics/ztest.pine
 * Repo:   mihakralj/pinescript
 * License: MIT
 * SPDX-FileCopyrightText: (c) mihakralj
 * SPDX-FileCopyrightText: (c) 2026 marketcalls (port to openalgo-charts)
 * SPDX-License-Identifier: MIT
 *
 * Tests the rolling sample mean of the source against a hypothesized
 * population mean, reporting the t-statistic built from a Bessel-corrected
 * sample variance. Most meaningful when the source is a returns series.
 */

export default function ({ registerIndicator, sourceValues, nulls }) {
  registerIndicator({
    id: 'oa-ztest',
    name: 'One-Sample t-Test (ZTEST)',
    category: 'Statistics',
    placement: 'pane',

    inputs: [
      { key: 'source', type: 'source', label: 'Source', default: 'close' },
      {
        key: 'period',
        type: 'number',
        label: 'Period',
        default: 30,
        min: 2,
        max: 5000,
        step: 1,
        tooltip: 'Lookback for the sample mean and standard deviation. Minimum 30 recommended for the z-critical approximation.',
      },
      {
        key: 'mu0',
        type: 'number',
        label: 'Hypothesized Mean',
        default: 0,
        step: 0.01,
        tooltip: 'The population mean being tested against. Use 0 when testing returns.',
      },
    ],

    plots: [{ key: 'tstat', type: 'line', title: 't-statistic', style: { color: '#ffeb3b', lineWidth: 2 } }],

    levels: () => [
      { price: 0, title: 'Zero Line', color: '#787b86', dashed: true },
      { price: 2.04, title: '95% ~t(30)', color: 'rgba(76, 175, 80, 0.3)', dashed: true },
      { price: -2.04, title: '95% ~t(30)', color: 'rgba(76, 175, 80, 0.3)', dashed: true },
      { price: 2.75, title: '99% ~t(30)', color: 'rgba(255, 82, 82, 0.3)', dashed: true },
      { price: -2.75, title: '99% ~t(30)', color: 'rgba(255, 82, 82, 0.3)', dashed: true },
    ],

    calc(bars, settings) {
      // A cleared number field arrives as '', and Number('') is 0. Pine raises
      // a runtime error below 2, so the floor stands in for that refusal.
      const period = Math.max(2, Math.min(5000, Math.floor(Number(settings.period) || 30)))
      const rawMu = Number(settings.mu0)
      const mu0 = Number.isFinite(rawMu) ? rawMu : 0
      const src = sourceValues(bars, settings.source ?? 'close')
      const len = bars.length
      const out = new Array(len).fill(NaN)

      // Pine's circular buffer with running sums, reproduced bar for bar: the
      // oldest slot leaves the window before the current value enters it, so
      // the sample is the last `period` bars including this one.
      const buffer = new Array(period).fill(NaN)
      let head = 0
      let n = 0
      let sum = 0
      let sumSq = 0

      for (let i = 0; i < len; i++) {
        const oldest = buffer[head]
        if (Number.isFinite(oldest)) {
          sum -= oldest
          sumSq -= oldest * oldest
          n -= 1
        }

        const value = src[i]
        if (Number.isFinite(value)) {
          sum += value
          sumSq += value * value
          n += 1
          buffer[head] = value
        } else {
          buffer[head] = NaN
        }
        head = (head + 1) % period

        // Pine emits from the second finite sample onward, not after a full
        // window: two observations are enough for a Bessel-corrected variance.
        if (n < 2) continue
        const nf = n
        const mean = sum / nf
        const variance = Math.max(0, sumSq / nf - mean * mean) * (nf / (nf - 1))
        const stddev = Math.sqrt(variance)
        const standardError = stddev / Math.sqrt(nf)
        if (standardError > 1e-10) out[i] = (mean - mu0) / standardError
      }

      return { tstat: nulls(out) }
    },
  })
}
