/**
 * Chaikin A/D Oscillator (ADOSC) - ported to openalgo-charts from Pine Script v6.
 *
 * Source: https://github.com/mihakralj/pinescript/blob/c4e91b962be09733d8fc76caa5191e9e586c5cee/indicators/volume/adosc.pine
 * Repo:   mihakralj/pinescript
 * License: MIT (c) mihakralj
 * SPDX-FileCopyrightText: (c) mihakralj
 * SPDX-FileCopyrightText: (c) 2026 marketcalls (port to openalgo-charts)
 * SPDX-License-Identifier: MIT
 *
 * The difference between a fast and a slow exponential average of the
 * accumulation/distribution line, so the histogram leads the ADL itself when
 * money flow changes direction.
 */

export default function ({ registerIndicator, nulls }) {
  registerIndicator({
    id: 'oa-adosc',
    name: 'Chaikin A/D Oscillator (ADOSC)',
    category: 'Volume',
    placement: 'pane',

    inputs: [
      { key: 'shortPeriod', type: 'number', label: 'Short Period', default: 3, min: 1, max: 5000, step: 1 },
      { key: 'longPeriod', type: 'number', label: 'Long Period', default: 10, min: 1, max: 5000, step: 1 },
    ],

    plots: [{ key: 'adosc', type: 'line', title: 'ADOSC', style: { color: '#ffeb3b', lineWidth: 2 } }],

    calc(bars, settings) {
      // A cleared number field arrives as '', and Number('') is 0.
      const shortPeriod = Math.max(1, Math.floor(Number(settings.shortPeriod) || 3))
      const longPeriod = Math.max(1, Math.floor(Number(settings.longPeriod) || 10))

      const EPSILON = 1e-10
      const shortAlpha = 2.0 / (shortPeriod + 1)
      const longAlpha = 2.0 / (longPeriod + 1)
      const oneMinusLongAlpha = 1.0 - longAlpha

      const out = new Array(bars.length).fill(NaN)

      // Pine `var` state, carried bar to bar inside this single pass.
      let cum = 0
      let e = 1.0
      let shortRawEma = 0
      let longRawEma = 0

      for (let i = 0; i < bars.length; i++) {
        const bar = bars[i]
        const high = Number(bar.high)
        const low = Number(bar.low)
        const close = Number(bar.close)
        // Index series carry no volume, so nothing is accumulated on that bar.
        const volume = Number.isFinite(bar.volume) ? bar.volume : 0

        let mf = 0
        if (Number.isFinite(high) && Number.isFinite(low) && Number.isFinite(close)) {
          const rng = high - low
          if (rng !== 0) mf = ((2 * close - high - low) / rng) * volume
        }
        if (!Number.isFinite(mf)) mf = 0

        cum = i === 0 ? mf : cum + mf

        // Pine divides by (1 - e) before decaying e, so on the very first bar
        // e is still exactly 1, the divisor is zero and the reading is not
        // defined. That bar is left as a gap rather than drawn as infinity.
        const denom = 1 - e
        const compensate = e > EPSILON

        shortRawEma = shortAlpha * (cum - shortRawEma) + shortRawEma
        const shortEma = compensate ? (denom !== 0 ? shortRawEma / denom : NaN) : shortRawEma

        longRawEma = longAlpha * (cum - longRawEma) + longRawEma
        const longEma = compensate ? (denom !== 0 ? longRawEma / denom : NaN) : longRawEma

        e = oneMinusLongAlpha * e

        const value = shortEma - longEma
        out[i] = Number.isFinite(value) ? value : NaN
      }

      return { adosc: nulls(out) }
    },
  })
}
