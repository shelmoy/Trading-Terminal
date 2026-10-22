/**
 * Ehlers Adaptive Laguerre Filter (ALAGUERRE) - ported to openalgo-charts from Pine Script v6.
 *
 * Source: https://github.com/mihakralj/pinescript/blob/c4e91b962be09733d8fc76caa5191e9e586c5cee/indicators/filters/alaguerre.pine
 * Repo:   mihakralj/pinescript
 * License: MIT (c) mihakralj
 * SPDX-FileCopyrightText: (c) mihakralj
 * SPDX-FileCopyrightText: (c) 2026 marketcalls (port to openalgo-charts)
 * SPDX-License-Identifier: MIT
 *
 * A four stage Laguerre all-pass cascade whose alpha is not fixed: the filter's
 * own tracking error is normalised against its recent range and median smoothed,
 * so the filter speeds up when it is falling behind and slows down when it is not.
 */

export default function ({ registerIndicator, sourceValues, nulls }) {
  registerIndicator({
    id: 'oa-alaguerre',
    name: 'Ehlers Adaptive Laguerre Filter (ALAGUERRE)',
    category: 'Filters',
    placement: 'onchart',

    inputs: [
      { key: 'source', type: 'source', label: 'Source', default: 'close' },
      { key: 'length', type: 'number', label: 'Length', default: 20, min: 1, max: 200, step: 1,
        tooltip: 'Lookback for the highest/lowest normalisation of the tracking error.' },
      { key: 'medianLength', type: 'number', label: 'Median Length', default: 5, min: 1, max: 50, step: 1,
        tooltip: 'Lookback for the median smoothing of the adaptive alpha.' },
    ],

    plots: [{ key: 'alaguerre', type: 'line', title: 'ALaguerre', style: { color: '#ff9800', lineWidth: 2 } }],

    calc(bars, settings) {
      // A cleared number field arrives as '', and Number('') is 0.
      const length = Math.min(200, Math.max(1, Math.floor(Number(settings.length) || 20)))
      const medianLength = Math.min(50, Math.max(1, Math.floor(Number(settings.medianLength) || 5)))
      const src = sourceValues(bars, settings.source ?? 'close')

      const out = new Array(bars.length).fill(NaN)

      // Pine holds every one of these in a var, so they are loop state here.
      let l0 = 0
      let l1 = 0
      let l2 = 0
      let l3 = 0
      let lastResult = 0
      let initialized = false
      const diffBuf = []
      const coeffBuf = []

      for (let i = 0; i < bars.length; i++) {
        // Pine's nz(src, src[1]): fall back to the previous bar's source.
        let ssrc = src[i]
        if (!Number.isFinite(ssrc)) ssrc = i > 0 ? src[i - 1] : NaN
        if (!Number.isFinite(ssrc)) continue

        if (!initialized) {
          l0 = ssrc
          l1 = ssrc
          l2 = ssrc
          l3 = ssrc
          lastResult = ssrc
          initialized = true
          // The seed entries stay in both buffers and take part in later windows.
          diffBuf.push(0)
          coeffBuf.push(0.5)
        } else {
          // Tracking error of the filter against the source.
          const diff = Math.abs(ssrc - lastResult)
          diffBuf.push(diff)
          if (diffBuf.length > length) diffBuf.shift()

          let hh = -Infinity
          let ll = Infinity
          for (let k = 0; k < diffBuf.length; k++) {
            if (diffBuf[k] > hh) hh = diffBuf[k]
            if (diffBuf[k] < ll) ll = diffBuf[k]
          }

          // A flat error range carries no information, so alpha holds at 0.5.
          const coeff = hh - ll > 1e-15 ? (diff - ll) / (hh - ll) : 0.5
          coeffBuf.push(coeff)
          if (coeffBuf.length > medianLength) coeffBuf.shift()

          const sorted = coeffBuf.slice().sort((a, b) => a - b)
          const sz = sorted.length
          const alpha =
            sz % 2 === 1
              ? sorted[Math.floor(sz / 2)]
              : (sorted[sz / 2 - 1] + sorted[sz / 2]) / 2

          const pL0 = l0
          const pL1 = l1
          const pL2 = l2
          const gamma = 1 - alpha
          l0 = alpha * ssrc + gamma * pL0
          l1 = -gamma * l0 + pL0 + gamma * pL1
          l2 = -gamma * l1 + pL1 + gamma * pL2
          // l3 on the right is still the previous bar's value, as in Pine.
          l3 = -gamma * l2 + pL2 + gamma * l3
        }

        const filt = (l0 + 2 * l1 + 2 * l2 + l3) / 6
        lastResult = filt
        out[i] = filt
      }

      return { alaguerre: nulls(out) }
    },
  })
}
