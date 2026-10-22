/**
 * Elder's Force Index (EFI) - ported to openalgo-charts from Pine Script v6.
 *
 * Source: https://github.com/mihakralj/pinescript/blob/c4e91b962be09733d8fc76caa5191e9e586c5cee/indicators/volume/efi.pine
 * Repo:   mihakralj/pinescript
 * License: MIT (c) mihakralj
 * SPDX-FileCopyrightText: (c) mihakralj
 * SPDX-FileCopyrightText: (c) 2026 marketcalls (port to openalgo-charts)
 * SPDX-License-Identifier: MIT
 *
 * Multiplies the bar-to-bar price change by the bar's volume to size the
 * pressure behind a move, then smooths it with a bias-corrected EMA so the
 * first bars are not dragged toward zero by the seed.
 */

export default function ({ registerIndicator, nulls }) {
  registerIndicator({
    id: 'oa-efi',
    name: 'Elder\'s Force Index (EFI)',
    category: 'Volume',
    placement: 'pane',

    inputs: [
      { key: 'length', type: 'number', label: 'Length', default: 13, min: 1, max: 5000, step: 1 },
    ],

    plots: [
      { key: 'efi', type: 'line', title: 'EFI', style: { color: '#ffeb3b', lineWidth: 2 } },
    ],

    calc(bars, settings) {
      // A cleared number field arrives as '', and Number('') is 0. The upper cap
      // keeps 1 - beta away from 0 in double precision.
      const len = Math.min(5000, Math.max(1, Math.floor(Number(settings.length) || 13)))
      const alpha = 2 / (len + 1)
      const beta = 1 - alpha

      const out = new Array(bars.length).fill(NaN)

      // Pine's `var float prev_src = src` seeds on the first bar with that bar's
      // own close, so the first raw force is exactly zero.
      let prevSrc
      // Smoothing state: `emaVal` starts na, `e` decays as beta^n and drives the
      // warmup compensation c = 1 / (1 - e).
      let emaVal = null
      let e = 1
      let warmup = true

      for (let i = 0; i < bars.length; i++) {
        const srcRaw = bars[i].close
        if (i === 0) prevSrc = srcRaw

        // nz() on each operand: a missing close, or a series carrying no volume
        // at all, reads as 0 exactly as the Pine source does.
        const s = Number.isFinite(srcRaw) ? srcRaw : 0
        const p = Number.isFinite(prevSrc) ? prevSrc : 0
        const vol = Number.isFinite(bars[i].volume) ? bars[i].volume : 0
        const rawForce = (s - p) * vol
        prevSrc = srcRaw

        let result
        if (emaVal === null) {
          emaVal = 0
          result = rawForce
        } else {
          emaVal = alpha * (rawForce - emaVal) + emaVal
          if (warmup) {
            e *= beta
            const denom = 1 - e
            result = denom !== 0 ? emaVal / denom : NaN
            if (e <= 1e-10) warmup = false
          } else {
            result = emaVal
          }
        }

        out[i] = Number.isFinite(result) ? result : NaN
      }

      return { efi: nulls(out) }
    },
  })
}
