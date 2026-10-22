/**
 * Average Directional Movement Index (ADX) - ported to openalgo-charts from Pine Script v6.
 *
 * Source: https://github.com/mihakralj/pinescript/blob/c4e91b962be09733d8fc76caa5191e9e586c5cee/indicators/dynamics/adx.pine
 * Repo:   mihakralj/pinescript
 * License: MIT (c) mihakralj
 * SPDX-FileCopyrightText: (c) mihakralj
 * SPDX-FileCopyrightText: (c) 2026 marketcalls (port to openalgo-charts)
 * SPDX-License-Identifier: MIT
 *
 * Directional movement is accumulated separately for up and down bars and
 * normalised by true range, giving a pair of directional lines and an averaged
 * reading of how strongly price is trending regardless of direction.
 */

export default function ({ registerIndicator, nulls }) {
  registerIndicator({
    id: 'oa-adx',
    name: 'Average Directional Movement Index (ADX)',
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
      { key: 'adx', type: 'line', title: 'ADX', style: { color: '#ffeb3b', lineWidth: 2 } },
      { key: 'plusDi', type: 'line', title: '+DI', style: { color: '#ffeb3b', lineWidth: 2 } },
      { key: 'minusDi', type: 'line', title: '-DI', style: { color: '#ffeb3b', lineWidth: 2 } },
    ],

    calc(bars, settings) {
      // A cleared number field arrives as '', and Number('') is 0.
      const period = Math.max(1, Math.floor(Number(settings.period) || 14))
      const n = bars.length

      const adxOut = new Array(n).fill(NaN)
      const plusDiOut = new Array(n).fill(NaN)
      const minusDiOut = new Array(n).fill(NaN)

      // Pine subtracts the sum series `period` bars back, not the raw term, so
      // each running total has to keep its own history.
      const trSum = new Array(n).fill(0)
      const plusDmSum = new Array(n).fill(0)
      const minusDmSum = new Array(n).fill(0)
      const dxSum = new Array(n).fill(0)

      for (let i = 0; i < n; i++) {
        const high = bars[i].high
        const low = bars[i].low
        const prevHigh = i > 0 ? bars[i - 1].high : NaN
        const prevLow = i > 0 ? bars[i - 1].low : NaN
        const prevClose = i > 0 ? bars[i - 1].close : NaN

        const tr = !Number.isFinite(prevClose)
          ? high - low
          : Math.max(high - low, Math.max(Math.abs(high - prevClose), Math.abs(low - prevClose)))

        const upMove = Number.isFinite(prevHigh) ? high - prevHigh : 0
        const downMove = Number.isFinite(prevLow) ? prevLow - low : 0
        const plusDm = !Number.isFinite(prevHigh) ? 0 : upMove > downMove && upMove > 0 ? upMove : 0
        const minusDm = !Number.isFinite(prevLow) ? 0 : downMove > upMove && downMove > 0 ? downMove : 0

        const prevTrSum = i > 0 ? trSum[i - 1] : 0
        const prevPlusSum = i > 0 ? plusDmSum[i - 1] : 0
        const prevMinusSum = i > 0 ? minusDmSum[i - 1] : 0
        const backTrSum = i >= period ? trSum[i - period] : 0
        const backPlusSum = i >= period ? plusDmSum[i - period] : 0
        const backMinusSum = i >= period ? minusDmSum[i - period] : 0

        trSum[i] = prevTrSum - backTrSum + (Number.isFinite(tr) ? tr : 0)
        plusDmSum[i] = prevPlusSum - backPlusSum + plusDm
        minusDmSum[i] = prevMinusSum - backMinusSum + minusDm

        const plusDi = trSum[i] !== 0 ? Math.min((100 * plusDmSum[i]) / trSum[i], 50) : 0
        const minusDi = trSum[i] !== 0 ? Math.min((100 * minusDmSum[i]) / trSum[i], 50) : 0
        const diSum = plusDi + minusDi
        const dx = diSum !== 0 ? (100 * Math.abs(plusDi - minusDi)) / diSum : 0

        const prevDxSum = i > 0 ? dxSum[i - 1] : 0
        const backDxSum = i >= period ? dxSum[i - period] : 0
        dxSum[i] = prevDxSum - backDxSum + (Number.isFinite(dx) ? dx : 0)
        const adxValue = dxSum[i] / period

        if (Number.isFinite(adxValue)) adxOut[i] = adxValue
        if (Number.isFinite(plusDi)) plusDiOut[i] = plusDi
        if (Number.isFinite(minusDi)) minusDiOut[i] = minusDi
      }

      return { adx: nulls(adxOut), plusDi: nulls(plusDiOut), minusDi: nulls(minusDiOut) }
    },
  })
}
