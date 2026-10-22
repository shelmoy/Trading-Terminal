/**
 * TRIM: Trimmed Mean Moving Average - ported to openalgo-charts from Pine Script v6.
 *
 * Source: https://github.com/mihakralj/pinescript/blob/c4e91b962be09733d8fc76caa5191e9e586c5cee/indicators/statistics/trim.pine
 * Repo:   mihakralj/pinescript
 * License: MIT
 * SPDX-FileCopyrightText: (c) mihakralj
 * SPDX-FileCopyrightText: (c) 2026 marketcalls (port to openalgo-charts)
 * SPDX-License-Identifier: MIT
 *
 * The lookback window is sorted, the lowest and highest trim percent of the
 * values are discarded, and the remaining middle is averaged. A trim of 0 gives
 * a plain SMA and a trim of 50 gives the median, so the line keeps more
 * information than a median while ignoring spikes.
 */

export default function ({ registerIndicator, nulls }) {
  registerIndicator({
    id: 'oa-trim',
    name: 'TRIM: Trimmed Mean Moving Average',
    category: 'Statistics',
    placement: 'onchart',

    inputs: [
      { key: 'period', type: 'number', label: 'Period', default: 20, min: 3, max: 5000, step: 1 },
      {
        key: 'trimPct',
        type: 'number',
        label: 'Trim %',
        default: 10,
        min: 0,
        max: 49,
        step: 1,
        tooltip: 'Percentage trimmed from each tail. 0=SMA, 50=Median',
      },
    ],

    plots: [{ key: 'trim', type: 'line', title: 'TRIM', style: { color: '#ffeb3b', lineWidth: 2 } }],

    calc(bars, settings) {
      // A cleared number field arrives as '', and Number('') is 0. Trim 0 is a
      // legitimate setting (plain SMA), so it is clamped rather than replaced.
      const period = Math.max(3, Math.floor(Number(settings.period) || 20))
      const rawTrim = Number(settings.trimPct)
      const trimPct = Number.isFinite(rawTrim) ? Math.min(49, Math.max(0, Math.floor(rawTrim))) : 10

      // Pine's int() truncates toward zero, and its int/int division does too.
      let trimCount = Math.max(Math.trunc((period * trimPct) / 100), 0)
      let keepCount = period - 2 * trimCount
      if (keepCount < 1) {
        keepCount = 1
        trimCount = Math.trunc((period - 1) / 2)
      }

      const n = bars.length
      const out = new Array(n).fill(NaN)
      const window = new Array(period)

      for (let i = 0; i < n; i++) {
        // Pine reads src[0..period-1] through nz(), so bars before the start of
        // history contribute 0 rather than dropping the value. The source plots
        // from the very first bar because of that, and this reproduces it.
        for (let k = 0; k < period; k++) {
          const j = i - k
          const v = j >= 0 ? bars[j].close : NaN
          window[k] = Number.isFinite(v) ? v : 0
        }
        window.sort((a, b) => a - b)

        let sum = 0
        for (let k = trimCount; k < trimCount + keepCount; k++) sum += window[k]
        // keepCount is forced to at least 1 above, so this divide is safe.
        out[i] = sum / keepCount
      }

      return { trim: nulls(out) }
    },
  })
}
