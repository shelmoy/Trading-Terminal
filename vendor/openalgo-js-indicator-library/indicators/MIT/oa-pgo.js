/**
 * Pretty Good Oscillator - ported to openalgo-charts from Pine Script v6.
 *
 * Source: https://github.com/mihakralj/pinescript/blob/c4e91b962be09733d8fc76caa5191e9e586c5cee/indicators/oscillators/pgo.pine
 * Repo:   mihakralj/pinescript
 * License: MIT
 * SPDX-FileCopyrightText: (c) mihakralj
 * SPDX-FileCopyrightText: (c) 2026 marketcalls (port to openalgo-charts)
 * SPDX-License-Identifier: MIT
 *
 * Measures how far price sits from its moving average in units of average
 * true range, so readings beyond plus or minus 3 mark an unusually stretched
 * move rather than a fixed price distance.
 */

export default function ({ registerIndicator, sourceValues, nulls }) {
  registerIndicator({
    id: 'oa-pgo',
    name: 'Pretty Good Oscillator',
    category: 'Oscillators',
    placement: 'pane',

    inputs: [
      {
        key: 'period',
        type: 'number',
        label: 'Period',
        default: 14,
        min: 1,
        max: 500,
        step: 1,
        tooltip: 'Number of bars used for both the moving average and the average true range.',
      },
      { key: 'source', type: 'source', label: 'Source', default: 'close' },
    ],

    plots: [{ key: 'pgo', type: 'line', title: 'PGO', style: { color: '#ffeb3b', lineWidth: 2 } }],

    levels: () => [
      { price: 0, title: 'Zero Line', color: '#787b86' },
      { price: 3, title: 'Overbought', color: '#ff5252', dashed: true },
      { price: -3, title: 'Oversold', color: '#4caf50', dashed: true },
    ],

    // bgcolor(): shade the pane while the oscillator sits in an extreme zone.
    background: ({ bars, values }) => {
      const pgo = values.pgo
      return bars.map((_, i) => {
        const v = pgo ? pgo[i] : null
        if (!Number.isFinite(v)) return null
        if (v > 3) return 'rgba(255, 82, 82, 0.15)'
        if (v < -3) return 'rgba(76, 175, 80, 0.15)'
        return null
      })
    },

    calc(bars, settings) {
      // A cleared number field arrives as '', and Number('') is 0.
      const period = Math.max(1, Math.min(5000, Math.floor(Number(settings.period) || 14)))
      const src = sourceValues(bars, settings.source ?? 'close')
      const len = bars.length
      const out = new Array(len).fill(NaN)

      // Moving average: Pine's circular buffer averages only the slots filled
      // so far, so it emits a partial-window mean from the very first bar.
      const buffer = new Array(period).fill(NaN)
      let head = 0
      let sum = 0
      let validCount = 0

      // Average true range: a bias-corrected exponential mean. `e` decays by
      // beta each bar while the correction is still material, which is the
      // Pine `warmup` flag.
      const alpha = 1 / period
      const beta = 1 - alpha
      let warmup = true
      let e = 1
      let emaTr = 0
      let atrValue = 0

      for (let i = 0; i < len; i++) {
        const value = src[i]

        const oldest = buffer[head]
        if (Number.isFinite(oldest)) {
          sum -= oldest
          validCount -= 1
        }
        if (Number.isFinite(value)) {
          sum += value
          validCount += 1
        }
        buffer[head] = Number.isFinite(value) ? value : NaN
        head = (head + 1) % period

        // nz(sma_sum / valid_count, source): an empty window falls back to the
        // current source value.
        let maValue = validCount > 0 ? sum / validCount : NaN
        if (!Number.isFinite(maValue)) maValue = value

        const bar = bars[i]
        const prev = i > 0 ? bars[i - 1] : null
        const prevClose = prev && Number.isFinite(prev.close) ? prev.close : bar.close
        const tr1 = bar.high - bar.low
        const tr2 = Math.abs(bar.high - prevClose)
        const tr3 = Math.abs(bar.low - prevClose)
        let tr = Math.max(tr1, Math.max(tr2, tr3))
        if (!Number.isFinite(tr)) tr = 0

        emaTr = alpha * (tr - emaTr) + emaTr
        if (warmup) {
          e *= beta
          // Pine multiplies by 1 / (1 - e); dividing keeps the zero guarded.
          const correction = 1 - e
          atrValue = Math.abs(correction) > 1e-15 ? emaTr / correction : emaTr
          warmup = e > 1e-10
        } else {
          atrValue = emaTr
        }

        if (atrValue > 0 && Number.isFinite(value) && Number.isFinite(maValue)) {
          out[i] = (value - maValue) / atrValue
        }
      }

      return { pgo: nulls(out) }
    },
  })
}
