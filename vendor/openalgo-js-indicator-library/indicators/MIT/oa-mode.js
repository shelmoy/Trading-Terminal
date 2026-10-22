/**
 * Mode - ported to openalgo-charts from Pine Script v6.
 *
 * Source: https://github.com/mihakralj/pinescript/blob/c4e91b962be09733d8fc76caa5191e9e586c5cee/indicators/statistics/mode.pine
 * Repo:   mihakralj/pinescript
 * License: MIT (c) mihakralj
 * SPDX-FileCopyrightText: (c) mihakralj
 * SPDX-FileCopyrightText: (c) 2026 marketcalls (port to openalgo-charts)
 * SPDX-License-Identifier: MIT
 *
 * The most frequently repeated value in the lookback window. It plots nothing
 * while every value in the window is distinct, so it marks the prices an
 * instrument keeps returning to.
 */

export default function ({ registerIndicator, sourceValues, nulls }) {
  registerIndicator({
    id: 'oa-mode',
    name: 'Mode',
    category: 'Statistics',
    placement: 'pane',

    inputs: [
      { key: 'source', type: 'source', label: 'Source', default: 'close' },
      { key: 'length', type: 'number', label: 'Period', default: 14, min: 1, max: 5000, step: 1 },
    ],

    plots: [{ key: 'mode', type: 'line', title: 'Mode', style: { color: '#ffeb3b', lineWidth: 2 } }],

    calc(bars, settings) {
      // A cleared number field arrives as '', and Number('') is 0.
      const length = Math.max(1, Math.floor(Number(settings.length) || 14))
      const src = sourceValues(bars, settings.source ?? 'close')

      const out = new Array(bars.length).fill(NaN)

      for (let i = 0; i < bars.length; i++) {
        // Pine clamps the window to the history that exists, so early bars use
        // however many bars they have rather than going na.
        const lookback = Math.min(length, i + 1)

        // A Map keeps insertion order, which is what decides the winner on a tie:
        // Pine walks map.keys() and only replaces the leader on a strictly
        // greater count, and keys are inserted walking backwards from this bar.
        const counts = new Map()
        for (let j = 0; j < lookback; j++) {
          const val = src[i - j]
          if (!Number.isFinite(val)) continue
          counts.set(val, (counts.get(val) ?? 0) + 1)
        }

        if (counts.size === 0) continue

        let modeVal = NaN
        let maxFreq = 0
        for (const [key, freq] of counts) {
          if (freq > maxFreq) {
            maxFreq = freq
            modeVal = key
          }
        }
        // Every value distinct means there is no mode at all.
        if (maxFreq <= 1 && counts.size > 1) modeVal = NaN

        out[i] = modeVal
      }

      return { mode: nulls(out) }
    },
  })
}
