/**
 * Jurik Moving Average (JMA) - ported to openalgo-charts from Pine Script v3.
 *
 * Source: https://github.com/everget/tradingview-pinescript-indicators/blob/60c93d3711d222b8f2db96160defe568429348e0/movings/jurik_moving_average.pine
 * Repo:   everget/tradingview-pinescript-indicators
 * License: GPL-3.0
 * SPDX-FileCopyrightText: (c) 2018-present Alex Orekhov (everget)
 * SPDX-FileCopyrightText: (c) 2026 marketcalls (port to openalgo-charts)
 * SPDX-License-Identifier: GPL-3.0-only
 *
 * Copyright (c) 2007-present Jurik Research and Consulting. All rights reserved.
 * Copyright (c) 2018-present, Alex Orekhov (everget)
 * Jurik Moving Average script may be freely distributed under the terms of the
 * GPL-3.0 license.
 *
 * A three stage adaptive filter: an EMA-like core, a momentum correction scaled
 * by the phase setting, and an accumulator, which together follow price with
 * far less lag than a moving average of the same length.
 */

export default function ({ registerIndicator, sourceValues, nulls }) {
  const NEUTRAL = '#6d1e7f'
  const UP = '#4caf50'
  const DOWN = '#ff5252'

  registerIndicator({
    id: 'oa-jurik-moving-average',
    name: 'Jurik Moving Average (JMA)',
    category: 'Moving Averages',
    placement: 'onchart',

    inputs: [
      { key: 'length', type: 'number', label: 'Length', default: 7, min: 1, max: 5000, step: 1 },
      {
        key: 'phase',
        type: 'number',
        label: 'Phase',
        default: 50,
        min: -1000,
        max: 1000,
        step: 1,
        tooltip: 'Weight given to the momentum correction. The source divides it by 100 with integer division, so it only moves the result at -100 and at 100.',
      },
      { key: 'power', type: 'number', label: 'Power', default: 2, min: 1, max: 100, step: 1 },
      { key: 'source', type: 'source', label: 'Source', default: 'close' },
      { key: 'highlightMovements', type: 'boolean', label: 'Highlight Movements ?', default: true },
    ],

    plots: [
      {
        key: 'jma',
        type: 'line',
        title: 'JMA',
        style: { color: NEUTRAL, lineWidth: 2 },
        colorBy({ index, values, settings }) {
          if (settings.highlightMovements === false) return NEUTRAL
          const series = values.jma
          const cur = series[index]
          const prev = index > 0 ? series[index - 1] : NaN
          if (!Number.isFinite(cur) || !Number.isFinite(prev)) return NEUTRAL
          return cur > prev ? UP : DOWN
        },
      },
    ],

    calc(bars, settings) {
      // A cleared number field arrives as '', and Number('') is 0.
      const length = Math.max(1, Math.floor(Number(settings.length) || 7))
      const power = Math.max(1, Math.floor(Number(settings.power) || 2))
      // Phase 0 is a legitimate setting, so it is not replaced by the default.
      const rawPhase = Number(settings.phase)
      const phase = Number.isFinite(rawPhase) ? Math.trunc(rawPhase) : 50
      const src = sourceValues(bars, settings.source ?? 'close')
      const n = bars.length
      const out = new Array(n).fill(NaN)

      // Both operands of `phase / 100` are int in Pine, so the division
      // truncates. That is reproduced here rather than corrected: it is what the
      // published script plots, and phaseRatio is therefore 1.5 for any phase
      // between -99 and 99, 2.5 at 100 and above, 0.5 at -100 and below.
      const phaseRatio = phase < -100 ? 0.5 : phase > 100 ? 2.5 : Math.trunc(phase / 100) + 1.5

      const denom = 0.45 * (length - 1) + 2
      const beta = denom === 0 ? 0 : (0.45 * (length - 1)) / denom
      const alpha = Math.pow(beta, power)
      const oneMinusAlphaSq = Math.pow(1 - alpha, 2)
      const alphaSq = Math.pow(alpha, 2)

      // Pine seeds every recursive series through nz(), so the previous value is
      // 0 on the first bar.
      let e0 = 0
      let e1 = 0
      let e2 = 0
      let jma = 0

      for (let i = 0; i < n; i++) {
        const s = src[i]
        // A source with no data on this bar would poison the whole recursion,
        // so the state is carried forward untouched and the bar left empty.
        if (!Number.isFinite(s)) continue

        e0 = (1 - alpha) * s + alpha * e0
        e1 = (s - e0) * (1 - beta) + beta * e1
        e2 = (e0 + phaseRatio * e1 - jma) * oneMinusAlphaSq + alphaSq * e2
        jma = e2 + jma

        out[i] = jma
      }

      return { jma: nulls(out) }
    },
  })
}
