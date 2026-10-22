/**
 * weekdays_gaps - ported to openalgo-charts from Pine Script v4.
 *
 * Source: https://github.com/everget/tradingview-pinescript-indicators/blob/60c93d3711d222b8f2db96160defe568429348e0/highlighters/weekdays_gaps.pine
 * Repo:   everget/tradingview-pinescript-indicators
 * License: GPL-3.0 (c) 2019-present Alex Orekhov (everget)
 * SPDX-FileCopyrightText: (c) 2018-present Alex Orekhov (everget)
 * SPDX-FileCopyrightText: (c) 2026 marketcalls (port to openalgo-charts)
 * SPDX-License-Identifier: GPL-3.0-only
 *
 * Shades every bar whose previous bar is not on the immediately preceding
 * weekday, which marks weekends, holidays and any other missing session. The
 * source compares only the weekday, so on an intraday chart the bars inside a
 * day are flagged too; that behaviour is kept as written.
 */

export default function ({
  registerIndicator,
  utcSecondsToZonedParts,
  isValidTimezone,
  DEFAULT_TIMEZONE,
  withAlpha,
  nulls,
}) {
  // color.new(#ffcc80, 70) is 30 percent opaque.
  const GAP_COLOR = withAlpha('#ffcc80', 0.3)

  const pickZone = (candidate) => {
    if (typeof candidate !== 'string') return null
    const zone = candidate.trim()
    if (zone === '') return null
    return isValidTimezone(zone) ? zone : null
  }

  registerIndicator({
    id: 'oa-weekdays-gaps',
    name: 'Weekdays Gaps',
    category: 'Highlighters',
    placement: 'onchart',

    inputs: [
      {
        key: 'timezone',
        type: 'text',
        label: 'Timezone',
        default: DEFAULT_TIMEZONE,
        tooltip: 'Exchange wall clock the weekday is read in. Bar times are UTC, so this decides which day a bar belongs to.',
      },
    ],

    plots: [
      // The flag is not worth drawing on the price pane, but background() is
      // handed values and never store, so it has to be a declared column.
      { key: 'gap', type: 'line', title: 'Gap', style: { color: '#ffcc80', visible: false } },
    ],

    calc(bars, settings, store, ctx) {
      const zone = pickZone(settings.timezone) ?? pickZone(ctx?.timezone) ?? DEFAULT_TIMEZONE
      const gap = new Array(bars.length).fill(NaN)

      // The source spells out all seven weekdays; every branch says the same
      // thing, that yesterday's bar is not on the calendar day before this one.
      // weekday here is 0 for Sunday through 6 for Saturday.
      for (let i = 1; i < bars.length; i++) {
        const today = utcSecondsToZonedParts(bars[i].time, zone)?.weekday
        const yesterday = utcSecondsToZonedParts(bars[i - 1].time, zone)?.weekday
        if (!Number.isFinite(today) || !Number.isFinite(yesterday)) continue
        gap[i] = yesterday === (today + 6) % 7 ? 0 : 1
      }

      return { gap: nulls(gap) }
    },

    background({ bars, values }) {
      // The source paints a fully transparent colour on the other bars, which is
      // null here: it leaves the bar alone rather than washing it invisibly.
      return bars.map((_, i) => (values.gap[i] === 1 ? GAP_COLOR : null))
    },
  })
}
