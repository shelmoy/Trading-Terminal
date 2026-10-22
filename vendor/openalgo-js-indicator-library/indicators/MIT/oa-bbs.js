/**
 * Bollinger Band Squeeze (BBS) - ported to openalgo-charts from Pine Script v6.
 *
 * Source: https://github.com/mihakralj/pinescript/blob/c4e91b962be09733d8fc76caa5191e9e586c5cee/indicators/oscillators/bbs.pine
 * Repo:   mihakralj/pinescript
 * License: MIT
 * SPDX-FileCopyrightText: (c) mihakralj
 * SPDX-FileCopyrightText: (c) 2026 marketcalls (port to openalgo-charts)
 * SPDX-License-Identifier: MIT
 *
 * Marks the bars where the Bollinger Bands sit entirely inside the Keltner
 * Channels, the low-volatility coil that usually precedes an expansion, and
 * draws both envelopes so the pinch can be read directly off the chart.
 */

export default function ({ registerIndicator, sourceValues, nulls }) {
  registerIndicator({
    id: 'oa-bbs',
    name: 'Bollinger Band Squeeze (BBS)',
    category: 'Oscillators',
    placement: 'onchart',

    inputs: [
      { key: 'bbPeriod', type: 'number', label: 'Bollinger Band Period', default: 20, min: 1, max: 500, step: 1 },
      { key: 'bbMult', type: 'number', label: 'BB StdDev Multiplier', default: 2.0, min: 0.1, max: 5.0, step: 0.1 },
      { key: 'kcPeriod', type: 'number', label: 'Keltner Channel Period', default: 20, min: 1, max: 500, step: 1 },
      { key: 'kcMult', type: 'number', label: 'KC ATR Multiplier', default: 1.5, min: 0.1, max: 5.0, step: 0.1 },
      { key: 'source', type: 'source', label: 'Source', default: 'close' },
      { key: 'showBands', type: 'boolean', label: 'Show Bands', default: true, group: 'Display Options' },
      { key: 'showChannels', type: 'boolean', label: 'Show Channels', default: true, group: 'Display Options' },
    ],

    plots: [
      { key: 'bbUpper', type: 'line', title: 'BB Upper', style: { color: '#2962ff80', lineWidth: 1 } },
      { key: 'bbMiddle', type: 'line', title: 'BB Middle', style: { color: '#2962ff80', lineWidth: 1 } },
      { key: 'bbLower', type: 'line', title: 'BB Lower', style: { color: '#2962ff80', lineWidth: 1 } },
      { key: 'kcUpper', type: 'line', title: 'KC Upper', style: { color: '#ff980080', lineWidth: 1 } },
      { key: 'kcMiddle', type: 'line', title: 'KC Middle', style: { color: '#ff980080', lineWidth: 1 } },
      { key: 'kcLower', type: 'line', title: 'KC Lower', style: { color: '#ff980080', lineWidth: 1 } },
    ],

    calc(bars, settings) {
      // A cleared number field arrives as '', and Number('') is 0.
      const bbPeriod = Math.max(1, Math.floor(Number(settings.bbPeriod) || 20))
      const bbMult = Math.max(0.1, Number(settings.bbMult) || 2.0)
      const kcPeriod = Math.max(1, Math.floor(Number(settings.kcPeriod) || 20))
      const kcMult = Math.max(0.1, Number(settings.kcMult) || 1.5)
      const showBands = settings.showBands !== false
      const showChannels = settings.showChannels !== false

      const src = sourceValues(bars, settings.source ?? 'close')
      const n = bars.length

      const bbUpper = new Array(n).fill(NaN)
      const bbMiddle = new Array(n).fill(NaN)
      const bbLower = new Array(n).fill(NaN)
      const kcUpper = new Array(n).fill(NaN)
      const kcMiddle = new Array(n).fill(NaN)
      const kcLower = new Array(n).fill(NaN)
      const squeeze = new Array(n).fill(0)

      // The running buffers expand up to the period rather than waiting for it,
      // so a value is produced from the very first bar, and nz() turns any
      // missing source value into a zero.
      const val = new Array(n)
      for (let i = 0; i < n; i++) val[i] = Number.isFinite(src[i]) ? src[i] : 0

      // Bias-corrected exponential ATR. nz(close[1]) is 0 on the first bar, so
      // that bar's true range is the whole price level, exactly as in Pine.
      const alpha = 2.0 / (kcPeriod + 1)
      const beta = 1.0 - alpha
      let e = 1.0
      let atrState = 0.0
      let warmup = true

      let bbSum = 0
      let bbSumSq = 0
      let kcSum = 0

      for (let i = 0; i < n; i++) {
        const bar = bars[i]
        const high = Number.isFinite(bar.high) ? bar.high : 0
        const low = Number.isFinite(bar.low) ? bar.low : 0
        const prevClose = i >= 1 && Number.isFinite(bars[i - 1].close) ? bars[i - 1].close : 0

        const tr = Math.max(high - low, Math.max(Math.abs(high - prevClose), Math.abs(low - prevClose)))
        atrState = alpha * tr + beta * atrState

        let atrVal
        if (warmup) {
          e *= beta
          const denom = 1.0 - e
          atrVal = denom > 0 ? atrState / denom : atrState
          warmup = e > 1e-10
        } else {
          atrVal = atrState
        }

        // Bollinger side: running sum and sum of squares over the window.
        bbSum += val[i]
        bbSumSq += val[i] * val[i]
        if (i >= bbPeriod) {
          bbSum -= val[i - bbPeriod]
          bbSumSq -= val[i - bbPeriod] * val[i - bbPeriod]
        }
        const bbCount = Math.max(1, Math.min(i + 1, bbPeriod))
        const basis = bbSum / bbCount
        const variance = bbCount > 1 ? Math.max(0.0, bbSumSq / bbCount - basis * basis) : 0.0
        const dev = Math.sqrt(variance)
        const upper = basis + bbMult * dev
        const lower = basis - bbMult * dev

        // Keltner side: the same expanding average, offset by the ATR.
        kcSum += val[i]
        if (i >= kcPeriod) kcSum -= val[i - kcPeriod]
        const kcCount = Math.max(1, Math.min(i + 1, kcPeriod))
        const middle = kcSum / kcCount
        const offset = kcMult * atrVal
        const kcUp = middle + offset
        const kcDn = middle - offset

        squeeze[i] = upper < kcUp && lower > kcDn ? 1 : 0

        if (showBands) {
          bbUpper[i] = upper
          bbMiddle[i] = basis
          bbLower[i] = lower
        }
        if (showChannels) {
          kcUpper[i] = kcUp
          kcMiddle[i] = middle
          kcLower[i] = kcDn
        }
      }

      return {
        bbUpper: nulls(bbUpper),
        bbMiddle: nulls(bbMiddle),
        bbLower: nulls(bbLower),
        kcUpper: nulls(kcUpper),
        kcMiddle: nulls(kcMiddle),
        kcLower: nulls(kcLower),
        squeeze,
      }
    },

    // Pine draws a red dot on every squeeze bar and a green one on every other
    // bar, both pinned to location.bottom. atPrice on a single row below the
    // lowest low is the equivalent that does not anchor to the plot lines.
    markers({ bars, values }) {
      const squeeze = values.squeeze || []
      if (bars.length === 0) return []

      let lowest = Infinity
      let highest = -Infinity
      for (let i = 0; i < bars.length; i++) {
        const bar = bars[i]
        if (Number.isFinite(bar.low) && bar.low < lowest) lowest = bar.low
        if (Number.isFinite(bar.high) && bar.high > highest) highest = bar.high
      }
      if (!Number.isFinite(lowest) || !Number.isFinite(highest)) return []

      const span = highest - lowest
      const pad = Math.max(span * 0.03, Math.abs(lowest) * 0.001, Number.EPSILON)
      const price = lowest - pad

      const out = []
      for (let i = 0; i < bars.length; i++) {
        const on = squeeze[i] === 1
        out.push({
          time: bars[i].time,
          position: 'atPrice',
          price,
          shape: 'circle',
          size: 'tiny',
          color: on ? '#ff5252' : '#4caf50',
        })
      }
      return out
    },

    background({ bars, values }) {
      const squeeze = values.squeeze || []
      return bars.map((bar, i) => (squeeze[i] === 1 ? '#ff52520d' : null))
    },
  })
}
