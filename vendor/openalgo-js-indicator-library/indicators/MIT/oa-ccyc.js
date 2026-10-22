/**
 * Ehlers Cyber Cycle (CCYC) - ported to openalgo-charts from Pine Script v6.
 *
 * Source: https://github.com/mihakralj/pinescript/blob/c4e91b962be09733d8fc76caa5191e9e586c5cee/indicators/cycles/ccyc.pine
 * Repo:   mihakralj/pinescript
 * License: MIT (c) mihakralj
 * SPDX-FileCopyrightText: (c) mihakralj
 * SPDX-FileCopyrightText: (c) 2026 marketcalls (port to openalgo-charts)
 * SPDX-License-Identifier: MIT
 *
 * A two-pole high-pass filter over a four-tap smoothed price, which strips the
 * trend and leaves the dominant cycle with very little lag. The trigger line is
 * the same series delayed one bar, so their crossings date the cycle turns.
 *
 * Reference: John F. Ehlers, "Cybernetic Analysis for Stocks and Futures"
 * (Wiley, 2004), Chapter 4.
 */

export default function ({ registerIndicator, sourceValues, nulls }) {
  registerIndicator({
    id: 'oa-ccyc',
    name: 'Ehlers Cyber Cycle (CCYC)',
    category: 'Cycles',
    placement: 'pane',

    inputs: [
      {
        key: 'alpha',
        type: 'number',
        label: 'Alpha (damping)',
        default: 0.07,
        min: 0.01,
        max: 0.99,
        step: 0.01,
        tooltip: 'High-pass cutoff. Lower damping gives a smoother, slower cycle; Ehlers uses 0.07.',
      },
      { key: 'source', type: 'source', label: 'Source', default: 'hl2' },
    ],

    plots: [
      { key: 'cycle', type: 'line', title: 'Cycle', style: { color: '#ffeb3b', lineWidth: 2 } },
      { key: 'trigger', type: 'line', title: 'Trigger', style: { color: '#ef5350', lineWidth: 1 } },
    ],

    levels: () => [{ price: 0, title: 'Zero', color: '#8892a6', dashed: true }],

    calc(bars, settings) {
      // A cleared number field arrives as '', and Number('') is 0. The source
      // raises a runtime error outside (0, 1); the input bounds are its minval
      // and maxval, so clamp to them instead.
      const alpha = Math.min(0.99, Math.max(0.01, Number(settings.alpha) || 0.07))
      const src = sourceValues(bars, settings.source ?? 'hl2')

      const cHp = Math.pow(1 - 0.5 * alpha, 2)
      const cFb1 = 2 * (1 - alpha)
      const cFb2 = -Math.pow(1 - alpha, 2)

      const n = bars.length
      const smooth = new Array(n).fill(NaN)
      const cycle = new Array(n).fill(NaN)
      const trigger = new Array(n).fill(NaN)

      for (let i = 0; i < n; i++) {
        // nz(source) and nz(source[k], price): a missing history reference falls
        // back to the current price, a missing current price to zero.
        const price = Number.isFinite(src[i]) ? src[i] : 0
        const p1 = i >= 1 && Number.isFinite(src[i - 1]) ? src[i - 1] : price
        const p2 = i >= 2 && Number.isFinite(src[i - 2]) ? src[i - 2] : price
        const p3 = i >= 3 && Number.isFinite(src[i - 3]) ? src[i - 3] : price

        // Four-element FIR smoother: kills two-bar and three-bar noise.
        smooth[i] = (price + 2 * p1 + 2 * p2 + p3) / 6

        if (i < 6) {
          // bar_count < 7 in the source, counting from one. Bootstrap with the
          // second difference of raw price so the IIR has something to converge
          // from rather than starting flat.
          cycle[i] = (price - 2 * p1 + p2) / 4
        } else {
          const s1 = Number.isFinite(smooth[i - 1]) ? smooth[i - 1] : smooth[i]
          const s2 = Number.isFinite(smooth[i - 2]) ? smooth[i - 2] : smooth[i]
          const c1 = Number.isFinite(cycle[i - 1]) ? cycle[i - 1] : 0
          const c2 = Number.isFinite(cycle[i - 2]) ? cycle[i - 2] : 0
          cycle[i] = cHp * (smooth[i] - 2 * s1 + s2) + cFb1 * c1 + cFb2 * c2
        }

        // trigger = nz(cycle[1]): zero on the first bar, as the var starts at 0.
        trigger[i] = i >= 1 && Number.isFinite(cycle[i - 1]) ? cycle[i - 1] : 0
      }

      return { cycle: nulls(cycle), trigger: nulls(trigger) }
    },
  })
}
