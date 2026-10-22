/**
 * Solar Cycle (SOLAR) - ported to openalgo-charts from Pine Script v6.
 *
 * Source: https://github.com/mihakralj/pinescript/blob/c4e91b962be09733d8fc76caa5191e9e586c5cee/indicators/cycles/solar.pine
 * Repo:   mihakralj/pinescript
 * License: MIT (c) mihakralj
 * SPDX-FileCopyrightText: (c) mihakralj
 * SPDX-FileCopyrightText: (c) 2026 marketcalls (port to openalgo-charts)
 * SPDX-License-Identifier: MIT
 *
 * The sine of the Sun's apparent ecliptic longitude at each bar's open time,
 * running from -1.0 at the winter solstice through 0.0 at the equinoxes to
 * +1.0 at the summer solstice. It is a pure calendar series, independent of
 * price, used to line seasonal studies up with the astronomical year.
 */

export default function ({ registerIndicator, nulls }) {
  // Pine's time is milliseconds since epoch; a bar's time here is seconds.
  const solar = (timeSeconds) => {
    if (!Number.isFinite(timeSeconds)) return NaN
    const jd = timeSeconds / 86400 + 2440587.5
    const T = (jd - 2451545) / 36525
    const l0DegRaw = 280.46646 + 36000.76983 * T + 0.0003032 * T * T
    const l0Deg = ((l0DegRaw % 360) + 360) % 360
    const mDegRaw = 357.52911 + 35999.05029 * T - 0.0001537 * T * T - 0.00000025 * T * T * T
    const mDeg = ((mDegRaw % 360) + 360) % 360
    const mRad = (mDeg * Math.PI) / 180
    const cDeg =
      (1.914602 - 0.004817 * T - 0.000014 * T * T) * Math.sin(mRad) +
      (0.019993 - 0.000101 * T) * Math.sin(2 * mRad) +
      0.000289 * Math.sin(3 * mRad)
    const lambdaSunDegRaw = l0Deg + cDeg
    const lambdaSunDeg = ((lambdaSunDegRaw % 360) + 360) % 360
    return Math.sin((lambdaSunDeg * Math.PI) / 180)
  }

  registerIndicator({
    id: 'oa-solar',
    name: 'Solar Cycle (SOLAR)',
    category: 'Cycles',
    placement: 'pane',

    inputs: [],

    plots: [{ key: 'solar', type: 'line', title: 'Solar Cycle', style: { color: '#ffeb3b', lineWidth: 2 } }],

    calc(bars) {
      const out = new Array(bars.length).fill(NaN)
      for (let i = 0; i < bars.length; i++) {
        out[i] = solar(bars[i].time)
      }
      return { solar: nulls(out) }
    },

    // Pine marks the four turning points with plotchar at location.absolute:
    // the solstices sit on the curve, the equinoxes on the zero line.
    markers({ bars, values }) {
      const solarValues = values.solar || []
      const out = []
      for (let i = 1; i < bars.length; i++) {
        const cur = solarValues[i]
        const prev = solarValues[i - 1]
        if (!Number.isFinite(cur) || !Number.isFinite(prev)) continue

        const delta1 = cur - prev
        // delta1[1] in Pine, which is na on the second bar, so the solstice
        // tests that read it stay false there.
        const prev2 = i >= 2 ? solarValues[i - 2] : NaN
        const delta0 = Number.isFinite(prev2) ? prev - prev2 : NaN
        const hasDelta0 = Number.isFinite(delta0)

        if (hasDelta0 && cur > 0.985 && prev > 0.985 && delta1 < 0 && delta0 > 0) {
          out.push({
            time: bars[i].time,
            position: 'atPrice',
            price: cur,
            shape: 'circle',
            size: 'small',
            color: '#ff5252',
            text: 'Peak Summer',
          })
        }
        if (prev < 0 && cur >= 0 && delta1 > 0) {
          out.push({
            time: bars[i].time,
            position: 'atPrice',
            price: 0,
            shape: 'circle',
            size: 'small',
            color: '#ffeb3b',
            text: 'Spring Rise',
          })
        }
        if (hasDelta0 && cur < -0.985 && prev < -0.985 && delta1 > 0 && delta0 < 0) {
          out.push({
            time: bars[i].time,
            position: 'atPrice',
            price: cur,
            shape: 'circle',
            size: 'small',
            color: '#2196f3',
            text: 'Peak Winter',
          })
        }
        if (prev > 0 && cur <= 0 && delta1 < 0) {
          out.push({
            time: bars[i].time,
            position: 'atPrice',
            price: 0,
            shape: 'circle',
            size: 'small',
            color: '#ffeb3b',
            text: 'Autumn Fall',
          })
        }
      }
      return out
    },
  })
}
