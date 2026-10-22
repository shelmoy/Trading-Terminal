/**
 * Ehlers Laguerre Filter (LAGUERRE) - ported to openalgo-charts from Pine Script v6.
 *
 * Source: https://github.com/mihakralj/pinescript/blob/c4e91b962be09733d8fc76caa5191e9e586c5cee/indicators/filters/laguerre.pine
 * Repo:   mihakralj/pinescript
 * License: MIT (c) mihakralj
 * SPDX-FileCopyrightText: (c) mihakralj
 * SPDX-FileCopyrightText: (c) 2026 marketcalls (port to openalgo-charts)
 * SPDX-License-Identifier: MIT
 *
 * Four cascaded all-pass sections give a short filter a long effective memory:
 * gamma sets the damping, so the line tracks price closely at 0 and turns into
 * a heavily smoothed, lagging average as gamma approaches 1.
 */

export default function ({ registerIndicator, sourceValues, nulls }) {
  registerIndicator({
    id: 'oa-laguerre',
    name: 'Ehlers Laguerre Filter (LAGUERRE)',
    category: 'Filters',
    placement: 'onchart',

    inputs: [
      {
        key: 'gamma',
        type: 'number',
        label: 'Gamma',
        default: 0.8,
        min: 0,
        max: 0.99,
        step: 0.01,
        tooltip: 'Damping factor. 0 behaves as an FIR filter, higher values smooth more and lag more.',
      },
      { key: 'source', type: 'source', label: 'Source', default: 'close' },
    ],

    plots: [{ key: 'laguerre', type: 'line', title: 'Laguerre', style: { color: '#ffeb3b', lineWidth: 2 } }],

    calc(bars, settings) {
      // Gamma may legitimately be 0, so `|| 0.8` would swallow a real setting.
      // A cleared field arrives as '' and falls back to the default instead.
      const rawGamma = settings.gamma === '' || settings.gamma == null ? 0.8 : Number(settings.gamma)
      const gamma = Number.isFinite(rawGamma) ? Math.min(0.99, Math.max(0, rawGamma)) : 0.8
      const src = sourceValues(bars, settings.source || 'close')
      const n = bars.length

      const out = new Array(n).fill(NaN)
      const omg = 1 - gamma
      let l0 = 0
      let l1 = 0
      let l2 = 0
      let l3 = 0
      let initialized = false

      for (let i = 0; i < n; i++) {
        // nz(src, src[1]): a missing price falls back to the previous bar's.
        let s = src[i]
        if (!Number.isFinite(s)) s = i > 0 ? src[i - 1] : NaN
        // Neither available: hold the filter state rather than poisoning it.
        if (!Number.isFinite(s)) continue

        if (!initialized) {
          l0 = s
          l1 = s
          l2 = s
          l3 = s
          initialized = true
        } else {
          const pL0 = l0
          const pL1 = l1
          const pL2 = l2
          l0 = omg * s + gamma * pL0
          l1 = -gamma * l0 + pL0 + gamma * pL1
          l2 = -gamma * l1 + pL1 + gamma * pL2
          // The source reuses L3 itself on the right, so this is the previous
          // bar's L3, not a stored pL3.
          l3 = -gamma * l2 + pL2 + gamma * l3
        }

        out[i] = (l0 + 2 * l1 + 2 * l2 + l3) / 6
      }

      return { laguerre: nulls(out) }
    },
  })
}
