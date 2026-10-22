/**
 * Adaptive Laguerre Filter (ALF) - ported to openalgo-charts from Pine Script v4.
 *
 * Source: https://github.com/everget/tradingview-pinescript-indicators/blob/60c93d3711d222b8f2db96160defe568429348e0/movings/adaptive_laguerre_filter.pine
 * Repo:   everget/tradingview-pinescript-indicators
 * License: GPL-3.0 (c) 2018-present, Alex Orekhov (everget)
 * SPDX-FileCopyrightText: (c) 2018-present Alex Orekhov (everget)
 * SPDX-FileCopyrightText: (c) 2026 marketcalls (port to openalgo-charts)
 * SPDX-License-Identifier: GPL-3.0-only
 *
 * A four-stage Laguerre filter whose damping factor is re-derived every bar
 * from where the current tracking error sits inside its own recent range, so
 * the line tightens onto price when it starts lagging and relaxes when it does
 * not.
 */

export default function ({ registerIndicator, sourceValues, nulls }) {
  const HIGHLIGHT_UP = '#4caf50'
  const HIGHLIGHT_DOWN = '#ff5252'
  const FLAT = '#6d1e7f'

  // The reference percentile_nearest_rank over the window ending at `end`:
  // na until the window is full, na if any member is na, otherwise the
  // rank-th smallest with rank = ceil(percentage / 100 * period).
  const percentileNearestRankAt = (values, end, period, percentage) => {
    if (period <= 0 || end < period - 1) return NaN
    const window = new Array(period)
    for (let k = 0; k < period; k++) {
      const v = values[end - period + 1 + k]
      if (!Number.isFinite(v)) return NaN
      window[k] = v
    }
    window.sort((a, b) => a - b)
    const rank = Math.max(1, Math.ceil((percentage / 100) * period))
    return window[Math.min(period, rank) - 1]
  }

  // Pine: highlight ? (alf > alf[1] and await ? green : red) : #6d1e7f.
  const colourAt = (values, settings, index) => {
    if (settings.highlight === false) return FLAT
    const series = values?.alf
    const confirmed = values?.confirmed
    if (!series) return HIGHLIGHT_DOWN
    const awaited = !confirmed || confirmed[index] === 1
    if (!awaited) return HIGHLIGHT_DOWN
    const current = series[index]
    const previous = index > 0 ? series[index - 1] : null
    if (!Number.isFinite(current) || !Number.isFinite(previous)) return HIGHLIGHT_DOWN
    return current > previous ? HIGHLIGHT_UP : HIGHLIGHT_DOWN
  }

  registerIndicator({
    id: 'oa-adaptive-laguerre-filter',
    name: 'Adaptive Laguerre Filter (ALF)',
    category: 'Moving Averages',
    placement: 'onchart',

    inputs: [
      { key: 'length', type: 'number', label: 'Length', default: 14, min: 1, max: 5000, step: 1 },
      {
        key: 'medianLength',
        type: 'number',
        label: 'Median Length',
        default: 5,
        min: 1,
        max: 5000,
        step: 1,
      },
      { key: 'source', type: 'source', label: 'Source', default: 'close' },
      { key: 'highlight', type: 'boolean', label: 'Highlight', default: true },
      {
        key: 'awaitBarConfirmation',
        type: 'boolean',
        label: 'Await Bar Confirmation',
        default: true,
        tooltip: 'Hold the up colour back until the forming bar has closed.',
      },
    ],

    plots: [
      {
        key: 'alf',
        type: 'line',
        title: 'ALF',
        style: { color: FLAT, lineWidth: 2 },
        colorBy({ index, values, settings }) {
          return colourAt(values, settings, index)
        },
      },
    ],

    alerts: [
      {
        id: 'alf-color-change',
        title: 'ALF colour change',
        message: 'ALF has changed its color!',
        when: ({ values, settings, index }) => {
          if (index < 1) return false
          if (settings.highlight === false) return false
          const confirmed = values?.confirmed
          const awaited = !confirmed || confirmed[index] === 1
          if (!awaited) return false
          return colourAt(values, settings, index) !== colourAt(values, settings, index - 1)
        },
      },
    ],

    calc(bars, settings, store, ctx) {
      // A cleared number field arrives as '', and Number('') is 0.
      const length = Math.max(1, Math.floor(Number(settings.length) || 14))
      const medianLength = Math.max(1, Math.floor(Number(settings.medianLength) || 5))
      const awaitBarConfirmation = settings.awaitBarConfirmation !== false

      const src = sourceValues(bars, settings.source ?? 'close')
      const n = bars.length

      const alf = new Array(n).fill(NaN)
      const diff = new Array(n).fill(NaN)
      const ratio = new Array(n).fill(NaN)
      const confirmed = new Array(n).fill(1)

      // barstate.isconfirmed: every closed bar is confirmed, the forming last
      // bar is not. The host may not say, in which case treat history as closed.
      const rawLast = Number(ctx?.barState?.lastIndex)
      const lastIndex = Number.isFinite(rawLast) ? rawLast : n - 1
      const lastConfirmed = ctx?.barState?.isConfirmed !== false

      const defaultAlpha = 2 / (length + 1)
      let prevAlpha = NaN
      let l0 = NaN
      let l1 = NaN
      let l2 = NaN
      let l3 = NaN

      for (let i = 0; i < n; i++) {
        if (awaitBarConfirmation && i >= lastIndex && !lastConfirmed) confirmed[i] = 0

        const s = src[i]
        if (!Number.isFinite(s)) continue

        // diff = abs(src - nz(alf[1], src)): the tracking error, which is 0
        // whenever the previous filter value is missing.
        const prevAlf = i > 0 && Number.isFinite(alf[i - 1]) ? alf[i - 1] : s
        const d = Math.abs(s - prevAlf)
        diff[i] = d

        // HH and LL scan nz(diff[i]) over `length` bars, so bars before the
        // start of history contribute 0 rather than being skipped.
        let hh = d
        let ll = d
        for (let k = 0; k < length; k++) {
          const idx = i - k
          const dv = idx >= 0 && Number.isFinite(diff[idx]) ? diff[idx] : 0
          if (dv > hh) hh = dv
          if (dv < ll) ll = dv
        }

        const span = hh - ll
        // Pine evaluates the ternary's series argument on every bar, so the
        // normalised error is recorded even when the branch is not taken.
        ratio[i] = span !== 0 ? (d - ll) / span : NaN

        let alpha
        if (span !== 0) {
          alpha = percentileNearestRankAt(ratio, i, medianLength, 50)
        } else {
          alpha = Number.isFinite(prevAlpha) ? prevAlpha : defaultAlpha
        }
        prevAlpha = alpha

        const alpha2 = 1 - alpha

        // nz(Lx[1], src): a missing previous stage falls back to the source.
        const p0 = Number.isFinite(l0) ? l0 : s
        const p1 = Number.isFinite(l1) ? l1 : s
        const p2 = Number.isFinite(l2) ? l2 : s
        const p3 = Number.isFinite(l3) ? l3 : s

        // Each stage consumes the stage above it as just recomputed on this
        // bar, and the stage's own previous value.
        const n0 = alpha * s + alpha2 * p0
        const n1 = p0 + alpha2 * (p1 - n0)
        const n2 = p1 + alpha2 * (p2 - n1)
        const n3 = p2 + alpha2 * (p3 - n2)

        l0 = Number.isFinite(n0) ? n0 : NaN
        l1 = Number.isFinite(n1) ? n1 : NaN
        l2 = Number.isFinite(n2) ? n2 : NaN
        l3 = Number.isFinite(n3) ? n3 : NaN

        const value = (n0 + 2 * n1 + 2 * n2 + n3) / 6
        alf[i] = Number.isFinite(value) ? value : NaN
      }

      return { alf: nulls(alf), confirmed }
    },
  })
}
