/**
 * McGinley Dynamic Indicator (MGDI) - ported to openalgo-charts from Pine Script v6.
 *
 * Source: https://github.com/mihakralj/pinescript/blob/c4e91b962be09733d8fc76caa5191e9e586c5cee/indicators/trends_IIR/mgdi.pine
 * Repo:   mihakralj/pinescript
 * License: MIT
 * SPDX-FileCopyrightText: (c) mihakralj
 * SPDX-FileCopyrightText: (c) 2026 marketcalls (port to openalgo-charts)
 * SPDX-License-Identifier: MIT
 *
 * An adaptive average whose smoothing constant reacts to how far price has run
 * from the line: the fourth power of the price-to-line ratio speeds it up in a
 * fast market and slows it down in a quiet one, so it hugs price far more
 * closely than an exponential average of the same period.
 */

export default function ({ registerIndicator, sourceValues, nulls }) {
  registerIndicator({
    id: 'oa-mgdi',
    name: 'McGinley Dynamic Indicator (MGDI)',
    category: 'Trends IIR',
    placement: 'onchart',

    inputs: [
      { key: 'period', type: 'number', label: 'Period', default: 10, min: 1, max: 5000, step: 1 },
      { key: 'factor', type: 'number', label: 'Factor', default: 0.6, min: 0.01, max: 5, step: 0.01 },
      { key: 'source', type: 'source', label: 'Source', default: 'close' },
    ],

    plots: [{ key: 'mgdi', type: 'line', title: 'MGDI', style: { color: '#ffeb3b', lineWidth: 2 } }],

    calc(bars, settings) {
      // A cleared number field arrives as '', and Number('') is 0.
      const period = Math.max(1, Math.floor(Number(settings.period) || 10))
      const factor = Math.min(5, Math.max(0.01, Number(settings.factor) || 0.6))
      const src = sourceValues(bars, settings.source ?? 'close')

      const out = new Array(bars.length).fill(NaN)
      let mgdi = NaN

      for (let i = 0; i < bars.length; i++) {
        const s = src[i]
        if (Number.isFinite(s)) {
          if (!Number.isFinite(mgdi)) {
            // Seed from the average of the bars available in the lookback. On the
            // very first bar only source[0] exists, so the line starts at price.
            let sum = 0
            let count = 0
            for (let k = 0; k < period; k++) {
              const j = i - k
              if (j < 0) continue
              if (!Number.isFinite(src[j])) continue
              sum += src[j]
              count += 1
            }
            mgdi = count > 0 ? sum / count : s
          } else if (Math.abs(mgdi) < 1e-10) {
            mgdi = s
          } else {
            const ratio = s / mgdi
            let denom = factor * period * Math.pow(ratio, 4)
            denom = Math.sign(denom) * Math.max(0.001, Math.abs(denom))
            // A zero source makes the ratio zero and math.sign(0) is 0, so the
            // denominator collapses; hold the line rather than divide by zero.
            if (Number.isFinite(denom) && denom !== 0) {
              const next = mgdi + (s - mgdi) / denom
              if (Number.isFinite(next)) mgdi = next
            }
          }
        }
        // Pine returns the carried value, so a non-finite source repeats the line.
        out[i] = Number.isFinite(mgdi) ? mgdi : NaN
      }

      return { mgdi: nulls(out) }
    },
  })
}
