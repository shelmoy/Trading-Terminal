/**
 * Pivot Points (DeMark) - ported to openalgo-charts from Pine Script v6.
 *
 * Source: https://github.com/mihakralj/pinescript/blob/c4e91b962be09733d8fc76caa5191e9e586c5cee/indicators/reversals/pivotdem.pine
 * Repo:   mihakralj/pinescript
 * License: MIT (c) mihakralj
 * SPDX-FileCopyrightText: (c) mihakralj
 * SPDX-FileCopyrightText: (c) 2026 marketcalls (port to openalgo-charts)
 * SPDX-License-Identifier: MIT
 *
 * DeMark's conditional pivot: the previous period's range is weighted by
 * whether that period closed above, below or level with its open, giving one
 * pivot and a single resistance and support level.
 */

export default function ({
  registerIndicator,
  nulls,
  zonedDayIndex,
  zonedWeekIndex,
  utcSecondsToZonedParts,
  isValidTimezone,
  DEFAULT_TIMEZONE,
}) {
  registerIndicator({
    id: 'oa-pivotdem',
    name: 'Pivot Points (DeMark)',
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
      { key: 'showS1', type: 'boolean', label: 'Show S1', default: true },
    ],

    plots: [
      { key: 'pp', type: 'step', title: 'PP', style: { color: '#ffeb3b', lineWidth: 2 } },
      { key: 'r1', type: 'step', title: 'R1', style: { color: '#ff5252', lineWidth: 1 } },
      { key: 's1', type: 'step', title: 'S1', style: { color: '#4caf50', lineWidth: 1 } },
    ],

    calc(bars, settings, store, ctx) {
      const tfRaw = settings.timeframe
      const tf = tfRaw === 'W' || tfRaw === 'M' ? tfRaw : 'D'
      const showPp = settings.showPp !== false
      const showR1 = settings.showR1 !== false
      const showS1 = settings.showS1 !== false

      const n = bars.length
      const pp = new Array(n).fill(NaN)
      const r1 = new Array(n).fill(NaN)
      const s1 = new Array(n).fill(NaN)
      if (n === 0) return { pp, r1, s1 }

      // Bar times are UTC seconds and a trading period is exchange wall clock,
      // so the bucket has to be resolved through a zone, never local time.
      const hostZone = ctx && ctx.timezone
      const zone = hostZone && isValidTimezone(hostZone) ? hostZone : DEFAULT_TIMEZONE
      const bucketOf = (t) => {
        if (tf === 'W') return zonedWeekIndex(t, zone)
        if (tf === 'M') {
          const parts = utcSecondsToZonedParts(t, zone)
          return parts.year * 12 + parts.month
        }
        return zonedDayIndex(t, zone)
      }

      // request.security(..., [high[1], low[1], open[1], close[1]],
      // lookahead_on) hands every bar of a period the PREVIOUS period's
      // completed OHLC. Folding the chart's own bars up to that period gives
      // the same series without the lookahead.
      let currentKey = null
      let curOpen = NaN
      let curHigh = NaN
      let curLow = NaN
      let curClose = NaN
      let prevOpen = NaN
      let prevHigh = NaN
      let prevLow = NaN
      let prevClose = NaN

      for (let i = 0; i < n; i++) {
        const b = bars[i]
        const o = Number(b.open)
        const h = Number(b.high)
        const l = Number(b.low)
        const c = Number(b.close)
        const key = bucketOf(Number(b.time))

        if (currentKey === null || key !== currentKey) {
          if (currentKey !== null) {
            prevOpen = curOpen
            prevHigh = curHigh
            prevLow = curLow
            prevClose = curClose
          }
          currentKey = key
          curOpen = o
          curHigh = h
          curLow = l
          curClose = c
        } else {
          if (Number.isFinite(h)) curHigh = Number.isFinite(curHigh) ? Math.max(curHigh, h) : h
          if (Number.isFinite(l)) curLow = Number.isFinite(curLow) ? Math.min(curLow, l) : l
          if (Number.isFinite(c)) curClose = c
        }

        // na on any leg means no pivot for this bar, as in the source.
        if (!Number.isFinite(prevHigh) || !Number.isFinite(prevLow)) continue
        if (!Number.isFinite(prevOpen) || !Number.isFinite(prevClose)) continue

        let x
        if (prevClose < prevOpen) x = prevHigh + 2 * prevLow + prevClose
        else if (prevClose > prevOpen) x = 2 * prevHigh + prevLow + prevClose
        else x = prevHigh + prevLow + 2 * prevClose

        if (showPp) pp[i] = x / 4
        if (showR1) r1[i] = x / 2 - prevLow
        if (showS1) s1[i] = x / 2 - prevHigh
      }

      return { pp: nulls(pp), r1: nulls(r1), s1: nulls(s1) }
    },
  })
}
