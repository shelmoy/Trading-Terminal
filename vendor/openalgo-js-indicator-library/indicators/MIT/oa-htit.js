/**
 * Hilbert Trendline (HTIT) - ported to openalgo-charts from Pine Script v6.
 *
 * Source: https://github.com/mihakralj/pinescript/blob/c4e91b962be09733d8fc76caa5191e9e586c5cee/indicators/trends_IIR/htit.pine
 * Repo:   mihakralj/pinescript
 * License: MIT (c) mihakralj
 * SPDX-FileCopyrightText: (c) mihakralj
 * SPDX-FileCopyrightText: (c) 2026 marketcalls (port to openalgo-charts)
 * SPDX-License-Identifier: MIT
 *
 * Ehlers' Hilbert Transform Instantaneous Trendline: the source is smoothed,
 * split into in-phase and quadrature components, and the dominant cycle period
 * those components imply is used to adapt the trendline bar by bar.
 */

export default function ({ registerIndicator, sourceValues, nulls }) {
  registerIndicator({
    id: 'oa-htit',
    name: 'Hilbert Trendline (HTIT)',
    category: 'Trends IIR',
    placement: 'onchart',

    inputs: [
      { key: 'source', type: 'source', label: 'Source', default: 'close' },
    ],

    plots: [
      { key: 'htit', type: 'line', title: 'HTIT', style: { color: '#ffeb3b', lineWidth: 2 } },
    ],

    calc(bars, settings) {
      const src = sourceValues(bars, settings.source ?? 'close')
      const n = bars.length

      // Pine's x[k]: NaN past the start of history, which is how na propagates
      // through the warmup exactly as it does in the source.
      const back = (arr, i, k) => (i - k >= 0 ? arr[i - k] : NaN)
      // Pine nz(): a missing value reads as 0.
      const nz = (v) => (Number.isFinite(v) ? v : 0)

      const price = new Array(n).fill(NaN)
      const smooth = new Array(n).fill(NaN)
      const detrender = new Array(n).fill(NaN)
      const i1 = new Array(n).fill(NaN)
      const q1 = new Array(n).fill(NaN)
      const i2 = new Array(n).fill(NaN)
      const q2 = new Array(n).fill(NaN)
      const re = new Array(n).fill(NaN)
      const im = new Array(n).fill(NaN)
      const iTrend = new Array(n).fill(NaN)
      const iTrend1 = new Array(n).fill(NaN)
      const iTrend2 = new Array(n).fill(NaN)
      const out = new Array(n).fill(NaN)

      let periodEst = 10

      for (let i = 0; i < n; i++) {
        const s = Number.isFinite(src[i]) ? src[i] : NaN

        // Weighted four-bar smoothing, applied twice.
        price[i] = (4 * s + 3 * back(src, i, 1) + 2 * back(src, i, 2) + back(src, i, 3)) / 10
        smooth[i] =
          (4 * price[i] + 3 * back(price, i, 1) + 2 * back(price, i, 2) + back(price, i, 3)) / 10

        // Hilbert transform gain, scaled by the current period estimate.
        const padAdj = 0.075 * periodEst + 0.54

        detrender[i] =
          (0.0962 * smooth[i] +
            0.5769 * back(smooth, i, 2) -
            0.5769 * back(smooth, i, 4) -
            0.0962 * back(smooth, i, 6)) *
          padAdj

        i1[i] = nz(back(detrender, i, 3))
        q1[i] =
          (0.0962 * detrender[i] +
            0.5769 * back(detrender, i, 2) -
            0.5769 * back(detrender, i, 4) -
            0.0962 * back(detrender, i, 6)) *
          padAdj

        const jI =
          (0.0962 * i1[i] + 0.5769 * back(i1, i, 2) - 0.5769 * back(i1, i, 4) - 0.0962 * back(i1, i, 6)) *
          padAdj
        const jQ =
          (0.0962 * q1[i] + 0.5769 * back(q1, i, 2) - 0.5769 * back(q1, i, 4) - 0.0962 * back(q1, i, 6)) *
          padAdj

        i2[i] = 0.2 * (i1[i] - jQ) + 0.8 * nz(back(i2, i, 1))
        q2[i] = 0.2 * (q1[i] + jI) + 0.8 * nz(back(q2, i, 1))

        re[i] =
          0.2 * (i2[i] * nz(back(i2, i, 1)) + q2[i] * nz(back(q2, i, 1))) + 0.8 * nz(back(re, i, 1))
        im[i] =
          0.2 * (i2[i] * nz(back(q2, i, 1)) - q2[i] * nz(back(i2, i, 1))) + 0.8 * nz(back(im, i, 1))

        // Pine treats any comparison against na as false, so the estimate holds
        // at its seed through the warmup.
        let newP = periodEst
        if (Number.isFinite(im[i]) && im[i] !== 0 && Number.isFinite(re[i]) && re[i] !== 0) {
          const angleRatio = Math.atan(im[i] / re[i])
          const candidate = angleRatio !== 0 ? (2 * Math.PI) / angleRatio : periodEst
          newP = Number.isFinite(candidate) ? candidate : periodEst
        }
        periodEst = Math.max(6, Math.min(50, 0.2 * newP + 0.8 * periodEst))

        // Phase of the in-phase / quadrature pair, lifted into [0, 2pi).
        let angle = i1[i] !== 0 ? Math.atan(q1[i] / i1[i]) : (Math.PI / 2) * Math.sign(q1[i])
        angle += i1[i] < 0 ? Math.PI : q1[i] < 0 && i1[i] > 0 ? 2 * Math.PI : 0
        angle = angle % (2 * Math.PI)

        const trendPower = Math.sqrt(i1[i] * i1[i] + q1[i] * q1[i])
        const newITrendComponent = smooth[i] + 0.07 * trendPower * Math.sin(angle)

        const prevITrend1 = back(iTrend1, i, 1)
        const prevITrend = back(iTrend, i, 1)
        const currentITrend2 = Number.isFinite(prevITrend1) ? prevITrend1 : smooth[i]
        const currentITrend1 = Number.isFinite(prevITrend) ? prevITrend : smooth[i]
        const currentITrend = 0.9 * newITrendComponent + 1.1 * currentITrend1 - 1.0 * currentITrend2

        iTrend2[i] = currentITrend1
        iTrend1[i] = currentITrend
        iTrend[i] = currentITrend
        out[i] = currentITrend
      }

      return { htit: nulls(out) }
    },
  })
}
