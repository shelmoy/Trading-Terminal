/**
 * Kaufman - ported to openalgo-charts from Pine Script v6.
 *
 * Source: https://github.com/mihakralj/pinescript/blob/c4e91b962be09733d8fc76caa5191e9e586c5cee/indicators/trends_IIR/kama.pine
 * Repo:   mihakralj/pinescript
 * License: MIT
 * SPDX-FileCopyrightText: (c) mihakralj
 * SPDX-FileCopyrightText: (c) 2026 marketcalls (port to openalgo-charts)
 * SPDX-License-Identifier: MIT
 *
 * Kaufman's Adaptive Moving Average: the efficiency ratio, net travel over the
 * lookback divided by the distance actually covered bar by bar, drives the
 * smoothing constant, so the line tracks a clean trend and flattens in chop.
 */

export default function ({ registerIndicator, sourceValues, nulls }) {
  registerIndicator({
    id: 'oa-kama',
    name: 'Kaufman\'s Adaptive Moving Average (KAMA)',
    category: 'Trends IIR',
    placement: 'onchart',

    inputs: [
      { key: 'period', type: 'number', label: 'Period', default: 10, min: 1, max: 5000, step: 1 },
      { key: 'source', type: 'source', label: 'Source', default: 'close' },
      { key: 'fastPeriod', type: 'number', label: 'Fast EMA Period', default: 2, min: 2, max: 5000, step: 1 },
      { key: 'slowPeriod', type: 'number', label: 'Slow EMA Period', default: 30, min: 2, max: 5000, step: 1 },
    ],

    plots: [{ key: 'kama', type: 'line', title: 'KAMA', style: { color: '#ffeb3b', lineWidth: 2 } }],

    calc(bars, settings) {
      // A cleared number field arrives as '', and Number('') is 0.
      const period = Math.max(1, Math.floor(Number(settings.period) || 10))
      const fastPeriod = Math.max(2, Math.floor(Number(settings.fastPeriod) || 2))
      const slowPeriod = Math.max(2, Math.floor(Number(settings.slowPeriod) || 30))
      const src = sourceValues(bars, settings.source ?? 'close')

      const fastAlpha = 2 / (fastPeriod + 1)
      const slowAlpha = 2 / (slowPeriod + 1)

      const kama = new Array(bars.length).fill(NaN)
      // Pine raises a runtime error when the fast constant is not above the
      // slow one, which stops the script and leaves the plot empty. Mirror that
      // rather than smoothing with an inverted pair.
      if (!(fastAlpha > slowAlpha)) return { kama: nulls(kama) }

      // math.abs(source - source[1]), na on the first bar.
      const step = new Array(bars.length).fill(NaN)
      for (let i = 1; i < bars.length; i++) {
        if (Number.isFinite(src[i]) && Number.isFinite(src[i - 1])) step[i] = Math.abs(src[i] - src[i - 1])
      }

      // math.sum(step, period): the window [i - period + 1, i] only holds a
      // full set of finite steps from bar `period` onward.
      const volatility = new Array(bars.length).fill(NaN)
      let acc = 0
      for (let i = 0; i < bars.length; i++) {
        if (Number.isFinite(step[i])) acc += step[i]
        const dropped = i - period
        if (dropped >= 0 && Number.isFinite(step[dropped])) acc -= step[dropped]
        if (i >= period) volatility[i] = acc
      }

      let state = NaN
      for (let i = 0; i < bars.length; i++) {
        const value = src[i]
        // Pine leaves current_kama na and the carried state untouched when the
        // source is na.
        if (!Number.isFinite(value)) continue

        let er = 0
        const change = i >= period && Number.isFinite(src[i - period]) ? Math.abs(value - src[i - period]) : NaN
        const vol = volatility[i]
        if (Number.isFinite(change) && Number.isFinite(vol) && vol !== 0) er = change / vol

        const sc = Math.pow(er * (fastAlpha - slowAlpha) + slowAlpha, 2)
        state = Number.isFinite(state) ? state + sc * (value - state) : value
        kama[i] = state
      }

      return { kama: nulls(kama) }
    },
  })
}
