/**
 * Swing High/Low Detection - ported to openalgo-charts from Pine Script v6.
 *
 * Source: https://github.com/mihakralj/pinescript/blob/c4e91b962be09733d8fc76caa5191e9e586c5cee/indicators/reversals/swings.pine
 * Repo:   mihakralj/pinescript
 * License: MIT (c) mihakralj
 * SPDX-FileCopyrightText: (c) mihakralj
 * SPDX-FileCopyrightText: (c) 2026 marketcalls (port to openalgo-charts)
 * SPDX-License-Identifier: MIT
 *
 * Confirms a swing point only once the lookback window on both sides has
 * closed, then holds that level forward as a flat line until the next swing
 * replaces it, giving the most recent confirmed high and low as running levels.
 */

export default function ({ registerIndicator, sourceValues, nulls }) {
  registerIndicator({
    id: 'oa-swings',
    name: 'Swing High/Low Detection',
    category: 'Reversals',
    placement: 'onchart',

    inputs: [
      {
        key: 'lookback',
        type: 'number',
        label: 'Lookback Period',
        default: 5,
        min: 1,
        max: 100,
        step: 1,
        tooltip: 'Number of bars on each side to confirm swing point.',
      },
      {
        key: 'sourceHigh',
        type: 'source',
        label: 'Source High',
        default: 'high',
        tooltip: 'Price series for swing high detection.',
      },
      {
        key: 'sourceLow',
        type: 'source',
        label: 'Source Low',
        default: 'low',
        tooltip: 'Price series for swing low detection.',
      },
      { key: 'showHigh', type: 'boolean', label: 'Show Swing High Lines', default: true },
      { key: 'showLow', type: 'boolean', label: 'Show Swing Low Lines', default: true },
    ],

    plots: [
      { key: 'swingHigh', type: 'line', title: 'Swing High', style: { color: '#ff5252', lineWidth: 2 } },
      { key: 'swingLow', type: 'line', title: 'Swing Low', style: { color: '#4caf50', lineWidth: 2 } },
    ],

    calc(bars, settings) {
      // A cleared number field arrives as '', and Number('') is 0. The source
      // refuses a lookback above 100, so clamp rather than raise.
      const lookback = Math.min(100, Math.max(1, Math.floor(Number(settings.lookback) || 5)))
      const showHigh = settings.showHigh !== false
      const showLow = settings.showLow !== false

      const srcHigh = sourceValues(bars, settings.sourceHigh ?? 'high')
      const srcLow = sourceValues(bars, settings.sourceLow ?? 'low')

      const highs = new Array(bars.length).fill(NaN)
      const lows = new Array(bars.length).fill(NaN)

      // Pine carries these in var floats that start na.
      let lastSwingHigh = NaN
      let lastSwingLow = NaN

      for (let j = 0; j < bars.length; j++) {
        // Pine skips while bar_index < lookback * 2, so the first candidate
        // centre is the bar at index lookback and it is judged lookback bars
        // later. The result therefore lands on the confirming bar, never ahead
        // of it.
        if (j >= lookback * 2) {
          const centre = j - lookback
          const centreHigh = srcHigh[centre]
          const centreLow = srcLow[centre]

          let isSwingHigh = Number.isFinite(centreHigh)
          let isSwingLow = Number.isFinite(centreLow)

          for (let i = 1; i <= lookback; i++) {
            const leftHigh = srcHigh[centre - i]
            const rightHigh = srcHigh[centre + i]
            if (
              (Number.isFinite(leftHigh) && leftHigh > centreHigh) ||
              (Number.isFinite(rightHigh) && rightHigh > centreHigh)
            ) {
              isSwingHigh = false
            }

            const leftLow = srcLow[centre - i]
            const rightLow = srcLow[centre + i]
            if (
              (Number.isFinite(leftLow) && leftLow < centreLow) ||
              (Number.isFinite(rightLow) && rightLow < centreLow)
            ) {
              isSwingLow = false
            }
          }

          if (isSwingHigh) lastSwingHigh = centreHigh
          if (isSwingLow) lastSwingLow = centreLow
        }

        if (showHigh) highs[j] = lastSwingHigh
        if (showLow) lows[j] = lastSwingLow
      }

      return { swingHigh: nulls(highs), swingLow: nulls(lows) }
    },
  })
}
