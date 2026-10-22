/**
 * Gann High-Low Activator - ported to openalgo-charts from Pine Script v6.
 *
 * Source: https://github.com/mihakralj/pinescript/blob/c4e91b962be09733d8fc76caa5191e9e586c5cee/indicators/dynamics/ghla.pine
 * Repo:   mihakralj/pinescript
 * License: MIT
 * SPDX-FileCopyrightText: (c) mihakralj
 * SPDX-FileCopyrightText: (c) 2026 marketcalls (port to openalgo-charts)
 * SPDX-License-Identifier: MIT
 *
 * A close above the average of recent highs turns the state bullish and a close
 * below the average of recent lows turns it bearish, with the opposite average
 * then trailing price as support or resistance until the state flips back.
 */

export default function ({ registerIndicator, sma, nulls }) {
  const BULL = '#26a69a'
  const BEAR = '#ef5350'

  registerIndicator({
    id: 'oa-ghla',
    name: 'Gann High-Low Activator',
    category: 'Dynamics',
    placement: 'onchart',

    inputs: [
      {
        key: 'period',
        type: 'number',
        label: 'Period',
        default: 3,
        min: 1,
        max: 100,
        step: 1,
        tooltip: 'SMA lookback period (Krausz default: 3)',
      },
    ],

    plots: [
      {
        key: 'ghla',
        type: 'line',
        title: 'GHLA',
        style: { color: BULL, lineWidth: 2 },
        colorBy({ index, values }) {
          const trend = values.trend
          const state = trend ? trend[index] : NaN
          return state === -1 ? BEAR : BULL
        },
      },
    ],

    calc(bars, settings) {
      // A cleared number field arrives as '', and Number('') is 0.
      const period = Math.max(1, Math.min(100, Math.floor(Number(settings.period) || 3)))
      const n = bars.length
      const highs = new Array(n)
      const lows = new Array(n)
      for (let i = 0; i < n; i++) {
        highs[i] = bars[i].high
        lows[i] = bars[i].low
      }
      const smaHigh = sma(highs, period)
      const smaLow = sma(lows, period)

      const activator = new Array(n).fill(NaN)
      const trendCol = new Array(n).fill(NaN)
      let trend = 0

      for (let i = 0; i < n; i++) {
        const c = bars[i].close
        const sh = smaHigh[i]
        const sl = smaLow[i]
        const finite = Number.isFinite(c)

        // Seed once. During the SMA warmup every comparison against na is false
        // in Pine, so both ternary branches fall through to the bullish default.
        if (trend === 0) {
          if (finite && Number.isFinite(sh) && c >= sh) trend = 1
          else if (finite && Number.isFinite(sl) && c <= sl) trend = -1
          else trend = 1
        }

        // Hysteresis: between the two averages the previous state is retained.
        if (finite && Number.isFinite(sh) && c > sh) trend = 1
        else if (finite && Number.isFinite(sl) && c < sl) trend = -1

        trendCol[i] = trend
        const line = trend === 1 ? sl : sh
        if (Number.isFinite(line)) activator[i] = line
      }

      return { ghla: nulls(activator), trend: trendCol }
    },

    markers({ bars, values }) {
      const out = []
      const trend = values.trend
      if (!Array.isArray(trend) || bars.length === 0) return out

      // atPrice adds no padding of its own, so scale the offset to the
      // instrument rather than using a fixed number of points.
      let sumRange = 0
      let counted = 0
      for (let i = 0; i < bars.length; i++) {
        const r = bars[i].high - bars[i].low
        if (Number.isFinite(r)) {
          sumRange += r
          counted += 1
        }
      }
      const meanRange = counted > 0 ? sumRange / counted : 0
      const lastClose = bars[bars.length - 1].close
      const ref = Number.isFinite(lastClose) ? Math.abs(lastClose) : 0
      const pad = Math.max(meanRange * 0.5, ref * 0.0005)

      for (let i = 0; i < bars.length; i++) {
        const cur = trend[i]
        // Pine compares against nz(trend[1]), so bar zero always reads as a flip.
        const prevRaw = i > 0 ? trend[i - 1] : NaN
        const prev = Number.isFinite(prevRaw) ? prevRaw : 0
        if (!Number.isFinite(cur) || cur === prev) continue

        if (cur === 1 && Number.isFinite(bars[i].low)) {
          out.push({
            time: bars[i].time,
            position: 'atPrice',
            price: bars[i].low - pad,
            shape: 'labelUp',
            size: 'small',
            color: BULL,
            text: 'BUY',
          })
        } else if (cur === -1 && Number.isFinite(bars[i].high)) {
          out.push({
            time: bars[i].time,
            position: 'atPrice',
            price: bars[i].high + pad,
            shape: 'labelDown',
            size: 'small',
            color: BEAR,
            text: 'SELL',
          })
        }
      }
      return out
    },
  })
}
