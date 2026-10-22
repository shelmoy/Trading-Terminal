/**
 * MA Envelope (MAE) - ported to openalgo-charts from Pine Script v6.
 *
 * Source: https://github.com/mihakralj/pinescript/blob/c4e91b962be09733d8fc76caa5191e9e586c5cee/indicators/channels/maenv.pine
 * Repo:   mihakralj/pinescript
 * License: MIT (c) mihakralj
 * SPDX-FileCopyrightText: (c) mihakralj
 * SPDX-FileCopyrightText: (c) 2026 marketcalls (port to openalgo-charts)
 * SPDX-License-Identifier: MIT
 *
 * A moving average with two bands a fixed percentage above and below it, so
 * the channel scales with price rather than with volatility.
 */

export default function ({ registerIndicator, sourceValues, nulls }) {
  registerIndicator({
    id: 'oa-maenv',
    name: 'MA Envelope (MAE)',
    category: 'Channels',
    placement: 'onchart',

    inputs: [
      { key: 'source', type: 'source', label: 'Source', default: 'close' },
      { key: 'length', type: 'number', label: 'Length', default: 20, min: 1, max: 5000, step: 1 },
      { key: 'percentage', type: 'number', label: 'Percentage', default: 1.0, min: 0.001, max: 1000, step: 0.1 },
      {
        key: 'maType',
        type: 'select',
        label: 'MA Type',
        default: 'EMA',
        options: [
          { label: 'SMA', value: 'SMA' },
          { label: 'EMA', value: 'EMA' },
          { label: 'WMA', value: 'WMA' },
        ],
        tooltip: 'Pine ma_type 0:SMA, 1:EMA, 2:WMA. EMA is the source default.',
      },
    ],

    plots: [
      { key: 'middle', type: 'line', title: 'Middle', style: { color: '#ffeb3b', lineWidth: 2 } },
      { key: 'upper', type: 'line', title: 'Upper', style: { color: '#ffeb3b', lineWidth: 2 } },
      { key: 'lower', type: 'line', title: 'Lower', style: { color: '#ffeb3b', lineWidth: 2 } },
    ],

    fills: [{ between: ['upper', 'lower'], colorUp: '#2196f3', colorDown: '#2196f3', opacity: 0.1 }],

    calc(bars, settings) {
      // A cleared number field arrives as '', and Number('') is 0.
      const length = Math.max(1, Math.floor(Number(settings.length) || 20))
      const percentage = Math.max(0.001, Number(settings.percentage) || 1.0)
      const src = sourceValues(bars, settings.source ?? 'close')
      const maType = settings.maType === 'SMA' || settings.maType === 'WMA' ? settings.maType : 'EMA'

      const middle = new Array(bars.length).fill(NaN)

      if (maType === 'SMA') {
        // Pine's circular buffer averages over however many bars exist, so the
        // line starts on the very first bar instead of after a warmup.
        let sum = 0
        let count = 0
        for (let i = 0; i < bars.length; i++) {
          const current = Number.isFinite(src[i]) ? src[i] : 0
          if (i >= length) {
            const oldest = Number.isFinite(src[i - length]) ? src[i - length] : 0
            sum -= oldest
            count -= 1
          }
          sum += current
          count += 1
          middle[i] = count > 0 ? sum / count : NaN
        }
      } else if (maType === 'WMA') {
        // Weights (length - i) * length over the window, with missing history
        // read as 0 by nz(). The extra factor of length cancels in sum / norm.
        let norm = 0
        for (let j = 0; j < length; j++) norm += (length - j) * length
        for (let i = 0; i < bars.length; i++) {
          let sum = 0
          for (let j = 0; j < length; j++) {
            const idx = i - j
            const v = idx >= 0 && Number.isFinite(src[idx]) ? src[idx] : 0
            sum += v * ((length - j) * length)
          }
          middle[i] = norm > 0 ? sum / norm : NaN
        }
      } else {
        // Warmup-compensated EMA: the running weight divides out the missing
        // history, so this too has a value on the first bar.
        const alpha = 2.0 / (length + 1)
        let sum = 0
        let weight = 0
        for (let i = 0; i < bars.length; i++) {
          // Pine does not guard the source here; skipping a missing bar keeps
          // one gap from poisoning every later value.
          if (!Number.isFinite(src[i])) continue
          sum = sum * (1.0 - alpha) + src[i] * alpha
          weight = weight * (1.0 - alpha) + alpha
          middle[i] = weight !== 0 ? sum / weight : NaN
        }
      }

      const upper = new Array(bars.length).fill(NaN)
      const lower = new Array(bars.length).fill(NaN)
      for (let i = 0; i < bars.length; i++) {
        if (!Number.isFinite(middle[i])) continue
        const dist = (middle[i] * percentage) / 100.0
        upper[i] = middle[i] + dist
        lower[i] = middle[i] - dist
      }

      return { middle: nulls(middle), upper: nulls(upper), lower: nulls(lower) }
    },
  })
}
