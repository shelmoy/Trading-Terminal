/**
 * leap_years - ported to openalgo-charts from Pine Script v3.
 *
 * Source: https://github.com/everget/tradingview-pinescript-indicators/blob/60c93d3711d222b8f2db96160defe568429348e0/highlighters/leap_years.pine
 * Repo:   everget/tradingview-pinescript-indicators
 * License: GPL-3.0 (c) 2019-present, Alex Orekhov (everget)
 * SPDX-FileCopyrightText: (c) 2018-present Alex Orekhov (everget)
 * SPDX-FileCopyrightText: (c) 2026 marketcalls (port to openalgo-charts)
 * SPDX-License-Identifier: GPL-3.0-only
 *
 * Shades every bar that falls in a leap year by the Gregorian rule (divisible
 * by 4, except centuries that are not divisible by 400) and labels the first
 * bar of each leap year, so the extra February day is visible on the chart
 * rather than something to work out from the axis.
 */

export default function ({
  registerIndicator,
  nulls,
  withAlpha,
  utcSecondsToZonedParts,
  isValidTimezone,
  DEFAULT_TIMEZONE,
}) {
  const LABEL_COLOR = '#1e90ff'
  const BG_COLOR = '#ffa726'
  const LABEL_TEXT = 'Leap\nYear'

  /** The nested Pine branch, written as the Gregorian rule it encodes. */
  const isLeapYear = (year) => {
    if (year % 4 !== 0) return false
    if (year % 100 !== 0) return true
    return year % 400 === 0
  }

  registerIndicator({
    id: 'oa-leap-years',
    name: 'Leap Years',
    category: 'Highlighters',
    placement: 'onchart',

    inputs: [
      {
        key: 'transparency',
        type: 'number',
        label: 'Transparency',
        default: 88,
        min: 0,
        max: 100,
        step: 1,
        tooltip: 'Matches the Pine transp argument: 0 is solid, 100 is invisible.',
      },
      { key: 'showLabels', type: 'boolean', label: 'Show Labels ?', default: true },
      {
        key: 'timezone',
        type: 'text',
        label: 'Timezone',
        default: DEFAULT_TIMEZONE,
        tooltip: 'The clock the calendar year is read on. Pine reads the exchange clock.',
      },
    ],

    // Nothing is plotted: the study is a shaded band plus a label. The flags are
    // still columns because background() and markers() are handed values and
    // never store.
    plots: [{ key: 'leap', type: 'line', title: 'Leap Year', style: { visible: false } }],

    calc(bars, settings) {
      const raw = String(settings.timezone ?? '').trim() || DEFAULT_TIMEZONE
      // A cleared or mistyped zone falls back to the chart default rather than
      // to the viewer's own clock, which would move the shading from one
      // machine to the next.
      const zone = isValidTimezone(raw) ? raw : DEFAULT_TIMEZONE

      const n = bars.length
      const leap = new Array(n).fill(NaN)
      const leapStart = new Array(n).fill(NaN)

      let prevYear = null

      for (let i = 0; i < n; i++) {
        const t = bars[i].time
        if (!Number.isFinite(t)) {
          prevYear = null
          continue
        }
        const parts = utcSecondsToZonedParts(t, zone)
        if (!parts || !Number.isFinite(parts.year)) {
          prevYear = null
          continue
        }
        const year = parts.year
        const inLeap = isLeapYear(year)
        leap[i] = inLeap ? 1 : 0
        // Pine: year != year[1] and isLeap. On the first bar year[1] is na, the
        // comparison is false, and no label is drawn.
        leapStart[i] = prevYear != null && year !== prevYear && inLeap ? 1 : 0
        prevYear = year
      }

      return { leap: nulls(leap), leapStart: nulls(leapStart) }
    },

    background({ bars, values, settings }) {
      // Transparency 0 is a legal setting (a solid band), so a plain `|| 88`
      // fallback would silently rewrite it. A cleared field arrives as '' and
      // Number('') is 0, which would paint the candles over completely, so the
      // cleared and unusable cases fall back to the default explicitly.
      const rawTransp = settings.transparency
      const parsedTransp = rawTransp === '' || rawTransp == null ? 88 : Number(rawTransp)
      const transparency = Number.isFinite(parsedTransp) ? Math.min(100, Math.max(0, parsedTransp)) : 88
      const opacity = (100 - transparency) / 100
      const shade = withAlpha(BG_COLOR, opacity)
      // Outside a leap year the source paints a fully transparent white, which
      // is the same as leaving the bar alone.
      return bars.map((_, i) => (values.leap[i] === 1 ? shade : null))
    },

    markers({ bars, values, settings }) {
      if (settings.showLabels === false) return []
      if (bars.length === 0) return []

      // aboveBar and belowBar anchor to this indicator's own (hidden) line, so
      // the label is placed at an explicit price below the candle instead, with
      // padding scaled to the instrument.
      let rangeSum = 0
      let rangeCount = 0
      let lastClose = 0
      for (let i = 0; i < bars.length; i++) {
        const bar = bars[i]
        if (Number.isFinite(bar.high) && Number.isFinite(bar.low)) {
          rangeSum += bar.high - bar.low
          rangeCount += 1
        }
        if (Number.isFinite(bar.close)) lastClose = bar.close
      }
      const meanRange = rangeCount > 0 ? rangeSum / rangeCount : 0
      const pad = Math.max(meanRange * 0.5, Math.abs(lastClose) * 0.0005, Number.EPSILON)

      const out = []
      const starts = values.leapStart || []
      for (let i = 0; i < bars.length; i++) {
        if (starts[i] !== 1) continue
        const low = bars[i].low
        if (!Number.isFinite(low)) continue
        out.push({
          time: bars[i].time,
          position: 'atPrice',
          price: low - pad,
          shape: 'labelUp',
          size: 'small',
          color: LABEL_COLOR,
          text: LABEL_TEXT,
        })
      }
      return out
    },
  })
}
