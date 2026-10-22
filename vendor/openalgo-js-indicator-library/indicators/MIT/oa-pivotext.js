/**
 * Pivot Points (Extended) - ported to openalgo-charts from Pine Script v6.
 *
 * Source: https://github.com/mihakralj/pinescript/blob/c4e91b962be09733d8fc76caa5191e9e586c5cee/indicators/reversals/pivotext.pine
 * Repo:   mihakralj/pinescript
 * License: MIT (c) mihakralj
 * SPDX-FileCopyrightText: (c) mihakralj
 * SPDX-FileCopyrightText: (c) 2026 marketcalls (port to openalgo-charts)
 * SPDX-License-Identifier: MIT
 *
 * Floor trader pivots taken from the previous day, week or month, extended out
 * to a fourth and fifth support and resistance so the far projections are
 * visible on a wide range day.
 */

export default function ({
  registerIndicator,
  nulls,
  calendarPeriodFlags,
  isNewZonedDay,
  isNewZonedWeek,
  isNewZonedMonth,
  isValidTimezone,
  DEFAULT_TIMEZONE,
}) {
  registerIndicator({
    id: 'oa-pivotext',
    name: 'Pivot Points (Extended)',
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
        tooltip: 'The period whose high, low and close the pivots are built from.',
      },
      { key: 'showPp', type: 'boolean', label: 'Show Pivot Point', default: true },
      { key: 'showR1', type: 'boolean', label: 'Show R1', default: true, group: 'Resistance' },
      { key: 'showR2', type: 'boolean', label: 'Show R2', default: true, group: 'Resistance' },
      { key: 'showR3', type: 'boolean', label: 'Show R3', default: true, group: 'Resistance' },
      { key: 'showR4', type: 'boolean', label: 'Show R4', default: true, group: 'Resistance' },
      { key: 'showR5', type: 'boolean', label: 'Show R5', default: true, group: 'Resistance' },
      { key: 'showS1', type: 'boolean', label: 'Show S1', default: true, group: 'Support' },
      { key: 'showS2', type: 'boolean', label: 'Show S2', default: true, group: 'Support' },
      { key: 'showS3', type: 'boolean', label: 'Show S3', default: true, group: 'Support' },
      { key: 'showS4', type: 'boolean', label: 'Show S4', default: true, group: 'Support' },
      { key: 'showS5', type: 'boolean', label: 'Show S5', default: true, group: 'Support' },
    ],

    plots: [
      { key: 'pp', type: 'step', title: 'PP', style: { color: '#ffeb3b', lineWidth: 2 } },
      { key: 'r1', type: 'step', title: 'R1', style: { color: '#ff5252', lineWidth: 1 } },
      { key: 'r2', type: 'step', title: 'R2', style: { color: '#ff5252', lineWidth: 1 } },
      { key: 'r3', type: 'step', title: 'R3', style: { color: '#ff5252', lineWidth: 1 } },
      { key: 'r4', type: 'step', title: 'R4', style: { color: '#ff5252', lineWidth: 1 } },
      { key: 'r5', type: 'step', title: 'R5', style: { color: '#ff5252', lineWidth: 1 } },
      { key: 's1', type: 'step', title: 'S1', style: { color: '#4caf50', lineWidth: 1 } },
      { key: 's2', type: 'step', title: 'S2', style: { color: '#4caf50', lineWidth: 1 } },
      { key: 's3', type: 'step', title: 'S3', style: { color: '#4caf50', lineWidth: 1 } },
      { key: 's4', type: 'step', title: 'S4', style: { color: '#4caf50', lineWidth: 1 } },
      { key: 's5', type: 'step', title: 'S5', style: { color: '#4caf50', lineWidth: 1 } },
    ],

    calc(bars, settings, store, ctx) {
      const n = bars.length
      const raw = String(settings.timeframe ?? 'D').trim().toUpperCase()
      const tf = raw === 'W' ? 'W' : raw === 'M' ? 'M' : 'D'
      const zoneRaw = ctx?.timezone ?? settings.timezone
      const zone = isValidTimezone(zoneRaw) ? zoneRaw : DEFAULT_TIMEZONE

      const show = {
        pp: settings.showPp !== false,
        r1: settings.showR1 !== false,
        r2: settings.showR2 !== false,
        r3: settings.showR3 !== false,
        r4: settings.showR4 !== false,
        r5: settings.showR5 !== false,
        s1: settings.showS1 !== false,
        s2: settings.showS2 !== false,
        s3: settings.showS3 !== false,
        s4: settings.showS4 !== false,
        s5: settings.showS5 !== false,
      }

      const out = {}
      for (const key of ['pp', 'r1', 'r2', 'r3', 'r4', 'r5', 's1', 's2', 's3', 's4', 's5']) {
        out[key] = new Array(n).fill(NaN)
      }
      if (n === 0) return out

      // Pine reads the previous higher timeframe bar through request.security.
      // There is no such call here, so the chart's own bars are folded up into
      // day, week or month buckets and the last completed bucket is used.
      const times = bars.map((b) => b.time)
      const isNew =
        tf === 'W'
          ? (a, b) => isNewZonedWeek(a, b, zone)
          : tf === 'M'
            ? (a, b) => isNewZonedMonth(a, b, zone)
            : (a, b) => isNewZonedDay(a, b, zone)
      const starts = calendarPeriodFlags(times, isNew)

      let curHigh = NaN
      let curLow = NaN
      let curClose = NaN
      let haveCur = false
      let prevHigh = NaN
      let prevLow = NaN
      let prevClose = NaN

      for (let i = 0; i < n; i++) {
        // Roll the finished bucket forward before this bar reads it, which is
        // what the [1] offset on the security call means.
        if (starts[i] && haveCur) {
          prevHigh = curHigh
          prevLow = curLow
          prevClose = curClose
          haveCur = false
          curHigh = NaN
          curLow = NaN
          curClose = NaN
        }

        const bar = bars[i]
        if (Number.isFinite(bar.high)) curHigh = Number.isFinite(curHigh) ? Math.max(curHigh, bar.high) : bar.high
        if (Number.isFinite(bar.low)) curLow = Number.isFinite(curLow) ? Math.min(curLow, bar.low) : bar.low
        if (Number.isFinite(bar.close)) curClose = bar.close
        haveCur = true

        if (!Number.isFinite(prevHigh) || !Number.isFinite(prevLow) || !Number.isFinite(prevClose)) continue

        const hi = prevHigh
        const lo = prevLow
        const cl = prevClose
        const pp = (hi + lo + cl) / 3
        const hlRange = hi - lo

        if (show.pp) out.pp[i] = pp
        if (show.r1) out.r1[i] = 2 * pp - lo
        if (show.r2) out.r2[i] = pp + hlRange
        if (show.r3) out.r3[i] = hi + 2 * (pp - lo)
        if (show.r4) out.r4[i] = hi + 3 * (pp - lo)
        if (show.r5) out.r5[i] = hi + 4 * (pp - lo)
        if (show.s1) out.s1[i] = 2 * pp - hi
        if (show.s2) out.s2[i] = pp - hlRange
        if (show.s3) out.s3[i] = lo - 2 * (hi - pp)
        if (show.s4) out.s4[i] = lo - 3 * (hi - pp)
        if (show.s5) out.s5[i] = lo - 4 * (hi - pp)
      }

      for (const key of Object.keys(out)) out[key] = nulls(out[key])
      return out
    },
  })
}
