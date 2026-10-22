/**
 * Exponential Distribution CDF (EXPDIST) - ported to openalgo-charts from
 * Pine Script v6.
 *
 * Source: https://github.com/mihakralj/pinescript/blob/c4e91b962be09733d8fc76caa5191e9e586c5cee/indicators/numerics/expdist.pine
 * Repo:   mihakralj/pinescript
 * License: MIT
 * SPDX-FileCopyrightText: (c) mihakralj
 * SPDX-FileCopyrightText: (c) 2026 marketcalls (port to openalgo-charts)
 * SPDX-License-Identifier: MIT
 *
 * The source is scaled to [0,1] against its own lookback range, then read
 * through an exponential cumulative distribution, so the reading rises toward
 * one the further price sits above the bottom of the window.
 */

export default function ({ registerIndicator, sourceValues, nulls }) {
  // A cleared field arrives as '', and Number('') is 0, which would silently
  // replace a deliberate value. Fall back only when the field is truly empty.
  const numOr = (v, fallback) => {
    if (v === '' || v === null || v === undefined) return fallback
    const n = Number(v)
    return Number.isFinite(n) ? n : fallback
  }

  registerIndicator({
    id: 'oa-expdist',
    name: 'Exponential Distribution CDF (EXPDIST)',
    category: 'Numerics',
    placement: 'pane',

    inputs: [
      { key: 'source', type: 'source', label: 'Source', default: 'close' },
      {
        key: 'period',
        type: 'number',
        label: 'Lookback Period',
        default: 50,
        min: 2,
        max: 5000,
        step: 1,
        tooltip: 'Min-max normalization window',
      },
      {
        key: 'lambda',
        type: 'number',
        label: 'Lambda',
        default: 3.0,
        min: 0.01,
        max: 100,
        step: 0.1,
        tooltip: 'Rate parameter; higher = faster rise toward 1',
      },
    ],

    plots: [{ key: 'expdist', type: 'line', title: 'EXPDIST', style: { color: '#ffeb3b', lineWidth: 2 } }],

    levels: () => [
      { price: 0.95, title: 'Upper', color: '#ef5350' },
      { price: 0.5, title: 'Midline', color: '#787b86' },
      { price: 0.05, title: 'Lower', color: '#4caf50' },
    ],

    calc(bars, settings) {
      const n = bars.length
      const period = Math.max(2, Math.min(5000, Math.floor(numOr(settings.period, 50))))
      const lambda = Math.max(0.01, numOr(settings.lambda, 3.0))
      const src = sourceValues(bars, settings.source ?? 'close')

      const out = new Array(n).fill(NaN)

      // The source scans source[0..period-1] and skips whatever is na, so at
      // the head of the chart the window is simply shorter and there is no
      // warmup gap. Two monotonic index queues give the same answer in one
      // pass instead of rescanning the window on every bar.
      const minQ = []
      const maxQ = []
      let minHead = 0
      let maxHead = 0

      for (let i = 0; i < n; i++) {
        const oldest = i - period + 1
        while (minHead < minQ.length && minQ[minHead] < oldest) minHead++
        while (maxHead < maxQ.length && maxQ[maxHead] < oldest) maxHead++

        const v = src[i]
        if (Number.isFinite(v)) {
          while (minQ.length > minHead && src[minQ[minQ.length - 1]] >= v) minQ.pop()
          minQ.push(i)
          while (maxQ.length > maxHead && src[maxQ[maxQ.length - 1]] <= v) maxQ.pop()
          maxQ.push(i)
        }

        // Pine seeds minVal and maxVal from the current bar's source, so a na
        // reading there makes the whole result na.
        if (!Number.isFinite(v)) continue
        const minVal = src[minQ[minHead]]
        const maxVal = src[maxQ[maxHead]]

        const range = maxVal - minVal
        const x = range > 0 ? (v - minVal) / range : 0.5
        out[i] = x <= 0 ? 0 : 1 - Math.exp(-lambda * x)

        // Keep the queues from growing without bound once the head has moved.
        if (minHead > 1024) {
          minQ.splice(0, minHead)
          minHead = 0
        }
        if (maxHead > 1024) {
          maxQ.splice(0, maxHead)
          maxHead = 0
        }
      }

      return { expdist: nulls(out) }
    },
  })
}
