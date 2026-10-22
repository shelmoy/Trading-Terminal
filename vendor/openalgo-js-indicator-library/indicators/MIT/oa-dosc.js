/**
 * Derivative Oscillator (DOSC) - ported to openalgo-charts from Pine Script v6.
 *
 * Source: https://github.com/mihakralj/pinescript/blob/c4e91b962be09733d8fc76caa5191e9e586c5cee/indicators/oscillators/dosc.pine
 * Repo:   mihakralj/pinescript
 * License: MIT (c) mihakralj
 * SPDX-FileCopyrightText: (c) mihakralj
 * SPDX-FileCopyrightText: (c) 2026 marketcalls (port to openalgo-charts)
 * SPDX-License-Identifier: MIT
 *
 * A double-smoothed RSI with its own moving average subtracted, so the plot is
 * the distance between a slow momentum reading and its signal line rather than
 * the reading itself.
 */

export default function ({ registerIndicator, sourceValues, nulls }) {
  registerIndicator({
    id: 'oa-dosc',
    name: 'Derivative Oscillator (DOSC)',
    category: 'Oscillators',
    placement: 'pane',

    inputs: [
      { key: 'source', type: 'source', label: 'Source', default: 'close' },
      { key: 'rsiPeriod', type: 'number', label: 'RSI Period', default: 14, min: 1, max: 500, step: 1 },
      {
        key: 'ema1Period',
        type: 'number',
        label: 'EMA1 Period',
        default: 5,
        min: 1,
        max: 500,
        step: 1,
        tooltip: 'First EMA smoothing of RSI',
      },
      {
        key: 'ema2Period',
        type: 'number',
        label: 'EMA2 Period',
        default: 3,
        min: 1,
        max: 500,
        step: 1,
        tooltip: 'Second EMA smoothing (double smooth)',
      },
      {
        key: 'sigPeriod',
        type: 'number',
        label: 'Signal Period',
        default: 9,
        min: 1,
        max: 500,
        step: 1,
        tooltip: 'SMA signal line period',
      },
    ],

    plots: [{ key: 'dosc', type: 'line', title: 'DOSC', style: { color: '#ffeb3b', lineWidth: 2 } }],

    levels: () => [{ price: 0, title: 'Zero', color: '#787b86', lineStyle: 'dotted' }],

    calc(bars, settings) {
      // A cleared number field arrives as '', and Number('') is 0.
      const rsiPeriod = Math.max(1, Math.floor(Number(settings.rsiPeriod) || 14))
      const ema1Period = Math.max(1, Math.floor(Number(settings.ema1Period) || 5))
      const ema2Period = Math.max(1, Math.floor(Number(settings.ema2Period) || 3))
      const sigPeriod = Math.max(1, Math.floor(Number(settings.sigPeriod) || 9))
      const src = sourceValues(bars, settings.source ?? 'close')
      const n = bars.length

      const out = new Array(n).fill(NaN)

      const rsiAlpha = 1 / rsiPeriod
      const alpha1 = 2 / (ema1Period + 1)
      const alpha2 = 2 / (ema2Period + 1)

      // Stage 1 state: the source carries its own Wilder averages rather than
      // ta.rsi, because this script seeds them from the raw change on every bar
      // before bar_index reaches rsiPeriod instead of from a mean.
      let avgGain = 0
      let avgLoss = 0
      // Stages 2 and 3 are var na, so each seeds from its own first input value.
      let ema1 = NaN
      let ema2 = NaN
      // Stage 4 is a circular buffer that starts full of na, so the signal is an
      // expanding mean until sigPeriod values have gone in and a rolling one after.
      const sigBuf = new Array(sigPeriod).fill(NaN)
      let sigHead = 0
      let sigCount = 0
      let sigSum = 0

      for (let i = 0; i < n; i++) {
        const cur = src[i]
        if (!Number.isFinite(cur)) continue

        // Pine's nz(source[1]) is 0 on the first bar, which makes that bar a
        // full-size gain and pins the first RSI reading at 100.
        const prev = i > 0 && Number.isFinite(src[i - 1]) ? src[i - 1] : 0
        const changeUp = Math.max(cur - prev, 0)
        const changeDown = Math.max(prev - cur, 0)

        if (i < rsiPeriod) {
          avgGain = changeUp
          avgLoss = changeDown
        } else {
          avgGain = avgGain * (1 - rsiAlpha) + changeUp * rsiAlpha
          avgLoss = avgLoss * (1 - rsiAlpha) + changeDown * rsiAlpha
        }

        const rsiVal = avgLoss === 0 ? 100 : 100 - 100 / (1 + avgGain / avgLoss)

        ema1 = Number.isFinite(ema1) ? ema1 * (1 - alpha1) + rsiVal * alpha1 : rsiVal
        ema2 = Number.isFinite(ema2) ? ema2 * (1 - alpha2) + ema1 * alpha2 : ema1

        const oldest = sigBuf[sigHead]
        if (Number.isFinite(oldest)) {
          sigSum -= oldest
          sigSum += ema2
        } else {
          sigCount += 1
          sigSum += ema2
        }
        sigBuf[sigHead] = ema2
        sigHead = (sigHead + 1) % sigPeriod

        const signal = sigCount > 0 ? sigSum / sigCount : 0

        out[i] = ema2 - signal
      }

      // The Pine script plots from the first bar with no na warmup, so nothing
      // is blanked here beyond bars whose source is missing.
      return { dosc: nulls(out) }
    },
  })
}
