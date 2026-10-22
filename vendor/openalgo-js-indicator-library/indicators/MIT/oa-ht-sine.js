/**
 * HT_SINE: Hilbert Transform - SineWave - ported to openalgo-charts from Pine Script v6.
 *
 * Source: https://github.com/mihakralj/pinescript/blob/c4e91b962be09733d8fc76caa5191e9e586c5cee/indicators/cycles/ht_sine.pine
 * Repo:   mihakralj/pinescript
 * License: MIT (c) mihakralj
 * SPDX-FileCopyrightText: (c) mihakralj
 * SPDX-FileCopyrightText: (c) 2026 marketcalls (port to openalgo-charts)
 * SPDX-License-Identifier: MIT
 *
 * Ehlers' Hilbert Transform pair: the in-phase and quadrature components of the
 * detrended price give a dominant cycle period, and the sine of that cycle's
 * phase, plus a copy led by 45 degrees, mark the cycle turns where they cross.
 */

export default function ({ registerIndicator, sourceValues, nulls }) {
  /**
   * The numerically stable, quadrant-aware atan2 the Pine source defines.
   * Pine raises a runtime error when both arguments are zero; both call sites
   * guard against that, so here the same case simply returns 0 rather than
   * throwing inside the chart's render loop.
   */
  function atan2(y, x) {
    const ay = Math.abs(y)
    const ax = Math.abs(x)
    if (!(ay > 0) && !(ax > 0)) return 0
    // ax > ay implies ax > 0; otherwise ay is the larger and is above zero.
    let angle = ax > ay ? Math.atan(ay / ax) : Math.PI / 2 - Math.atan(ax / ay)
    if (x < 0) angle = Math.PI - angle
    if (y < 0) angle = -angle
    return angle
  }

  // Pine's nz(series[n]): a bar before the first one reads as 0.
  const back = (arr, i) => (i >= 0 && Number.isFinite(arr[i]) ? arr[i] : 0)

  registerIndicator({
    id: 'oa-ht-sine',
    name: 'HT_SINE: Hilbert Transform - SineWave',
    category: 'Cycles',
    placement: 'pane',

    inputs: [{ key: 'source', type: 'source', label: 'Source', default: 'hlc3' }],

    plots: [
      { key: 'sine', type: 'line', title: 'Sine', style: { color: '#ffeb3b', lineWidth: 2 } },
      { key: 'leadsine', type: 'line', title: 'LeadSine', style: { color: '#2196f3', lineWidth: 2 } },
    ],

    calc(bars, settings) {
      const n = bars.length
      const src = sourceValues(bars, settings.source ?? 'hlc3')

      // Every one of these is a Pine `var` read back with a history offset, so
      // each needs its own per-bar column rather than a single carried scalar.
      const price = new Array(n).fill(0)
      const smoothPrice = new Array(n).fill(0)
      const detrender = new Array(n).fill(0)
      const q1 = new Array(n).fill(0)
      const i1 = new Array(n).fill(0)
      const i2 = new Array(n).fill(0)
      const q2 = new Array(n).fill(0)
      const re = new Array(n).fill(0)
      const im = new Array(n).fill(0)

      const sine = new Array(n).fill(NaN)
      const leadsine = new Array(n).fill(NaN)

      // Pine seeds these three and carries them forward, so they are scalars.
      let period = 15
      let smoothPeriod = 15
      let phase = 0

      for (let i = 0; i < n; i++) {
        price[i] = Number.isFinite(src[i]) ? src[i] : 0

        // Read before smoothPeriod is updated below, so this is the previous
        // bar's adaptive bandwidth, exactly as the Pine line order gives.
        const bandwidth = 0.075 * smoothPeriod + 0.54

        smoothPrice[i] =
          (4 * price[i] + 3 * back(price, i - 1) + 2 * back(price, i - 2) + back(price, i - 3)) / 10

        detrender[i] =
          (0.0962 * smoothPrice[i] +
            0.5769 * back(smoothPrice, i - 2) -
            0.5769 * back(smoothPrice, i - 4) -
            0.0962 * back(smoothPrice, i - 6)) *
          bandwidth

        q1[i] =
          (0.0962 * detrender[i] +
            0.5769 * back(detrender, i - 2) -
            0.5769 * back(detrender, i - 4) -
            0.0962 * back(detrender, i - 6)) *
          bandwidth

        i1[i] = back(detrender, i - 3)

        const ji =
          (0.0962 * i1[i] +
            0.5769 * back(i1, i - 2) -
            0.5769 * back(i1, i - 4) -
            0.0962 * back(i1, i - 6)) *
          bandwidth

        const jq =
          (0.0962 * q1[i] +
            0.5769 * back(q1, i - 2) -
            0.5769 * back(q1, i - 4) -
            0.0962 * back(q1, i - 6)) *
          bandwidth

        // Raw phasor, then the 0.2/0.8 one-pole smoothing Pine applies in place.
        i2[i] = 0.2 * (i1[i] - jq) + 0.8 * back(i2, i - 1)
        q2[i] = 0.2 * (q1[i] + ji) + 0.8 * back(q2, i - 1)

        const reRaw = i2[i] * back(i2, i - 1) + q2[i] * back(q2, i - 1)
        const imRaw = i2[i] * back(q2, i - 1) - q2[i] * back(i2, i - 1)
        re[i] = 0.2 * reRaw + 0.8 * back(re, i - 1)
        im[i] = 0.2 * imRaw + 0.8 * back(im, i - 1)

        if (im[i] !== 0 || re[i] !== 0) {
          const angle = atan2(im[i], re[i])
          if (angle !== 0) period = (2 * Math.PI) / angle
        }
        period = Math.max(6, Math.min(50, period))
        smoothPeriod = 0.33 * period + 0.67 * smoothPeriod

        if (i2[i] !== 0 || q2[i] !== 0) phase = atan2(q2[i], i2[i])

        sine[i] = Math.sin(phase)
        leadsine[i] = Math.sin(phase + Math.PI / 4)
      }

      return { sine: nulls(sine), leadsine: nulls(leadsine) }
    },

    // Pine: hline(0, "Zero", color=color.gray, linestyle=hline.style_solid)
    levels: () => [{ price: 0, title: 'Zero', color: '#787b86' }],
  })
}
