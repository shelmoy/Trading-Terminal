/**
 * Moving Harmonic Mean (MHM) - ported to openalgo-charts from Pine Script v3.
 *
 * Source: https://github.com/everget/tradingview-pinescript-indicators/blob/60c93d3711d222b8f2db96160defe568429348e0/movings/moving_harmonic_mean.pine
 * Repo:   everget/tradingview-pinescript-indicators
 * License: GPL-3.0 (c) 2018-present, Alex Orekhov (everget)
 * SPDX-FileCopyrightText: (c) 2018-present Alex Orekhov (everget)
 * SPDX-FileCopyrightText: (c) 2026 marketcalls (port to openalgo-charts)
 * SPDX-License-Identifier: GPL-3.0-only
 *
 * The harmonic mean of the last N source values: N divided by the sum of the
 * reciprocals. It sits below the arithmetic mean and is pulled harder by low
 * values, so it tracks a falling series more closely than an SMA does.
 */

export default function ({ registerIndicator, sourceValues, nulls }) {
  registerIndicator({
    id: 'oa-moving-harmonic-mean',
    name: 'Moving Harmonic Mean (MHM)',
    category: 'Moving Averages',
    placement: 'onchart',

    inputs: [
      { key: 'length', type: 'number', label: 'Length', default: 14, min: 1, max: 5000, step: 1 },
      { key: 'source', type: 'source', label: 'Source', default: 'close' },
    ],

    plots: [{ key: 'mhm', type: 'line', title: 'MHM', style: { color: '#6d1e7f', lineWidth: 2 } }],

    calc(bars, settings) {
      // A cleared number field arrives as '', and Number('') is 0.
      const length = Math.max(1, Math.floor(Number(settings.length) || 14))
      const src = sourceValues(bars, settings.source ?? 'close')
      const out = new Array(bars.length).fill(NaN)

      for (let i = 0; i < bars.length; i++) {
        // Pine substitutes 1 for a bar that does not exist yet, which produces a
        // meaningless spike over the first length-1 bars. Held back as warmup.
        if (i < length - 1) continue
        let sum = 0
        let ok = true
        for (let k = 0; k < length; k++) {
          const v = src[i - k]
          // Pine: na(src[i]) ? 1 : src[i], so a missing value contributes 1 / 1.
          if (!Number.isFinite(v)) {
            sum += 1
            continue
          }
          if (v === 0) {
            ok = false
            break
          }
          sum += 1 / v
        }
        if (!ok || !Number.isFinite(sum) || sum === 0) continue
        out[i] = length / sum
      }

      return { mhm: nulls(out) }
    },
  })
}
