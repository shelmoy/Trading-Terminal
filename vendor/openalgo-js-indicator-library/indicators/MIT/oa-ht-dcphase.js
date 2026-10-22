/**
 * HT_DCPHASE: Hilbert Transform Dominant Cycle Phase - ported to openalgo-charts
 * from Pine Script v6.
 *
 * Source: https://github.com/mihakralj/pinescript/blob/c4e91b962be09733d8fc76caa5191e9e586c5cee/indicators/cycles/ht_dcphase.pine
 * Repo:   mihakralj/pinescript
 * License: MIT
 * SPDX-FileCopyrightText: (c) mihakralj
 * SPDX-FileCopyrightText: (c) 2026 marketcalls (port to openalgo-charts)
 * SPDX-License-Identifier: MIT
 *
 * Ehlers' Hilbert transform splits price into in-phase and quadrature
 * components, and this reports where inside the dominant cycle the market
 * currently sits, as an angle from -pi to pi.
 */

export default function ({ registerIndicator, sourceValues, nulls }) {
  // The Pine helper, ported verbatim. It is quadrant aware and avoids the
  // unstable divide by taking the smaller magnitude over the larger one.
  const atan2 = (y, x) => {
    if (y === 0 && x === 0) return 0
    const ay = Math.abs(y)
    const ax = Math.abs(x)
    let angle = ax > ay ? Math.atan(ay / ax) : Math.PI / 2 - Math.atan(ax / ay)
    if (x < 0) angle = Math.PI - angle
    if (y < 0) angle = -angle
    return angle
  }

  registerIndicator({
    id: 'oa-ht-dcphase',
    name: 'HT_DCPHASE: Hilbert Transform Dominant Cycle Phase',
    category: 'Cycles',
    placement: 'pane',

    inputs: [{ key: 'source', type: 'source', label: 'Source', default: 'hlc3' }],

    plots: [
      { key: 'dcphase', type: 'line', title: 'Dominant Cycle Phase', style: { color: '#ffeb3b', lineWidth: 2 } },
    ],

    levels: () => [
      { price: 0, title: 'Zero Phase', color: '#9598a1' },
      { price: 1.5708, title: 'pi/2', color: '#9598a1', dashed: true },
      { price: -1.5708, title: '-pi/2', color: '#9598a1', dashed: true },
    ],

    calc(bars, settings) {
      const src = sourceValues(bars, settings.source ?? 'hlc3')
      const n = bars.length

      // Every historical read in the Pine source is wrapped in nz(), so a bar
      // that does not exist yet reads as 0 rather than propagating na.
      const back = (arr, idx) => (idx >= 0 && Number.isFinite(arr[idx]) ? arr[idx] : 0)

      const price = new Array(n).fill(0)
      const smoothPrice = new Array(n).fill(0)
      const detrender = new Array(n).fill(0)
      const q1 = new Array(n).fill(0)
      const i1 = new Array(n).fill(0)
      const i2 = new Array(n).fill(0)
      const q2 = new Array(n).fill(0)
      const re = new Array(n).fill(0)
      const im = new Array(n).fill(0)
      const out = new Array(n).fill(NaN)

      // Pine var state, seeded exactly as the source seeds it.
      let period = 15
      let smoothPeriod = 15
      let phase = 0

      for (let k = 0; k < n; k++) {
        price[k] = Number.isFinite(src[k]) ? src[k] : 0

        // bandwidth reads the smooth period carried in from the previous bar.
        const bandwidth = 0.075 * smoothPeriod + 0.54

        smoothPrice[k] =
          (4 * price[k] + 3 * back(price, k - 1) + 2 * back(price, k - 2) + back(price, k - 3)) / 10

        detrender[k] =
          (0.0962 * smoothPrice[k] +
            0.5769 * back(smoothPrice, k - 2) -
            0.5769 * back(smoothPrice, k - 4) -
            0.0962 * back(smoothPrice, k - 6)) *
          bandwidth

        q1[k] =
          (0.0962 * detrender[k] +
            0.5769 * back(detrender, k - 2) -
            0.5769 * back(detrender, k - 4) -
            0.0962 * back(detrender, k - 6)) *
          bandwidth

        i1[k] = back(detrender, k - 3)

        const ji =
          (0.0962 * i1[k] +
            0.5769 * back(i1, k - 2) -
            0.5769 * back(i1, k - 4) -
            0.0962 * back(i1, k - 6)) *
          bandwidth

        const jq =
          (0.0962 * q1[k] +
            0.5769 * back(q1, k - 2) -
            0.5769 * back(q1, k - 4) -
            0.0962 * back(q1, k - 6)) *
          bandwidth

        i2[k] = i1[k] - jq
        q2[k] = q1[k] + ji
        // The one-bar reads below are the previous bar's smoothed values,
        // because Pine commits history at the end of the bar.
        i2[k] = 0.2 * i2[k] + 0.8 * back(i2, k - 1)
        q2[k] = 0.2 * q2[k] + 0.8 * back(q2, k - 1)

        re[k] = i2[k] * back(i2, k - 1) + q2[k] * back(q2, k - 1)
        im[k] = i2[k] * back(q2, k - 1) - q2[k] * back(i2, k - 1)
        re[k] = 0.2 * re[k] + 0.8 * back(re, k - 1)
        im[k] = 0.2 * im[k] + 0.8 * back(im, k - 1)

        if (im[k] !== 0 || re[k] !== 0) {
          const angle = atan2(im[k], re[k])
          if (angle !== 0) period = (2 * Math.PI) / angle
        }
        period = Math.max(6, Math.min(50, period))
        smoothPeriod = 0.33 * period + 0.67 * smoothPeriod

        if (i2[k] !== 0 || q2[k] !== 0) phase = atan2(q2[k], i2[k])

        out[k] = Number.isFinite(phase) ? phase : NaN
      }

      return { dcphase: nulls(out) }
    },
  })
}
