/**
 * Lunar Phase (LUNAR) - ported to openalgo-charts from Pine Script v6.
 *
 * Source: https://github.com/mihakralj/pinescript/blob/c4e91b962be09733d8fc76caa5191e9e586c5cee/indicators/cycles/lunar.pine
 * Repo:   mihakralj/pinescript
 * License: MIT (c) mihakralj
 * SPDX-FileCopyrightText: (c) mihakralj
 * SPDX-FileCopyrightText: (c) 2026 marketcalls (port to openalgo-charts)
 * SPDX-License-Identifier: MIT
 *
 * Illuminated fraction of the Moon at each bar's open, computed from the lunar
 * orbital elements with the main perturbation terms, so 0 is a new moon and 1
 * is a full moon.
 */

export default function ({ registerIndicator, nulls }) {
  const DEG = Math.PI / 180

  // The Pine function works from time in milliseconds; bar times here are UTC
  // seconds, so the Julian Day conversion divides by 86400 instead.
  const lunarPhase = (utcSeconds) => {
    if (!Number.isFinite(utcSeconds)) return NaN
    const jd = utcSeconds / 86400 + 2440587.5
    const T = (jd - 2451545) / 36525
    const T2 = T * T
    const T3 = T2 * T
    const T4 = T3 * T

    const Lp = (218.3164477 + 481267.88123421 * T - 0.0015786 * T2 + T3 / 538841 - T4 / 65194000) % 360
    const D = (297.8501921 + 445267.1114034 * T - 0.0018819 * T2 + T3 / 545868 - T4 / 113065000) % 360
    const M = (357.5291092 + 35999.0502909 * T - 0.0001536 * T2 + T3 / 24490000) % 360
    const Mp = (134.9633964 + 477198.8675055 * T + 0.0087414 * T2 + T3 / 69699 - T4 / 14712000) % 360
    const F = (93.272095 + 483202.0175233 * T - 0.0036539 * T2 - T3 / 3526000 + T4 / 863310000) % 360

    const Drad = D * DEG
    const Mrad = M * DEG
    const Mprad = Mp * DEG
    const Frad = F * DEG

    const dL =
      6288.016 * Math.sin(Mprad) +
      1274.242 * Math.sin(2 * Drad - Mprad) +
      658.314 * Math.sin(2 * Drad) +
      214.818 * Math.sin(2 * Mprad) +
      186.986 * Math.sin(Mrad) +
      109.154 * Math.sin(2 * Frad)

    const Lmoon = Lp + dL / 1000000
    const Lsun = (280.46646 + 36000.76983 * T + 0.0003032 * T2) % 360
    // JavaScript's % keeps the sign of the dividend, exactly as Pine's does, and
    // cosine is even, so a negative remainder gives the same phase.
    const phaseAngle = ((Lmoon - Lsun) % 360) * DEG
    return (1 - Math.cos(phaseAngle)) / 2
  }

  registerIndicator({
    id: 'oa-lunar',
    name: 'Lunar Phase (LUNAR)',
    category: 'Cycles',
    placement: 'pane',

    inputs: [],

    plots: [{ key: 'phase', type: 'line', title: 'Lunar Phase', style: { color: '#ffeb3b', lineWidth: 2 } }],

    calc(bars) {
      const out = new Array(bars.length).fill(NaN)
      for (let i = 0; i < bars.length; i++) out[i] = lunarPhase(bars[i].time)
      return { phase: nulls(out) }
    },

    markers({ bars, values }) {
      const phase = values.phase
      const out = []
      // The Pine conditions read phase[1], phase[2] through the first
      // difference, so nothing can fire before the third bar.
      for (let i = 2; i < bars.length; i++) {
        const cur = phase[i]
        const prev = phase[i - 1]
        const prev2 = phase[i - 2]
        if (!Number.isFinite(cur) || !Number.isFinite(prev) || !Number.isFinite(prev2)) continue

        const delta = cur - prev
        const prevDelta = prev - prev2
        const at = { time: bars[i].time, position: 'atPrice', price: cur, size: 'small', color: '#ffffff' }

        if (cur < 0.1 && prev < 0.1 && delta > 0 && prevDelta < 0) {
          out.push({ ...at, shape: 'circle', text: 'New' })
        }
        if (prev < 0.5 && cur >= 0.5 && delta > 0) {
          out.push({ ...at, shape: 'triangleUp', text: 'FQ' })
        }
        if (cur > 0.9 && prev > 0.9 && delta < 0 && prevDelta > 0) {
          out.push({ ...at, shape: 'diamond', text: 'Full' })
        }
        if (prev > 0.5 && cur <= 0.5 && delta < 0) {
          out.push({ ...at, shape: 'triangleDown', text: 'LQ' })
        }
      }
      return out
    },
  })
}
