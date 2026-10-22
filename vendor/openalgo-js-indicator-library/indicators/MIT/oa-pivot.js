/**
 * Pivot Points (Classic) - ported to openalgo-charts from Pine Script v6.
 *
 * Source: https://github.com/mihakralj/pinescript/blob/c4e91b962be09733d8fc76caa5191e9e586c5cee/indicators/reversals/pivot.pine
 * Repo:   mihakralj/pinescript
 * License: MIT (c) mihakralj
 * SPDX-FileCopyrightText: (c) mihakralj
 * SPDX-FileCopyrightText: (c) 2026 marketcalls (port to openalgo-charts)
 * SPDX-License-Identifier: MIT
 *
 * The floor traders' pivot: the previous day, week or month's high, low and
 * close turned into a central pivot plus three supports and three resistances.
 *
 * Note on the higher timeframe: the source reads the previous period's HLC with
 * request.security(..., lookahead_on). There is no such call here, so the
 * period's high, low and close are folded from the chart's own bars, which is
 * the equivalent non-repainting result. The consequence is that levels only
 * begin once one whole period of loaded history has completed, and a period
 * that the loaded history only covers in part is only as complete as that
 * history.
 */

export default function ({ registerIndicator, nulls, DEFAULT_TIMEZONE, isValidTimezone, utcSecondsToZonedParts, zonedDayIndex, zonedWeekIndex }) {
  registerIndicator({
    id: 'oa-pivot',
    name: 'Pivot Points (Classic)',
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

    // plot.style_stepline in the source.
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
      const n = bars.length
      const pp = new Array(n).fill(NaN)
      const r1 = new Array(n).fill(NaN)
      const r2 = new Array(n).fill(NaN)
      const r3 = new Array(n).fill(NaN)
      const s1 = new Array(n).fill(NaN)
      const s2 = new Array(n).fill(NaN)
      const s3 = new Array(n).fill(NaN)

      const showPp = settings.showPp !== false
      const showR1 = settings.showR1 !== false
      const showR2 = settings.showR2 !== false
      const showR3 = settings.showR3 !== false
      const showS1 = settings.showS1 !== false
      const showS2 = settings.showS2 !== false
      const showS3 = settings.showS3 !== false

      // Never the browser clock: bar times are UTC seconds, period boundaries are
      // exchange wall clock.
      const hostZone = ctx?.timezone
      const zone = typeof hostZone === 'string' && isValidTimezone(hostZone) ? hostZone : DEFAULT_TIMEZONE

      const tf = settings.timeframe === 'W' || settings.timeframe === 'M' ? settings.timeframe : 'D'
      const periodKey = (time) => {
        if (tf === 'W') return zonedWeekIndex(time, zone)
        if (tf === 'M') {
          const parts = utcSecondsToZonedParts(time, zone)
          return parts.year * 12 + parts.month
        }
        return zonedDayIndex(time, zone)
      }

      // The completed previous period, and the period being built.
      let prevHi = NaN
      let prevLo = NaN
      let prevCl = NaN
      let curKey = null
      let curHi = NaN
      let curLo = NaN
      let curCl = NaN

      for (let i = 0; i < n; i++) {
        const bar = bars[i]
        const high = Number(bar.high)
        const low = Number(bar.low)
        const close = Number(bar.close)
        const key = periodKey(bar.time)

        if (curKey === null || key !== curKey) {
          if (curKey !== null) {
            prevHi = curHi
            prevLo = curLo
            prevCl = curCl
          }
          curKey = key
          curHi = high
          curLo = low
          curCl = close
        } else {
          if (Number.isFinite(high)) curHi = Number.isFinite(curHi) ? Math.max(curHi, high) : high
          if (Number.isFinite(low)) curLo = Number.isFinite(curLo) ? Math.min(curLo, low) : low
          if (Number.isFinite(close)) curCl = close
        }

        // Pine returns na for every level while any of the three is na.
        if (!Number.isFinite(prevHi) || !Number.isFinite(prevLo) || !Number.isFinite(prevCl)) continue

        const pivot = (prevHi + prevLo + prevCl) / 3
        const span = prevHi - prevLo
        if (showPp) pp[i] = pivot
        if (showR1) r1[i] = 2 * pivot - prevLo
        if (showS1) s1[i] = 2 * pivot - prevHi
        if (showR2) r2[i] = pivot + span
        if (showS2) s2[i] = pivot - span
        if (showR3) r3[i] = prevHi + 2 * (pivot - prevLo)
        if (showS3) s3[i] = prevLo - 2 * (prevHi - pivot)
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
