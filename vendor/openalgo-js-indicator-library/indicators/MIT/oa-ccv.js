/**
 * Close-to-Close Volatility (CCV) - ported to openalgo-charts from Pine Script v6.
 *
 * Source: https://github.com/mihakralj/pinescript/blob/c4e91b962be09733d8fc76caa5191e9e586c5cee/indicators/volatility/ccv.pine
 * Repo:   mihakralj/pinescript
 * License: MIT (c) mihakralj
 * SPDX-FileCopyrightText: (c) mihakralj
 * SPDX-FileCopyrightText: (c) 2026 marketcalls (port to openalgo-charts)
 * SPDX-License-Identifier: MIT
 *
 * The annualised dispersion of log returns taken close to close, the classic
 * historical-volatility estimate: it ignores the intrabar range and reads only
 * how far each close travelled from the last.
 */

export default function ({ registerIndicator, nulls }) {
  const SQRT_252 = Math.sqrt(252)
  const EPSILON = 1e-10

  registerIndicator({
    id: 'oa-ccv',
    name: 'Close-to-Close Volatility (CCV)',
    category: 'Volatility',
    placement: 'pane',

    inputs: [
      {
        key: 'length',
        type: 'number',
        label: 'Length',
        default: 20,
        min: 1,
        max: 500,
        step: 1,
        tooltip: 'Number of bars for volatility calculation.',
      },
      {
        key: 'method',
        type: 'number',
        label: 'Method',
        default: 1,
        min: 1,
        max: 3,
        step: 1,
        tooltip: '1 = SMA, 2 = EMA, 3 = WMA. Method 3 reduces to method 1 in the source formula.',
      },
    ],

    plots: [
      { key: 'ccv', type: 'line', title: 'CCV', style: { color: '#ffeb3b', lineWidth: 2 } },
    ],

    calc(bars, settings) {
      // A cleared field arrives as '', and Number('') is 0.
      const length = Math.max(1, Math.min(500, Math.floor(Number(settings.length) || 20)))
      const method = Math.max(1, Math.min(3, Math.floor(Number(settings.method) || 1)))

      const size = Math.max(1, length)
      const buffer = new Array(size).fill(NaN)
      let head = 0
      let count = 0

      // The source adds the first bar's na return into its running sum, so that
      // sum is na for the whole series and nz(sum / count) is 0 on every bar.
      // The dispersion below is therefore measured about zero, not about the
      // mean of the window. Reproduced rather than corrected.
      const mean = 0

      let rawRma = 0
      let e = 1
      const alpha = 1 / length
      const beta = 1 - alpha

      // Pine's int division: length * (length + 1) is always even, so this is
      // exact either way.
      const sumWeight = Math.floor((length * (length + 1)) / 2)

      const out = new Array(bars.length).fill(NaN)
      for (let i = 0; i < bars.length; i++) {
        const close = bars[i].close
        const prevClose = i > 0 ? bars[i - 1].close : NaN
        let priceReturn = NaN
        if (Number.isFinite(close) && Number.isFinite(prevClose) && close > 0 && prevClose > 0) {
          priceReturn = Math.log(close / prevClose)
        }

        // Only the count is maintained here: the running sum is dead weight in
        // the source for the reason noted above.
        if (Number.isFinite(buffer[head])) count -= 1
        count += 1
        buffer[head] = priceReturn
        head = (head + 1) % size

        let squaredSum = 0
        for (let k = 0; k < length; k++) {
          const value = buffer[(((head - k - 1) % size) + size) % size]
          if (Number.isFinite(value)) squaredSum += Math.pow(value - mean, 2)
        }
        const annualizedStdDev = count > 0 ? Math.sqrt(squaredSum / count) * SQRT_252 : NaN

        let result = NaN
        if (method === 1) {
          result = annualizedStdDev
        } else if (method === 2) {
          rawRma = (rawRma * (length - 1) + annualizedStdDev) / length
          e *= beta
          result = e > EPSILON ? rawRma / (1 - e) : rawRma
        } else {
          // The source weights the current value by every weight in turn rather
          // than walking back through the buffer, so the weighted sum collapses
          // to annualizedStdDev * sumWeight and this branch returns the raw
          // value, exactly as method 1 does.
          let weightedSum = 0
          let weight = length
          for (let k = 0; k < length; k++) {
            weightedSum += annualizedStdDev * weight
            weight -= 1
          }
          result = sumWeight > 0 ? weightedSum / sumWeight : NaN
        }
        out[i] = result
      }

      // Bar 0 has no previous close, so the 0 the source reports there is the
      // absence of a return rather than a measurement of one: left as a gap so
      // it does not anchor the pane.
      if (out.length > 0) out[0] = NaN

      return { ccv: nulls(out) }
    },
  })
}
