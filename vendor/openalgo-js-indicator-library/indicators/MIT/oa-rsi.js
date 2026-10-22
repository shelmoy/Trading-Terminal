/**
 * Relative Strength Index (RSI) - ported to openalgo-charts from Pine Script v6.
 *
 * Source: https://github.com/mihakralj/pinescript/blob/c4e91b962be09733d8fc76caa5191e9e586c5cee/indicators/momentum/rsi.pine
 * Repo:   mihakralj/pinescript
 * License: MIT (c) mihakralj
 * SPDX-FileCopyrightText: (c) mihakralj
 * SPDX-FileCopyrightText: (c) 2026 marketcalls (port to openalgo-charts)
 * SPDX-License-Identifier: MIT
 *
 * Wilder's momentum oscillator: average up move against average down move over
 * the lookback, mapped onto 0 to 100.
 */

export default function ({ registerIndicator, sourceValues, nulls }) {
  registerIndicator({
    id: 'oa-rsi',
    name: 'Relative Strength Index (RSI)',
    category: 'Momentum',
    placement: 'pane',

    inputs: [
      { key: 'length', type: 'number', label: 'Length', default: 14, min: 1, max: 5000, step: 1 },
      { key: 'source', type: 'source', label: 'Source', default: 'close' },
    ],

    plots: [{ key: 'rsi', type: 'line', title: 'RSI', style: { color: '#ffeb3b', lineWidth: 2 } }],

    calc(bars, settings) {
      // A cleared number field arrives as '', and Number('') is 0.
      const len = Math.max(1, Math.floor(Number(settings.length) || 14))
      const src = sourceValues(bars, settings.source ?? 'close')
      const n = bars.length
      const out = new Array(n).fill(NaN)
      const alpha = 1 / len

      // The source seeds the two averages with the bar's own raw move for every
      // bar before index len, and only then starts Wilder smoothing. That is a
      // different warmup from the usual seeded-average RSI, so it is kept.
      let smoothUp = NaN
      let smoothDown = NaN

      for (let i = 0; i < n; i++) {
        const cur = src[i]
        const prev = i > 0 ? src[i - 1] : NaN

        // Pine's math.max propagates na, so the first bar has no move at all.
        let up = NaN
        let down = NaN
        if (Number.isFinite(cur) && Number.isFinite(prev)) {
          up = Math.max(cur - prev, 0)
          down = Math.max(prev - cur, 0)
        }

        if (i < len) {
          smoothUp = up
          smoothDown = down
        } else {
          // nz() on the carried value, matching the Pine source.
          const prevUp = Number.isFinite(smoothUp) ? smoothUp : 0
          const prevDown = Number.isFinite(smoothDown) ? smoothDown : 0
          smoothUp = Number.isFinite(up) ? prevUp * (1 - alpha) + up * alpha : NaN
          smoothDown = Number.isFinite(down) ? prevDown * (1 - alpha) + down * alpha : NaN
        }

        if (!Number.isFinite(smoothUp) || !Number.isFinite(smoothDown)) continue
        if (smoothDown === 0) {
          // No down move in the window: the source reports a full 100.
          out[i] = 100
        } else {
          const rs = smoothUp / smoothDown
          const value = 100 - 100 / (1 + rs)
          if (Number.isFinite(value)) out[i] = value
        }
      }

      return { rsi: nulls(out) }
    },
  })
}
