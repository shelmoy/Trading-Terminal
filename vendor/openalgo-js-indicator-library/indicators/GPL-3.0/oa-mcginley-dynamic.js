/**
 * McGinley Dynamic (MD) - ported to openalgo-charts from Pine Script v3.
 *
 * Source: https://github.com/everget/tradingview-pinescript-indicators/blob/60c93d3711d222b8f2db96160defe568429348e0/movings/mcginley_dynamic.pine
 * Repo:   everget/tradingview-pinescript-indicators
 * License: GPL-3.0 (c) 2018-present, Alex Orekhov (everget)
 * SPDX-FileCopyrightText: (c) 2018-present Alex Orekhov (everget)
 * SPDX-FileCopyrightText: (c) 2026 marketcalls (port to openalgo-charts)
 * SPDX-License-Identifier: GPL-3.0-only
 *
 * A moving average whose smoothing constant adapts to how far price has run
 * from the line: the step is divided by (price / line) raised to the fourth,
 * so the average speeds up in a fast move and slows down in a quiet one, which
 * keeps it from being whipsawed the way a fixed-length average is.
 */

export default function ({ registerIndicator, sourceValues, nulls }) {
  registerIndicator({
    id: 'oa-mcginley-dynamic',
    name: 'McGinley Dynamic (MD)',
    category: 'Moving Averages',
    placement: 'onchart',

    inputs: [
      { key: 'length', type: 'number', label: 'Length', default: 14, min: 1, max: 5000, step: 1 },
      {
        key: 'k',
        type: 'number',
        label: 'K',
        default: 0.6,
        min: 0.1,
        max: 10,
        step: 0.1,
        tooltip: 'Scales the adaptive damping. Smaller values let the line track price more closely.',
      },
      { key: 'source', type: 'source', label: 'Source', default: 'close' },
    ],

    plots: [
      { key: 'md', type: 'line', title: 'MD', style: { color: '#6d1e7f', lineWidth: 2 } },
    ],

    calc(bars, settings) {
      // A cleared number field arrives as '', and Number('') is 0.
      const length = Math.max(1, Math.floor(Number(settings.length) || 14))
      const k = Math.max(0.1, Number(settings.k) || 0.6)
      const src = sourceValues(bars, settings.source ?? 'close')
      const n = bars.length
      const out = new Array(n).fill(NaN)

      // Pine: md := na(md[1]) ? src : md[1] + (src - md[1]) / (k * length * pow(src / md[1], 4))
      let prev = NaN
      for (let i = 0; i < n; i++) {
        const value = src[i]
        if (!Number.isFinite(value)) {
          // Nothing to seed or step with: carry the state and leave a gap.
          out[i] = Number.isFinite(prev) ? prev : NaN
          continue
        }
        if (!Number.isFinite(prev)) {
          prev = value
        } else if (prev !== 0) {
          // prev === 0 leaves price / line undefined, so that case holds the line
          // where it is instead of emitting Infinity.
          const ratio = value / prev
          const denom = k * length * Math.pow(ratio, 4)
          // A denominator that is zero or non-finite also leaves the line where
          // it is, which is where the ratio term drives it in the limit anyway.
          if (Number.isFinite(denom) && denom !== 0) {
            const next = prev + (value - prev) / denom
            if (Number.isFinite(next)) prev = next
          }
        }
        out[i] = prev
      }

      return { md: nulls(out) }
    },
  })
}
