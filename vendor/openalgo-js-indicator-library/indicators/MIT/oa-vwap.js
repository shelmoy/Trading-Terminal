/**
 * Volume Weighted Average Price (VWAP) - ported to openalgo-charts from Pine
 * Script v6.
 *
 * Source: https://github.com/mihakralj/pinescript/blob/c4e91b962be09733d8fc76caa5191e9e586c5cee/indicators/volume/vwap.pine
 * Repo:   mihakralj/pinescript
 * License: MIT (c) mihakralj
 * SPDX-FileCopyrightText: (c) mihakralj
 * SPDX-FileCopyrightText: (c) 2026 marketcalls (port to openalgo-charts)
 * SPDX-License-Identifier: MIT
 *
 * The average price paid since the chosen period began, each bar weighted by
 * its volume, so it tracks where the traded value actually sits rather than
 * where the price has been.
 */

export default function ({
  registerIndicator,
  sourceValues,
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
  nulls,
}) {
  // The intraday reset choices, as bucket lengths in seconds.
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

  const SESSION_OPTIONS = [
    '1m', '2m', '3m', '5m', '10m', '15m', '30m', '45m',
    '1H', '2H', '3H', '4H',
    '1D', '1W', '1M', '3M', '6M', '12M', 'Never',
  ]

  /**
   * Per-bar reset flags, the port of `ta.change(time(tf)) != 0`.
   *
   * Calendar periods go through calendarPeriodFlags so a session straddling a
   * boundary is not cut in half. Intraday buckets are measured from the session
   * open, which is where an exchange's own higher timeframe bars start, so a
   * 45-minute reset lands on the session grid rather than on clock time.
   */
  const resetFlags = (times, mode, zone) => {
    const n = times.length
    const flags = new Array(n).fill(false)
    if (mode === 'Never') return flags

    const bucketSeconds = INTRADAY_SECONDS[mode]
    if (bucketSeconds) {
      const sessionStart = sessionStartFlags(times, zone)
      let anchor = Number.isFinite(times[0]) ? times[0] : 0
      let bucket = 0
      for (let i = 1; i < n; i++) {
        const t = times[i]
        if (!Number.isFinite(t)) continue
        if (sessionStart[i]) {
          anchor = t
          bucket = 0
          flags[i] = true
          continue
        }
        const b = Math.floor((t - anchor) / bucketSeconds)
        if (b !== bucket) {
          bucket = b
          flags[i] = true
        }
      }
      return flags
    }

    let isNew
    switch (mode) {
      case '1W': isNew = (p, t) => isNewZonedWeek(p, t, zone); break
      case '1M': isNew = (p, t) => isNewZonedMonth(p, t, zone); break
      case '3M': isNew = (p, t) => isNewZonedQuarter(p, t, zone); break
      case '6M':
        // No half-year helper: months 1 to 6 are the first half, 7 to 12 the second.
        isNew = (p, t) => {
          const a = utcSecondsToZonedParts(p, zone)
          const b = utcSecondsToZonedParts(t, zone)
          return a.year !== b.year || (a.month > 6) !== (b.month > 6)
        }
        break
      case '12M': isNew = (p, t) => isNewZonedYear(p, t, zone); break
      default: isNew = (p, t) => isNewZonedDay(p, t, zone)
    }
    return calendarPeriodFlags(times, isNew)
  }

  registerIndicator({
    id: 'oa-vwap',
    name: 'Volume Weighted Average Price (VWAP)',
    category: 'Volume',
    placement: 'onchart',

    inputs: [
      { key: 'source', type: 'source', label: 'Source', default: 'hlc3' },
      {
        key: 'sessionType',
        type: 'select',
        label: 'Session Reset',
        default: '1D',
        options: SESSION_OPTIONS.map((value) => ({ label: value, value })),
      },
    ],

    plots: [{ key: 'vwap', type: 'line', title: 'VWAP', style: { color: '#ffeb3b', lineWidth: 2 } }],

    calc(bars, settings, store, ctx) {
      const n = bars.length
      const src = sourceValues(bars, settings.source ?? 'hlc3')

      // A cleared select arrives as '', which is no option at all: fall back to
      // the default rather than to the source's catch-all of never resetting.
      const raw = settings.sessionType
      const mode = SESSION_OPTIONS.includes(raw) ? raw : '1D'

      const hostZone = ctx?.timezone
      const zone =
        typeof hostZone === 'string' && isValidTimezone(hostZone) ? hostZone : DEFAULT_TIMEZONE

      const times = new Array(n)
      for (let i = 0; i < n; i++) times[i] = bars[i].time
      const resets = n > 0 ? resetFlags(times, mode, zone) : []

      const out = new Array(n).fill(NaN)
      let sumPv = 0
      let sumVol = 0

      for (let i = 0; i < n; i++) {
        const price = Number.isFinite(src[i]) ? src[i] : 0
        // An index carries no volume at all, so this can legitimately be 0.
        const vol = Number.isFinite(bars[i].volume) ? bars[i].volume : 0

        if (resets[i]) {
          sumPv = vol > 0 ? price * vol : 0
          sumVol = vol > 0 ? vol : 0
        } else if (vol > 0) {
          sumPv += price * vol
          sumVol += vol
        }

        // With no traded volume yet the source falls back to the raw source.
        out[i] = sumVol > 0 ? sumPv / sumVol : Number.isFinite(src[i]) ? src[i] : NaN
      }

      return { vwap: nulls(out) }
    },
  })
}
