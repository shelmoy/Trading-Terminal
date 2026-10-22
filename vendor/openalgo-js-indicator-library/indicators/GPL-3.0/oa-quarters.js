/**
 * quarters - ported to openalgo-charts from Pine Script v3.
 *
 * Source: https://github.com/everget/tradingview-pinescript-indicators/blob/60c93d3711d222b8f2db96160defe568429348e0/highlighters/quarters.pine
 * Repo:   everget/tradingview-pinescript-indicators
 * License: GPL-3.0 (c) 2019-present, Alex Orekhov (everget)
 * SPDX-FileCopyrightText: (c) 2018-present Alex Orekhov (everget)
 * SPDX-FileCopyrightText: (c) 2026 marketcalls (port to openalgo-charts)
 * SPDX-License-Identifier: GPL-3.0-only
 *
 * Shades the chart by calendar quarter and labels the first bar of each one, so
 * seasonal behaviour and quarter-boundary effects are visible without counting
 * months off the time axis.
 */

export default function ({
  registerIndicator,
  nulls,
  withAlpha,
  utcSecondsToZonedParts,
  isValidTimezone,
  DEFAULT_TIMEZONE,
}) {
  // The source's four quarter colours, indexed 1..4.
  const QUARTER_COLORS = { 1: '#e6194b', 2: '#3cb44b', 3: '#ffe119', 4: '#f58231' }
  const LABEL_COLOR = '#1e90ff'

  registerIndicator({
    id: 'oa-quarters',
    name: 'Quarters',
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
        tooltip: 'Transparency of the quarter shading, as in the source: 0 is solid, 100 is invisible.',
      },
      { key: 'showLabels', type: 'boolean', label: 'Show Labels', default: true },
    ],

    plots: [
      // Nothing is plotted in the source: it draws a background and labels only.
      // The quarter number is carried as a hidden column because `background`
      // and `markers` are handed `values` and never `store`. The quarter-start
      // column is read by `markers` alone, so it needs no plot of its own.
      { key: 'quarter', type: 'line', title: 'Quarter', style: { visible: false } },
    ],

    calc(bars, settings, store, ctx) {
      // Bar times are UTC seconds and the source reads month(time) in exchange
      // time, so resolve the month in the chart's zone, never the browser's.
      const raw = typeof ctx?.timezone === 'string' ? ctx.timezone.trim() : ''
      const zone = raw && isValidTimezone(raw) ? raw : DEFAULT_TIMEZONE

      const n = bars.length
      const quarter = new Array(n).fill(NaN)
      const quarterStart = new Array(n).fill(NaN)

      let prevMonth = NaN
      for (let i = 0; i < n; i++) {
        const t = bars[i]?.time
        if (!Number.isFinite(t)) {
          prevMonth = NaN
          continue
        }
        const month = utcSecondsToZonedParts(t, zone).month
        if (!Number.isFinite(month)) {
          prevMonth = NaN
          continue
        }
        quarter[i] = Math.floor((month - 1) / 3) + 1

        // The source tests the exact month pair, so a quarter that opens on a
        // bar whose previous bar is not the last month of the previous quarter
        // (a gap in the data, or the first bar loaded) gets no label.
        if (
          (prevMonth === 12 && month === 1) ||
          (prevMonth === 3 && month === 4) ||
          (prevMonth === 6 && month === 7) ||
          (prevMonth === 9 && month === 10)
        ) {
          quarterStart[i] = quarter[i]
        }
        prevMonth = month
      }

      return { quarter: nulls(quarter), quarterStart: nulls(quarterStart) }
    },

    // bgcolor() per quarter, at the transparency the source takes as an input.
    background({ bars, values, settings }) {
      // A cleared number field arrives as '', which Number() reads as 0, and 0
      // transparency here means a solid block of colour over the candles. An
      // explicit 0 is a real setting though, so the empty field is tested for
      // rather than leaning on `||`, which would swallow it.
      const raw = settings.transparency
      const parsed = raw === '' || raw == null ? NaN : Number(raw)
      const transparency = Number.isFinite(parsed) ? Math.min(100, Math.max(0, parsed)) : 88
      const alpha = (100 - transparency) / 100
      return bars.map((_, i) => {
        const q = values.quarter[i]
        if (q == null || !Number.isFinite(q)) return null
        const color = QUARTER_COLORS[q]
        if (!color) return null
        // null, not a transparent colour, where there is nothing to paint.
        return alpha > 0 ? withAlpha(color, alpha) : null
      })
    },

    // plotshape(style=shape.labelup, location=location.belowbar). belowBar would
    // anchor to this indicator's own (hidden) line, so the label is placed at an
    // explicit price under the bar instead, padded relative to the instrument.
    markers({ bars, values, settings }) {
      if (settings.showLabels === false) return []
      const n = bars.length
      if (n === 0) return []

      let sumRange = 0
      let counted = 0
      for (let i = 0; i < n; i++) {
        const b = bars[i]
        if (Number.isFinite(b.high) && Number.isFinite(b.low)) {
          sumRange += b.high - b.low
          counted++
        }
      }
      const meanRange = counted > 0 ? sumRange / counted : 0
      const lastClose = Number.isFinite(bars[n - 1].close) ? bars[n - 1].close : 0
      const pad = Math.max(meanRange * 0.5, Math.abs(lastClose) * 0.0005)

      const out = []
      for (let i = 0; i < n; i++) {
        const q = values.quarterStart[i]
        if (q == null || !Number.isFinite(q)) continue
        const low = bars[i].low
        if (!Number.isFinite(low)) continue
        out.push({
          time: bars[i].time,
          position: 'atPrice',
          price: low - pad,
          shape: 'labelUp',
          size: 'small',
          color: LABEL_COLOR,
          text: `Q${q}`,
        })
      }
      return out
    },
  })
}
