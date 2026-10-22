/**
 * Intraday Intensity Index (III) - ported to openalgo-charts from Pine Script v6.
 *
 * Source: https://github.com/mihakralj/pinescript/blob/c4e91b962be09733d8fc76caa5191e9e586c5cee/indicators/volume/iii.pine
 * Repo:   mihakralj/pinescript
 * License: MIT (c) mihakralj
 * SPDX-FileCopyrightText: (c) mihakralj
 * SPDX-FileCopyrightText: (c) 2026 marketcalls (port to openalgo-charts)
 * SPDX-License-Identifier: MIT
 *
 * Volume signed by where the close sits inside the bar's range: full weight
 * when the bar closes on its high or low, nothing when it closes mid-range.
 * Either smoothed over a window or accumulated into a running total.
 */

export default function ({ registerIndicator, nulls }) {
  registerIndicator({
    id: 'oa-iii',
    name: 'Intraday Intensity Index (III)',
    category: 'Volume',
    placement: 'pane',

    inputs: [
      {
        key: 'period',
        type: 'number',
        label: 'Period',
        default: 14,
        min: 1,
        max: 100,
        step: 1,
        tooltip: 'Smoothing period for the intensity index.',
      },
      {
        key: 'cumulative',
        type: 'boolean',
        label: 'Cumulative Mode',
        default: false,
        tooltip: 'Accumulate intensity values for trend analysis.',
      },
    ],

    plots: [{ key: 'iii', type: 'line', title: 'III', style: { color: '#ffeb3b', lineWidth: 2 } }],

    calc(bars, settings) {
      // A cleared number field arrives as '', and Number('') is 0.
      const period = Math.max(1, Math.min(100, Math.floor(Number(settings.period) || 14)))
      const isCumulative = settings.cumulative === true

      const out = new Array(bars.length).fill(NaN)
      // The Pine circular buffer: entries start na, so nothing is subtracted
      // until the window has wrapped once.
      const buffer = new Array(period).fill(NaN)
      let head = 0
      let sum = 0
      let cumulativeValue = 0

      for (let i = 0; i < bars.length; i++) {
        const bar = bars[i]
        const c = Number.isFinite(bar.close) ? bar.close : 0
        // Pine's nz(h, close) / nz(l, close): a missing high or low reads as the close.
        const h = Number.isFinite(bar.high) ? bar.high : c
        const l = Number.isFinite(bar.low) ? bar.low : c
        // math.max(nz(vol, 0.0), 1.0): an index series with no volume weights as 1.
        const vol = Math.max(Number.isFinite(bar.volume) ? bar.volume : 0, 1)

        const range = h - l
        // A doji or a halted bar has zero range, which is the divide to guard.
        const positionMultiplier = range > 0 ? (2 * c - h - l) / range : 0
        const raw = positionMultiplier * vol

        const oldest = buffer[head]
        if (Number.isFinite(oldest)) sum -= oldest
        sum += raw
        buffer[head] = raw
        head = (head + 1) % period

        // Pine divides by the full period from the very first bar, so the
        // warmup values are genuine but damped rather than absent.
        const smoothed = sum / period
        cumulativeValue += raw

        out[i] = isCumulative ? cumulativeValue : smoothed
      }

      return { iii: nulls(out) }
    },
  })
}
