/**
 * Kairi Relative Index (KRI) - ported to openalgo-charts from Pine Script v6.
 *
 * Source: https://github.com/mihakralj/pinescript/blob/c4e91b962be09733d8fc76caa5191e9e586c5cee/indicators/oscillators/kri.pine
 * Repo:   mihakralj/pinescript
 * License: MIT (c) mihakralj
 * SPDX-FileCopyrightText: (c) mihakralj
 * SPDX-FileCopyrightText: (c) 2026 marketcalls (port to openalgo-charts)
 * SPDX-License-Identifier: MIT
 *
 * The percentage distance of the source from its own simple moving average, so
 * the zero line is the average itself and the extremes mark how stretched price
 * has become away from it.
 */

export default function ({ registerIndicator, sourceValues, nulls }) {
  registerIndicator({
    id: 'oa-kri',
    name: 'Kairi Relative Index (KRI)',
    category: 'Oscillators',
    placement: 'pane',

    inputs: [
      { key: 'source', type: 'source', label: 'Source', default: 'close' },
      {
        key: 'period',
        type: 'number',
        label: 'Period',
        default: 14,
        min: 1,
        max: 5000,
        step: 1,
        tooltip: 'SMA lookback period.',
      },
    ],

    plots: [{ key: 'kri', type: 'line', title: 'KRI', style: { color: '#ffeb3b', lineWidth: 2 } }],

    levels: () => [{ price: 0, title: 'Zero', color: '#787b86', dashed: true }],

    calc(bars, settings) {
      // A cleared number field arrives as '', and Number('') is 0.
      const period = Math.max(1, Math.min(5000, Math.floor(Number(settings.period) || 14)))
      const src = sourceValues(bars, settings.source ?? 'close')

      // Pine's circular buffer: the running sum drops the slot about to be
      // overwritten, and count only grows while the buffer still holds na, so
      // the average is over however many samples have arrived so far.
      const buffer = new Array(period).fill(NaN)
      let head = 0
      let sum = 0
      let count = 0

      const out = new Array(bars.length).fill(NaN)
      for (let i = 0; i < bars.length; i++) {
        const oldest = buffer[head]
        if (Number.isFinite(oldest)) sum -= oldest
        else count += 1

        // Pine: nz(source) - a missing sample enters the window as 0.
        const current = Number.isFinite(src[i]) ? src[i] : 0
        sum += current
        buffer[head] = current
        head = (head + 1) % period

        const mean = sum / Math.max(1, count)
        out[i] = mean !== 0 ? (100 * (current - mean)) / mean : 0
      }

      return { kri: nulls(out) }
    },
  })
}
