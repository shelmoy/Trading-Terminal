/**
 * Corrected Moving Average (CMA) - ported to openalgo-charts from Pine Script v6.
 *
 * Source: https://github.com/everget/tradingview-pinescript-indicators/blob/60c93d3711d222b8f2db96160defe568429348e0/movings/corrected_moving_average.pine
 * Repo:   everget/tradingview-pinescript-indicators
 * License: GPL-3.0 (c) 2020-present Alex Orekhov (everget)
 * SPDX-FileCopyrightText: (c) 2018-present Alex Orekhov (everget)
 * SPDX-FileCopyrightText: (c) 2026 marketcalls (port to openalgo-charts)
 * SPDX-License-Identifier: GPL-3.0-only
 *
 * A simple moving average that only steps toward its new value when the step is
 * large against the dispersion of the window, so the line holds flat through
 * noise and tracks the average once a move is big enough to be a move.
 */

export default function ({ registerIndicator, sourceValues, sma, stdev, nulls }) {
  const ORANGE = '#FF9800'
  const GREEN = '#4CAF50'
  const RED = '#FF5252'

  const crossed = (a, b, index, up) => {
    if (index < 1) return false
    const curA = a[index]
    const curB = b[index]
    const prevA = a[index - 1]
    const prevB = b[index - 1]
    // Pine treats every comparison against na as false; JavaScript does not, so
    // an unguarded test fires on the first bar the warmup gap closes.
    if (![curA, curB, prevA, prevB].every(Number.isFinite)) return false
    return up ? curA > curB && prevA <= prevB : curA < curB && prevA >= prevB
  }

  registerIndicator({
    id: 'oa-corrected-moving-average',
    name: 'Corrected Moving Average',
    category: 'Moving Averages',
    placement: 'onchart',

    inputs: [
      { key: 'length', type: 'number', label: 'Length', default: 35, min: 1, max: 5000, step: 1 },
      { key: 'source', type: 'source', label: 'Source', default: 'close' },
      {
        key: 'highlightDirection',
        type: 'boolean',
        label: 'Highlight CMA',
        default: false,
        tooltip: 'Colour the CMA green while it rises and red while it falls instead of a single colour.',
      },
      {
        key: 'applyRibbonFilling',
        type: 'boolean',
        label: 'Apply Ribbon Filling',
        default: true,
        tooltip: 'Shade between the SMA and the CMA, green where the SMA leads and red where it lags.',
      },
    ],

    // The ribbon edges are separate plots because a fill may only name plots,
    // and the 'Apply Ribbon Filling' switch has to be able to withhold the
    // shading without also withholding the two lines. They carry the same values
    // and the same style as the lines they sit on, so they are invisible.
    plots: [
      {
        key: 'cma',
        type: 'line',
        title: 'CMA',
        style: { color: ORANGE, lineWidth: 2 },
        colorBy: ({ index, values, settings }) => {
          if (settings.highlightDirection !== true) return ORANGE
          const cur = values.cma[index]
          const prev = index > 0 ? values.cma[index - 1] : undefined
          if (!Number.isFinite(cur) || !Number.isFinite(prev)) return RED
          return cur > prev ? GREEN : RED
        },
      },
      { key: 'sma', type: 'line', title: 'SMA', style: { color: '#2962ff', lineWidth: 2 } },
      { key: 'ribbonSma', type: 'line', title: 'Ribbon Edge (SMA)', style: { color: '#2962ff', lineWidth: 2 } },
      { key: 'ribbonCma', type: 'line', title: 'Ribbon Edge (CMA)', style: { color: ORANGE, lineWidth: 2 } },
    ],

    // color.new(#0ebb23, 75) and color.new(#cc0000, 75) are 75 percent
    // transparent, so opacity 0.25. Up is where the SMA leads the CMA.
    fills: [
      { between: ['ribbonSma', 'ribbonCma'], colorUp: '#0ebb23', colorDown: '#cc0000', opacity: 0.25 },
    ],

    alerts: [
      {
        id: 'cma-long',
        title: 'Long Signal',
        message: 'Enter Long: the SMA crossed above the Corrected Moving Average.',
        when: ({ values, index }) => crossed(values.sma, values.cma, index, true),
      },
      {
        id: 'cma-short',
        title: 'Short Signal',
        message: 'Enter Short: the SMA crossed below the Corrected Moving Average.',
        when: ({ values, index }) => crossed(values.sma, values.cma, index, false),
      },
    ],

    calc(bars, settings) {
      // A cleared number field arrives as '', and Number('') is 0.
      const length = Math.max(1, Math.floor(Number(settings.length) || 35))
      const applyRibbonFilling = settings.applyRibbonFilling !== false
      const src = sourceValues(bars, settings.source ?? 'close')

      const n = bars.length
      const smaLine = sma(src, length)
      // ta.variance defaults to biased=true, which is the population variance,
      // and the exported stdev is the population standard deviation over the
      // same window, so squaring it reproduces both the value and the warmup.
      const sd = stdev(src, length)

      const cma = new Array(n).fill(NaN)
      const smaOut = new Array(n).fill(NaN)
      const ribbonSma = new Array(n).fill(NaN)
      const ribbonCma = new Array(n).fill(NaN)

      let prevCma = NaN
      for (let i = 0; i < n; i++) {
        const mean = smaLine[i]
        if (!Number.isFinite(mean) || !Number.isFinite(sd[i])) continue

        // nz(cma[1], sma): the first bar that has an average seeds from it.
        const cmaPrev = Number.isFinite(prevCma) ? prevCma : mean
        const v1 = sd[i] * sd[i]
        const dev = cmaPrev - mean
        const v2 = dev * dev
        const denom = v1 + v2
        const v3 = v1 === 0 || v2 === 0 || denom <= 0 ? 1 : v2 / denom
        // Closed form of the source's fixed-point iteration, clamped at 0 where
        // the iteration collapses. v3 is in (0, 1], so k never exceeds 1.
        const k = Math.max(0, 2 - 1 / v3)
        const value = cmaPrev + k * (mean - cmaPrev)

        cma[i] = value
        smaOut[i] = mean
        if (applyRibbonFilling) {
          ribbonSma[i] = mean
          ribbonCma[i] = value
        }
        prevCma = value
      }

      return {
        cma: nulls(cma),
        sma: nulls(smaOut),
        ribbonSma: nulls(ribbonSma),
        ribbonCma: nulls(ribbonCma),
      }
    },
  })
}
