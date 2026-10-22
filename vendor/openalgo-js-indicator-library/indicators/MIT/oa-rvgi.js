/**
 * Relative Vigor Index (RVGI) - ported to openalgo-charts from Pine Script v6.
 *
 * Source: https://github.com/mihakralj/pinescript/blob/c4e91b962be09733d8fc76caa5191e9e586c5cee/indicators/oscillators/rvgi.pine
 * Repo:   mihakralj/pinescript
 * License: MIT (c) mihakralj
 * SPDX-FileCopyrightText: (c) mihakralj
 * SPDX-FileCopyrightText: (c) 2026 marketcalls (port to openalgo-charts)
 * SPDX-License-Identifier: MIT
 *
 * Measures the conviction behind a move by comparing where a bar closes
 * relative to its open against the size of its full range, both smoothed with
 * the symmetric four-bar kernel, then averaged over the period.
 */

export default function ({ registerIndicator, nulls }) {
  registerIndicator({
    id: 'oa-rvgi',
    name: 'Relative Vigor Index (RVGI)',
    category: 'Oscillators',
    placement: 'pane',

    inputs: [{ key: 'period', type: 'number', label: 'Period', default: 10, min: 1, max: 5000, step: 1 }],

    plots: [
      { key: 'rvgi', type: 'line', title: 'RVGI', style: { color: '#ffeb3b', lineWidth: 2 } },
      { key: 'signal', type: 'line', title: 'Signal', style: { color: '#00bcd4', lineWidth: 1 } },
    ],

    levels: () => [{ price: 0, title: 'Zero', color: '#787b86', dashed: true }],

    calc(bars, settings) {
      // A cleared number field arrives as '', and Number('') is 0.
      const period = Math.max(1, Math.floor(Number(settings.period) || 10))
      const n = bars.length

      const rvgiOut = new Array(n).fill(NaN)
      const signalOut = new Array(n).fill(NaN)

      // Pine reads the history terms through nz(), so a bar before the first
      // one, or a missing field, counts as 0 rather than dropping the bar.
      const back = (i, field) => {
        if (i < 0 || i >= n) return 0
        const v = bars[i][field]
        return Number.isFinite(v) ? v : 0
      }

      // Circular buffers with count-based warmup: the average is taken over
      // however many samples have arrived, so it emits from the first bar.
      const numBuf = new Array(period).fill(NaN)
      const denBuf = new Array(period).fill(NaN)
      let numHead = 0
      let numSum = 0
      let numCount = 0
      let denHead = 0
      let denSum = 0
      let denCount = 0

      // The signal line is a four-bar symmetric average of RVGI itself, held
      // in three var carries that start at zero.
      let rv1 = 0
      let rv2 = 0
      let rv3 = 0

      for (let i = 0; i < n; i++) {
        // swma(x) = (x[3] + 2*x[2] + 2*x[1] + x[0]) / 6
        const co0 = bars[i].close - bars[i].open
        const co1 = back(i - 1, 'close') - back(i - 1, 'open')
        const co2 = back(i - 2, 'close') - back(i - 2, 'open')
        const co3 = back(i - 3, 'close') - back(i - 3, 'open')
        let swmaNum = (co3 + 2 * co2 + 2 * co1 + co0) / 6
        if (!Number.isFinite(swmaNum)) swmaNum = 0

        const hl0 = bars[i].high - bars[i].low
        const hl1 = back(i - 1, 'high') - back(i - 1, 'low')
        const hl2 = back(i - 2, 'high') - back(i - 2, 'low')
        const hl3 = back(i - 3, 'high') - back(i - 3, 'low')
        let swmaDen = (hl3 + 2 * hl2 + 2 * hl1 + hl0) / 6
        if (!Number.isFinite(swmaDen)) swmaDen = 0

        const oldNum = numBuf[numHead]
        if (Number.isFinite(oldNum)) numSum -= oldNum
        else numCount += 1
        numSum += swmaNum
        numBuf[numHead] = swmaNum
        numHead = (numHead + 1) % period
        const smaNum = numSum / Math.max(1, numCount)

        const oldDen = denBuf[denHead]
        if (Number.isFinite(oldDen)) denSum -= oldDen
        else denCount += 1
        denSum += swmaDen
        denBuf[denHead] = swmaDen
        denHead = (denHead + 1) % period
        const smaDen = denSum / Math.max(1, denCount)

        // Pine returns 0 rather than dividing by a zero range.
        const rvgiVal = !Number.isFinite(smaDen) || smaDen === 0 ? 0 : smaNum / smaDen

        signalOut[i] = (rv3 + 2 * rv2 + 2 * rv1 + rvgiVal) / 6
        rvgiOut[i] = rvgiVal
        rv3 = rv2
        rv2 = rv1
        rv1 = rvgiVal
      }

      return { rvgi: nulls(rvgiOut), signal: nulls(signalOut) }
    },
  })
}
