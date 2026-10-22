/**
 * Connors RSI (CRSI) - ported to openalgo-charts from Pine Script v6.
 *
 * Source: https://github.com/mihakralj/pinescript/blob/c4e91b962be09733d8fc76caa5191e9e586c5cee/indicators/oscillators/crsi.pine
 * Repo:   mihakralj/pinescript
 * License: MIT (c) mihakralj
 * SPDX-FileCopyrightText: (c) mihakralj
 * SPDX-FileCopyrightText: (c) 2026 marketcalls (port to openalgo-charts)
 * SPDX-License-Identifier: MIT
 *
 * The average of three components: a short Wilder RSI of price, an RSI of the
 * consecutive up/down streak length, and the percent rank of the one-bar rate
 * of change against its own recent history.
 */

export default function ({ registerIndicator, sourceValues, nulls }) {
  // Wilder RSI with the source's warmup compensation: the running averages are
  // scaled by 1 / (1 - beta^n) until the bias term decays, so a value is
  // available from the second bar rather than after `period` bars.
  const rsiCalc = (values, period) => {
    const n = values.length
    const out = new Array(n).fill(NaN)
    const alpha = 1 / period
    const beta = 1 - alpha
    let prevVal = NaN
    let avgGain = 0
    let avgLoss = 0
    let e = 1
    let warmup = true

    for (let i = 0; i < n; i++) {
      // Pine re-declares result every bar, so an na source yields 50.
      let result = 50
      const source = values[i]
      if (Number.isFinite(source)) {
        if (!Number.isFinite(prevVal)) {
          prevVal = source
        } else {
          const delta = source - prevVal
          const gain = delta > 0 ? delta : 0
          const loss = delta < 0 ? -delta : 0
          prevVal = source

          avgGain = alpha * gain + beta * avgGain
          avgLoss = alpha * loss + beta * avgLoss

          if (warmup) {
            e *= beta
            const c = e > 1e-10 ? 1 / (1 - e) : 1
            const aG = avgGain * c
            const aL = avgLoss * c
            const total = aG + aL
            result = total !== 0 ? (100 * aG) / total : 50
            if (e <= 1e-10) warmup = false
          } else {
            const total = avgGain + avgLoss
            result = total !== 0 ? (100 * avgGain) / total : 50
          }
        }
      }
      out[i] = result
    }
    return out
  }

  registerIndicator({
    id: 'oa-crsi',
    name: 'Connors RSI (CRSI)',
    category: 'Oscillators',
    placement: 'pane',

    inputs: [
      { key: 'source', type: 'source', label: 'Source', default: 'close' },
      { key: 'rsiPeriod', type: 'number', label: 'RSI Period', default: 3, min: 1, max: 500, step: 1 },
      { key: 'streakPeriod', type: 'number', label: 'Streak RSI Period', default: 2, min: 1, max: 500, step: 1 },
      { key: 'rankPeriod', type: 'number', label: 'Percent Rank Period', default: 100, min: 1, max: 1000, step: 1 },
    ],

    plots: [{ key: 'crsi', type: 'line', title: 'CRSI', style: { color: '#ffeb3b', lineWidth: 2 } }],

    levels: () => [
      { price: 70, title: 'Overbought', color: '#787b86', dashed: true },
      { price: 30, title: 'Oversold', color: '#787b86', dashed: true },
    ],

    calc(bars, settings) {
      // A cleared number field arrives as '', and Number('') is 0.
      const rsiPeriod = Math.max(1, Math.min(500, Math.floor(Number(settings.rsiPeriod) || 3)))
      const streakPeriod = Math.max(1, Math.min(500, Math.floor(Number(settings.streakPeriod) || 2)))
      const rankPeriod = Math.max(1, Math.min(1000, Math.floor(Number(settings.rankPeriod) || 100)))
      const src = sourceValues(bars, settings.source ?? 'close')
      const n = bars.length

      // Component 1: RSI of price.
      const priceRsi = rsiCalc(src, rsiPeriod)

      // Component 2: consecutive up/down streak, then an RSI of that streak.
      const streakSeries = new Array(n).fill(0)
      let prevClose = NaN
      let streak = 0
      for (let i = 0; i < n; i++) {
        const s = src[i]
        if (Number.isFinite(s)) {
          if (!Number.isFinite(prevClose)) streak = 0
          else if (s > prevClose) streak = streak >= 0 ? streak + 1 : 1
          else if (s < prevClose) streak = streak <= 0 ? streak - 1 : -1
          else streak = 0
          prevClose = s
        }
        streakSeries[i] = streak
      }
      const streakRsi = rsiCalc(streakSeries, streakPeriod)

      // Component 3: percent rank of the one-bar rate of change against the
      // previous `rankPeriod` readings, counted before the current one is stored.
      const roc = new Array(n).fill(0)
      let prevSrc = NaN
      for (let i = 0; i < n; i++) {
        const s = src[i]
        let value = 0
        if (Number.isFinite(s) && Number.isFinite(prevSrc) && prevSrc !== 0) {
          value = ((s - prevSrc) / prevSrc) * 100
        }
        if (Number.isFinite(s)) prevSrc = s
        roc[i] = value
      }

      const out = new Array(n).fill(NaN)
      for (let i = 0; i < n; i++) {
        const start = Math.max(0, i - rankPeriod)
        const count = i - start
        let lessCount = 0
        for (let k = start; k < i; k++) {
          if (roc[k] < roc[i]) lessCount += 1
        }
        const pctRank = count > 0 ? (lessCount / count) * 100 : 50

        const value = (priceRsi[i] + streakRsi[i] + pctRank) / 3
        if (!Number.isFinite(value)) continue
        out[i] = Math.max(0, Math.min(100, value))
      }

      return { crsi: nulls(out) }
    },
  })
}
