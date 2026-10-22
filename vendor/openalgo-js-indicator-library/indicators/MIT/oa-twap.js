/**
 * Time Weighted Average Price (TWAP) - ported to openalgo-charts from Pine Script v6.
 *
 * Source: https://github.com/mihakralj/pinescript/blob/c4e91b962be09733d8fc76caa5191e9e586c5cee/indicators/volume/twap.pine
 * Repo:   mihakralj/pinescript
 * License: MIT (c) mihakralj
 * SPDX-FileCopyrightText: (c) mihakralj
 * SPDX-FileCopyrightText: (c) 2026 marketcalls (port to openalgo-charts)
 * SPDX-License-Identifier: MIT
 *
 * The running mean of the source since the chosen period began, so every bar
 * counts once regardless of how much traded in it, which is what separates it
 * from VWAP.
 */

export default function ({
  registerIndicator,
  sourceValues,
  nulls,
  sessionStartFlags,
  calendarPeriodFlags,
  isNewZonedDay,
  isNewZonedWeek,
  isNewZonedMonth,
  isNewZonedQuarter,
  isNewZonedYear,
  utcSecondsToZonedParts,
  isValidTimezone,
  DEFAULT_TIMEZONE,
}) {
  // The intraday reset choices, in seconds. Pine asks for time(tf), whose
  // buckets run from the session open, so these are measured from there too.
  const INTRADAY_SECONDS = {
    '1m': 60,
    '2m': 120,
    '3m': 180,
    '5m': 300,
    '10m': 600,
    '15m': 900,
    '30m': 1800,
    '45m': 2700,
    '1H': 3600,
    '2H': 7200,
    '3H': 10800,
    '4H': 14400,
  }

  const RESET_CHOICES = new Set([
    '1m', '2m', '3m', '5m', '10m', '15m', '30m', '45m',
    '1H', '2H', '3H', '4H',
    '1D', '1W', '1M', '3M', '6M', '12M', 'Never',
  ])

  const resetFlags = (times, sessionType, zone) => {
    const n = times.length
    const flags = new Array(n).fill(false)
    if (n === 0) return flags

    if (sessionType === 'Never') {
      // Pine resets only at bar_index == 0, which is a no-op on an empty running sum.
      flags[0] = true
      return flags
    }

    const bucketSeconds = INTRADAY_SECONDS[sessionType]
    if (bucketSeconds) {
      const sessionStarts = sessionStartFlags(times, zone)
      let sessionStart = times[0]
      let prevBucket = null
      for (let i = 0; i < n; i++) {
        if (sessionStarts[i]) {
          sessionStart = times[i]
          prevBucket = null
        }
        const bucket = Math.floor((times[i] - sessionStart) / bucketSeconds)
        if (prevBucket === null || bucket !== prevBucket) {
          flags[i] = true
          prevBucket = bucket
        }
      }
      return flags
    }

    let isNew = null
    if (sessionType === '1D') isNew = (a, b) => isNewZonedDay(a, b, zone)
    else if (sessionType === '1W') isNew = (a, b) => isNewZonedWeek(a, b, zone)
    else if (sessionType === '1M') isNew = (a, b) => isNewZonedMonth(a, b, zone)
    else if (sessionType === '3M') isNew = (a, b) => isNewZonedQuarter(a, b, zone)
    else if (sessionType === '12M') isNew = (a, b) => isNewZonedYear(a, b, zone)
    else if (sessionType === '6M') {
      // Pine's time("6M") buckets half-years from January, which no exported
      // boundary test covers, so compare the half directly.
      isNew = (a, b) => {
        const prev = utcSecondsToZonedParts(a, zone)
        const cur = utcSecondsToZonedParts(b, zone)
        return prev.year !== cur.year || Math.floor((prev.month - 1) / 6) !== Math.floor((cur.month - 1) / 6)
      }
    }

    if (!isNew) return flags
    return calendarPeriodFlags(times, isNew)
  }

  registerIndicator({
    id: 'oa-twap',
    name: 'Time Weighted Average Price (TWAP)',
    category: 'Volume',
    placement: 'onchart',

    inputs: [
      { key: 'source', type: 'source', label: 'Source', default: 'ohlc4' },
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
    ],

    plots: [{ key: 'twap', type: 'line', title: 'TWAP', style: { color: '#ffeb3b', lineWidth: 2 } }],

    calc(bars, settings, store, ctx) {
      const n = bars.length
      const out = new Array(n).fill(NaN)
      if (n === 0) return { twap: nulls(out) }

      const src = sourceValues(bars, settings.source ?? 'ohlc4')
      // A cleared or unknown select value falls back to the Pine default.
      const chosen = settings.sessionType
      const sessionType = RESET_CHOICES.has(chosen) ? chosen : '1D'

      const zoneCandidate = ctx?.timezone ?? DEFAULT_TIMEZONE
      const zone = typeof zoneCandidate === 'string' && isValidTimezone(zoneCandidate) ? zoneCandidate : DEFAULT_TIMEZONE

      const times = bars.map((b) => b.time)
      const flags = resetFlags(times, sessionType, zone)

      let sum = 0
      let count = 0
      for (let i = 0; i < n; i++) {
        // Pine reads the source through nz(), so a missing value counts as zero
        // rather than poisoning the running mean.
        const price = Number.isFinite(src[i]) ? src[i] : 0
        if (flags[i]) {
          sum = 0
          count = 0
        }
        sum += price
        count += 1
        out[i] = sum / count
      }

      return { twap: nulls(out) }
    },
  })
}
