/**
 * Weibull Distribution CDF (WEIBULLDIST) - ported to openalgo-charts from
 * Pine Script v6.
 *
 * Source: https://github.com/mihakralj/pinescript/blob/c4e91b962be09733d8fc76caa5191e9e586c5cee/indicators/numerics/weibulldist.pine
 * Repo:   mihakralj/pinescript
 * License: MIT (c) mihakralj
 * SPDX-FileCopyrightText: (c) mihakralj
 * SPDX-FileCopyrightText: (c) 2026 marketcalls (port to openalgo-charts)
 * SPDX-License-Identifier: MIT
 *
 * The source is min-max normalised over the lookback window and fed to the
 * Weibull CDF F(x) = 1 - exp(-(x / lambda)^k), so a reading near 1 puts price
 * at the top of the recent range and one near 0 at the bottom. Shape k tunes
 * how sharply the curve reacts to the extremes.
 */

export default function ({ registerIndicator, sourceValues, nulls }) {
  registerIndicator({
    id: 'oa-weibulldist',
    name: 'Weibull Distribution CDF (WEIBULLDIST)',
    category: 'Numerics',
    placement: 'pane',

    inputs: [
      { key: 'source', type: 'source', label: 'Source', default: 'close' },
      { key: 'period', type: 'number', label: 'Period', default: 50, min: 1, max: 1000, step: 1 },
      {
        key: 'shape',
        type: 'number',
        label: 'Shape (k)',
        default: 2,
        min: 0.01,
        max: 100,
        step: 0.1,
        tooltip: 'Below 1 gives a concave curve, 1 is the exponential case, 2 the Rayleigh case, above 3 an S-curve.',
      },
      {
        key: 'scale',
        type: 'number',
        label: 'Scale (lambda)',
        default: 0.5,
        min: 0.01,
        max: 100,
        step: 0.1,
        tooltip: 'A larger scale makes the curve rise more slowly, a smaller one saturates it sooner.',
      },
    ],

    plots: [
      { key: 'weibull', type: 'line', title: 'WEIBULLDIST', style: { color: '#ffeb3b', lineWidth: 2 } },
    ],

    levels: () => [
      { price: 0.5, title: 'Midline', color: '#787b86', dashed: true },
      { price: 0.95, title: 'Upper', color: '#ef5350', dashed: true },
      { price: 0.05, title: 'Lower', color: '#26a69a', dashed: true },
    ],

    calc(bars, settings) {
      // A cleared number field arrives as '', and Number('') is 0.
      const period = Math.max(1, Math.floor(Number(settings.period) || 50))
      const shape = Math.max(0.01, Number(settings.shape) || 2)
      const scale = Math.max(0.01, Number(settings.scale) || 0.5)
      const src = sourceValues(bars, settings.source ?? 'close')

      const out = new Array(bars.length).fill(NaN)
      for (let i = 0; i < bars.length; i++) {
        // Pine reads every tap through nz(), so a bar that does not exist yet
        // enters the min-max scan as 0 rather than being skipped.
        const cur = Number.isFinite(src[i]) ? src[i] : 0
        let hi = cur
        let lo = cur

        // Pine counts a for-loop down when its end is below its start, so
        // period = 1 walks i = 1 then i = 0 and scans two bars, not one.
        const lastTap = period - 1
        const step = lastTap >= 1 ? 1 : -1
        for (let j = 1; step > 0 ? j <= lastTap : j >= lastTap; j += step) {
          const idx = i - j
          const v = idx >= 0 && Number.isFinite(src[idx]) ? src[idx] : 0
          if (v > hi) hi = v
          if (v < lo) lo = v
        }

        const range = hi - lo
        // A flat window carries no information, so Pine centres x at 0.5.
        const x = range === 0 ? 0.5 : (cur - lo) / range
        const safeX = Math.max(0, x)
        const raised = Math.pow(safeX / scale, shape)
        const value = 1 - Math.exp(-raised)
        if (Number.isFinite(value)) out[i] = value
      }

      return { weibull: nulls(out) }
    },
  })
}
