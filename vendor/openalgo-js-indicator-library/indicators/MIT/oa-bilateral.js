/**
 * Bilateral Filter (BILATERAL) - ported to openalgo-charts from Pine Script v6.
 *
 * Source: https://github.com/mihakralj/pinescript/blob/c4e91b962be09733d8fc76caa5191e9e586c5cee/indicators/filters/bilateral.pine
 * Repo:   mihakralj/pinescript
 * License: MIT
 * SPDX-FileCopyrightText: (c) mihakralj
 * SPDX-FileCopyrightText: (c) 2026 marketcalls (port to openalgo-charts)
 * SPDX-License-Identifier: MIT
 *
 * Each bar in the window is weighted both by how far back it sits and by how
 * far its value is from the current one, so the average smooths inside a range
 * but preserves the edge of a sharp move.
 */

export default function ({ registerIndicator, sourceValues, stdev, nulls }) {
  registerIndicator({
    id: 'oa-bilateral',
    name: 'Bilateral Filter (BILATERAL)',
    category: 'Filters',
    placement: 'onchart',

    inputs: [
      { key: 'length', type: 'number', label: 'Length', default: 20, min: 2, max: 1000, step: 1 },
      {
        key: 'sigmaSRatio',
        type: 'number',
        label: 'Spatial Sigma Ratio',
        default: 0.5,
        min: 0.01,
        max: 100,
        step: 0.05,
        tooltip: 'Spatial standard deviation as a fraction of the length: larger means bars further back keep more weight.',
      },
      {
        key: 'sigmaRMult',
        type: 'number',
        label: 'Range Sigma Multiplier',
        default: 1,
        min: 0.01,
        max: 100,
        step: 0.1,
        tooltip: 'Range standard deviation as a multiple of the rolling standard deviation: larger means a move has to be bigger before it is treated as an edge.',
      },
      { key: 'source', type: 'source', label: 'Source', default: 'close' },
    ],

    plots: [{ key: 'bilateral', type: 'line', title: 'Bilateral', style: { color: '#ffeb3b', lineWidth: 2 } }],

    calc(bars, settings) {
      // A cleared number field arrives as '', and Number('') is 0.
      const length = Math.max(2, Math.floor(Number(settings.length) || 20))
      const sigmaSRatio = Math.max(0.01, Number(settings.sigmaSRatio) || 0.5)
      const sigmaRMult = Math.max(0.01, Number(settings.sigmaRMult) || 1)
      const src = sourceValues(bars, settings.source ?? 'close')

      // Pine's ta.stdev is the population standard deviation, matching this helper.
      const dev = stdev(src, length)

      const sigmaS = Math.max(length * sigmaSRatio, 1e-10)
      const twoSigmaSSq = 2 * sigmaS * sigmaS

      const out = new Array(bars.length).fill(NaN)

      for (let t = 0; t < bars.length; t++) {
        // ta.stdev is na through its warmup, and math.max(na, 1e-10) is na in
        // Pine, so the whole result is na for the first length-1 bars.
        if (!Number.isFinite(dev[t])) continue

        const sigmaR = Math.max(dev[t] * sigmaRMult, 1e-10)
        const twoSigmaRSq = 2 * sigmaR * sigmaR

        // nz(src[0], src[1]): the current value, falling back to the previous one.
        let centerVal = src[t]
        if (!Number.isFinite(centerVal)) centerVal = t > 0 ? src[t - 1] : NaN
        if (!Number.isFinite(centerVal)) continue

        let sumWeights = 0
        let sumWeightedSrc = 0
        for (let i = 0; i < length; i++) {
          const raw = t - i >= 0 ? src[t - i] : NaN
          const val = Number.isFinite(raw) ? raw : centerVal
          const diffRange = centerVal - val
          const weightSpatial = Math.exp(-(i * i) / twoSigmaSSq)
          const weightRange = Math.exp(-(diffRange * diffRange) / twoSigmaRSq)
          const weight = weightSpatial * weightRange
          sumWeights += weight
          sumWeightedSrc += weight * val
        }

        out[t] = sumWeights === 0 ? centerVal : sumWeightedSrc / sumWeights
      }

      return { bilateral: nulls(out) }
    },
  })
}
