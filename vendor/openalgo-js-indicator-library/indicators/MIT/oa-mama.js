/**
 * MESA Adaptive Moving Average (MAMA) - ported to openalgo-charts from Pine Script v6.
 *
 * Source: https://github.com/mihakralj/pinescript/blob/c4e91b962be09733d8fc76caa5191e9e586c5cee/indicators/trends_IIR/mama.pine
 * Repo:   mihakralj/pinescript
 * License: MIT (c) mihakralj
 * SPDX-FileCopyrightText: (c) mihakralj
 * SPDX-FileCopyrightText: (c) 2026 marketcalls (port to openalgo-charts)
 * SPDX-License-Identifier: MIT
 *
 * Ehlers' MAMA runs a Hilbert-transform phase detector over price and sets its
 * smoothing constant from how fast that phase is rotating, so it tracks closely
 * in a trend and flattens in a range. FAMA follows MAMA at half the rate.
 */

export default function ({ registerIndicator, sourceValues, nulls }) {
  registerIndicator({
    id: 'oa-mama',
    name: 'MESA Adaptive Moving Average (MAMA)',
    category: 'Trends IIR',
    placement: 'onchart',

    inputs: [
      { key: 'source', type: 'source', label: 'Source', default: 'close' },
      {
        key: 'fastLimit',
        type: 'number',
        label: 'Fast Limit',
        default: 0.5,
        min: 0.01,
        max: 0.99,
        step: 0.01,
        tooltip: 'Upper bound on the adaptive smoothing constant.',
      },
      {
        key: 'slowLimit',
        type: 'number',
        label: 'Slow Limit',
        default: 0.05,
        min: 0.001,
        max: 0.5,
        step: 0.01,
        tooltip: 'Lower bound on the adaptive smoothing constant.',
      },
    ],

    plots: [
      { key: 'mama', type: 'line', title: 'MAMA', style: { color: '#ffeb3b', lineWidth: 2 } },
      { key: 'fama', type: 'line', title: 'FAMA', style: { color: '#ffeb3b', lineWidth: 2 } },
    ],

    calc(bars, settings) {
      const n = bars.length
      // A cleared number field arrives as '', and Number('') is 0.
      const fastLimit = Math.min(0.99, Math.max(0.01, Number(settings.fastLimit) || 0.5))
      const slowRaw = Math.min(0.5, Math.max(0.001, Number(settings.slowLimit) || 0.05))
      // Pine aborts when fastLimit < slowLimit; clamp instead so the chart keeps drawing.
      const slowLimit = Math.min(slowRaw, fastLimit)
      const src = sourceValues(bars, settings.source ?? 'close')

      const TWOPI = 2 * Math.PI
      const c1 = 0.0962
      const c2 = 0.5769

      // One array per Pine series, holding the value the variable carried at the
      // end of each bar. That is what `x[k]` reads, including on a bar where the
      // branch taken left the var untouched.
      const priceArr = new Array(n).fill(NaN)
      const smoothArr = new Array(n).fill(NaN)
      const dtArr = new Array(n).fill(NaN)
      const i1Arr = new Array(n).fill(NaN)
      const q1Arr = new Array(n).fill(NaN)
      const i2Arr = new Array(n).fill(NaN)
      const q2Arr = new Array(n).fill(NaN)
      const reArr = new Array(n).fill(NaN)
      const imArr = new Array(n).fill(NaN)
      const periodArr = new Array(n).fill(NaN)
      const phaseArr = new Array(n).fill(NaN)
      const mamaArr = new Array(n).fill(NaN)
      const famaArr = new Array(n).fill(NaN)

      // A bar before the first one reads as na in Pine, which is NaN here.
      const hist = (arr, k) => (k >= 0 ? arr[k] : NaN)

      // var seeds, copied from the source declarations.
      let period = 0
      let phase = 0
      let i1 = 0
      let q1 = 0
      let i2 = 0
      let q2 = 0
      let re = 0
      let im = 0
      let dt = NaN
      let smooth = NaN
      let mamaVal = NaN
      let famaVal = NaN

      for (let k = 0; k < n; k++) {
        const s0 = src[k]
        const s1 = hist(src, k - 1)
        const s2 = hist(src, k - 2)
        const s3 = hist(src, k - 3)
        let price
        if (Number.isFinite(s3)) price = (4 * s0 + 3 * s1 + 2 * s2 + s3) / 10
        else if (Number.isFinite(s2)) price = (4 * s0 + 3 * s1 + 2 * s2) / 9
        else if (Number.isFinite(s1)) price = (4 * s0 + 3 * s1) / 7
        else price = s0

        if (!Number.isFinite(mamaVal)) {
          // Seeding branch. It also re-arms whenever the recursion has produced
          // an na, which the source's early Hilbert warmup does on a few bars.
          mamaVal = price
          famaVal = price
          smooth = price
        } else {
          smooth =
            (4 * price +
              3 * hist(priceArr, k - 1) +
              2 * hist(priceArr, k - 2) +
              hist(priceArr, k - 3)) /
            10

          const padj = 0.075 * period + 0.54

          dt =
            (c1 * smooth +
              c2 * hist(smoothArr, k - 2) -
              c2 * hist(smoothArr, k - 4) -
              c1 * hist(smoothArr, k - 6)) *
            padj

          i1 = hist(dtArr, k - 3)

          q1 =
            (c1 * dt + c2 * hist(dtArr, k - 2) - c2 * hist(dtArr, k - 4) - c1 * hist(dtArr, k - 6)) *
            padj

          const jI =
            (c1 * i1 +
              c2 * hist(i1Arr, k - 2) -
              c2 * hist(i1Arr, k - 4) -
              c1 * hist(i1Arr, k - 6)) *
            padj

          const jQ =
            (c1 * q1 +
              c2 * hist(q1Arr, k - 2) -
              c2 * hist(q1Arr, k - 4) -
              c1 * hist(q1Arr, k - 6)) *
            padj

          i2 = 0.2 * (i1 - jQ) + 0.8 * hist(i2Arr, k - 1)
          q2 = 0.2 * (q1 + jI) + 0.8 * hist(q2Arr, k - 1)

          re = 0.2 * (i2 * hist(i2Arr, k - 1) + q2 * hist(q2Arr, k - 1)) + 0.8 * hist(reArr, k - 1)
          im = 0.2 * (i2 * hist(q2Arr, k - 1) - q2 * hist(i2Arr, k - 1)) + 0.8 * hist(imArr, k - 1)

          // Pine treats a comparison against na as false; JavaScript does not.
          if (Number.isFinite(im) && im !== 0 && Number.isFinite(re) && re !== 0) {
            period = TWOPI / Math.atan(im / re)
          }
          period = 0.2 * Math.max(6, Math.min(50, period)) + 0.8 * hist(periodArr, k - 1)

          if (Number.isFinite(i1) && i1 !== 0) {
            phase = Math.atan(q1 / i1)
          }

          let deltaPhase = hist(phaseArr, k - 1) - phase
          if (deltaPhase >= 1) deltaPhase = 0
          if (deltaPhase < 0) deltaPhase += TWOPI

          // A zero deltaPhase divides to Infinity, which the max/min pair then
          // pulls back to fastLimit. That is the source's intent, so leave it.
          const alpha = Math.min(
            fastLimit,
            Math.max(slowLimit, fastLimit / Math.pow(deltaPhase / 0.5, 2)),
          )
          const oneMinusAlpha = 1 - alpha

          mamaVal = alpha * price + oneMinusAlpha * hist(mamaArr, k - 1)
          famaVal = 0.5 * alpha * mamaVal + (1 - 0.5 * alpha) * hist(famaArr, k - 1)
        }

        priceArr[k] = price
        smoothArr[k] = smooth
        dtArr[k] = dt
        i1Arr[k] = i1
        q1Arr[k] = q1
        i2Arr[k] = i2
        q2Arr[k] = q2
        reArr[k] = re
        imArr[k] = im
        periodArr[k] = period
        phaseArr[k] = phase
        mamaArr[k] = mamaVal
        famaArr[k] = famaVal
      }

      return { mama: nulls(mamaArr), fama: nulls(famaArr) }
    },
  })
}
