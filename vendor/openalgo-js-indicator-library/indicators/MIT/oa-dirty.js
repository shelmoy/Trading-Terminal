/**
 * Dirty Data Injection (DIRTY) - ported to openalgo-charts from Pine Script v6.
 *
 * Source: https://github.com/mihakralj/pinescript/blob/c4e91b962be09733d8fc76caa5191e9e586c5cee/indicators/errors/dirty.pine
 * Repo:   mihakralj/pinescript
 * License: MIT (c) mihakralj
 * SPDX-FileCopyrightText: (c) mihakralj
 * SPDX-FileCopyrightText: (c) 2026 marketcalls (port to openalgo-charts)
 * SPDX-License-Identifier: MIT
 *
 * A test harness rather than a study: it echoes the source series but blanks it
 * for the first bars of every cycle, so other indicators can be checked against
 * a series full of gaps.
 */

export default function ({ registerIndicator, sourceValues, nulls }) {
  registerIndicator({
    id: 'oa-dirty',
    name: 'Dirty Data Injection (DIRTY)',
    category: 'Errors',
    placement: 'pane',

    inputs: [
      { key: 'source', type: 'source', label: 'Source', default: 'close' },
      {
        key: 'interval',
        type: 'number',
        label: 'NA Injection Interval',
        default: 10,
        min: 2,
        max: 5000,
        step: 1,
        tooltip: 'Length of one cycle. The gap is injected at the start of every cycle.',
      },
      {
        key: 'gapSize',
        type: 'number',
        label: 'NA Gap Size',
        default: 5,
        min: 1,
        max: 5000,
        step: 1,
        tooltip: 'How many bars at the start of each cycle are blanked.',
      },
    ],

    plots: [
      {
        key: 'dirty',
        type: 'line',
        title: 'Dirty Data',
        // Pine declares format=format.percent on the indicator.
        priceFormat: { type: 'percent' },
        style: { color: '#ffeb3b', lineWidth: 2 },
      },
    ],

    calc(bars, settings) {
      // A cleared number field arrives as '', and Number('') is 0.
      const interval = Math.max(2, Math.floor(Number(settings.interval) || 10))
      const gapSize = Math.max(1, Math.floor(Number(settings.gapSize) || 5))
      const src = sourceValues(bars, settings.source ?? 'close')

      const out = new Array(bars.length).fill(NaN)
      for (let i = 0; i < bars.length; i++) {
        // bar_index == 0 is always blanked, then the first gapSize bars of
        // every interval-long cycle.
        if (i === 0) continue
        if (i % interval < gapSize) continue
        if (!Number.isFinite(src[i])) continue
        out[i] = src[i]
      }

      return { dirty: nulls(out) }
    },
  })
}
