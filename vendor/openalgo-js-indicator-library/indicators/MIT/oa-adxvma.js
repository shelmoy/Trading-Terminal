/**
 * ADX Variable Moving Average (ADXVMA) - ported to openalgo-charts from
 * Pine Script v6.
 *
 * Source: https://github.com/mihakralj/pinescript/blob/c4e91b962be09733d8fc76caa5191e9e586c5cee/indicators/trends_IIR/adxvma.pine
 * Repo:   mihakralj/pinescript
 * License: MIT (c) mihakralj
 * SPDX-FileCopyrightText: (c) mihakralj
 * SPDX-FileCopyrightText: (c) 2026 marketcalls (port to openalgo-charts)
 * SPDX-License-Identifier: MIT
 *
 * An adaptive average whose smoothing constant is the ADX itself, so it
 * tracks price closely while a trend is strong and flattens out while the
 * market is directionless.
 */

export default function ({ registerIndicator, sourceValues, nulls }) {
  registerIndicator({
    id: 'oa-adxvma',
    name: 'ADX Variable Moving Average (ADXVMA)',
    category: 'Trends IIR',
    placement: 'onchart',

    inputs: [
      { key: 'period', type: 'number', label: 'Period', default: 14, min: 1, max: 5000, step: 1 },
      { key: 'source', type: 'source', label: 'Source', default: 'close' },
    ],

    plots: [{ key: 'adxvma', type: 'line', title: 'ADXVMA', style: { color: '#ffeb3b', lineWidth: 2 } }],

    calc(bars, settings) {
      // A cleared number field arrives as '', and Number('') is 0. Pine raises
      // on a period of 0 or less, so clamp at 1 rather than throwing.
      const period = Math.max(1, Math.floor(Number(settings.period) || 14))
      const src = sourceValues(bars, settings.source ?? 'close')

      const EPSILON = 1e-10
      const alpha = 1.0 / period
      const beta = 1.0 - alpha

      const out = new Array(bars.length).fill(NaN)

      // Pine `var` state, carried bar to bar inside this single pass.
      let rawTr = 0
      let rawPdm = 0
      let rawNdm = 0
      let rawDx = 0
      let eTr = 1.0
      let ePdm = 1.0
      let eNdm = 1.0
      let eDx = 1.0
      let result = NaN

      for (let i = 0; i < bars.length; i++) {
        const source = src[i]
        if (!Number.isFinite(source)) {
          // Pine holds the previous value when the source is not available.
          out[i] = result
          continue
        }

        const high = Number(bars[i].high)
        const low = Number(bars[i].low)
        const close = Number(bars[i].close)
        if (!Number.isFinite(high) || !Number.isFinite(low) || !Number.isFinite(close)) {
          out[i] = result
          continue
        }

        // nz(close[1], close): the first bar compares against itself.
        const prevClose = i > 0 && Number.isFinite(bars[i - 1].close) ? Number(bars[i - 1].close) : close
        const prevHigh = i > 0 && Number.isFinite(bars[i - 1].high) ? Number(bars[i - 1].high) : high
        const prevLow = i > 0 && Number.isFinite(bars[i - 1].low) ? Number(bars[i - 1].low) : low

        const tr = Math.max(high - low, Math.max(Math.abs(high - prevClose), Math.abs(low - prevClose)))
        const upMove = high - prevHigh
        const downMove = prevLow - low
        const plusDm = upMove > downMove && upMove > 0 ? upMove : 0.0
        const minusDm = downMove > upMove && downMove > 0 ? downMove : 0.0

        rawTr = rawTr * beta + tr * alpha
        rawPdm = rawPdm * beta + plusDm * alpha
        rawNdm = rawNdm * beta + minusDm * alpha
        eTr *= beta
        ePdm *= beta
        eNdm *= beta

        // Wilder smoothing with the usual 1/(1 - beta^n) warmup compensation.
        const compTr = eTr > EPSILON && 1 - eTr !== 0 ? rawTr / (1 - eTr) : rawTr
        const compPdm = ePdm > EPSILON && 1 - ePdm !== 0 ? rawPdm / (1 - ePdm) : rawPdm
        const compNdm = eNdm > EPSILON && 1 - eNdm !== 0 ? rawNdm / (1 - eNdm) : rawNdm

        const plusDi = compTr !== 0 ? (100.0 * compPdm) / compTr : 0.0
        const minusDi = compTr !== 0 ? (100.0 * compNdm) / compTr : 0.0
        const diSum = plusDi + minusDi
        const dx = diSum !== 0 ? (100.0 * Math.abs(plusDi - minusDi)) / diSum : 0.0

        rawDx = rawDx * beta + dx * alpha
        eDx *= beta
        const adxVal = eDx > EPSILON && 1 - eDx !== 0 ? rawDx / (1 - eDx) : rawDx

        const sc = Math.max(0.0, Math.min(Number.isFinite(adxVal) ? adxVal / 100.0 : 0, 1.0))
        result = Number.isFinite(result) ? result + sc * (source - result) : source

        out[i] = result
      }

      return { adxvma: nulls(out) }
    },
  })
}
