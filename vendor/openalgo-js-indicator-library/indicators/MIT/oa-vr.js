/**
 * Volatility Ratio (VR) - ported to openalgo-charts from Pine Script v6.
 *
 * Source: https://github.com/mihakralj/pinescript/blob/c4e91b962be09733d8fc76caa5191e9e586c5cee/indicators/volatility/vr.pine
 * Repo:   mihakralj/pinescript
 * License: MIT
 * SPDX-FileCopyrightText: (c) mihakralj
 * SPDX-FileCopyrightText: (c) 2026 marketcalls (port to openalgo-charts)
 * SPDX-License-Identifier: MIT
 *
 * Divides the current true range by a bias-corrected Wilder ATR, so a reading
 * above 1 means this bar is wider than the recent average and below 1 means it
 * is narrower.
 */

export default function ({ registerIndicator, nulls }) {
  registerIndicator({
    id: 'oa-vr',
    name: 'Volatility Ratio (VR)',
    category: 'Volatility',
    placement: 'pane',

    inputs: [
      {
        key: 'atrPeriod',
        type: 'number',
        label: 'ATR Period',
        default: 14,
        min: 1,
        max: 5000,
        step: 1,
        tooltip: 'The lookback period for calculating the Average True Range (ATR).',
      },
    ],

    plots: [{ key: 'vr', type: 'line', title: 'VR', style: { color: '#ffeb3b', lineWidth: 2 } }],

    calc(bars, settings) {
      // A cleared number field arrives as '', and Number('') is 0.
      const atrPeriod = Math.max(1, Math.floor(Number(settings.atrPeriod) || 14))
      const n = bars.length
      const out = new Array(n).fill(NaN)

      const EPSILON_ATR = 1e-10
      const alpha = 1.0 / atrPeriod
      // Both are var floats in the source: raw_atr carries Wilder's running
      // average and e_compensator carries (1 - alpha)^barsSoFar.
      let rawAtr = 0.0
      let prevRawAtr = NaN
      let eCompensator = 1.0

      for (let i = 0; i < n; i++) {
        const high = bars[i].high
        const low = bars[i].low
        const prevClose = i > 0 ? bars[i - 1].close : undefined

        const hl = high - low
        let tr
        if (Number.isFinite(prevClose)) {
          tr = Math.max(hl, Math.abs(high - prevClose), Math.abs(low - prevClose))
        } else {
          tr = hl
        }
        const trForAtr = Number.isFinite(tr) ? tr : 0

        // The seed branch fires only on the very first bar, where raw_atr has no
        // history and the compensator is still exactly 1.
        if (!Number.isFinite(prevRawAtr) && eCompensator === 1.0) {
          rawAtr = trForAtr
        } else {
          const carried = Number.isFinite(prevRawAtr) ? prevRawAtr : 0
          rawAtr = (carried * (atrPeriod - 1) + trForAtr) / atrPeriod
        }
        eCompensator = (1.0 - alpha) * eCompensator

        const denom = 1.0 - eCompensator
        let atrCurrent
        if (eCompensator > EPSILON_ATR && denom !== 0) atrCurrent = rawAtr / denom
        else atrCurrent = rawAtr

        if (Number.isFinite(tr) && Number.isFinite(atrCurrent) && atrCurrent !== 0) {
          const ratio = tr / atrCurrent
          if (Number.isFinite(ratio)) out[i] = ratio
        }

        prevRawAtr = rawAtr
      }

      return { vr: nulls(out) }
    },
  })
}
