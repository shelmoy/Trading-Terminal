/**
 * HT_PHASOR: Hilbert Transform Phasor Components - ported to openalgo-charts from Pine Script v6.
 *
 * Source: https://github.com/mihakralj/pinescript/blob/c4e91b962be09733d8fc76caa5191e9e586c5cee/indicators/cycles/ht_phasor.pine
 * Repo:   mihakralj/pinescript
 * License: MIT
 * SPDX-FileCopyrightText: (c) mihakralj
 * SPDX-FileCopyrightText: (c) 2026 marketcalls (port to openalgo-charts)
 * SPDX-License-Identifier: MIT
 *
 * Runs Ehlers' Hilbert transform over a smoothed price to split the dominant
 * cycle into its in-phase and quadrature components, with the filter bandwidth
 * adapting to the measured cycle period.
 */

export default function ({ registerIndicator, sourceValues, nulls }) {
  // Quadrant-aware angle, ported verbatim. The source guards against y and x
  // both being zero before calling it, so this is only reached with one non-zero.
  const atan2 = (y, x) => {
    const ay = Math.abs(y)
    const ax = Math.abs(x)
    let angle = 0.0
    if (ax > ay) {
      angle = Math.atan(ay / ax)
    } else if (ay > 0) {
      angle = Math.PI / 2.0 - Math.atan(ax / ay)
    } else {
      return 0.0
    }
    if (x < 0.0) angle = Math.PI - angle
    if (y < 0.0) angle = -angle
    return angle
  }

  registerIndicator({
    id: 'oa-ht-phasor',
    name: 'HT_PHASOR: Hilbert Transform Phasor Components',
    category: 'Cycles',
    placement: 'pane',

    inputs: [{ key: 'source', type: 'source', label: 'Source', default: 'hlc3' }],

    plots: [
      { key: 'inphase', type: 'line', title: 'InPhase', style: { color: '#ffeb3b', lineWidth: 2 } },
      { key: 'quadrature', type: 'line', title: 'Quadrature', style: { color: '#2962ff', lineWidth: 2 } },
    ],

    // The source's hline is style_solid, and a level with no style set falls to
    // dashed in the runtime, so the style is given explicitly.
    levels: () => [{ price: 0, title: 'Zero', color: '#9598a1', lineStyle: 'solid' }],

    calc(bars, settings) {
      const src = sourceValues(bars, settings.source ?? 'hlc3')
      const n = bars.length

      // Every series below is nz()'d in the source, so a missing history reads
      // as 0 rather than propagating na.
      const price = new Array(n).fill(0)
      const smoothPrice = new Array(n).fill(0)
      const detrender = new Array(n).fill(0)
      const i1 = new Array(n).fill(0)
      const q1 = new Array(n).fill(0)
      const i2 = new Array(n).fill(0)
      const q2 = new Array(n).fill(0)
      const re = new Array(n).fill(0)
      const im = new Array(n).fill(0)

      const at = (arr, k) => (k >= 0 && Number.isFinite(arr[k]) ? arr[k] : 0)

      // Pine seeds both var floats at 15 and only updates them at the end of a
      // bar, so bandwidth on bar i uses the previous bar's smoothed period.
      let period = 15.0
      let smoothPeriod = 15.0

      for (let i = 0; i < n; i++) {
        price[i] = Number.isFinite(src[i]) ? src[i] : 0

        const bandwidth = 0.075 * smoothPeriod + 0.54

        smoothPrice[i] = (4.0 * price[i] + 3.0 * at(price, i - 1) + 2.0 * at(price, i - 2) + at(price, i - 3)) / 10.0

        detrender[i] =
          (0.0962 * smoothPrice[i] +
            0.5769 * at(smoothPrice, i - 2) -
            0.5769 * at(smoothPrice, i - 4) -
            0.0962 * at(smoothPrice, i - 6)) *
          bandwidth

        q1[i] =
          (0.0962 * detrender[i] +
            0.5769 * at(detrender, i - 2) -
            0.5769 * at(detrender, i - 4) -
            0.0962 * at(detrender, i - 6)) *
          bandwidth

        i1[i] = at(detrender, i - 3)

        const ji =
          (0.0962 * i1[i] + 0.5769 * at(i1, i - 2) - 0.5769 * at(i1, i - 4) - 0.0962 * at(i1, i - 6)) * bandwidth
        const jq =
          (0.0962 * q1[i] + 0.5769 * at(q1, i - 2) - 0.5769 * at(q1, i - 4) - 0.0962 * at(q1, i - 6)) * bandwidth

        const rawI2 = i1[i] - jq
        const rawQ2 = q1[i] + ji

        const prevI2 = at(i2, i - 1)
        const prevQ2 = at(q2, i - 1)
        i2[i] = 0.2 * rawI2 + 0.8 * prevI2
        q2[i] = 0.2 * rawQ2 + 0.8 * prevQ2

        const rawRe = i2[i] * prevI2 + q2[i] * prevQ2
        const rawIm = i2[i] * prevQ2 - q2[i] * prevI2
        re[i] = 0.2 * rawRe + 0.8 * at(re, i - 1)
        im[i] = 0.2 * rawIm + 0.8 * at(im, i - 1)

        if (im[i] !== 0.0 || re[i] !== 0.0) {
          const angle = atan2(im[i], re[i])
          if (angle !== 0.0 && Number.isFinite(angle)) {
            const next = (2.0 * Math.PI) / angle
            if (Number.isFinite(next)) period = next
          }
        }
        period = Math.max(6.0, Math.min(50.0, period))
        smoothPeriod = 0.33 * period + 0.67 * smoothPeriod

        if (!Number.isFinite(i2[i])) i2[i] = 0
        if (!Number.isFinite(q2[i])) q2[i] = 0
        if (!Number.isFinite(re[i])) re[i] = 0
        if (!Number.isFinite(im[i])) im[i] = 0
      }

      return { inphase: nulls(i2), quadrature: nulls(q2) }
    },
  })
}
