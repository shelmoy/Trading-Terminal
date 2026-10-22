/**
 * HOMOD: Homodyne Discriminator Dominant Cycle - ported to openalgo-charts from Pine Script v6.
 *
 * Source: https://github.com/mihakralj/pinescript/blob/c4e91b962be09733d8fc76caa5191e9e586c5cee/indicators/cycles/homod.pine
 * Repo:   mihakralj/pinescript
 * License: MIT (c) mihakralj
 * SPDX-FileCopyrightText: (c) mihakralj
 * SPDX-FileCopyrightText: (c) 2026 marketcalls (port to openalgo-charts)
 * SPDX-License-Identifier: MIT
 *
 * Ehlers' homodyne discriminator estimates the dominant cycle length of price by
 * building a Hilbert-transform quadrature pair and reading how far the complex
 * phasor rotates from one bar to the next.
 */

export default function ({ registerIndicator, sourceValues, nulls }) {
  // Quadrant-aware angle, written out the way the source does rather than via
  // Math.atan2, so the arithmetic path matches bar for bar. The caller only
  // reaches it when |y| + |x| is above 1e-10, so both cannot be zero.
  const atan2 = (y, x) => {
    const ay = Math.abs(y)
    const ax = Math.abs(x)
    let angle = ax > ay ? Math.atan(ay / ax) : Math.PI / 2 - Math.atan(ax / ay)
    if (x < 0) angle = Math.PI - angle
    if (y < 0) angle = -angle
    return angle
  }

  registerIndicator({
    id: 'oa-homod',
    name: 'HOMOD: Homodyne Discriminator Dominant Cycle',
    category: 'Cycles',
    placement: 'pane',

    inputs: [
      { key: 'source', type: 'source', label: 'Source', default: 'hlc3' },
      {
        key: 'minPeriod',
        type: 'number',
        label: 'Min Period',
        default: 6,
        min: 1,
        max: 5000,
        step: 0.5,
        tooltip: 'Shortest dominant cycle the discriminator is allowed to report.',
      },
      {
        key: 'maxPeriod',
        type: 'number',
        label: 'Max Period',
        default: 50,
        min: 2,
        max: 5000,
        step: 0.5,
        tooltip: 'Longest dominant cycle the discriminator is allowed to report.',
      },
    ],

    plots: [
      { key: 'period', type: 'line', title: 'Dominant Cycle Period', style: { color: '#ffeb3b', lineWidth: 2 } },
    ],

    calc(bars, settings) {
      const n = bars.length
      // A cleared number field arrives as '', and Number('') is 0.
      const minPeriod = Math.max(1, Number(settings.minPeriod) || 6)
      // Pine aborts when maxPeriod <= minPeriod; keep the ordering instead.
      const maxPeriod = Math.max(minPeriod + 0.5, Number(settings.maxPeriod) || 50)
      const src = sourceValues(bars, settings.source ?? 'hlc3')

      // Every historical read in the source is wrapped in nz(), so a bar before
      // the first one contributes 0 rather than a gap.
      const back = (arr, i) => (i >= 0 && Number.isFinite(arr[i]) ? arr[i] : 0)

      const price = new Array(n).fill(0)
      const smoothPrice = new Array(n).fill(0)
      const detrender = new Array(n).fill(0)
      const q1s = new Array(n).fill(0)
      const i1s = new Array(n).fill(0)
      const i2s = new Array(n).fill(0)
      const q2s = new Array(n).fill(0)
      const res = new Array(n).fill(0)
      const ims = new Array(n).fill(0)
      const out = new Array(n).fill(NaN)

      // var state carried across bars, seeded exactly as the source seeds it.
      let period = 15
      let smoothPeriod = 15
      let warmDecay = 1
      let warmup = true
      const alpha = 0.33

      for (let i = 0; i < n; i++) {
        price[i] = Number.isFinite(src[i]) ? src[i] : 0

        // bandwidth reads the smoothed period left over from the previous bar.
        const bandwidth = 0.075 * smoothPeriod + 0.54

        smoothPrice[i] =
          (4 * price[i] + 3 * back(price, i - 1) + 2 * back(price, i - 2) + back(price, i - 3)) / 10

        detrender[i] =
          (0.0962 * smoothPrice[i] +
            0.5769 * back(smoothPrice, i - 2) -
            0.5769 * back(smoothPrice, i - 4) -
            0.0962 * back(smoothPrice, i - 6)) *
          bandwidth

        q1s[i] =
          (0.0962 * detrender[i] +
            0.5769 * back(detrender, i - 2) -
            0.5769 * back(detrender, i - 4) -
            0.0962 * back(detrender, i - 6)) *
          bandwidth

        i1s[i] = back(detrender, i - 3)

        const ji =
          (0.0962 * i1s[i] +
            0.5769 * back(i1s, i - 2) -
            0.5769 * back(i1s, i - 4) -
            0.0962 * back(i1s, i - 6)) *
          bandwidth

        const jq =
          (0.0962 * q1s[i] +
            0.5769 * back(q1s, i - 2) -
            0.5769 * back(q1s, i - 4) -
            0.0962 * back(q1s, i - 6)) *
          bandwidth

        i2s[i] = 0.2 * (i1s[i] - jq) + 0.8 * back(i2s, i - 1)
        q2s[i] = 0.2 * (q1s[i] + ji) + 0.8 * back(q2s, i - 1)

        const reRaw = i2s[i] * back(i2s, i - 1) + q2s[i] * back(q2s, i - 1)
        const imRaw = i2s[i] * back(q2s, i - 1) - q2s[i] * back(i2s, i - 1)
        res[i] = 0.2 * reRaw + 0.8 * back(res, i - 1)
        ims[i] = 0.2 * imRaw + 0.8 * back(ims, i - 1)

        const magnitude = Math.abs(res[i]) + Math.abs(ims[i])
        if (magnitude > 1e-10) {
          const angle = atan2(ims[i], res[i])
          if (Math.abs(angle) > 1e-10) {
            const candidate = (2 * Math.PI) / angle
            const clamped = Math.max(minPeriod, Math.min(maxPeriod, Math.abs(candidate)))
            period = 0.2 * clamped + 0.8 * period
          }
        }

        smoothPeriod = smoothPeriod + alpha * (period - smoothPeriod)

        let result = smoothPeriod
        if (warmup) {
          warmDecay *= 1 - alpha
          const denom = 1 - warmDecay
          result = denom > 1e-10 ? result / denom : result
          warmup = warmDecay > 1e-10
        }
        out[i] = Number.isFinite(result) ? result : NaN
      }

      return { period: nulls(out) }
    },
  })
}
