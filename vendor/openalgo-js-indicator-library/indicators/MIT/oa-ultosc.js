/**
 * Ultimate Oscillator (ULTOSC) - ported to openalgo-charts from Pine Script v6.
 *
 * Source: https://github.com/mihakralj/pinescript/blob/c4e91b962be09733d8fc76caa5191e9e586c5cee/indicators/oscillators/ultosc.pine
 * Repo:   mihakralj/pinescript
 * License: MIT (c) mihakralj
 * SPDX-FileCopyrightText: (c) mihakralj
 * SPDX-FileCopyrightText: (c) 2026 marketcalls (port to openalgo-charts)
 * SPDX-License-Identifier: MIT
 *
 * Buying pressure is summed against true range over three windows, and the
 * three ratios are blended by weight, so a single reading carries short,
 * medium and long term momentum at once.
 */

export default function ({ registerIndicator, nulls }) {
  registerIndicator({
    id: 'oa-ultosc',
    name: 'Ultimate Oscillator (ULTOSC)',
    category: 'Oscillators',
    placement: 'pane',

    inputs: [
      {
        key: 'fastPeriod',
        type: 'number',
        label: 'Fast Period',
        default: 7,
        min: 1,
        max: 50,
        step: 1,
        tooltip: 'Short-term period for momentum calculation',
      },
      {
        key: 'mediumPeriod',
        type: 'number',
        label: 'Medium Period',
        default: 14,
        min: 1,
        max: 100,
        step: 1,
        tooltip: 'Medium-term period for momentum calculation',
      },
      {
        key: 'slowPeriod',
        type: 'number',
        label: 'Slow Period',
        default: 28,
        min: 1,
        max: 200,
        step: 1,
        tooltip: 'Long-term period for momentum calculation',
      },
      {
        key: 'fastWeight',
        type: 'number',
        label: 'Fast Weight',
        default: 4,
        min: 0.1,
        max: 10,
        step: 0.1,
        tooltip: 'Weight applied to fast period calculation',
      },
      {
        key: 'mediumWeight',
        type: 'number',
        label: 'Medium Weight',
        default: 2,
        min: 0.1,
        max: 10,
        step: 0.1,
        tooltip: 'Weight applied to medium period calculation',
      },
      {
        key: 'slowWeight',
        type: 'number',
        label: 'Slow Weight',
        default: 1,
        min: 0.1,
        max: 10,
        step: 0.1,
        tooltip: 'Weight applied to slow period calculation',
      },
    ],

    plots: [
      { key: 'ultosc', type: 'line', title: 'Ultimate Oscillator', style: { color: '#ffeb3b', lineWidth: 2 } },
    ],

    calc(bars, settings) {
      // A cleared number field arrives as '', and Number('') is 0.
      const fastPeriod = Math.max(1, Math.floor(Number(settings.fastPeriod) || 7))
      const mediumPeriod = Math.max(1, Math.floor(Number(settings.mediumPeriod) || 14))
      const slowPeriod = Math.max(1, Math.floor(Number(settings.slowPeriod) || 28))
      const fastWeight = Math.max(0.1, Number(settings.fastWeight) || 4)
      const mediumWeight = Math.max(0.1, Number(settings.mediumWeight) || 2)
      const slowWeight = Math.max(0.1, Number(settings.slowWeight) || 1)

      const n = bars.length
      const out = new Array(n).fill(NaN)
      if (n === 0) return { ultosc: nulls(out) }

      // Pine: prev_close = nz(close[1], close), so the first bar uses its own close.
      const bp = new Array(n).fill(NaN)
      const tr = new Array(n).fill(NaN)
      for (let i = 0; i < n; i++) {
        const bar = bars[i]
        const high = Number(bar.high)
        const low = Number(bar.low)
        const close = Number(bar.close)
        if (!Number.isFinite(high) || !Number.isFinite(low) || !Number.isFinite(close)) continue
        const before = i > 0 ? Number(bars[i - 1].close) : NaN
        const prevClose = Number.isFinite(before) ? before : close
        const trueLow = Math.min(low, prevClose)
        const trueHigh = Math.max(high, prevClose)
        bp[i] = close - trueLow
        tr[i] = trueHigh - trueLow
      }

      // Pine keeps a circular buffer of `period` slots pre-filled with na, so the
      // slot read on bar i holds the value from bar i - period and nothing is
      // subtracted until the buffer has wrapped. This reproduces that exactly,
      // including the count that only advances on a non-na sample.
      const rollingWindow = (values, period) => {
        const sums = new Array(n).fill(0)
        const counts = new Array(n).fill(0)
        let sum = 0
        let count = 0
        for (let i = 0; i < n; i++) {
          const oldest = i >= period ? values[i - period] : NaN
          if (Number.isFinite(oldest)) {
            sum -= oldest
            count -= 1
          }
          if (Number.isFinite(values[i])) {
            sum += values[i]
            count += 1
          }
          sums[i] = sum
          counts[i] = count
        }
        return { sums, counts }
      }

      const bpFast = rollingWindow(bp, fastPeriod)
      const trFast = rollingWindow(tr, fastPeriod)
      const bpMedium = rollingWindow(bp, mediumPeriod)
      const trMedium = rollingWindow(tr, mediumPeriod)
      const bpSlow = rollingWindow(bp, slowPeriod)
      const trSlow = rollingWindow(tr, slowPeriod)

      // Pine halts with runtime.error when the periods are not strictly
      // ascending or a weight is not positive. The inputs are clamped above and
      // the blend below stays well defined for any positive set, so the port
      // keeps drawing instead of blanking the pane.
      const totalWeight = fastWeight + mediumWeight + slowWeight
      if (!(totalWeight > 0)) return { ultosc: nulls(out) }

      for (let i = 0; i < n; i++) {
        if (bpSlow.counts[i] < slowPeriod) continue
        const rawFast = trFast.sums[i] > 0 && bpFast.counts[i] >= fastPeriod
          ? (100 * bpFast.sums[i]) / trFast.sums[i]
          : 0
        const rawMedium = trMedium.sums[i] > 0 && bpMedium.counts[i] >= mediumPeriod
          ? (100 * bpMedium.sums[i]) / trMedium.sums[i]
          : 0
        const rawSlow = trSlow.sums[i] > 0 && bpSlow.counts[i] >= slowPeriod
          ? (100 * bpSlow.sums[i]) / trSlow.sums[i]
          : 0
        const weighted = rawFast * fastWeight + rawMedium * mediumWeight + rawSlow * slowWeight
        out[i] = weighted / totalWeight
      }

      return { ultosc: nulls(out) }
    },
  })
}
