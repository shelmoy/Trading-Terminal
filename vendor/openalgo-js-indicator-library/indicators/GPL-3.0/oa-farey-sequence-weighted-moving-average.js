/**
 * Farey Sequence Weighted Moving Average (FSWMA) - ported to openalgo-charts from Pine Script v4.
 *
 * Source: https://github.com/everget/tradingview-pinescript-indicators/blob/60c93d3711d222b8f2db96160defe568429348e0/movings/farey_sequence_weighted_moving_average.pine
 * Repo:   everget/tradingview-pinescript-indicators
 * License: GPL-3.0 (c) 2019-present, Alex Orekhov (everget)
 * SPDX-FileCopyrightText: (c) 2018-present Alex Orekhov (everget)
 * SPDX-FileCopyrightText: (c) 2026 marketcalls (port to openalgo-charts)
 * SPDX-License-Identifier: GPL-3.0-only
 *
 * A moving average whose weights are the Farey sequence of the chosen order,
 * the fractions in lowest terms between 0 and 1 taken in descending size, so
 * the window length and the taper are both fixed by that one number.
 */

export default function ({ registerIndicator, sourceValues, nulls }) {
  // Transcribed verbatim from the generated weight table in the source. Index 0
  // is the current bar and index k is src[k], so the window is the row length.
  const WEIGHTS = {
    '2': [1, 0.5],
    '3': [1, 0.667, 0.5, 0.333],
    '4': [1, 0.75, 0.667, 0.5, 0.333, 0.25],
    '5': [1, 0.8, 0.75, 0.667, 0.6, 0.5, 0.4, 0.333, 0.25, 0.2],
    '6': [1, 0.833, 0.8, 0.75, 0.667, 0.6, 0.5, 0.4, 0.333, 0.25, 0.2, 0.167],
    '7': [1, 0.857, 0.833, 0.8, 0.75, 0.714, 0.667, 0.6, 0.571, 0.5, 0.429, 0.4, 0.333, 0.286, 0.25, 0.2, 0.167, 0.143],
    '8': [1, 0.875, 0.857, 0.833, 0.8, 0.75, 0.714, 0.667, 0.625, 0.6, 0.571, 0.5, 0.429, 0.4, 0.375, 0.333, 0.286, 0.25, 0.2, 0.167, 0.143, 0.125],
    '9': [1, 0.889, 0.875, 0.857, 0.833, 0.8, 0.778, 0.75, 0.714, 0.667, 0.625, 0.6, 0.571, 0.556, 0.5, 0.444, 0.429, 0.4, 0.375, 0.333, 0.286, 0.25, 0.222, 0.2, 0.167, 0.143, 0.125, 0.111],
    '10': [1, 0.9, 0.889, 0.875, 0.857, 0.833, 0.8, 0.778, 0.75, 0.714, 0.7, 0.667, 0.625, 0.6, 0.571, 0.556, 0.5, 0.444, 0.429, 0.4, 0.375, 0.333, 0.3, 0.286, 0.25, 0.222, 0.2, 0.167, 0.143, 0.125, 0.111, 0.1],
    '11': [1, 0.909, 0.9, 0.889, 0.875, 0.857, 0.833, 0.818, 0.8, 0.778, 0.75, 0.727, 0.714, 0.7, 0.667, 0.636, 0.625, 0.6, 0.571, 0.556, 0.545, 0.5, 0.455, 0.444, 0.429, 0.4, 0.375, 0.364, 0.333, 0.3, 0.286, 0.273, 0.25, 0.222, 0.2, 0.182, 0.167, 0.143, 0.125, 0.111, 0.1, 0.091],
    '12': [1, 0.917, 0.909, 0.9, 0.889, 0.875, 0.857, 0.833, 0.818, 0.8, 0.778, 0.75, 0.727, 0.714, 0.7, 0.667, 0.636, 0.625, 0.6, 0.583, 0.571, 0.556, 0.545, 0.5, 0.455, 0.444, 0.429, 0.417, 0.4, 0.375, 0.364, 0.333, 0.3, 0.286, 0.273, 0.25, 0.222, 0.2, 0.182, 0.167, 0.143, 0.125, 0.111, 0.1, 0.091, 0.083],
    '13': [1, 0.923, 0.917, 0.909, 0.9, 0.889, 0.875, 0.857, 0.846, 0.833, 0.818, 0.8, 0.778, 0.769, 0.75, 0.727, 0.714, 0.7, 0.692, 0.667, 0.636, 0.625, 0.615, 0.6, 0.583, 0.571, 0.556, 0.545, 0.538, 0.5, 0.462, 0.455, 0.444, 0.429, 0.417, 0.4, 0.385, 0.375, 0.364, 0.333, 0.308, 0.3, 0.286, 0.273, 0.25, 0.231, 0.222, 0.2, 0.182, 0.167, 0.154, 0.143, 0.125, 0.111, 0.1, 0.091, 0.083, 0.077],
    '14': [1, 0.929, 0.923, 0.917, 0.909, 0.9, 0.889, 0.875, 0.857, 0.846, 0.833, 0.818, 0.8, 0.786, 0.778, 0.769, 0.75, 0.727, 0.714, 0.7, 0.692, 0.667, 0.643, 0.636, 0.625, 0.615, 0.6, 0.583, 0.571, 0.556, 0.545, 0.538, 0.5, 0.462, 0.455, 0.444, 0.429, 0.417, 0.4, 0.385, 0.375, 0.364, 0.357, 0.333, 0.308, 0.3, 0.286, 0.273, 0.25, 0.231, 0.222, 0.214, 0.2, 0.182, 0.167, 0.154, 0.143, 0.125, 0.111, 0.1, 0.091, 0.083, 0.077, 0.071],
  }

  // The published divisor of each row. It equals that row's weight sum exactly,
  // but it is kept explicit so the port matches the source line for line.
  const DIVISORS = {
    '2': 1.5,
    '3': 2.5,
    '4': 3.5,
    '5': 5.5,
    '6': 6.5,
    '7': 9.5,
    '8': 11.5,
    '9': 14.5,
    '10': 16.5,
    '11': 21.5,
    '12': 23.5,
    '13': 29.5,
    '14': 32.5,
  }

  const ORDERS = ['2', '3', '4', '5', '6', '7', '8', '9', '10', '11', '12', '13', '14']
  const FLAT_COLOR = '#6d1e7f'
  const UP_COLOR = '#4caf50'
  const DOWN_COLOR = '#ff5252'

  registerIndicator({
    id: 'oa-farey-sequence-weighted-moving-average',
    name: 'Farey Sequence Weighted Moving Average (FSWMA)',
    category: 'Moving Averages',
    placement: 'onchart',

    inputs: [
      {
        key: 'order',
        type: 'select',
        label: 'Order',
        default: '5',
        options: ORDERS.map((o) => ({ label: o, value: o })),
        tooltip: 'Farey sequence order. The window is the number of fractions in that sequence, from 2 bars at order 2 to 64 at order 14.',
      },
      { key: 'source', type: 'source', label: 'Source', default: 'close' },
      { key: 'highlightMovements', type: 'boolean', label: 'Highlight Movements ?', default: true },
    ],

    plots: [
      {
        key: 'fswma',
        type: 'line',
        title: 'FSWMA',
        style: { color: FLAT_COLOR, lineWidth: 2 },
        colorBy({ value, index, values, settings }) {
          if (settings.highlightMovements === false) return FLAT_COLOR
          const previous = values.fswma[index - 1]
          // Pine compares against na on the first plotted bar and every such
          // comparison is false, so that bar takes the down colour.
          if (!Number.isFinite(previous) || !Number.isFinite(value)) return DOWN_COLOR
          return value > previous ? UP_COLOR : DOWN_COLOR
        },
      },
    ],

    calc(bars, settings) {
      const order = String(settings.order ?? '5')
      const weights = WEIGHTS[order] || WEIGHTS['5']
      const divisor = DIVISORS[order] || DIVISORS['5']
      const src = sourceValues(bars, settings.source ?? 'close')

      const out = new Array(bars.length).fill(NaN)
      for (let i = 0; i < bars.length; i++) {
        let sum = 0
        let complete = true
        for (let k = 0; k < weights.length; k++) {
          const j = i - k
          const value = j >= 0 ? src[j] : NaN
          // The source has no nz() here, so one missing term makes the whole
          // average na: the line only starts once the full window exists.
          if (!Number.isFinite(value)) {
            complete = false
            break
          }
          sum += weights[k] * value
        }
        if (complete && divisor > 0) out[i] = sum / divisor
      }

      return { fswma: nulls(out) }
    },
  })
}
