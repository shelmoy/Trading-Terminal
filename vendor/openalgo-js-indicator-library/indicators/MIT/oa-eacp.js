/**
 * EACP: Ehlers Autocorrelation Periodogram - ported to openalgo-charts from Pine Script v6.
 *
 * Source: https://github.com/mihakralj/pinescript/blob/c4e91b962be09733d8fc76caa5191e9e586c5cee/indicators/cycles/eacp.pine
 * Repo:   mihakralj/pinescript
 * License: MIT (c) mihakralj
 * SPDX-FileCopyrightText: (c) mihakralj
 * SPDX-FileCopyrightText: (c) 2026 marketcalls (port to openalgo-charts)
 * SPDX-License-Identifier: MIT
 *
 * Price is high pass filtered and smoothed, autocorrelated at every lag, then
 * turned into a power spectrum by a discrete transform, and the centre of
 * gravity of that spectrum is reported as the dominant cycle length.
 */

export default function ({ registerIndicator, sourceValues, nulls }) {
  registerIndicator({
    id: 'oa-eacp',
    name: 'EACP: Ehlers Autocorrelation Periodogram',
    category: 'Cycles',
    placement: 'pane',

    inputs: [
      { key: 'source', type: 'source', label: 'Source', default: 'close' },
      { key: 'minPeriod', type: 'number', label: 'Min Period', default: 8, min: 3, max: 500, step: 1 },
      { key: 'maxPeriod', type: 'number', label: 'Max Period', default: 48, min: 4, max: 500, step: 1 },
      {
        key: 'avgLength',
        type: 'number',
        label: 'Autocorrelation Length',
        default: 3,
        min: 0,
        max: 500,
        step: 1,
        tooltip: 'Averaging length for the Pearson correlation. Zero uses the lag itself.',
      },
      { key: 'enhance', type: 'boolean', label: 'Enhance Resolution', default: true },
    ],

    plots: [
      { key: 'dominantCycle', type: 'line', title: 'Dominant Cycle', style: { color: '#ffeb3b', lineWidth: 2 } },
      { key: 'normalizedPower', type: 'line', title: 'Normalized Power', style: { color: '#ff9800', lineWidth: 2 } },
    ],

    calc(bars, settings) {
      // A cleared number field arrives as '', and Number('') is 0.
      const minPeriod = Math.min(500, Math.max(3, Math.floor(Number(settings.minPeriod) || 8)))
      let maxPeriod = Math.min(500, Math.max(4, Math.floor(Number(settings.maxPeriod) || 48)))
      // Pine raises when the range is empty; here it is clamped instead.
      if (maxPeriod <= minPeriod) maxPeriod = Math.min(500, minPeriod + 1)

      // Zero is a meaningful setting for this one (use the lag as the window),
      // so a cleared field has to be told apart from a deliberate 0.
      const rawAvg = settings.avgLength
      const avgNum = Number(rawAvg)
      const avgLength =
        rawAvg === '' || rawAvg === null || rawAvg === undefined || !Number.isFinite(avgNum)
          ? 3
          : Math.min(500, Math.max(0, Math.floor(avgNum)))

      const enhance = settings.enhance !== false
      const src = sourceValues(bars, settings.source ?? 'close')

      const n = bars.length
      const dominantCycle = new Array(n).fill(NaN)
      const normalizedPower = new Array(n).fill(NaN)
      if (n === 0) return { dominantCycle: nulls(dominantCycle), normalizedPower: nulls(normalizedPower) }

      const size = maxPeriod + 1
      const corr = new Array(size).fill(0)
      const power = new Array(size).fill(0)
      // smooth is recursive across bars: each spectral bin keeps 80 per cent of
      // its previous value.
      const smooth = new Array(size).fill(0)

      const hpArr = new Array(n).fill(0)
      const filtArr = new Array(n).fill(0)

      const twoPi = 2 * Math.PI
      const rootTwoPi = Math.SQRT2 * Math.PI

      // High pass coefficients, fixed by maxPeriod.
      const cosHp = Math.cos(rootTwoPi / maxPeriod)
      const sinHp = Math.sin(rootTwoPi / maxPeriod)
      const alphaHP = cosHp !== 0 ? (cosHp + sinHp - 1) / cosHp : 0
      const hpGain = Math.pow(1 - alphaHP / 2, 2)
      const hpB = 2 * (1 - alphaHP)
      const hpC = Math.pow(1 - alphaHP, 2)

      // Super smoother coefficients, fixed by minPeriod.
      const a1 = Math.exp(-rootTwoPi / minPeriod)
      const b1 = 2 * a1 * Math.cos(rootTwoPi / minPeriod)
      const c2 = b1
      const c3 = -(a1 * a1)
      const c1 = 1 - c2 - c3

      // The transform angles never change, so build them once instead of every bar.
      const bins = maxPeriod - minPeriod + 1
      const cosTable = new Array(bins)
      const sinTable = new Array(bins)
      for (let p = minPeriod; p <= maxPeriod; p++) {
        const cosRow = new Float64Array(maxPeriod + 1)
        const sinRow = new Float64Array(maxPeriod + 1)
        for (let k = 2; k <= maxPeriod; k++) {
          const angle = (twoPi * k) / p
          cosRow[k] = Math.cos(angle)
          sinRow[k] = Math.sin(angle)
        }
        cosTable[p - minPeriod] = cosRow
        sinTable[p - minPeriod] = sinRow
      }

      const diff = maxPeriod - minPeriod
      const K = diff > 0 ? Math.pow(10, -0.15 / diff) : 1
      const alpha = 0.2
      const beta = 1 - alpha

      // var state, seeded exactly as the source seeds it on its first bar.
      let dom = (minPeriod + maxPeriod) * 0.5
      let maxPwr = 0
      let e = 1
      let warmup = true

      for (let i = 0; i < n; i++) {
        const price = Number.isFinite(src[i]) ? src[i] : 0
        const price1 = i >= 1 && Number.isFinite(src[i - 1]) ? src[i - 1] : 0
        const price2 = i >= 2 && Number.isFinite(src[i - 2]) ? src[i - 2] : 0

        const hpPrev1 = i >= 1 ? hpArr[i - 1] : 0
        const hpPrev2 = i >= 2 ? hpArr[i - 2] : 0
        const hp = hpGain * (price - 2 * price1 + price2) + hpB * hpPrev1 - hpC * hpPrev2
        hpArr[i] = hp

        const filtPrev1 = i >= 1 ? filtArr[i - 1] : 0
        const filtPrev2 = i >= 2 ? filtArr[i - 2] : 0
        const filt = c1 * (hp + hpPrev1) * 0.5 + c2 * filtPrev1 + c3 * filtPrev2
        filtArr[i] = filt

        // Pearson correlation of the filtered series against itself at each lag.
        for (let lag = 0; lag <= maxPeriod; lag++) {
          if (lag < 2) {
            corr[lag] = 0
            continue
          }
          let window = avgLength === 0 ? lag : avgLength
          if (window < 2) window = 2

          let sx = 0
          let sy = 0
          let sxx = 0
          let syy = 0
          let sxy = 0
          let valid = 0
          for (let k = 0; k < window; k++) {
            const xi = i - k
            const yi = i - (lag + k)
            // Out of range history reads as na in Pine, which nz() turns to 0.
            const x = xi >= 0 ? filtArr[xi] : 0
            const y = yi >= 0 ? filtArr[yi] : 0
            sx += x
            sy += y
            sxx += x * x
            syy += y * y
            sxy += x * y
            valid += 1
          }

          let corrVal = 0
          if (valid > 1) {
            const denomX = valid * sxx - sx * sx
            const denomY = valid * syy - sy * sy
            const denom = denomX * denomY
            corrVal = denom > 0 ? (valid * sxy - sx * sy) / Math.sqrt(denom) : 0
          }
          corr[lag] = corrVal
        }

        // Discrete transform of the correlation set into a power spectrum.
        for (let p = minPeriod; p <= maxPeriod; p++) {
          const cosRow = cosTable[p - minPeriod]
          const sinRow = sinTable[p - minPeriod]
          let cosAcc = 0
          let sinAcc = 0
          for (let k = 2; k <= maxPeriod; k++) {
            const corrVal = corr[k]
            cosAcc += corrVal * cosRow[k]
            sinAcc += corrVal * sinRow[k]
          }
          const sq = cosAcc * cosAcc + sinAcc * sinAcc
          smooth[p] = 0.2 * sq * sq + 0.8 * smooth[p]
        }

        let localMaxPwr = 0
        for (let p = minPeriod; p <= maxPeriod; p++) {
          if (smooth[p] > localMaxPwr) localMaxPwr = smooth[p]
        }

        // The running peak decays by K per bar unless a new peak arrives.
        if (localMaxPwr > maxPwr) maxPwr = localMaxPwr
        else maxPwr = K * maxPwr

        let weighted = 0
        let sumWeight = 0
        for (let p = minPeriod; p <= maxPeriod; p++) {
          let pwr = maxPwr > 0 ? smooth[p] / maxPwr : 0
          if (enhance) pwr = Math.pow(pwr, 3)
          power[p] = pwr
          if (pwr >= 0.5) {
            weighted += p * pwr
            sumWeight += pwr
          }
        }

        const base = sumWeight >= 0.25 ? weighted / sumWeight : dom
        dom = alpha * (base - dom) + dom

        if (warmup) {
          // The source scales dom itself here, so the compensation feeds back
          // into the state; that is what produces the large opening transient
          // it draws, and it is reproduced rather than smoothed over.
          e *= beta
          const c = 1 - e !== 0 ? 1 / (1 - e) : 1
          dom = c * dom
          warmup = e > 1e-10
        }

        let domIdx = Math.round(dom)
        if (!Number.isFinite(domIdx)) domIdx = minPeriod
        domIdx = Math.min(Math.max(domIdx, minPeriod), maxPeriod)

        dominantCycle[i] = dom
        normalizedPower[i] = power[domIdx]
      }

      return { dominantCycle: nulls(dominantCycle), normalizedPower: nulls(normalizedPower) }
    },
  })
}
