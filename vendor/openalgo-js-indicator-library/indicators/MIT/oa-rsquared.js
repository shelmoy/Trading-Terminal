/**
 * R2 Coefficient of Determination (RSQUARED) - ported to openalgo-charts from Pine Script v6.
 *
 * Source: https://github.com/mihakralj/pinescript/blob/c4e91b962be09733d8fc76caa5191e9e586c5cee/indicators/errors/rsquared.pine
 * Repo:   mihakralj/pinescript
 * License: MIT
 * SPDX-FileCopyrightText: (c) mihakralj
 * SPDX-FileCopyrightText: (c) 2026 marketcalls (port to openalgo-charts)
 * SPDX-License-Identifier: MIT
 *
 * Measures how much of the source's variation around its own rolling mean an
 * EMA of the same length explains: 1 is a perfect fit, 0 is no better than the
 * mean, and a negative reading means the EMA tracks worse than a flat line.
 */

export default function ({ registerIndicator, sourceValues, smaSeededEma, nulls }) {
  // Pine keeps three circular buffers of length p, each skipping na slots, so
  // the running sum and the count of live entries both have to be carried.
  const rollingSums = (values, p) => {
    const buffer = new Array(p).fill(NaN)
    const sums = new Array(values.length).fill(NaN)
    const counts = new Array(values.length).fill(0)
    let sum = 0
    let head = 0
    let count = 0
    for (let i = 0; i < values.length; i++) {
      const oldest = buffer[head]
      if (Number.isFinite(oldest)) {
        sum -= oldest
        count -= 1
      }
      const value = values[i]
      if (Number.isFinite(value)) {
        sum += value
        count += 1
      }
      buffer[head] = value
      head = (head + 1) % p
      sums[i] = sum
      counts[i] = count
    }
    return { sums, counts }
  }

  registerIndicator({
    id: 'oa-rsquared',
    name: 'R² Coefficient of Determination (RSQUARED)',
    category: 'Errors',
    // The Pine indicator() call carries no overlay flag, so the study owns a
    // pane; only the EMA comparison line is force_overlay onto price.
    placement: 'pane',

    inputs: [
      { key: 'source', type: 'source', label: 'Source', default: 'close' },
      { key: 'period', type: 'number', label: 'Period', default: 100, min: 1, max: 4000, step: 1 },
    ],

    plots: [
      { key: 'score', type: 'area', title: 'R²', style: { color: '#ffeb3b', lineWidth: 2 } },
      { key: 'ema', type: 'line', title: 'EMA', overlay: true, style: { color: '#ffeb3b', lineWidth: 1 } },
    ],

    calc(bars, settings) {
      // A cleared number field arrives as '', and Number('') is 0.
      const period = Math.max(1, Math.floor(Number(settings.period) || 100))
      // Pine clamps the buffer length to 4000 while the EMA keeps the raw input.
      const p = Math.min(Math.max(1, period), 4000)
      const source1 = sourceValues(bars, settings.source ?? 'close')
      // ta.ema seeds from the SMA of the first `period` values, so it is na for
      // period-1 bars; smaSeededEma reproduces that exactly.
      const source2 = smaSeededEma(source1, period)

      const mean1 = rollingSums(source1, p)

      const squaredResidual = new Array(bars.length).fill(NaN)
      const totalSs = new Array(bars.length).fill(NaN)
      for (let i = 0; i < bars.length; i++) {
        const s1 = source1[i]
        const s2 = source2[i]
        if (Number.isFinite(s1) && Number.isFinite(s2)) squaredResidual[i] = (s1 - s2) * (s1 - s2)
        // Pine falls back to the raw source when the window holds nothing yet.
        const mean = mean1.counts[i] > 0 ? mean1.sums[i] / mean1.counts[i] : s1
        if (Number.isFinite(s1) && Number.isFinite(mean)) totalSs[i] = (s1 - mean) * (s1 - mean)
      }

      const rssWindow = rollingSums(squaredResidual, p)
      const tssWindow = rollingSums(totalSs, p)

      const score = new Array(bars.length).fill(NaN)
      for (let i = 0; i < bars.length; i++) {
        // These are rolling SUMS, not means: Pine divides one by the other.
        const rss = rssWindow.counts[i] > 0 ? rssWindow.sums[i] : squaredResidual[i]
        const tss = tssWindow.counts[i] > 0 ? tssWindow.sums[i] : totalSs[i]
        if (!Number.isFinite(rss) || !Number.isFinite(tss)) continue
        score[i] = tss !== 0 ? 1 - rss / tss : 1
      }

      return { score: nulls(score), ema: nulls(source2) }
    },
  })
}
