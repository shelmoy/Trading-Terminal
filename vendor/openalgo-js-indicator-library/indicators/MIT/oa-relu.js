/**
 * Rectified Linear Unit (ReLU) - ported to openalgo-charts from Pine Script v6.
 *
 * Source: https://github.com/mihakralj/pinescript/blob/c4e91b962be09733d8fc76caa5191e9e586c5cee/indicators/numerics/relu.pine
 * Repo:   mihakralj/pinescript
 * License: MIT
 * SPDX-FileCopyrightText: (c) mihakralj
 * SPDX-FileCopyrightText: (c) 2026 marketcalls (port to openalgo-charts)
 * SPDX-License-Identifier: MIT
 *
 * Splits the gap between price and its 20-bar simple moving average into two
 * one-sided halves: the positive side is drawn above zero and the negative side
 * is mirrored below it, so only the active side of the deviation is ever shown.
 */

export default function ({ registerIndicator, sourceValues, sma, nulls }) {
  // The Pine script hard-codes ta.sma(source, 20); it exposes no length input.
  const SMA_PERIOD = 20

  registerIndicator({
    id: 'oa-relu',
    name: 'Rectified Linear Unit (ReLU)',
    category: 'Numerics',
    placement: 'pane',

    inputs: [{ key: 'source', type: 'source', label: 'Source', default: 'close' }],

    plots: [
      { key: 'reluUp', type: 'line', title: 'ReLU Up', style: { color: '#4caf50', lineWidth: 2 } },
      { key: 'reluDn', type: 'line', title: 'ReLU Down', style: { color: '#ff5252', lineWidth: 2 } },
    ],

    calc(bars, settings) {
      const src = sourceValues(bars, settings.source ?? 'close')
      const basis = sma(src, SMA_PERIOD)

      const up = new Array(bars.length).fill(NaN)
      const dn = new Array(bars.length).fill(NaN)

      for (let i = 0; i < bars.length; i++) {
        // ta.sma is na for the first 19 bars, so both legs stay in warmup.
        if (!Number.isFinite(src[i]) || !Number.isFinite(basis[i])) continue
        up[i] = Math.max(0, src[i] - basis[i])
        dn[i] = -Math.max(0, basis[i] - src[i])
      }

      return { reluUp: nulls(up), reluDn: nulls(dn) }
    },
  })
}
