/**
 * Intraday Momentum Index (IMI) - ported to openalgo-charts from Pine Script v6.
 *
 * Source: https://github.com/mihakralj/pinescript/blob/c4e91b962be09733d8fc76caa5191e9e586c5cee/indicators/oscillators/imi.pine
 * Repo:   mihakralj/pinescript
 * License: MIT (c) mihakralj
 * SPDX-FileCopyrightText: (c) mihakralj
 * SPDX-FileCopyrightText: (c) 2026 marketcalls (port to openalgo-charts)
 * SPDX-License-Identifier: MIT
 *
 * An RSI built from the bar's own body rather than from close to close: the up
 * bodies as a share of all bodies over the lookback, so it reads whether the
 * period's buying or selling happened inside the bars.
 */

export default function ({ registerIndicator, nulls }) {
  registerIndicator({
    id: 'oa-imi',
    name: 'Intraday Momentum Index (IMI)',
    category: 'Oscillators',
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
        tooltip: 'Number of bars used in the calculation',
      },
    ],

    plots: [{ key: 'imi', type: 'line', title: 'IMI', style: { color: '#ffeb3b', lineWidth: 2 } }],

    calc(bars, settings) {
      // A cleared number field arrives as '', and Number('') is 0. The source
      // refuses a period of 0 or less.
      const period = Math.max(1, Math.floor(Number(settings.period) || 14))
      const n = bars.length

      const gains = new Array(n).fill(0)
      const losses = new Array(n).fill(0)
      const out = new Array(n).fill(NaN)

      // The source's circular buffers start full of zeros, so the sums run over
      // however many bars exist and the line starts on the first bar.
      let gainSum = 0
      let lossSum = 0

      for (let i = 0; i < n; i++) {
        const open = bars[i].open
        const close = bars[i].close

        let gain = 0
        let loss = 0
        if (Number.isFinite(open) && Number.isFinite(close)) {
          if (close > open) gain = close - open
          else if (close < open) loss = open - close
        }

        gains[i] = gain
        losses[i] = loss
        gainSum += gain
        lossSum += loss

        const dropped = i - period
        if (dropped >= 0) {
          gainSum -= gains[dropped]
          lossSum -= losses[dropped]
        }

        // A run of doji bars leaves nothing to divide by, which the source
        // calls neutral.
        const total = gainSum + lossSum
        out[i] = total !== 0 ? (100 * gainSum) / total : 50
      }

      return { imi: nulls(out) }
    },
  })
}
