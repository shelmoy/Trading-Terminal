/**
 * HT_DCPERIOD: Hilbert Transform Dominant Cycle Period - ported to
 * openalgo-charts from Pine Script v6.
 *
 * Source: https://github.com/mihakralj/pinescript/blob/c4e91b962be09733d8fc76caa5191e9e586c5cee/indicators/cycles/ht_dcperiod.pine
 * Repo:   mihakralj/pinescript
 * License: MIT (c) mihakralj
 * SPDX-FileCopyrightText: (c) mihakralj
 * SPDX-FileCopyrightText: (c) 2026 marketcalls (port to openalgo-charts)
 * SPDX-License-Identifier: MIT
 *
 * Ehlers' Hilbert transform quadrature method: the price is split into in-phase
 * and quadrature components, and the angle their phasor turns through each bar
 * gives the dominant cycle length in bars, clamped to 6 to 50 and smoothed.
 */

export default function ({ registerIndicator, sourceValues, nulls }) {
  // The source's own quadrant-aware atan2. It agrees with Math.atan2 term for
  // term; it is kept because the port should read like the reference.
  const atan2 = (y, x) => {
    const ay = Math.abs(y)
    const ax = Math.abs(x)
    let angle = ax > ay ? Math.atan(ay / ax) : Math.PI / 2 - Math.atan(ax / ay)
    if (x < 0) angle = Math.PI - angle
    if (y < 0) angle = -angle
    return angle
  }

  registerIndicator({
    id: 'oa-ht-dcperiod',
    name: 'HT_DCPERIOD: Hilbert Transform Dominant Cycle Period',
    category: 'Cycles',
    placement: 'pane',

    inputs: [{ key: 'source', type: 'source', label: 'Source', default: 'hlc3' }],

    plots: [
      {
        key: 'dcperiod',
        type: 'line',
        title: 'Dominant Cycle Period',
        style: { color: '#ffeb3b', lineWidth: 2 },
      },
    ],

    levels: () => [
      { price: 15, title: 'Short Cycle', color: '#787b86', dashed: true },
      { price: 30, title: 'Long Cycle', color: '#787b86', dashed: true },
    ],

    calc(bars, settings) {
      const n = bars.length
      const src = sourceValues(bars, settings.source ?? 'hlc3')

      // Pine wraps every history reference in nz(), so a missing bar and a bar
      // before the series began both read as 0.
      const price = new Array(n).fill(0)
      for (let i = 0; i < n; i++) price[i] = Number.isFinite(src[i]) ? src[i] : 0

      const back = (arr, i, k) => {
        const j = i - k
        return j >= 0 && Number.isFinite(arr[j]) ? arr[j] : 0
      }

      const smoothPrice = new Array(n).fill(0)
      const detrender = new Array(n).fill(0)
      const q1 = new Array(n).fill(0)
      const i1 = new Array(n).fill(0)
      const i2 = new Array(n).fill(0)
      const q2 = new Array(n).fill(0)
      const re = new Array(n).fill(0)
      const im = new Array(n).fill(0)

      // var state: both seed at 15 bars, and `period` keeps its previous value
      // on any bar where the phasor gives no usable angle.
      let period = 15
      let smoothPeriod = 15

      const out = new Array(n).fill(NaN)

      for (let i = 0; i < n; i++) {
        // The Hilbert filter width follows the previous bar's smoothed period.
        const bandwidth = 0.075 * smoothPeriod + 0.54

        smoothPrice[i] =
          (4 * price[i] + 3 * back(price, i, 1) + 2 * back(price, i, 2) + back(price, i, 3)) / 10

        detrender[i] =
          (0.0962 * smoothPrice[i] +
            0.5769 * back(smoothPrice, i, 2) -
            0.5769 * back(smoothPrice, i, 4) -
            0.0962 * back(smoothPrice, i, 6)) *
          bandwidth

        q1[i] =
          (0.0962 * detrender[i] +
            0.5769 * back(detrender, i, 2) -
            0.5769 * back(detrender, i, 4) -
            0.0962 * back(detrender, i, 6)) *
          bandwidth

        i1[i] = back(detrender, i, 3)

        const ji =
          (0.0962 * i1[i] +
            0.5769 * back(i1, i, 2) -
            0.5769 * back(i1, i, 4) -
            0.0962 * back(i1, i, 6)) *
          bandwidth

        const jq =
          (0.0962 * q1[i] +
            0.5769 * back(q1, i, 2) -
            0.5769 * back(q1, i, 4) -
            0.0962 * back(q1, i, 6)) *
          bandwidth

        // Phasor, then the source's 0.2 / 0.8 one-pole smoothing of each leg.
        const rawI2 = i1[i] - jq
        const rawQ2 = q1[i] + ji
        i2[i] = 0.2 * rawI2 + 0.8 * back(i2, i, 1)
        q2[i] = 0.2 * rawQ2 + 0.8 * back(q2, i, 1)

        const rawRe = i2[i] * back(i2, i, 1) + q2[i] * back(q2, i, 1)
        const rawIm = i2[i] * back(q2, i, 1) - q2[i] * back(i2, i, 1)
        re[i] = 0.2 * rawRe + 0.8 * back(re, i, 1)
        im[i] = 0.2 * rawIm + 0.8 * back(im, i, 1)

        // atan2 is undefined at the origin, which is why the source guards it.
        if (im[i] !== 0 || re[i] !== 0) {
          const angle = atan2(im[i], re[i])
          if (angle !== 0) period = (2 * Math.PI) / angle
        }

        period = Math.max(6, Math.min(50, period))
        smoothPeriod = 0.33 * period + 0.67 * smoothPeriod
        out[i] = smoothPeriod
      }

      return { dcperiod: nulls(out) }
    },
  })
}
