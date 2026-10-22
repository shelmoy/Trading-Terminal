/**
 * VWAP Bands (VWAPBANDS) - ported to openalgo-charts from Pine Script v6.
 *
 * Source: https://github.com/mihakralj/pinescript/blob/c4e91b962be09733d8fc76caa5191e9e586c5cee/indicators/channels/vwapbands.pine
 * Repo:   mihakralj/pinescript
 * License: MIT (c) mihakralj
 * SPDX-FileCopyrightText: (c) mihakralj
 * SPDX-FileCopyrightText: (c) 2026 marketcalls (port to openalgo-charts)
 * SPDX-License-Identifier: MIT
 *
 * A volume weighted average price that restarts on a chosen period boundary,
 * with one and two standard deviation envelopes derived from the same running
 * volume weighted sums rather than from a rolling window.
 */

export default function ({
  registerIndicator,
  sourceValues,
  nulls,
  sessionStartFlags,
  calendarPeriodFlags,
  isNewZonedWeek,
  isNewZonedMonth,
  isNewZonedQuarter,
  isNewZonedYear,
  utcSecondsToZonedParts,
  isValidTimezone,
  DEFAULT_TIMEZONE,
}) {
  // Pine reaches the sub-daily resets through time("N"), whose higher timeframe
  // bars are anchored at the session open rather than at the UTC epoch. Reading
  // the session opens back out of the bar times reproduces that anchoring.
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

  const halfYearIndex = (t, zone) => {
    const p = utcSecondsToZonedParts(t, zone)
    return p.year * 2 + (p.month > 6 ? 1 : 0)
  }

  const resetFlags = (times, sessionType, zone) => {
    const n = times.length
    const flags = new Array(n).fill(false)
    if (n === 0) return flags

    // Pine's switch falls through to `=> false` for anything unrecognised, and
    // "Never" only resets on bar 0, where a reset and a fresh accumulation land
    // on identical sums. Both therefore mean "never reset".
    if (sessionType === 'Never' || !sessionType) return flags

    const toFlags = (result) =>
      Array.isArray(result) && result.length === n ? result.map((v) => v === true) : flags

    if (sessionType === '1D') return toFlags(sessionStartFlags(times, zone))
    if (sessionType === '1W') return toFlags(calendarPeriodFlags(times, (a, b) => isNewZonedWeek(a, b, zone)))
    if (sessionType === '1M') return toFlags(calendarPeriodFlags(times, (a, b) => isNewZonedMonth(a, b, zone)))
    if (sessionType === '3M') return toFlags(calendarPeriodFlags(times, (a, b) => isNewZonedQuarter(a, b, zone)))
    if (sessionType === '6M') {
      return toFlags(calendarPeriodFlags(times, (a, b) => halfYearIndex(a, zone) !== halfYearIndex(b, zone)))
    }
    if (sessionType === '12M') return toFlags(calendarPeriodFlags(times, (a, b) => isNewZonedYear(a, b, zone)))

    const minutes = INTRADAY_MINUTES[sessionType]
    if (!minutes) return flags

    const starts = toFlags(sessionStartFlags(times, zone))
    const bucketSec = minutes * 60
    let anchor = times[0]
    let prevBucket = null
    for (let i = 0; i < n; i++) {
      if (starts[i]) {
        anchor = times[i]
        prevBucket = null
      }
      const bucket = Math.floor((times[i] - anchor) / bucketSec)
      if (prevBucket === null || bucket !== prevBucket) flags[i] = true
      prevBucket = bucket
    }
    return flags
  }

  registerIndicator({
    id: 'oa-vwapbands',
    name: 'VWAP Bands (VWAPBANDS)',
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
        key: 'multiplier',
        type: 'number',
        label: 'Standard Deviation Multiplier',
        default: 1,
        min: 0.1,
        max: 100,
        step: 0.1,
      },
      { key: 'showBands2', type: 'boolean', label: 'Show 2nd Standard Deviation Bands', default: true },
    ],

    plots: [
      { key: 'vwap', type: 'line', title: 'VWAP', style: { color: '#ffeb3b', lineWidth: 2 } },
      { key: 'upper1', type: 'line', title: 'Upper Band 1 SD', style: { color: '#ffeb3b', lineWidth: 2 } },
      { key: 'lower1', type: 'line', title: 'Lower Band 1 SD', style: { color: '#ffeb3b', lineWidth: 2 } },
      { key: 'upper2', type: 'line', title: 'Upper Band 2 SD', style: { color: '#ffeb3b', lineWidth: 2 } },
      { key: 'lower2', type: 'line', title: 'Lower Band 2 SD', style: { color: '#ffeb3b', lineWidth: 2 } },
    ],

    fills: [
      { between: ['upper1', 'lower1'], colorUp: '#2196f3', colorDown: '#2196f3', opacity: 0.1 },
      { between: ['upper2', 'upper1'], colorUp: '#9c27b0', colorDown: '#9c27b0', opacity: 0.1 },
      { between: ['lower1', 'lower2'], colorUp: '#9c27b0', colorDown: '#9c27b0', opacity: 0.1 },
    ],

    calc(bars, settings, store, ctx) {
      const n = bars.length
      // A cleared number field arrives as '', and Number('') is 0.
      const multiplier = Math.max(0.1, Number(settings.multiplier) || 1)
      const showBands2 = settings.showBands2 !== false
      const src = sourceValues(bars, settings.source ?? 'hlc3')

      const requested = ctx?.timezone ?? settings.timezone
      const zone = typeof requested === 'string' && isValidTimezone(requested) ? requested : DEFAULT_TIMEZONE

      const vwap = new Array(n).fill(NaN)
      const upper1 = new Array(n).fill(NaN)
      const lower1 = new Array(n).fill(NaN)
      const upper2 = new Array(n).fill(NaN)
      const lower2 = new Array(n).fill(NaN)
      if (n === 0) return { vwap, upper1, lower1, upper2, lower2 }

      const times = bars.map((b) => b.time)
      const resets = resetFlags(times, settings.sessionType ?? '1D', zone)

      // var state carried bar to bar, exactly as the Pine function does.
      let sumPv = 0
      let sumVol = 0
      let sumPv2 = 0
      let count = 0

      for (let i = 0; i < n; i++) {
        const price = Number.isFinite(src[i]) ? src[i] : 0
        const rawVol = bars[i].volume
        const vol = Number.isFinite(rawVol) ? rawVol : 0

        if (resets[i]) {
          if (vol > 0) {
            sumPv = price * vol
            sumVol = vol
            sumPv2 = price * price * vol
            count = 1
          } else {
            sumPv = 0
            sumVol = 0
            sumPv2 = 0
            count = 0
          }
        } else if (vol > 0) {
          sumPv += price * vol
          sumVol += vol
          sumPv2 += price * price * vol
          count += 1
        }

        // With no usable volume the Pine function falls back to the raw source,
        // which is what an index series without volume produces on every bar.
        const vwapVal = sumVol > 0 ? sumPv / sumVol : src[i]
        if (!Number.isFinite(vwapVal)) continue

        let variance = 0
        if (sumVol > 0 && count > 1) {
          variance = Math.max(0, sumPv2 / sumVol - vwapVal * vwapVal)
        }
        const sd = Math.sqrt(variance)

        vwap[i] = vwapVal
        upper1[i] = vwapVal + multiplier * sd
        lower1[i] = vwapVal - multiplier * sd
        if (showBands2) {
          upper2[i] = vwapVal + 2 * multiplier * sd
          lower2[i] = vwapVal - 2 * multiplier * sd
        }
      }

      return {
        vwap: nulls(vwap),
        upper1: nulls(upper1),
        lower1: nulls(lower1),
        upper2: nulls(upper2),
        lower2: nulls(lower2),
      }
    },
  })
}
