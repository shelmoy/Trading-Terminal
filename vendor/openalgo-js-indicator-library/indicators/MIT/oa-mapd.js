/**
 * Mean Absolute %Deviation (MAPD) - ported to openalgo-charts from Pine Script v6.
 *
 * Source: https://github.com/mihakralj/pinescript/blob/c4e91b962be09733d8fc76caa5191e9e586c5cee/indicators/errors/mapd.pine
 * Repo:   mihakralj/pinescript
 * License: MIT (c) mihakralj
 * SPDX-FileCopyrightText: (c) mihakralj
 * SPDX-FileCopyrightText: (c) 2026 marketcalls (port to openalgo-charts)
 * SPDX-License-Identifier: MIT
 *
 * How far price sits from its own EMA, expressed as a percentage of the EMA and
 * averaged over the lookback, so the reading says how wide the typical
 * departure has been rather than which side of the average price is on.
 */

export default function ({ registerIndicator, sourceValues, smaSeededEma, nulls }) {
  // Pine's ta.ema is seeded from the SMA of the first `period` values and is na
  // for the period-1 bars before that. smaSeededEma reproduces that, but is not
  // NaN tolerant, so a leading gap in the input is skipped and realigned.
  const pineEma = (values, period) => {
    const out = new Array(values.length).fill(NaN)
    let start = 0
    while (start < values.length && !Number.isFinite(values[start])) start += 1
    if (start >= values.length) return out
    const seeded = smaSeededEma(values.slice(start), period)
    for (let i = 0; i < seeded.length; i += 1) out[start + i] = seeded[i]
    return out
  }

  registerIndicator({
    id: 'oa-mapd',
    name: 'Mean Absolute %Deviation (MAPD)',
    category: 'Errors',
    // The Pine indicator() call omits overlay, so the study owns a pane and only
    // the EMA reference line is pushed onto price with force_overlay.
    placement: 'pane',

    inputs: [
      { key: 'source', type: 'source', label: 'Source', default: 'close' },
      {
        key: 'period',
        type: 'number',
        label: 'Period',
        default: 100,
        min: 1,
        max: 5000,
        step: 1,
        tooltip: 'Lookback for the reference EMA and for averaging the error. The averaging window is capped at 4000 bars.',
      },
    ],

    plots: [
      { key: 'mapd', type: 'area', title: 'MAPD', style: { color: '#ff525266', lineWidth: 2 } },
      { key: 'ema', type: 'line', title: 'EMA', style: { color: '#ffeb3b', lineWidth: 1 }, overlay: true },
    ],

    calc(bars, settings) {
      // A cleared number field arrives as '', and Number('') is 0.
      const period = Math.max(1, Math.floor(Number(settings.period) || 100))
      const src = sourceValues(bars, settings.source ?? 'close')

      const reference = pineEma(src, period)

      // Pine clamps the averaging buffer to 4000 slots while the EMA keeps the
      // full period.
      const p = Math.min(period, 4000)

      const out = new Array(bars.length).fill(NaN)
      const buffer = new Array(p).fill(NaN)
      let head = 0
      let sum = 0
      let validCount = 0

      for (let i = 0; i < bars.length; i += 1) {
        const s1 = src[i]
        const s2 = reference[i]
        // Warmup and a zero reference both leave the error unavailable rather
        // than producing an infinity.
        const error =
          Number.isFinite(s1) && Number.isFinite(s2) && s2 !== 0
            ? 100 * Math.abs((s1 - s2) / s2)
            : NaN

        const oldest = buffer[head]
        if (Number.isFinite(oldest)) {
          sum -= oldest
          validCount -= 1
        }
        if (Number.isFinite(error)) {
          sum += error
          validCount += 1
        }
        buffer[head] = error
        head = (head + 1) % p

        out[i] = validCount > 0 ? sum / validCount : error
      }

      return { mapd: nulls(out), ema: nulls(reference) }
    },
  })
}
