/**
 * Choppiness Index - ported to openalgo-charts from Pine Script v6.
 *
 * Source: https://github.com/mihakralj/pinescript/blob/c4e91b962be09733d8fc76caa5191e9e586c5cee/indicators/dynamics/chop.pine
 * Repo:   mihakralj/pinescript
 * License: MIT (c) mihakralj
 * SPDX-FileCopyrightText: (c) mihakralj
 * SPDX-FileCopyrightText: (c) 2026 marketcalls (port to openalgo-charts)
 * SPDX-License-Identifier: MIT
 *
 * Compares the summed true range of a window against the window's own
 * high-to-low span, on a 0 to 100 scale: low readings mean price travelled in
 * one direction, high readings mean it covered the same ground repeatedly.
 */

export default function ({ registerIndicator, nulls }) {
  registerIndicator({
    id: 'oa-chop',
    name: 'Choppiness Index',
    category: 'Dynamics',
    placement: 'pane',

    inputs: [
      { key: 'length', type: 'number', label: 'Length', default: 14, min: 2, max: 5000, step: 1 },
    ],

    plots: [{ key: 'chop', type: 'line', title: 'CHOP', style: { color: '#ffeb3b', lineWidth: 2 } }],

    levels: () => [
      { price: 61.8, title: 'High Threshold', color: '#ef5350', dashed: true },
      { price: 38.2, title: 'Low Threshold', color: '#26a69a', dashed: true },
      { price: 50, title: 'Midline', color: '#787b86', dashed: true },
    ],

    calc(bars, settings) {
      // A cleared number field arrives as '', and Number('') is 0. Pine refuses
      // a length of 1 or less, so the floor is 2.
      const length = Math.max(2, Math.floor(Number(settings.length) || 14))
      const n = bars.length
      const out = new Array(n).fill(NaN)

      const trBuf = new Array(length).fill(NaN)
      const highBuf = new Array(length).fill(NaN)
      const lowBuf = new Array(length).fill(NaN)
      let sumTr = 0
      let head = 0
      let filled = 0

      for (let i = 0; i < n; i++) {
        const high = Number(bars[i].high)
        const low = Number(bars[i].low)
        const close = Number(bars[i].close)
        if (!Number.isFinite(high) || !Number.isFinite(low) || !Number.isFinite(close)) continue

        const prevRaw = i > 0 ? Number(bars[i - 1].close) : NaN
        const prevClose = Number.isFinite(prevRaw) ? prevRaw : close
        const tr = Math.max(high - low, Math.max(Math.abs(high - prevClose), Math.abs(low - prevClose)))

        // The slot being overwritten leaves the rolling sum; an empty slot means
        // the window has not filled yet.
        const evicted = trBuf[head]
        if (Number.isFinite(evicted)) sumTr -= evicted
        else filled += 1

        trBuf[head] = tr
        highBuf[head] = high
        lowBuf[head] = low
        sumTr += tr

        const win = Math.min(filled, length)
        let hhv = -1e100
        let llv = 1e100
        for (let k = 0; k < win; k++) {
          const idx = (head - k + length) % length
          const h = highBuf[idx]
          const l = lowBuf[idx]
          if (Number.isFinite(h)) hhv = Math.max(hhv, h)
          if (Number.isFinite(l)) llv = Math.min(llv, l)
        }
        head = (head + 1) % length

        const priceRange = hhv - llv
        // win >= 2 also keeps log10(win) off zero, and priceRange > 0 keeps the
        // ratio finite on a window where price never moved.
        if (win >= 2 && priceRange > 0) {
          const logRatio = Math.log10(sumTr / priceRange)
          const logLen = Math.log10(win)
          let value = (100.0 * logRatio) / logLen
          value = Math.max(0.0, Math.min(100.0, value))
          out[i] = value
        }
      }

      return { chop: nulls(out) }
    },
  })
}
