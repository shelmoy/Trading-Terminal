/**
 * Awesome Oscillator (AO) - ported to openalgo-charts from Pine Script v6.
 *
 * Source: https://github.com/mihakralj/pinescript/blob/c4e91b962be09733d8fc76caa5191e9e586c5cee/indicators/oscillators/ao.pine
 * Repo:   mihakralj/pinescript
 * License: MIT (c) mihakralj
 * SPDX-FileCopyrightText: (c) mihakralj
 * SPDX-FileCopyrightText: (c) 2026 marketcalls (port to openalgo-charts)
 * SPDX-License-Identifier: MIT
 *
 * Bill Williams' momentum measure: the fast simple average of the bar midpoint
 * minus the slow one, so the histogram reads the shift of short term drive
 * against the broader trend.
 */

export default function ({ registerIndicator, nulls }) {
  // Pine's circular buffer averages over the entries it actually holds, so the
  // early bars carry a partial window average rather than a warmup gap.
  const runningMean = (values, period) => {
    const buf = new Array(period).fill(NaN)
    const out = new Array(values.length).fill(NaN)
    let head = 0
    let sum = 0
    let count = 0
    for (let i = 0; i < values.length; i++) {
      const oldest = buf[head]
      if (Number.isFinite(oldest)) {
        sum -= oldest
        count -= 1
      }
      if (Number.isFinite(values[i])) {
        sum += values[i]
        count += 1
      }
      buf[head] = values[i]
      head = (head + 1) % period
      out[i] = count > 0 ? sum / count : NaN
    }
    return out
  }

  registerIndicator({
    id: 'oa-ao',
    name: 'Awesome Oscillator (AO)',
    category: 'Oscillators',
    placement: 'pane',

    inputs: [
      { key: 'fastLength', type: 'number', label: 'Fast Length', default: 5, min: 1, max: 5000, step: 1 },
      { key: 'slowLength', type: 'number', label: 'Slow Length', default: 34, min: 1, max: 5000, step: 1 },
    ],

    plots: [
      {
        key: 'ao',
        type: 'line',
        title: 'AO',
        style: { color: '#4caf50', lineWidth: 2 },
        // Pine colours the bar green while AO is not falling, red otherwise.
        // The first bar has no previous value, and in Pine every comparison
        // against na is false, so it is red.
        colorBy({ index, values }) {
          const cur = values.ao?.[index]
          const prev = index > 0 ? values.ao?.[index - 1] : null
          if (!Number.isFinite(cur) || !Number.isFinite(prev)) return '#ff5252'
          return cur >= prev ? '#4caf50' : '#ff5252'
        },
      },
    ],

    calc(bars, settings) {
      // A cleared number field arrives as '', and Number('') is 0.
      const fastLength = Math.max(1, Math.floor(Number(settings.fastLength) || 5))
      // Pine refuses a fast length that is not shorter than the slow one; the
      // chart cannot raise, so the slow window is held one bar longer instead.
      const slowLength = Math.max(fastLength + 1, Math.floor(Number(settings.slowLength) || 34))

      const mp = new Array(bars.length).fill(NaN)
      for (let i = 0; i < bars.length; i++) {
        const h = bars[i].high
        const l = bars[i].low
        if (Number.isFinite(h) && Number.isFinite(l)) mp[i] = (h + l) / 2
      }

      const fastMa = runningMean(mp, fastLength)
      const slowMa = runningMean(mp, slowLength)

      const ao = new Array(bars.length).fill(NaN)
      for (let i = 0; i < bars.length; i++) {
        if (!Number.isFinite(fastMa[i]) || !Number.isFinite(slowMa[i])) continue
        ao[i] = fastMa[i] - slowMa[i]
      }

      return { ao: nulls(ao) }
    },
  })
}
