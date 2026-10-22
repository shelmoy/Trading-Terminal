/**
 * Ultimate Channel (UCHANNEL) - ported to openalgo-charts from Pine Script v6.
 *
 * Source: https://github.com/mihakralj/pinescript/blob/c4e91b962be09733d8fc76caa5191e9e586c5cee/indicators/channels/uchannel.pine
 * Repo:   mihakralj/pinescript
 * License: MIT (c) mihakralj
 * SPDX-FileCopyrightText: (c) mihakralj
 * SPDX-FileCopyrightText: (c) 2026 marketcalls (port to openalgo-charts)
 * SPDX-License-Identifier: MIT
 *
 * A two-pole ultra smooth filter runs twice: once on the centreline source and
 * once on a close-anchored true range, and the bands sit a fixed multiple of
 * that smoothed range either side of the smoothed centreline.
 */

export default function ({ registerIndicator, sourceValues, nulls }) {
  // The two-pole ultra smooth filter Pine builds inline for both the range and
  // the centreline. Coefficients are constant for a given period because the
  // Pine length arguments are simple ints.
  const ultraSmooth = (values, period) => {
    const n = values.length
    const out = new Array(n).fill(NaN)
    const arg = (Math.SQRT2 * Math.PI) / period
    const expArg = Math.exp(-arg)
    const c2 = 2 * expArg * Math.cos(arg)
    const c3 = -expArg * expArg
    const c1 = (1 + c2 - c3) / 4

    for (let i = 0; i < n; i++) {
      // nz(v, v[1]) then nz(v[1], v) then nz(v[2], v[1]): missing history repeats
      // the nearest value it has rather than opening a hole in the filter.
      let s0 = values[i]
      if (!Number.isFinite(s0)) s0 = i > 0 && Number.isFinite(values[i - 1]) ? values[i - 1] : NaN
      if (!Number.isFinite(s0)) continue
      const s1 = i > 0 && Number.isFinite(values[i - 1]) ? values[i - 1] : s0
      const s2 = i > 1 && Number.isFinite(values[i - 2]) ? values[i - 2] : s1

      // Pine falls back to the raw value while either of the two previous filter
      // outputs is still na, which is the first two bars of the series.
      if (i < 2 || !Number.isFinite(out[i - 1]) || !Number.isFinite(out[i - 2])) {
        out[i] = s0
        continue
      }

      out[i] =
        (1 - c1) * s0 +
        (2 * c1 - c2) * s1 -
        (c1 + c3) * s2 +
        c2 * out[i - 1] +
        c3 * out[i - 2]
    }

    return out
  }

  registerIndicator({
    id: 'oa-uchannel',
    name: 'Ultimate Channel (UCHANNEL)',
    category: 'Channels',
    placement: 'onchart',

    inputs: [
      { key: 'source', type: 'source', label: 'Source for Centerline', default: 'close' },
      { key: 'highSource', type: 'source', label: 'Source for High', default: 'high' },
      { key: 'lowSource', type: 'source', label: 'Source for Low', default: 'low' },
      {
        key: 'strLength',
        type: 'number',
        label: 'STR Length',
        default: 20,
        min: 1,
        max: 5000,
        step: 1,
        tooltip: 'Lookback period for smoothing the True Range.',
      },
      {
        key: 'length',
        type: 'number',
        label: 'Centerline Length',
        default: 20,
        min: 1,
        max: 5000,
        step: 1,
        tooltip: 'Lookback period for smoothing the centerline (close price).',
      },
      {
        key: 'numSTRs',
        type: 'number',
        label: 'STR Multiplier',
        default: 1,
        min: 0.01,
        max: 100,
        step: 0.01,
        tooltip: 'Number of Smoothed True Ranges for channel width.',
      },
    ],

    plots: [
      { key: 'middle', type: 'line', title: 'Middle Channel', style: { color: '#ffeb3b', lineWidth: 2 } },
      { key: 'upper', type: 'line', title: 'Upper Channel', style: { color: '#ffeb3b', lineWidth: 2 } },
      { key: 'lower', type: 'line', title: 'Lower Channel', style: { color: '#ffeb3b', lineWidth: 2 } },
    ],

    fills: [{ between: ['upper', 'lower'], colorUp: '#2962ff', colorDown: '#2962ff', opacity: 0.1 }],

    calc(bars, settings) {
      // A cleared number field arrives as '', and Number('') is 0.
      const strLength = Math.max(1, Math.floor(Number(settings.strLength) || 20))
      const length = Math.max(1, Math.floor(Number(settings.length) || 20))
      const numSTRs = Math.max(0.01, Number(settings.numSTRs) || 1)

      const center = sourceValues(bars, settings.source ?? 'close')
      const highSrc = sourceValues(bars, settings.highSource ?? 'high')
      const lowSrc = sourceValues(bars, settings.lowSource ?? 'low')
      const n = bars.length

      // True range anchored on the previous centreline value, which falls back
      // to this bar's own high or low on the first bar.
      const trueRangeSeries = new Array(n).fill(NaN)
      for (let i = 0; i < n; i++) {
        const h = highSrc[i]
        const l = lowSrc[i]
        if (!Number.isFinite(h) || !Number.isFinite(l)) continue
        const prevCenter = i > 0 && Number.isFinite(center[i - 1]) ? center[i - 1] : null
        const th = Math.max(h, prevCenter === null ? h : prevCenter)
        const tl = Math.min(l, prevCenter === null ? l : prevCenter)
        trueRangeSeries[i] = th - tl
      }

      const smoothedRange = ultraSmooth(trueRangeSeries, strLength)
      const centerline = ultraSmooth(center, length)

      const upper = new Array(n).fill(NaN)
      const middle = new Array(n).fill(NaN)
      const lower = new Array(n).fill(NaN)

      for (let i = 0; i < n; i++) {
        const mid = centerline[i]
        const str = smoothedRange[i]
        if (!Number.isFinite(mid)) continue
        middle[i] = mid
        if (!Number.isFinite(str)) continue
        upper[i] = mid + numSTRs * str
        lower[i] = mid - numSTRs * str
      }

      return { middle: nulls(middle), upper: nulls(upper), lower: nulls(lower) }
    },
  })
}
