/**
 * Huber Loss (HUBER) - ported to openalgo-charts from Pine Script v6.
 *
 * Source: https://github.com/mihakralj/pinescript/blob/c4e91b962be09733d8fc76caa5191e9e586c5cee/indicators/errors/huber.pine
 * Repo:   mihakralj/pinescript
 * License: MIT (c) mihakralj
 * SPDX-FileCopyrightText: (c) mihakralj
 * SPDX-FileCopyrightText: (c) 2026 marketcalls (port to openalgo-charts)
 * SPDX-License-Identifier: MIT
 *
 * Measures how far the source has drifted from its own EMA using the Huber
 * penalty: squared while the gap is inside delta, linear beyond it, so a single
 * violent bar cannot dominate the average the way a plain squared error does.
 * The loss is then averaged over the lookback window.
 */

export default function ({ registerIndicator, sourceValues, smaSeededEma, nulls }) {
  registerIndicator({
    id: 'oa-huber',
    name: 'Huber Loss (HUBER)',
    category: 'Errors',
    // The Pine indicator() call omits overlay, so the study itself sits in its
    // own pane; only the reference EMA carries force_overlay=true, which is the
    // per-plot overlay flag below.
    placement: 'pane',

    inputs: [
      { key: 'source', type: 'source', label: 'Source', default: 'close' },
      { key: 'period', type: 'number', label: 'Period', default: 100, min: 1, max: 5000, step: 1 },
      {
        key: 'delta',
        type: 'number',
        label: 'Delta',
        default: 1.345,
        min: 0.1,
        max: 1000,
        step: 0.001,
        tooltip: 'Threshold where the penalty switches from squared error to absolute error.',
      },
    ],

    plots: [
      { key: 'huber', type: 'area', title: 'Huber', style: { color: '#ff5252', lineWidth: 2 } },
      { key: 'ema', type: 'line', title: 'EMA', style: { color: '#ffeb3b', lineWidth: 1 }, overlay: true },
    ],

    calc(bars, settings) {
      // A cleared number field arrives as '', and Number('') is 0.
      const period = Math.max(1, Math.floor(Number(settings.period) || 100))
      const delta = Math.max(0.1, Number(settings.delta) || 1.345)
      const src = sourceValues(bars, settings.source ?? 'close')

      // Pine compares the source against ta.ema of the same source and period.
      // ta.ema seeds from the SMA of the first `period` values, which is what
      // smaSeededEma reproduces; the plain ema helper seeds from values[0].
      const emaLine = smaSeededEma(src, period)

      // Pine clamps the averaging window to [1, 4000] inside the function.
      const p = Math.min(Math.max(1, period), 4000)

      const loss = new Array(bars.length).fill(NaN)
      for (let i = 0; i < bars.length; i++) {
        const a = src[i]
        const b = emaLine[i]
        if (!Number.isFinite(a) || !Number.isFinite(b)) continue
        const error = a - b
        const abs = Math.abs(error)
        loss[i] = abs <= delta ? 0.5 * error * error : delta * abs - 0.5 * delta * delta
      }

      // Pine keeps a circular buffer of the last p losses and averages only the
      // non-na entries, so the mean is over however many real values the window
      // holds and stays na until the first one arrives.
      const out = new Array(bars.length).fill(NaN)
      let sum = 0
      let count = 0
      for (let i = 0; i < bars.length; i++) {
        const dropped = i - p
        if (dropped >= 0 && Number.isFinite(loss[dropped])) {
          sum -= loss[dropped]
          count -= 1
        }
        if (Number.isFinite(loss[i])) {
          sum += loss[i]
          count += 1
        }
        out[i] = count > 0 ? sum / count : loss[i]
      }

      return { huber: nulls(out), ema: nulls(emaLine) }
    },
  })
}
