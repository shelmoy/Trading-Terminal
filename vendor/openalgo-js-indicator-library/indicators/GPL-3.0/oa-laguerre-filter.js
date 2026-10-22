/**
 * Laguerre Filter (LF) - ported to openalgo-charts from Pine Script v4.
 *
 * Source: https://github.com/everget/tradingview-pinescript-indicators/blob/60c93d3711d222b8f2db96160defe568429348e0/movings/laguerre_filter.pine
 * Repo:   everget/tradingview-pinescript-indicators
 * License: GPL-3.0 (c) 2018-present, Alex Orekhov (everget)
 * SPDX-FileCopyrightText: (c) 2018-present Alex Orekhov (everget)
 * SPDX-FileCopyrightText: (c) 2026 marketcalls (port to openalgo-charts)
 * SPDX-License-Identifier: GPL-3.0-only
 *
 * A four stage Laguerre cascade averaged into one line: a single alpha buys
 * heavy smoothing with far less lag than a moving average of equivalent
 * smoothness.
 */

export default function ({ registerIndicator, sourceValues, nulls }) {
  const nz = (x) => (Number.isFinite(x) ? x : 0)

  registerIndicator({
    id: 'oa-laguerre-filter',
    name: 'Laguerre Filter (LF)',
    category: 'Moving Averages',
    placement: 'onchart',

    inputs: [
      {
        key: 'alpha',
        type: 'number',
        label: 'Alpha',
        default: 0.7,
        min: 0,
        max: 1,
        step: 0.1,
        tooltip: 'Damping factor. Lower values smooth harder and lag more.',
      },
      { key: 'source', type: 'source', label: 'Source', default: 'close' },
      { key: 'highlight', type: 'boolean', label: 'Highlight', default: true },
    ],

    plots: [
      {
        key: 'lf',
        type: 'line',
        title: 'LF',
        style: { color: '#6d1e7f', lineWidth: 2 },
        colorBy({ index, values, settings }) {
          if (settings.highlight === false) return '#6d1e7f'
          const cur = values.lf[index]
          const prev = index > 0 ? values.lf[index - 1] : null
          // Pine compares against na on the first bar, which is false, so the
          // first bar and any gap read as down.
          if (!Number.isFinite(cur) || !Number.isFinite(prev)) return '#ff5252'
          return cur > prev ? '#4caf50' : '#ff5252'
        },
      },
    ],

    calc(bars, settings) {
      // A cleared number field arrives as '', and Number('') is 0, which is a
      // legal alpha here. Fall back on the empty field only, so a deliberate
      // zero still behaves the way the source does.
      const rawAlpha = settings.alpha === '' || settings.alpha == null ? 0.7 : Number(settings.alpha)
      const alpha = Number.isFinite(rawAlpha) ? Math.min(1, Math.max(0, rawAlpha)) : 0.7
      const src = sourceValues(bars, settings.source ?? 'close')

      const out = new Array(bars.length).fill(NaN)
      const oneMinus = 1 - alpha

      // nz(L0[1]) and friends: the bar before the first reads as zero.
      let prevL0 = NaN
      let prevL1 = NaN
      let prevL2 = NaN
      let prevL3 = NaN

      for (let i = 0; i < bars.length; i++) {
        const value = src[i]
        if (!Number.isFinite(value)) {
          prevL0 = NaN
          prevL1 = NaN
          prevL2 = NaN
          prevL3 = NaN
          continue
        }

        const l0 = alpha * value + oneMinus * nz(prevL0)
        const l1 = -oneMinus * l0 + nz(prevL0) + oneMinus * nz(prevL1)
        const l2 = -oneMinus * l1 + nz(prevL1) + oneMinus * nz(prevL2)
        const l3 = -oneMinus * l2 + nz(prevL2) + oneMinus * nz(prevL3)

        out[i] = (l0 + 2 * l1 + 2 * l2 + l3) / 6

        prevL0 = l0
        prevL1 = l1
        prevL2 = l2
        prevL3 = l3
      }

      return { lf: nulls(out) }
    },
  })
}
