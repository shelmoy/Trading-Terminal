/**
 * Skewness (SKEW) - ported to openalgo-charts from Pine Script v6.
 *
 * Source: https://github.com/mihakralj/pinescript/blob/c4e91b962be09733d8fc76caa5191e9e586c5cee/indicators/statistics/skew.pine
 * Repo:   mihakralj/pinescript
 * License: MIT
 * SPDX-FileCopyrightText: (c) mihakralj
 * SPDX-FileCopyrightText: (c) 2026 marketcalls (port to openalgo-charts)
 * SPDX-License-Identifier: MIT
 *
 * Population skewness (Fisher-Pearson coefficient g1) of the source over a
 * rolling window: the asymmetry of the return distribution about its mean.
 */

export default function ({ registerIndicator, sourceValues, nulls }) {
  registerIndicator({
    id: 'oa-skew',
    name: 'Skewness (SKEW)',
    category: 'Statistics',
    placement: 'pane',

    inputs: [
      { key: 'source', type: 'source', label: 'Source', default: 'close' },
      { key: 'length', type: 'number', label: 'Length', default: 20, min: 3, max: 5000, step: 1 },
    ],

    plots: [{ key: 'skew', type: 'line', title: 'Skewness', style: { color: '#ffeb3b', lineWidth: 2 } }],

    calc(bars, settings) {
      // A cleared number field arrives as '', and Number('') is 0. Pine raises
      // below 3, so the floor is 3 rather than 1.
      const len = Math.max(3, Math.floor(Number(settings.length) || 20))
      const src = sourceValues(bars, settings.source ?? 'close')
      const n = bars.length
      const out = new Array(n).fill(NaN)
      const nz = (x) => (Number.isFinite(x) ? x : 0)

      // Three rolling buffers, exactly as the source keeps them. Each slot is
      // written before it is ever read back, so the na seeding never matters.
      const bufM = new Array(len).fill(0)
      const bufV = new Array(len).fill(0)
      const bufS3 = new Array(len).fill(0)
      let headM = 0
      let headV = 0
      let headS3 = 0
      let sumM = 0
      let sumV = 0
      let sumS3 = 0

      for (let i = 0; i < n; i++) {
        if (i >= len) sumM -= bufM[headM]
        const currentSrc = nz(src[i])
        sumM += currentSrc
        bufM[headM] = currentSrc
        headM = (headM + 1) % len

        // Expanding mean until the window is full, rolling mean after that.
        const mean = i >= len - 1 ? sumM / len : sumM / (i + 1)

        // The deviation uses the raw source, and each moment buffer stores the
        // deviation measured against that bar's own mean: the window is never
        // re-centred, which is what makes this an O(1) approximation.
        const dev = src[i] - mean

        const devSq = nz(Math.pow(dev, 2))
        if (i >= len) sumV -= bufV[headV]
        sumV += devSq
        bufV[headV] = devSq
        headV = (headV + 1) % len
        const variance = i >= len - 1 ? sumV / len : sumV / (i + 1)
        const stddev = variance > 1e-9 ? Math.sqrt(variance) : 0

        const devCubed = nz(Math.pow(dev, 3))
        if (i >= len) sumS3 -= bufS3[headS3]
        sumS3 += devCubed
        bufS3[headS3] = devCubed
        headS3 = (headS3 + 1) % len
        const m3 = i >= len - 1 ? sumS3 / len : sumS3 / (i + 1)

        let skewVal = 0
        if (Number.isFinite(m3) && stddev > 1e-9) {
          const stddevCubed = Math.pow(stddev, 3)
          skewVal = stddevCubed !== 0 ? m3 / stddevCubed : 0
        }
        out[i] = Number.isFinite(skewVal) ? skewVal : NaN
      }

      return { skew: nulls(out) }
    },
  })
}
