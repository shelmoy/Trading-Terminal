/**
 * VWAP with Standard Deviation Bands - ported to openalgo-charts from Pine Script v6.
 *
 * Source: https://github.com/mihakralj/pinescript/blob/c4e91b962be09733d8fc76caa5191e9e586c5cee/indicators/channels/vwapsd.pine
 * Repo:   mihakralj/pinescript
 * License: MIT
 * SPDX-FileCopyrightText: (c) mihakralj
 * SPDX-FileCopyrightText: (c) 2026 marketcalls (port to openalgo-charts)
 * SPDX-License-Identifier: MIT
 *
 * A volume weighted average price anchored to the chosen reset period, with
 * bands set a number of volume weighted standard deviations away, so the
 * channel shows where trade has actually been done rather than where price has
 * merely traded.
 */

export default function ({
  registerIndicator,
  sourceValues,
  nulls,
  DEFAULT_TIMEZONE,
  isValidTimezone,
  utcSecondsToZonedParts,
  zonedDayIndex,
  sessionStartFlags,
  calendarPeriodFlags,
  isNewZonedWeek,
  isNewZonedMonth,
  isNewZonedQuarter,
  isNewZonedYear,
}) {
  const INTRADAY_MINUTES = {
    '1m': 1,
    '2m': 2,
    '3m': 3,
    '5m': 5,
    '10m': 10,
    '15m': 15,
    '30m': 30,
    '45m': 45,
    '1H': 60,
    '2H': 120,
    '3H': 180,
    '4H': 240,
  }

  // Pine resets on ta.change(time(tf)) != 0. The first bar never reports a
  // change, but the var sums start at zero there anyway, so anchoring bar 0 is
  // the same series and keeps every branch consistent.
  const resetFlags = (bars, sessionType, zone) => {
    const count = bars.length
    const flags = new Array(count).fill(false)
    if (count === 0) return flags
    const times = bars.map((bar) => bar.time)

    const fromCalendar = (isNew) => {
      const raw = calendarPeriodFlags(times, isNew)
      for (let i = 0; i < count; i++) flags[i] = raw[i] === true
      flags[0] = true
      return flags
    }

    if (sessionType === '1D') {
      const raw = sessionStartFlags(times, zone)
      for (let i = 0; i < count; i++) flags[i] = raw[i] === true
      flags[0] = true
      return flags
    }
    if (sessionType === '1W') return fromCalendar((prev, t) => isNewZonedWeek(prev, t, zone))
    if (sessionType === '1M') return fromCalendar((prev, t) => isNewZonedMonth(prev, t, zone))
    if (sessionType === '3M') return fromCalendar((prev, t) => isNewZonedQuarter(prev, t, zone))
    if (sessionType === '12M') return fromCalendar((prev, t) => isNewZonedYear(prev, t, zone))
    if (sessionType === '6M') {
      // No half-year helper exists; build the bucket from the zoned month,
      // which utcSecondsToZonedParts reports as 1..12.
      const half = (t) => {
        const parts = utcSecondsToZonedParts(t, zone)
        return parts.year * 2 + (parts.month > 6 ? 1 : 0)
      }
      return fromCalendar((prev, t) => half(prev) !== half(t))
    }

    const minutes = INTRADAY_MINUTES[sessionType]
    if (minutes) {
      let previousKey = null
      for (let i = 0; i < count; i++) {
        const parts = utcSecondsToZonedParts(times[i], zone)
        const minuteOfDay = parts.hour * 60 + parts.minute
        const key = zonedDayIndex(times[i], zone) * 10000 + Math.floor(minuteOfDay / minutes)
        if (previousKey === null || key !== previousKey) flags[i] = true
        previousKey = key
      }
      return flags
    }

    // 'Never', and Pine's `=> false` fallback: accumulate from the first bar.
    flags[0] = true
    return flags
  }

  registerIndicator({
    id: 'oa-vwapsd',
    name: 'VWAP with Standard Deviation Bands',
    category: 'Channels',
    placement: 'onchart',

    inputs: [
      { key: 'source', type: 'source', label: 'Source', default: 'hlc3' },
      {
        key: 'sessionType',
        type: 'select',
        label: 'Session Reset',
        default: '1D',
        options: [
          { label: '1m', value: '1m' },
          { label: '2m', value: '2m' },
          { label: '3m', value: '3m' },
          { label: '5m', value: '5m' },
          { label: '10m', value: '10m' },
          { label: '15m', value: '15m' },
          { label: '30m', value: '30m' },
          { label: '45m', value: '45m' },
          { label: '1H', value: '1H' },
          { label: '2H', value: '2H' },
          { label: '3H', value: '3H' },
          { label: '4H', value: '4H' },
          { label: '1D', value: '1D' },
          { label: '1W', value: '1W' },
          { label: '1M', value: '1M' },
          { label: '3M', value: '3M' },
          { label: '6M', value: '6M' },
          { label: '12M', value: '12M' },
          { label: 'Never', value: 'Never' },
        ],
      },
      {
        key: 'numDevs',
        type: 'number',
        label: 'Standard Deviations',
        default: 2,
        min: 0.1,
        max: 5,
        step: 0.1,
        tooltip: 'Number of standard deviations for bands.',
      },
    ],

    plots: [
      { key: 'vwap', type: 'line', title: 'VWAP', style: { color: '#ffeb3b', lineWidth: 2 } },
      { key: 'upper', type: 'line', title: 'Upper Band', style: { color: '#ef5350', lineWidth: 1 } },
      { key: 'lower', type: 'line', title: 'Lower Band', style: { color: '#26a69a', lineWidth: 1 } },
    ],

    fills: [{ between: ['upper', 'lower'], colorUp: '#787b86', colorDown: '#787b86', opacity: 0.1 }],

    calc(bars, settings, store, ctx) {
      // A cleared number field arrives as '', and Number('') is 0. Pine raises
      // outside (0, 5], which the input bounds already express, so clamp.
      const numDevs = Math.min(5, Math.max(0.1, Number(settings.numDevs) || 2))
      const sessionType = typeof settings.sessionType === 'string' && settings.sessionType ? settings.sessionType : '1D'
      const candidate = ctx && typeof ctx.timezone === 'string' ? ctx.timezone : ''
      const zone = candidate && isValidTimezone(candidate) ? candidate : DEFAULT_TIMEZONE

      const src = sourceValues(bars, settings.source ?? 'hlc3')
      const resets = resetFlags(bars, sessionType, zone)

      const vwap = new Array(bars.length).fill(NaN)
      const upper = new Array(bars.length).fill(NaN)
      const lower = new Array(bars.length).fill(NaN)

      let sumPv = 0
      let sumVol = 0
      let sumPv2 = 0

      for (let i = 0; i < bars.length; i++) {
        // nz(src) and nz(vol, 0.0): an index feed carries no volume at all.
        const price = Number.isFinite(src[i]) ? src[i] : 0
        const volume = Number.isFinite(bars[i].volume) ? bars[i].volume : 0

        if (resets[i]) {
          sumPv = volume > 0 ? price * volume : 0
          sumVol = volume > 0 ? volume : 0
          sumPv2 = volume > 0 ? price * price * volume : 0
        } else if (volume > 0) {
          sumPv += price * volume
          sumVol += volume
          sumPv2 += price * price * volume
        }

        // With no volume anywhere the Pine function falls back to the raw
        // source and a zero deviation, which collapses the bands onto it.
        const value = sumVol > 0 ? sumPv / sumVol : src[i]
        if (!Number.isFinite(value)) continue
        const variance = sumVol > 0 ? sumPv2 / sumVol - value * value : 0
        const stddev = Math.sqrt(Math.max(0, variance))

        vwap[i] = value
        upper[i] = value + numDevs * stddev
        lower[i] = value - numDevs * stddev
      }

      return { vwap: nulls(vwap), upper: nulls(upper), lower: nulls(lower) }
    },
  })
}
