/**
 * Qstick Indicator (QSTICK) - ported to openalgo-charts from Pine Script v6.
 *
 * Source: https://github.com/mihakralj/pinescript/blob/c4e91b962be09733d8fc76caa5191e9e586c5cee/indicators/dynamics/qstick.pine
 * Repo:   mihakralj/pinescript
 * License: MIT (c) mihakralj
 * SPDX-FileCopyrightText: (c) mihakralj
 * SPDX-FileCopyrightText: (c) 2026 marketcalls (port to openalgo-charts)
 * SPDX-License-Identifier: MIT
 *
 * A moving average of the close-minus-open body, so it reads how consistently
 * candles have been closing above or below where they opened: above zero is a
 * run of buying pressure, below zero a run of selling pressure.
 */

export default function ({ registerIndicator, sourceValues, nulls, withAlpha }) {
  const GREEN = '#4CAF50'
  const RED = '#FF5252'

  registerIndicator({
    id: 'oa-qstick',
    name: 'Qstick Indicator',
    category: 'Dynamics',
    placement: 'pane',

    inputs: [
      {
        key: 'length',
        type: 'number',
        label: 'Length',
        default: 14,
        min: 1,
        max: 5000,
        step: 1,
        tooltip: 'Lookback period for moving average calculation.',
      },
      {
        key: 'maType',
        type: 'select',
        label: 'MA Type',
        default: 'SMA',
        options: [
          { label: 'SMA', value: 'SMA' },
          { label: 'EMA', value: 'EMA' },
        ],
        tooltip: 'Simple (SMA) or Exponential (EMA) moving average.',
      },
      {
        key: 'sourceClose',
        type: 'source',
        label: 'Close Source',
        default: 'close',
        tooltip: 'Source for closing price.',
      },
      {
        key: 'sourceOpen',
        type: 'source',
        label: 'Open Source',
        default: 'open',
        tooltip: 'Source for opening price.',
      },
    ],

    plots: [{ key: 'qstick', type: 'line', title: 'Qstick', style: { color: '#ffeb3b', lineWidth: 2 } }],

    levels: () => [{ price: 0, title: 'Zero Line', color: '#787b86', dashed: true }],

    // bgcolor(qstick > 0 ? green 90% transparent : red 90% transparent).
    background: ({ bars, values }) => {
      const up = withAlpha(GREEN, 0.1)
      const down = withAlpha(RED, 0.1)
      return bars.map((_b, i) => {
        const v = values.qstick[i]
        if (!Number.isFinite(v)) return null
        return v > 0 ? up : down
      })
    },

    calc(bars, settings) {
      // A cleared number field arrives as '', and Number('') is 0.
      const length = Math.max(1, Math.floor(Number(settings.length) || 14))
      const useEma = settings.maType === 'EMA'
      const closeSrc = sourceValues(bars, settings.sourceClose ?? 'close')
      const openSrc = sourceValues(bars, settings.sourceOpen ?? 'open')

      const n = bars.length
      const diff = new Array(n).fill(NaN)
      for (let i = 0; i < n; i++) {
        if (Number.isFinite(closeSrc[i]) && Number.isFinite(openSrc[i])) diff[i] = closeSrc[i] - openSrc[i]
      }

      const out = new Array(n).fill(NaN)

      if (useEma) {
        // var float ema = 0.0, with no warmup compensator: the source starts the
        // recursion at zero and emits from bar 0, so the first readings are
        // pulled toward zero. That bias is part of the published behaviour.
        const alpha = 2 / (length + 1)
        let acc = 0
        for (let i = 0; i < n; i++) {
          if (Number.isFinite(diff[i])) acc = alpha * (diff[i] - acc) + acc
          out[i] = acc
        }
      } else {
        // The circular buffer in the source counts only the slots it has filled,
        // so the divisor grows from 1 to length: an expanding mean that becomes a
        // rolling one, again emitting from bar 0 rather than after length-1 bars.
        const buffer = new Array(length).fill(NaN)
        let head = 0
        let sum = 0
        let count = 0
        for (let i = 0; i < n; i++) {
          const oldest = buffer[head]
          if (Number.isFinite(oldest)) sum -= oldest
          else count += 1
          const current = Number.isFinite(diff[i]) ? diff[i] : 0
          sum += current
          buffer[head] = current
          head = (head + 1) % length
          out[i] = sum / Math.max(1, count)
        }
      }

      return { qstick: nulls(out) }
    },
  })
}
