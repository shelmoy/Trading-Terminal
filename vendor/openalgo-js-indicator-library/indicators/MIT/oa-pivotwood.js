/**
 * Pivot Points (Woodie) - ported to openalgo-charts from Pine Script v6.
 *
 * Source: https://github.com/mihakralj/pinescript/blob/c4e91b962be09733d8fc76caa5191e9e586c5cee/indicators/reversals/pivotwood.pine
 * Repo:   mihakralj/pinescript
 * License: MIT (c) mihakralj
 * SPDX-FileCopyrightText: (c) mihakralj
 * SPDX-FileCopyrightText: (c) 2026 marketcalls (port to openalgo-charts)
 * SPDX-License-Identifier: MIT
 *
 * Woodie's pivots weight the previous period's close twice, so the central
 * pivot and its three support and resistance steps sit nearer the close than
 * the classic formula puts them.
 */

export default function ({
  registerIndicator,
  nulls,
  DEFAULT_TIMEZONE,
  isValidTimezone,
  zonedDayIndex,
  zonedWeekIndex,
  utcSecondsToZonedParts,
}) {
  registerIndicator({
    id: 'oa-pivotwood',
    name: 'Pivot Points (Woodie)',
    category: 'Reversals',
    placement: 'onchart',

    inputs: [
      {
        key: 'timeframe',
        type: 'select',
        label: 'Pivot Timeframe',
        default: 'D',
        options: [
          { label: 'Daily', value: 'D' },
          { label: 'Weekly', value: 'W' },
          { label: 'Monthly', value: 'M' },
        ],
      },
      { key: 'showPp', type: 'boolean', label: 'Show Pivot Point', default: true },
      { key: 'showR1', type: 'boolean', label: 'Show R1', default: true },
      { key: 'showR2', type: 'boolean', label: 'Show R2', default: true },
      { key: 'showR3', type: 'boolean', label: 'Show R3', default: true },
      { key: 'showS1', type: 'boolean', label: 'Show S1', default: true },
      { key: 'showS2', type: 'boolean', label: 'Show S2', default: true },
      { key: 'showS3', type: 'boolean', label: 'Show S3', default: true },
    ],

    plots: [
      { key: 'pp', type: 'step', title: 'PP', style: { color: '#ffeb3b', lineWidth: 2 } },
      { key: 'r1', type: 'step', title: 'R1', style: { color: '#ef5350', lineWidth: 1 } },
      { key: 'r2', type: 'step', title: 'R2', style: { color: '#ef5350', lineWidth: 1 } },
      { key: 'r3', type: 'step', title: 'R3', style: { color: '#ef5350', lineWidth: 1 } },
      { key: 's1', type: 'step', title: 'S1', style: { color: '#26a69a', lineWidth: 1 } },
      { key: 's2', type: 'step', title: 'S2', style: { color: '#26a69a', lineWidth: 1 } },
      { key: 's3', type: 'step', title: 'S3', style: { color: '#26a69a', lineWidth: 1 } },
    ],

    calc(bars, settings, store, ctx) {
      // A cleared select arrives as '', so fall back to the Pine default.
      const raw = typeof settings.timeframe === 'string' ? settings.timeframe.trim().toUpperCase() : ''
      const tf = raw === 'W' || raw === 'M' ? raw : 'D'

      const wanted = ctx?.timezone
      const zone = typeof wanted === 'string' && isValidTimezone(wanted) ? wanted : DEFAULT_TIMEZONE

      const bucketOf = (t) => {
        if (tf === 'W') return zonedWeekIndex(t, zone)
        if (tf === 'M') {
          const parts = utcSecondsToZonedParts(t, zone)
          return parts.year * 12 + parts.month
        }
        return zonedDayIndex(t, zone)
      }

      const showPp = settings.showPp !== false
      const showR1 = settings.showR1 !== false
      const showR2 = settings.showR2 !== false
      const showR3 = settings.showR3 !== false
      const showS1 = settings.showS1 !== false
      const showS2 = settings.showS2 !== false
      const showS3 = settings.showS3 !== false

      const pp = new Array(bars.length).fill(NaN)
      const r1 = new Array(bars.length).fill(NaN)
      const r2 = new Array(bars.length).fill(NaN)
      const r3 = new Array(bars.length).fill(NaN)
      const s1 = new Array(bars.length).fill(NaN)
      const s2 = new Array(bars.length).fill(NaN)
      const s3 = new Array(bars.length).fill(NaN)

      // Pine reads [high[1], low[1], close[1]] of the higher timeframe, which is
      // the last COMPLETED period. Folding the chart's own bars up gives the same
      // values with no lookahead: a period contributes only once it has closed.
      let curKey = null
      let curHigh = NaN
      let curLow = NaN
      let curClose = NaN
      let hi = NaN
      let lo = NaN
      let cl = NaN

      for (let i = 0; i < bars.length; i++) {
        const bar = bars[i]
        const key = Number.isFinite(bar.time) ? bucketOf(bar.time) : curKey
        if (curKey === null) {
          curKey = key
        } else if (key !== curKey) {
          hi = curHigh
          lo = curLow
          cl = curClose
          curKey = key
          curHigh = NaN
          curLow = NaN
          curClose = NaN
        }

        if (Number.isFinite(hi) && Number.isFinite(lo) && Number.isFinite(cl)) {
          const pivot = (hi + lo + 2 * cl) / 4
          const span = hi - lo
          if (showPp) pp[i] = pivot
          if (showR1) r1[i] = 2 * pivot - lo
          if (showR2) r2[i] = pivot + span
          if (showR3) r3[i] = hi + 2 * (pivot - lo)
          if (showS1) s1[i] = 2 * pivot - hi
          if (showS2) s2[i] = pivot - span
          if (showS3) s3[i] = lo - 2 * (hi - pivot)
        }

        // Fold this bar into the period still forming, after the levels are read.
        if (Number.isFinite(bar.high)) curHigh = Number.isFinite(curHigh) ? Math.max(curHigh, bar.high) : bar.high
        if (Number.isFinite(bar.low)) curLow = Number.isFinite(curLow) ? Math.min(curLow, bar.low) : bar.low
        if (Number.isFinite(bar.close)) curClose = bar.close
      }

      return {
        pp: nulls(pp),
        r1: nulls(r1),
        r2: nulls(r2),
        r3: nulls(r3),
        s1: nulls(s1),
        s2: nulls(s2),
        s3: nulls(s3),
      }
    },
  })
}
