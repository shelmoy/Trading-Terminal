/**
 * Arnaud Legoux Moving Average (ALMA) - ported to openalgo-charts from Pine Script v6.
 *
 * Source: https://github.com/mihakralj/pinescript/blob/c4e91b962be09733d8fc76caa5191e9e586c5cee/indicators/trends_FIR/alma.pine
 * Repo:   mihakralj/pinescript
 * License: MIT (c) mihakralj
 * SPDX-FileCopyrightText: (c) mihakralj
 * SPDX-FileCopyrightText: (c) 2026 marketcalls (port to openalgo-charts)
 * SPDX-License-Identifier: MIT
 *
 * A Gaussian-weighted average whose peak can be slid from the middle of the
 * window towards the newest bar, trading smoothness against lag.
 */

export default function ({ registerIndicator, sourceValues, nulls }) {
  // A cleared number field arrives as '', and Number('') is 0: that would make
  // sigma zero (the source raises on it) and silently move the Gaussian peak.
  const numberInput = (raw, fallback, min, max) => {
    if (raw === '' || raw === null || raw === undefined) return fallback
    const value = Number(raw)
    if (!Number.isFinite(value)) return fallback
    return Math.min(max, Math.max(min, value))
  }

  // Weight k counts bars back from the current one, so offset 1 puts the peak on
  // the newest bar, exactly as the source indexes source[i].
  const gaussianWeights = (p, offset, sigma) => {
    const m = (1 - offset) * (p - 1)
    const s = p / sigma
    const s2 = 2 * (s * s)
    const weights = new Array(p)
    for (let k = 0; k < p; k++) {
      const diff = k - m
      weights[k] = Math.exp(-(diff * diff) / s2)
    }
    return weights
  }

  registerIndicator({
    id: 'oa-alma',
    name: 'Arnaud Legoux Moving Average (ALMA)',
    category: 'Trends FIR',
    placement: 'onchart',

    inputs: [
      {
        key: 'period',
        type: 'number',
        label: 'Period',
        default: 50,
        min: 1,
        max: 1000,
        step: 1,
        tooltip: 'Number of bars used in the calculation',
      },
      { key: 'offset', type: 'number', label: 'Offset', default: 0.85, min: 0, max: 1, step: 0.01 },
      { key: 'sigma', type: 'number', label: 'Sigma', default: 6, min: 0.1, max: 20, step: 0.1 },
      { key: 'source', type: 'source', label: 'Source', default: 'close' },
    ],

    plots: [{ key: 'alma', type: 'line', title: 'ALMA', style: { color: '#ffeb3b', lineWidth: 2 } }],

    calc(bars, settings) {
      const period = Math.max(1, Math.floor(Number(settings.period) || 50))
      const offset = numberInput(settings.offset, 0.85, 0, 1)
      const sigma = numberInput(settings.sigma, 6, 0.1, 20)
      const src = sourceValues(bars, settings.source ?? 'close')
      const n = bars.length
      const out = new Array(n).fill(NaN)

      // The source shrinks the window to min(bar_index + 1, period), so it plots
      // from the first bar rather than waiting out a warmup. The weights depend
      // only on the window size, so the full-window set is built once.
      const fullWeights = period > 1 ? gaussianWeights(period, offset, sigma) : null

      for (let i = 0; i < n; i++) {
        const p = Math.min(i + 1, period)
        const fallback = Number.isFinite(src[i]) ? src[i] : NaN
        if (p <= 1) {
          out[i] = fallback
          continue
        }

        const weights = p === period && fullWeights ? fullWeights : gaussianWeights(p, offset, sigma)
        let sum = 0
        let weightSum = 0
        for (let k = 0; k < p; k++) {
          const price = src[i - k]
          if (!Number.isFinite(price)) continue
          sum += price * weights[k]
          weightSum += weights[k]
        }

        // nz(sum / weight_sum, source): an empty window falls back to the bar.
        const value = weightSum > 0 ? sum / weightSum : NaN
        out[i] = Number.isFinite(value) ? value : fallback
      }

      return { alma: nulls(out) }
    },
  })
}
