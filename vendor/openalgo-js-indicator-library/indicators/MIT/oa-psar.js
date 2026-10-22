/**
 * Parabolic SAR - ported to openalgo-charts from Pine Script v6.
 *
 * Source: https://github.com/mihakralj/pinescript/blob/c4e91b962be09733d8fc76caa5191e9e586c5cee/indicators/reversals/psar.pine
 * Repo:   mihakralj/pinescript
 * License: MIT (c) mihakralj
 * SPDX-FileCopyrightText: (c) mihakralj
 * SPDX-FileCopyrightText: (c) 2026 marketcalls (port to openalgo-charts)
 * SPDX-License-Identifier: MIT
 *
 * Wilder's stop and reverse: a trailing stop that accelerates toward price each
 * time the trend posts a new extreme, and flips side when price trades through
 * it. The stop is drawn in two colours, one for the bars where it sits above
 * the close and one for the bars where it sits below.
 */

export default function ({ registerIndicator, clamp, nulls }) {
  registerIndicator({
    id: 'oa-psar',
    name: 'Parabolic SAR',
    category: 'Reversals',
    placement: 'onchart',

    inputs: [
      { key: 'afStart', type: 'number', label: 'Start AF', default: 0.02, min: 0.001, max: 1, step: 0.001 },
      { key: 'afIncrement', type: 'number', label: 'AF Increment', default: 0.02, min: 0.001, max: 1, step: 0.001 },
      {
        key: 'afMax',
        type: 'number',
        label: 'Max AF',
        default: 0.2,
        min: 0.001,
        max: 1,
        step: 0.01,
        tooltip: 'Ceiling for the acceleration factor. Values at or below Start AF are lifted to Start AF.',
      },
    ],

    plots: [
      { key: 'above', type: 'line', title: 'PSAR Above', style: { color: '#ef5350', lineWidth: 2 } },
      { key: 'below', type: 'line', title: 'PSAR Below', style: { color: '#26a69a', lineWidth: 2 } },
    ],

    calc(bars, settings) {
      // A cleared number field arrives as '', and Number('') is 0.
      const afStart = clamp(Number(settings.afStart) || 0.02, 0.001, 1)
      const afIncrement = clamp(Number(settings.afIncrement) || 0.02, 0.001, 1)
      // Pine raises when Max AF is not above Start AF. A chart study cannot stop,
      // so the ceiling is lifted to Start AF and the factor simply never grows.
      const afMax = Math.max(clamp(Number(settings.afMax) || 0.2, 0.001, 1), afStart)

      const above = new Array(bars.length).fill(NaN)
      const below = new Array(bars.length).fill(NaN)

      let isLong = true
      let sar = NaN
      let ep = NaN
      let af = afStart

      for (let i = 0; i < bars.length; i++) {
        const bar = bars[i]
        if (i === 0) {
          isLong = bar.close > bar.open
          sar = isLong ? bar.low : bar.high
          ep = isLong ? bar.high : bar.low
          af = afStart
        } else {
          let newSar = sar + af * (ep - sar)
          if (isLong) {
            // The stop may never sit above the prior one or two lows.
            newSar = Math.min(newSar, bars[i - 1].low)
            if (i > 1) newSar = Math.min(newSar, bars[i - 2].low)
            if (bar.low < newSar) {
              isLong = false
              newSar = ep
              ep = bar.low
              af = afStart
            } else if (bar.high > ep) {
              ep = bar.high
              af = Math.min(af + afIncrement, afMax)
            }
          } else {
            newSar = Math.max(newSar, bars[i - 1].high)
            if (i > 1) newSar = Math.max(newSar, bars[i - 2].high)
            if (bar.high > newSar) {
              isLong = true
              newSar = ep
              ep = bar.high
              af = afStart
            } else if (bar.low < ep) {
              ep = bar.low
              af = Math.min(af + afIncrement, afMax)
            }
          }
          sar = newSar
        }

        if (!Number.isFinite(sar) || !Number.isFinite(bar.close)) continue
        // Pine plots two linebr series, each na on the bars the other owns.
        if (sar > bar.close) above[i] = sar
        else if (sar < bar.close) below[i] = sar
      }

      return { above: nulls(above), below: nulls(below) }
    },
  })
}
