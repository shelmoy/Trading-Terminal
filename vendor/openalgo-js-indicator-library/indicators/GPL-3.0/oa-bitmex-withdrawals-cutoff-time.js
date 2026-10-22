/**
 * BitMEX Withdrawals Cutoff Time - ported to openalgo-charts from Pine Script v3.
 *
 * Source: https://github.com/everget/tradingview-pinescript-indicators/blob/60c93d3711d222b8f2db96160defe568429348e0/highlighters/bitmex_withdrawals_cutoff_time.pine
 * Repo:   everget/tradingview-pinescript-indicators
 * License: GPL-3.0 (c) 2019-present, Alex Orekhov (everget)
 * SPDX-FileCopyrightText: (c) 2018-present Alex Orekhov (everget)
 * SPDX-FileCopyrightText: (c) 2026 marketcalls (port to openalgo-charts)
 * SPDX-License-Identifier: GPL-3.0-only
 *
 * Shades every bar that falls in the 13:00 hour, the daily window in which
 * BitMEX processes withdrawals, so the flow around the cutoff is visible on the
 * chart rather than something to work out from the axis.
 */

export default function ({ registerIndicator, nulls, withAlpha, utcSecondsToZonedParts, isValidTimezone }) {
  /** The source hard-codes the cutoff at hour 13 of the exchange clock. */
  const CUTOFF_HOUR = 13
  const CUTOFF_COLOR = '#f57f17'

  registerIndicator({
    id: 'oa-bitmex-withdrawals-cutoff-time',
    name: 'BitMEX Withdrawals Cutoff Time',
    category: 'Highlighters',
    placement: 'onchart',

    inputs: [
      {
        key: 'transparency',
        type: 'number',
        label: 'Transparency',
        default: 70,
        min: 0,
        max: 100,
        step: 1,
        tooltip: 'Matches the Pine transp argument: 0 is solid, 100 is invisible.',
      },
      {
        key: 'timezone',
        type: 'text',
        label: 'Timezone',
        default: 'UTC',
        tooltip: 'The clock the cutoff hour is read on. BitMEX publishes the cutoff in UTC.',
      },
    ],

    // Nothing is plotted: the study is a shaded band. The flag is still a column
    // because background() is handed values and never store.
    plots: [
      { key: 'cutoff', type: 'line', title: 'Cutoff Hour', style: { visible: false } },
    ],

    calc(bars, settings) {
      const raw = String(settings.timezone ?? '').trim() || 'UTC'
      // A cleared or mistyped zone falls back to UTC rather than to the viewer's
      // own clock, which would move the band from one machine to the next.
      const zone = isValidTimezone(raw) ? raw : 'UTC'
      const n = bars.length
      const out = new Array(n).fill(NaN)

      for (let i = 0; i < n; i++) {
        const t = bars[i].time
        if (!Number.isFinite(t)) continue
        const parts = utcSecondsToZonedParts(t, zone)
        if (!parts || !Number.isFinite(parts.hour)) continue
        out[i] = parts.hour === CUTOFF_HOUR ? 1 : 0
      }

      return { cutoff: nulls(out) }
    },

    background({ bars, values, settings }) {
      const rawTransp = Number(settings.transparency)
      const transparency = Number.isFinite(rawTransp) ? Math.min(100, Math.max(0, rawTransp)) : 70
      const opacity = (100 - transparency) / 100
      const shade = withAlpha(CUTOFF_COLOR, opacity)
      // Outside the cutoff hour the source paints a fully transparent white,
      // which is the same as leaving the bar alone.
      return bars.map((_, i) => (values.cutoff[i] === 1 ? shade : null))
    },
  })
}
