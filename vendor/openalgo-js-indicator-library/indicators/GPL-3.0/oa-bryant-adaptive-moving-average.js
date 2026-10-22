/**
 * Bryant Adaptive Moving Average (BAMA) - ported to openalgo-charts from
 * Pine Script v3.
 *
 * Source: https://github.com/everget/tradingview-pinescript-indicators/blob/60c93d3711d222b8f2db96160defe568429348e0/movings/bryant_adaptive_moving_average.pine
 * Repo:   everget/tradingview-pinescript-indicators
 * License: GPL-3.0
 *   Copyright (c) 2014-present, Michael R. Bryant
 *   Copyright (c) 2019-present, Alex Orekhov (everget)
 *   Bryant Adaptive Moving Average script may be freely distributed under the
 *   terms of the GPL-3.0 license.
 * SPDX-FileCopyrightText: (c) 2018-present Alex Orekhov (everget)
 * SPDX-FileCopyrightText: (c) 2026 marketcalls (port to openalgo-charts)
 * SPDX-License-Identifier: GPL-3.0-only
 *
 * An exponential average whose period is driven by a variable efficiency ratio,
 * so a directional move shortens the period and a choppy one lengthens it up to
 * the max length. The trend parameter tilts how hard the efficiency ratio is
 * allowed to push.
 */

export default function ({ registerIndicator, sourceValues, nulls }) {
  // Pine v3 `green` and `red`, kept so the highlight matches the source.
  const UP_COLOR = '#008000'
  const DOWN_COLOR = '#ff0000'

  registerIndicator({
    id: 'oa-bryant-adaptive-moving-average',
    name: 'Bryant Adaptive Moving Average (BAMA)',
    category: 'Moving Averages',
    placement: 'onchart',

    inputs: [
      { key: 'length', type: 'number', label: 'Length', default: 14, min: 1, max: 5000, step: 1 },
      {
        key: 'trendParam',
        type: 'number',
        label: 'Trend Parameter',
        default: -1,
        min: -10,
        max: 10,
        step: 0.1,
        tooltip: 'Tilts the variable efficiency ratio. Negative values react harder to a trend.',
      },
      {
        key: 'maxLength',
        type: 'number',
        label: 'Max Length',
        default: 100,
        min: 1,
        max: 5000,
        step: 1,
      },
      {
        key: 'highlightMovements',
        type: 'boolean',
        label: 'Highlight Movements ?',
        default: false,
      },
      { key: 'source', type: 'source', label: 'Source', default: 'close' },
    ],

    plots: [
      {
        key: 'bama',
        type: 'line',
        title: 'BAMA',
        style: { color: '#6d1e7f', lineWidth: 2 },
        colorBy({ value, index, values, settings }) {
          // Returning undefined leaves the plot on its own style colour, which
          // is what the source does when the highlight is switched off.
          if (settings?.highlightMovements !== true) return undefined
          const series = values?.bama
          const prev = index > 0 && series ? series[index - 1] : null
          if (!Number.isFinite(value) || !Number.isFinite(prev)) return undefined
          return value > prev ? UP_COLOR : DOWN_COLOR
        },
      },
    ],

    calc(bars, settings) {
      // A cleared number field arrives as '', and Number('') is 0.
      const length = Math.max(1, Math.floor(Number(settings.length) || 14))
      const maxLength = Math.max(1, Math.floor(Number(settings.maxLength) || 100))
      // 0 is a legal trend parameter, so `|| -1` would swallow it. Only a
      // genuinely empty or non-numeric field falls back to the default.
      const rawTrend = settings.trendParam
      const trendParam =
        rawTrend === '' || rawTrend == null || !Number.isFinite(Number(rawTrend))
          ? -1
          : Number(rawTrend)

      const src = sourceValues(bars, settings.source ?? 'close')
      const n = bars.length

      // volatility = sum(abs(change(src)), length). The library rollingSum is a
      // running total, so the NaN at bar 0 would poison every later bar; this
      // window sum instead stays na until the window holds no na at all, which
      // is what the Pine sum does.
      const absChange = new Array(n).fill(NaN)
      for (let i = 1; i < n; i++) {
        if (Number.isFinite(src[i]) && Number.isFinite(src[i - 1])) {
          absChange[i] = Math.abs(src[i] - src[i - 1])
        }
      }
      const volatility = new Array(n).fill(NaN)
      let running = 0
      let missing = 0
      for (let i = 0; i < n; i++) {
        if (Number.isFinite(absChange[i])) running += absChange[i]
        else missing += 1
        if (i >= length) {
          const dropped = absChange[i - length]
          if (Number.isFinite(dropped)) running -= dropped
          else missing -= 1
        }
        if (i >= length - 1 && missing === 0) volatility[i] = running
      }

      const bama = new Array(n).fill(NaN)
      let prev = NaN

      for (let i = 0; i < n; i++) {
        const s = src[i]
        if (!Number.isFinite(s)) {
          bama[i] = NaN
          prev = NaN
          continue
        }

        const mom =
          i >= length && Number.isFinite(src[i - length]) ? Math.abs(s - src[i - length]) : NaN
        const vol = volatility[i]
        // Pine: `er = volatility != 0 ? mom / volatility : 0`. A na volatility
        // makes that test false, so the warmup runs on er = 0 rather than na.
        const er = Number.isFinite(vol) && vol !== 0 ? mom / vol : 0

        const ver = Math.pow(er - ((2 * er - 1) / 2) * (1 - trendParam) + 0.5, 2)
        let vlength = ver !== 0 ? (length - ver + 1) / ver : Infinity
        if (vlength > maxLength) vlength = maxLength
        const valpha = 2 / (vlength + 1)

        // `nz(bama[1], bama)` falls back to the current bar's own source, since
        // Pine initialises bama to src before the reassignment.
        const base = Number.isFinite(prev) ? prev : s
        const value = valpha * s + (1 - valpha) * base

        bama[i] = Number.isFinite(value) ? value : NaN
        prev = bama[i]
      }

      return { bama: nulls(bama) }
    },
  })
}
