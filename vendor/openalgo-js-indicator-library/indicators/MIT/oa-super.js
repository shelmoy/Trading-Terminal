/**
 * SuperTrend - ported to openalgo-charts from Pine Script v6.
 *
 * Source: https://github.com/mihakralj/pinescript/blob/c4e91b962be09733d8fc76caa5191e9e586c5cee/indicators/dynamics/super.pine
 * Repo:   mihakralj/pinescript
 * License: MIT (c) mihakralj
 * SPDX-FileCopyrightText: (c) mihakralj
 * SPDX-FileCopyrightText: (c) 2026 marketcalls (port to openalgo-charts)
 * SPDX-License-Identifier: MIT
 *
 * An ATR band around the bar midpoint that only ever tightens towards price,
 * flipping side when the close breaks it, so the line acts as a trailing
 * support in an uptrend and a trailing resistance in a downtrend.
 */

export default function ({ registerIndicator, nulls }) {
  const BULLISH = '#4caf50'
  const BEARISH = '#ff5252'

  registerIndicator({
    id: 'oa-super',
    name: 'SuperTrend',
    category: 'Dynamics',
    placement: 'onchart',

    inputs: [
      { key: 'atrPeriod', type: 'number', label: 'ATR Period', default: 10, min: 1, max: 100, step: 1 },
      { key: 'multiplier', type: 'number', label: 'Multiplier', default: 3, min: 0.1, max: 100, step: 0.1 },
      // The source script declares this input and passes it to super(), which
      // never reads it: the bands are built from high, low and close.
      { key: 'source', type: 'source', label: 'Source', default: 'close' },
    ],

    plots: [
      {
        key: 'supertrend',
        type: 'line',
        title: 'SuperTrend',
        style: { color: BULLISH, lineWidth: 2 },
        colorBy({ index, values }) {
          const d = values?.dir?.[index]
          return d === 1 ? BULLISH : BEARISH
        },
      },
    ],

    calc(bars, settings) {
      // A cleared number field arrives as '', and Number('') is 0.
      const atrPeriod = Math.max(1, Math.min(100, Math.floor(Number(settings.atrPeriod) || 10)))
      const multiplier = Math.max(0.1, Number(settings.multiplier) || 3)

      const n = bars.length
      const line = new Array(n).fill(NaN)
      const dir = new Array(n).fill(NaN)

      const alpha = 1.0 / atrPeriod
      const beta = 1.0 - alpha

      // var state carried across bars, exactly as the Pine function does.
      let warmup = true
      let e = 1.0
      let atrState = 0.0
      let finalUb = NaN
      let finalLb = NaN
      let seeded = false
      let trend = 1

      for (let i = 0; i < n; i++) {
        const high = bars[i].high
        const low = bars[i].low
        const close = bars[i].close
        if (!Number.isFinite(high) || !Number.isFinite(low) || !Number.isFinite(close)) continue

        // Pine's nz(close[1]) is 0 on the first bar, which is what sizes its
        // first true range.
        const prevClose = i > 0 && Number.isFinite(bars[i - 1].close) ? bars[i - 1].close : 0
        const hl2Value = (high + low) / 2.0
        const tr = Math.max(high - low, Math.max(Math.abs(high - prevClose), Math.abs(low - prevClose)))

        atrState = alpha * (tr - atrState) + atrState

        let compensatedAtr
        if (warmup) {
          e *= beta
          const denom = 1.0 - e
          const c = denom > 0 ? 1.0 / denom : 1.0
          compensatedAtr = c * atrState
          warmup = e > 1e-10
        } else {
          compensatedAtr = atrState
        }

        const basicUb = hl2Value + multiplier * compensatedAtr
        const basicLb = hl2Value - multiplier * compensatedAtr

        // var float final_ub = basic_ub seeds on the first bar that runs.
        if (!seeded) {
          finalUb = basicUb
          finalLb = basicLb
          seeded = true
        }

        finalUb = basicUb < finalUb || prevClose > finalUb ? basicUb : finalUb
        finalLb = basicLb > finalLb || prevClose < finalLb ? basicLb : finalLb

        trend = close > finalUb ? 1 : close < finalLb ? -1 : trend
        line[i] = trend === 1 ? finalLb : finalUb
        dir[i] = trend
      }

      return { supertrend: nulls(line), dir }
    },

    markers({ bars, values }) {
      const dir = values?.dir ?? []
      const n = bars.length
      if (!n) return []

      // atPrice adds no padding, so scale the offset to the instrument.
      let rangeSum = 0
      let rangeCount = 0
      for (let i = 0; i < n; i++) {
        const r = bars[i].high - bars[i].low
        if (Number.isFinite(r)) {
          rangeSum += r
          rangeCount++
        }
      }
      const meanRange = rangeCount > 0 ? rangeSum / rangeCount : 0
      const lastClose = Number.isFinite(bars[n - 1].close) ? bars[n - 1].close : 0
      const pad = Math.max(meanRange * 0.5, Math.abs(lastClose) * 0.0005)

      const out = []
      for (let i = 0; i < n; i++) {
        const d = dir[i]
        if (!Number.isFinite(d)) continue
        // Pine reads nz(st_direction[1]), which is 0 before any history, so the
        // first bar with a direction always counts as a change.
        const prev = i > 0 && Number.isFinite(dir[i - 1]) ? dir[i - 1] : 0
        if (d === prev) continue
        if (d === 1) {
          out.push({
            time: bars[i].time,
            position: 'atPrice',
            price: bars[i].low - pad,
            shape: 'labelUp',
            color: BULLISH,
            text: 'BUY',
            size: 'small',
          })
        } else if (d === -1) {
          out.push({
            time: bars[i].time,
            position: 'atPrice',
            price: bars[i].high + pad,
            shape: 'labelDown',
            color: BEARISH,
            text: 'SELL',
            size: 'small',
          })
        }
      }
      return out
    },
  })
}
