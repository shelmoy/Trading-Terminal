/**
 * Ehlers Predictive Moving Average (PMA) - ported to openalgo-charts from Pine Script v6.
 *
 * Source: https://github.com/mihakralj/pinescript/blob/c4e91b962be09733d8fc76caa5191e9e586c5cee/indicators/trends_FIR/pma.pine
 * Repo:   mihakralj/pinescript
 * License: MIT (c) mihakralj
 * SPDX-FileCopyrightText: (c) mihakralj
 * SPDX-FileCopyrightText: (c) 2026 marketcalls (port to openalgo-charts)
 * SPDX-License-Identifier: MIT
 *
 * A weighted moving average with one lag cancelled by linear extrapolation,
 * PMA = 2*WMA - WMA(WMA), plus a trigger line that leads it.
 */

export default function ({ registerIndicator, sourceValues, nulls }) {
  // The source does not call ta.wma: it runs its own circular-buffer WMA that
  // emits a partial-window value from the very first bar (weights 1..count,
  // normalised by count*(count+1)/2) and only switches to the full rolling
  // update once the buffer fills. Reproduced exactly, including nz() on the
  // input, so the warmup matches bar for bar.
  const runningWma = (values, period) => {
    const n = values.length
    const out = new Array(n).fill(NaN)
    const buffer = new Array(period).fill(NaN)
    let head = 0
    let sum = 0
    let weightedSum = 0
    let count = 0
    let norm = 0

    for (let i = 0; i < n; i++) {
      const oldest = buffer[head]
      const current = Number.isFinite(values[i]) ? values[i] : 0

      if (Number.isFinite(oldest)) {
        const oldSum = sum
        sum = sum - oldest + current
        weightedSum = weightedSum - oldSum + period * current
      } else {
        count += 1
        sum += current
        weightedSum += count * current
        norm = count * (count + 1) * 0.5
      }

      buffer[head] = current
      head = (head + 1) % period

      out[i] = norm > 0 ? weightedSum / norm : NaN
    }
    return out
  }

  registerIndicator({
    id: 'oa-pma',
    name: 'Ehlers Predictive Moving Average (PMA)',
    category: 'Trends FIR',
    placement: 'onchart',

    inputs: [
      {
        key: 'period',
        type: 'number',
        label: 'Period',
        default: 7,
        min: 1,
        max: 5000,
        step: 1,
        tooltip: 'Lookback period for WMA smoothing (Ehlers default: 7)',
      },
      { key: 'source', type: 'source', label: 'Source', default: 'close' },
    ],

    plots: [
      { key: 'pma', type: 'line', title: 'PMA', style: { color: '#ffeb3b', lineWidth: 2 } },
      { key: 'trigger', type: 'line', title: 'Trigger', style: { color: '#ff9800', lineWidth: 1 } },
    ],

    calc(bars, settings) {
      // A cleared number field arrives as '', and Number('') is 0.
      const period = Math.max(1, Math.floor(Number(settings.period) || 7))
      const src = sourceValues(bars, settings.source ?? 'close')
      const n = bars.length

      const wma1 = runningWma(src, period)
      const wma2 = runningWma(wma1, period)

      const pma = new Array(n).fill(NaN)
      const trigger = new Array(n).fill(NaN)
      for (let i = 0; i < n; i++) {
        // The source returns na whenever the source bar itself is na.
        if (!Number.isFinite(src[i])) continue
        if (!Number.isFinite(wma1[i]) || !Number.isFinite(wma2[i])) continue
        pma[i] = 2 * wma1[i] - wma2[i]
        trigger[i] = (4 * wma1[i] - wma2[i]) / 3
      }

      return { pma: nulls(pma), trigger: nulls(trigger) }
    },
  })
}
