/**
 * Directional Movement Index (DX) - ported to openalgo-charts from Pine Script v6.
 *
 * Source: https://github.com/mihakralj/pinescript/blob/c4e91b962be09733d8fc76caa5191e9e586c5cee/indicators/dynamics/dx.pine
 * Repo:   mihakralj/pinescript
 * License: MIT (c) mihakralj
 * SPDX-FileCopyrightText: (c) mihakralj
 * SPDX-FileCopyrightText: (c) 2026 marketcalls (port to openalgo-charts)
 * SPDX-License-Identifier: MIT
 *
 * Wilder's directional movement: +DI and -DI measure how much of the true
 * range has been one-way, and DX is the gap between them as a percentage of
 * their sum, so a high reading means a trend and a low one means chop.
 */

export default function ({ registerIndicator, nulls }) {
  registerIndicator({
    id: 'oa-dx',
    name: 'Directional Movement Index (DX)',
    category: 'Dynamics',
    placement: 'pane',

    inputs: [
      {
        key: 'period',
        type: 'number',
        label: 'Period',
        default: 14,
        min: 1,
        max: 5000,
        step: 1,
        tooltip: 'Number of bars used in the calculation.',
      },
    ],

    plots: [
      { key: 'dx', type: 'line', title: 'DX', style: { color: '#ffeb3b', lineWidth: 2 } },
      { key: 'plusDi', type: 'line', title: '+DI', style: { color: '#4caf50', lineWidth: 1 } },
      { key: 'minusDi', type: 'line', title: '-DI', style: { color: '#ff5252', lineWidth: 1 } },
    ],

    levels: () => [{ price: 25, title: 'Strong Trend Threshold', color: '#787b86', dashed: true }],

    calc(bars, settings) {
      // A cleared number field arrives as '', and Number('') is 0.
      const period = Math.max(1, Math.floor(Number(settings.period) || 14))
      const alpha = 1 / period
      const beta = 1 - alpha

      const dx = new Array(bars.length).fill(NaN)
      const plusDiOut = new Array(bars.length).fill(NaN)
      const minusDiOut = new Array(bars.length).fill(NaN)

      // Wilder smoothing carried by hand, with the exponential warmup
      // compensator the source uses to emit usable values from bar 1.
      let warmup = true
      let e = 1
      let trEma = 0
      let plusDmEma = 0
      let minusDmEma = 0

      for (let i = 0; i < bars.length; i += 1) {
        const high = bars[i].high
        const low = bars[i].low
        if (!Number.isFinite(high) || !Number.isFinite(low)) continue

        const prevClose = i > 0 ? bars[i - 1].close : NaN
        const prevHigh = i > 0 ? bars[i - 1].high : NaN
        const prevLow = i > 0 ? bars[i - 1].low : NaN

        let tr = 0
        let plusDm = 0
        let minusDm = 0

        if (!Number.isFinite(prevClose)) {
          tr = high - low
        } else {
          tr = Math.max(high - low, Math.max(Math.abs(high - prevClose), Math.abs(low - prevClose)))
          if (Number.isFinite(prevHigh) && Number.isFinite(prevLow)) {
            const upMove = high - prevHigh
            const downMove = prevLow - low
            // Pine compares against na as false, so both moves have to be real
            // numbers before either can set a directional movement.
            if (upMove > downMove && upMove > 0) plusDm = upMove
            if (downMove > upMove && downMove > 0) minusDm = downMove
          }
        }

        trEma += alpha * (tr - trEma)
        plusDmEma += alpha * (plusDm - plusDmEma)
        minusDmEma += alpha * (minusDm - minusDmEma)

        let trResult
        let plusDmResult
        let minusDmResult
        if (warmup) {
          e *= beta
          const denominator = 1 - e
          const c = denominator !== 0 ? 1 / denominator : 1
          trResult = c * trEma
          plusDmResult = c * plusDmEma
          minusDmResult = c * minusDmEma
          warmup = e > 1e-10
        } else {
          trResult = trEma
          plusDmResult = plusDmEma
          minusDmResult = minusDmEma
        }

        const plusDi = trResult !== 0 ? (100 * plusDmResult) / trResult : 0
        const minusDi = trResult !== 0 ? (100 * minusDmResult) / trResult : 0
        const diSum = plusDi + minusDi
        const dxValue = diSum !== 0 ? (100 * Math.abs(plusDi - minusDi)) / diSum : 0

        if (Number.isFinite(plusDi)) plusDiOut[i] = plusDi
        if (Number.isFinite(minusDi)) minusDiOut[i] = minusDi
        if (Number.isFinite(dxValue)) dx[i] = dxValue
      }

      return { dx: nulls(dx), plusDi: nulls(plusDiOut), minusDi: nulls(minusDiOut) }
    },
  })
}
