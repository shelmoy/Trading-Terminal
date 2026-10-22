/**
 * HT_TRENDMODE: Hilbert Transform Trend Mode - ported to openalgo-charts from Pine Script v6.
 *
 * Source: https://github.com/mihakralj/pinescript/blob/c4e91b962be09733d8fc76caa5191e9e586c5cee/indicators/dynamics/ht_trendmode.pine
 * Repo:   mihakralj/pinescript
 * License: MIT (c) mihakralj
 * SPDX-FileCopyrightText: (c) mihakralj
 * SPDX-FileCopyrightText: (c) 2026 marketcalls (port to openalgo-charts)
 * SPDX-License-Identifier: MIT
 *
 * Ehlers' Hilbert transform discriminator reduced to one decision: it prints 1
 * when the instantaneous period runs well past the smoothed dominant cycle
 * (trend mode) and 0 when the two agree (cycle mode).
 */

export default function ({ registerIndicator, sourceValues, nulls }) {
  // Pine's numerically stable atan2, ported branch for branch. The source
  // refuses the y == 0 and x == 0 case; every call site here guards it, so the
  // zero return below is unreachable.
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
    id: 'oa-ht-trendmode',
    name: 'HT_TRENDMODE: Hilbert Transform Trend Mode',
    category: 'Dynamics',
    placement: 'pane',

    inputs: [{ key: 'source', type: 'source', label: 'Source', default: 'hlc3' }],

    plots: [
      {
        key: 'trendmode',
        type: 'step',
        title: 'Trend Mode',
        style: { color: '#4caf50', lineWidth: 3 },
        // Pine: color=trendmode == 1 ? color.green : color.red
        colorBy: ({ value }) => (value === 1 ? '#4caf50' : '#ff5252'),
      },
    ],

    calc(bars, settings) {
      const n = bars.length
      const src = sourceValues(bars, settings.source ?? 'hlc3')

      // Pine's nz(x[back]): history before the first bar reads as 0.
      const back = (arr, i, k) => (i - k >= 0 ? arr[i - k] : 0)

      const price = new Array(n).fill(0)
      const smoothPrice = new Array(n).fill(0)
      const detrender = new Array(n).fill(0)
      const i1 = new Array(n).fill(0)
      const q1 = new Array(n).fill(0)
      const i2 = new Array(n).fill(0)
      const q2 = new Array(n).fill(0)
      const re = new Array(n).fill(0)
      const im = new Array(n).fill(0)
      const dcPhaseHist = new Array(n).fill(0)
      const deltaPhaseHist = new Array(n).fill(0)
      const instPeriodHist = new Array(n).fill(0)
      const out = new Array(n).fill(NaN)

      // The var-carried state of the Pine function, with its seed values.
      let period = 15
      let smoothPeriod = 15
      let dcPhase = 0
      let instPeriod = 15

      for (let i = 0; i < n; i++) {
        price[i] = Number.isFinite(src[i]) ? src[i] : 0

        // bandwidth reads smooth_period before this bar reassigns it.
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
          (0.0962 * i1[i] + 0.5769 * back(i1, i, 2) - 0.5769 * back(i1, i, 4) - 0.0962 * back(i1, i, 6)) *
          bandwidth
        const jq =
          (0.0962 * q1[i] + 0.5769 * back(q1, i, 2) - 0.5769 * back(q1, i, 4) - 0.0962 * back(q1, i, 6)) *
          bandwidth

        // i2 and q2 are written twice on the bar: the raw value, then the
        // 0.2/0.8 smoothing against the previous bar's committed value.
        i2[i] = 0.2 * (i1[i] - jq) + 0.8 * back(i2, i, 1)
        q2[i] = 0.2 * (q1[i] + ji) + 0.8 * back(q2, i, 1)

        const rawRe = i2[i] * back(i2, i, 1) + q2[i] * back(q2, i, 1)
        const rawIm = i2[i] * back(q2, i, 1) - q2[i] * back(i2, i, 1)
        re[i] = 0.2 * rawRe + 0.8 * back(re, i, 1)
        im[i] = 0.2 * rawIm + 0.8 * back(im, i, 1)

        if (im[i] !== 0 || re[i] !== 0) {
          const angle = atan2(im[i], re[i])
          if (angle !== 0) period = (2 * Math.PI) / angle
        }
        period = Math.max(6, Math.min(50, period))
        smoothPeriod = 0.33 * period + 0.67 * smoothPeriod

        if (im[i] !== 0 || re[i] !== 0) dcPhase = atan2(im[i], re[i])
        dcPhaseHist[i] = dcPhase

        let deltaPhase = dcPhase - back(dcPhaseHist, i, 1)
        if (Math.abs(deltaPhase) < 0.1) deltaPhase = back(deltaPhaseHist, i, 1)
        deltaPhaseHist[i] = deltaPhase

        // Pine reads nz(inst_period[1]) here, so the first bar folds in 0 while
        // an unassigned bar keeps the var value of 15.
        const prevInstPeriod = back(instPeriodHist, i, 1)
        if (deltaPhase !== 0) {
          const tempPeriod = (2 * Math.PI) / deltaPhase
          instPeriod = 0.33 * tempPeriod + 0.67 * prevInstPeriod
        }
        instPeriodHist[i] = instPeriod

        out[i] = instPeriod > 1.5 * smoothPeriod ? 1 : 0
      }

      return { trendmode: nulls(out) }
    },
  })
}
