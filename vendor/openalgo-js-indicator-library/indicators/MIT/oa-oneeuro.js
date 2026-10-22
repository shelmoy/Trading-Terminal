/**
 * One Euro Filter (ONEEURO) - ported to openalgo-charts from Pine Script v6.
 *
 * Source: https://github.com/mihakralj/pinescript/blob/c4e91b962be09733d8fc76caa5191e9e586c5cee/indicators/filters/oneeuro.pine
 * Repo:   mihakralj/pinescript
 * License: MIT (c) mihakralj
 * SPDX-FileCopyrightText: (c) mihakralj
 * SPDX-FileCopyrightText: (c) 2026 marketcalls (port to openalgo-charts)
 * SPDX-License-Identifier: MIT
 *
 * An adaptive low-pass filter that trades jitter suppression against lag: when
 * price barely moves it uses a low cutoff frequency and smooths heavily, and
 * when the smoothed speed rises it raises the cutoff so the line catches up.
 * Reference: Casiez, Roussel and Vogel (2012), CHI '12, pp. 2527-2530.
 */

export default function ({ registerIndicator, sourceValues, nulls }) {
  // A cleared number field arrives as '', and Number('') is 0, which would turn
  // a "minimum" of 0.001 into a division-shaped surprise. Fall back to the
  // Pine default instead, then clamp to the Pine minval.
  const readNumber = (raw, fallback) => {
    if (raw === '' || raw === null || raw === undefined) return fallback
    const n = Number(raw)
    return Number.isFinite(n) ? n : fallback
  }

  registerIndicator({
    id: 'oa-oneeuro',
    name: 'One Euro Filter (ONEEURO)',
    category: 'Filters',
    placement: 'onchart',

    inputs: [
      { key: 'source', type: 'source', label: 'Source', default: 'close' },
      {
        key: 'minCutoff',
        type: 'number',
        label: 'Min Cutoff Frequency',
        default: 1,
        min: 0.001,
        max: 1000,
        step: 0.1,
        tooltip: 'Controls jitter at low speed. Lower = smoother when price is stable.',
      },
      {
        key: 'beta',
        type: 'number',
        label: 'Speed Coefficient (beta)',
        default: 0.007,
        min: 0,
        max: 1000,
        step: 0.001,
        tooltip: 'Controls lag at high speed. Higher = faster response to rapid moves.',
      },
      {
        key: 'dCutoff',
        type: 'number',
        label: 'Derivative Cutoff',
        default: 1,
        min: 0.001,
        max: 1000,
        step: 0.1,
        tooltip: 'Cutoff frequency for the derivative (speed) estimator.',
      },
    ],

    plots: [{ key: 'oneeuro', type: 'line', title: 'OneEuro', style: { color: '#ffeb3b', lineWidth: 2 } }],

    calc(bars, settings) {
      // Pine raises a runtime error outside these ranges; clamping is the
      // equivalent that keeps a chart drawing.
      const minCutoff = Math.max(0.001, readNumber(settings.minCutoff, 1))
      const beta = Math.max(0, readNumber(settings.beta, 0.007))
      const dCutoff = Math.max(0.001, readNumber(settings.dCutoff, 1))
      const src = sourceValues(bars, settings.source ?? 'close')

      // Derivative smoothing factor is constant: it depends only on dCutoff.
      const rD = 2 * Math.PI * dCutoff
      const alphaD = rD / (rD + 1)

      const out = new Array(bars.length).fill(NaN)
      let xHat = NaN
      let dxHat = 0
      let xPrev = NaN

      for (let i = 0; i < bars.length; i++) {
        const x = src[i]
        if (!Number.isFinite(xHat)) {
          // Pine seeds with nz(src, 0.0) on bar 0. Seeding a price overlay with
          // a literal 0 would wreck the scale, so the seed waits for the first
          // finite sample instead; on real bars the two are the same thing.
          if (!Number.isFinite(x)) continue
          xHat = x
          xPrev = x
          dxHat = 0
          out[i] = xHat
          continue
        }
        if (!Number.isFinite(x)) {
          // Pine propagates na through the recursion and re-seeds next bar.
          xHat = NaN
          xPrev = NaN
          continue
        }

        // Raw derivative from consecutive RAW inputs, then smooth it.
        const dx = x - xPrev
        dxHat = alphaD * dx + (1 - alphaD) * dxHat

        // Adaptive cutoff driven by the smoothed speed, then the filter step.
        const fc = minCutoff + beta * Math.abs(dxHat)
        const rC = 2 * Math.PI * fc
        const alpha = rC / (rC + 1)
        xHat = alpha * x + (1 - alpha) * xHat
        xPrev = x

        out[i] = xHat
      }

      return { oneeuro: nulls(out) }
    },
  })
}
