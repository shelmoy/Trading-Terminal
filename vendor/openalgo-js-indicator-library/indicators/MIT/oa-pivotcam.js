/**
 * Pivot Points (Camarilla) - ported to openalgo-charts from Pine Script v6.
 *
 * Source: https://github.com/mihakralj/pinescript/blob/c4e91b962be09733d8fc76caa5191e9e586c5cee/indicators/reversals/pivotcam.pine
 * Repo:   mihakralj/pinescript
 * License: MIT
 * SPDX-FileCopyrightText: (c) mihakralj
 * SPDX-FileCopyrightText: (c) 2026 marketcalls (port to openalgo-charts)
 * SPDX-License-Identifier: MIT
 *
 * The Camarilla equation spreads eight levels around the previous period's
 * close in fixed fractions of that period's range, with the classic pivot
 * point plotted alongside them.
 */

export default function ({
  registerIndicator,
  nulls,
  DEFAULT_TIMEZONE,
  isValidTimezone,
  utcSecondsToZonedParts,
  zonedDayIndex,
  zonedWeekIndex,
}) {
  registerIndicator({
    id: 'oa-pivotcam',
    name: 'Pivot Points (Camarilla)',
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
      { key: 'showR4', type: 'boolean', label: 'Show R4', default: true },
      { key: 'showS1', type: 'boolean', label: 'Show S1', default: true },
      { key: 'showS2', type: 'boolean', label: 'Show S2', default: true },
      { key: 'showS3', type: 'boolean', label: 'Show S3', default: true },
      { key: 'showS4', type: 'boolean', label: 'Show S4', default: true },
    ],

    plots: [
      { key: 'pp', type: 'step', title: 'PP', style: { color: '#ffeb3b', lineWidth: 2 } },
      { key: 'r1', type: 'step', title: 'R1', style: { color: '#ef5350', lineWidth: 1 } },
      { key: 'r2', type: 'step', title: 'R2', style: { color: '#ef5350', lineWidth: 1 } },
      { key: 'r3', type: 'step', title: 'R3', style: { color: '#ef5350', lineWidth: 1 } },
      { key: 'r4', type: 'step', title: 'R4', style: { color: '#ef5350', lineWidth: 1 } },
      { key: 's1', type: 'step', title: 'S1', style: { color: '#4caf50', lineWidth: 1 } },
      { key: 's2', type: 'step', title: 'S2', style: { color: '#4caf50', lineWidth: 1 } },
      { key: 's3', type: 'step', title: 'S3', style: { color: '#4caf50', lineWidth: 1 } },
      { key: 's4', type: 'step', title: 'S4', style: { color: '#4caf50', lineWidth: 1 } },
    ],

    calc(bars, settings, store, ctx) {
      const tf = settings.timeframe === 'W' || settings.timeframe === 'M' ? settings.timeframe : 'D'
      const wanted = ctx?.timezone
      const zone = typeof wanted === 'string' && isValidTimezone(wanted) ? wanted : DEFAULT_TIMEZONE

      // Pine pulls [high[1], low[1], close[1]] off the higher timeframe. There
      // is no security call here, so the chart's own bars are folded up into
      // the same buckets and the previous completed bucket is what every bar of
      // the current one reads. That is the lookahead_on behaviour without the
      // lookahead: the prior period is already closed.
      const bucketOf = (t) => {
        if (tf === 'W') return zonedWeekIndex(t, zone)
        if (tf === 'M') {
          const p = utcSecondsToZonedParts(t, zone)
          return p.year * 12 + p.month
        }
        return zonedDayIndex(t, zone)
      }

      const n = bars.length
      const pp = new Array(n).fill(NaN)
      const r1 = new Array(n).fill(NaN)
      const r2 = new Array(n).fill(NaN)
      const r3 = new Array(n).fill(NaN)
      const r4 = new Array(n).fill(NaN)
      const s1 = new Array(n).fill(NaN)
      const s2 = new Array(n).fill(NaN)
      const s3 = new Array(n).fill(NaN)
      const s4 = new Array(n).fill(NaN)

      const showPp = settings.showPp !== false
      const showR1 = settings.showR1 !== false
      const showR2 = settings.showR2 !== false
      const showR3 = settings.showR3 !== false
      const showR4 = settings.showR4 !== false
      const showS1 = settings.showS1 !== false
      const showS2 = settings.showS2 !== false
      const showS3 = settings.showS3 !== false
      const showS4 = settings.showS4 !== false

      let bucket = null
      let curHi = -Infinity
      let curLo = Infinity
      let curClose = NaN
      let prevHi = NaN
      let prevLo = NaN
      let prevClose = NaN

      for (let i = 0; i < n; i++) {
        const bar = bars[i]
        const key = bucketOf(bar.time)

        if (bucket === null) {
          bucket = key
        } else if (key !== bucket) {
          prevHi = curHi
          prevLo = curLo
          prevClose = curClose
          bucket = key
          curHi = -Infinity
          curLo = Infinity
          curClose = NaN
        }

        // Emit from the previous completed period before folding this bar in.
        if (Number.isFinite(prevHi) && Number.isFinite(prevLo) && Number.isFinite(prevClose)) {
          const range = prevHi - prevLo
          if (showPp) pp[i] = (prevHi + prevLo + prevClose) / 3.0
          if (showR1) r1[i] = prevClose + (range * 1.0833) / 12.0
          if (showS1) s1[i] = prevClose - (range * 1.0833) / 12.0
          if (showR2) r2[i] = prevClose + (range * 1.1666) / 12.0
          if (showS2) s2[i] = prevClose - (range * 1.1666) / 12.0
          if (showR3) r3[i] = prevClose + (range * 1.25) / 12.0
          if (showS3) s3[i] = prevClose - (range * 1.25) / 12.0
          if (showR4) r4[i] = prevClose + (range * 1.5) / 12.0
          if (showS4) s4[i] = prevClose - (range * 1.5) / 12.0
        }

        if (Number.isFinite(bar.high)) curHi = Math.max(curHi, bar.high)
        if (Number.isFinite(bar.low)) curLo = Math.min(curLo, bar.low)
        if (Number.isFinite(bar.close)) curClose = bar.close
      }

      return {
        pp: nulls(pp),
        r1: nulls(r1),
        r2: nulls(r2),
        r3: nulls(r3),
        r4: nulls(r4),
        s1: nulls(s1),
        s2: nulls(s2),
        s3: nulls(s3),
        s4: nulls(s4),
      }
    },
  })
}
