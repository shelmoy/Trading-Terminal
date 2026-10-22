/**
 * Discrete Wavelet Transform (DWT) - ported to openalgo-charts from Pine Script v6.
 *
 * Source: https://github.com/mihakralj/pinescript/blob/c4e91b962be09733d8fc76caa5191e9e586c5cee/indicators/numerics/dwt.pine
 * Repo:   mihakralj/pinescript
 * License: MIT
 * SPDX-FileCopyrightText: (c) mihakralj
 * SPDX-FileCopyrightText: (c) 2026 marketcalls (port to openalgo-charts)
 * SPDX-License-Identifier: MIT
 *
 * A trous (stationary) Haar decomposition. Each level halves the frequency band
 * by averaging the previous approximation with itself lagged by 2^(level-1)
 * bars, so the output is either the smooth trend at the deepest level or the
 * detail (noise or cycle) removed at one chosen level.
 */

export default function ({ registerIndicator, sourceValues, nulls }) {
  // A cleared field arrives as '', and Number('') is 0. The output component is
  // legitimately 0, so it falls back to its default only when unparsable.
  const intInput = (raw, fallback, min, max) => {
    if (raw === '' || raw === null || raw === undefined) return fallback
    const n = Number(raw)
    if (!Number.isFinite(n)) return fallback
    return Math.min(max, Math.max(min, Math.floor(n)))
  }

  registerIndicator({
    id: 'oa-dwt',
    name: 'Discrete Wavelet Transform (DWT)',
    category: 'Numerics',
    placement: 'pane',

    inputs: [
      { key: 'source', type: 'source', label: 'Source', default: 'close' },
      {
        key: 'levels',
        type: 'number',
        label: 'Decomposition Levels',
        default: 4,
        min: 1,
        max: 8,
        step: 1,
        tooltip: 'Number of levels; lookback = 2^levels bars.',
      },
      {
        key: 'output',
        type: 'number',
        label: 'Output Component',
        default: 0,
        min: 0,
        max: 8,
        step: 1,
        tooltip: '0 = approximation (trend), 1-8 = detail at that level (noise/cycles). Values above the level count are clamped to the deepest level.',
      },
    ],

    plots: [{ key: 'dwt', type: 'line', title: 'DWT', style: { color: '#ffeb3b', lineWidth: 2 } }],

    levels: () => [{ price: 0, title: 'Zero', color: '#787b86', lineStyle: 'dotted' }],

    calc(bars, settings) {
      const levelCount = intInput(settings.levels, 4, 1, 8)
      // Pine raises a runtime error when output exceeds the level count, which
      // leaves the pane blank with no explanation. Clamping to the deepest
      // available detail keeps the study drawing instead.
      const output = Math.min(intInput(settings.output, 0, 0, 8), levelCount)

      const src = sourceValues(bars, settings.source ?? 'close')
      const n = bars.length

      // c0 = nz(src, 0.0)
      const c0 = new Array(n)
      for (let i = 0; i < n; i++) c0[i] = Number.isFinite(src[i]) ? src[i] : 0

      // c1 = (c0 + nz(src[1], c0)) * 0.5, d1 = c0 - c1
      const c1 = new Array(n)
      const d1 = new Array(n)
      for (let i = 0; i < n; i++) {
        const back = i >= 1 && Number.isFinite(src[i - 1]) ? src[i - 1] : c0[i]
        c1[i] = (c0[i] + back) * 0.5
        d1[i] = c0[i] - c1[i]
      }

      // Levels 2..8: c[k] = (c[k-1] + nz(c[k-1][2^(k-1)], c[k-1])) * 0.5.
      // When the level is not requested Pine passes the approximation through
      // unchanged and zeroes the detail, so the history it indexes matches.
      const approxes = [c0, c1]
      const details = [null, d1]
      for (let k = 2; k <= 8; k++) {
        const lag = 1 << (k - 1)
        const prev = approxes[k - 1]
        const cur = new Array(n)
        const det = new Array(n)
        for (let i = 0; i < n; i++) {
          if (levelCount >= k) {
            const back = i >= lag ? prev[i - lag] : prev[i]
            cur[i] = (prev[i] + back) * 0.5
            det[i] = prev[i] - cur[i]
          } else {
            cur[i] = prev[i]
            det[i] = 0
          }
        }
        approxes.push(cur)
        details.push(det)
      }

      const picked = output === 0 ? approxes[levelCount] : details[output]
      const out = new Array(n).fill(NaN)
      for (let i = 0; i < n; i++) {
        const v = picked[i]
        out[i] = Number.isFinite(v) ? v : NaN
      }

      return { dwt: nulls(out) }
    },
  })
}
