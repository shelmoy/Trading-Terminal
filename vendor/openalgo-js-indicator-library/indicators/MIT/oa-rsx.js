/**
 * Relative Strength Xtra (RSX) - ported to openalgo-charts from Pine Script v6.
 *
 * Source: https://github.com/mihakralj/pinescript/blob/c4e91b962be09733d8fc76caa5191e9e586c5cee/indicators/momentum/rsx.pine
 * Repo:   mihakralj/pinescript
 * License: MIT
 * SPDX-FileCopyrightText: (c) mihakralj
 * SPDX-FileCopyrightText: (c) 2026 marketcalls (port to openalgo-charts)
 * SPDX-License-Identifier: MIT
 *
 * A relative strength oscillator whose up and down moves are each smoothed by a
 * Jurik-style adaptive filter before the ratio is taken, so it tracks momentum
 * with far less of the jitter a plain RSI carries.
 */

export default function ({ registerIndicator, sourceValues, nulls }) {
  registerIndicator({
    id: 'oa-rsx',
    name: 'Relative Strength Xtra (RSX)',
    category: 'Momentum',
    placement: 'pane',

    inputs: [
      { key: 'length', type: 'number', label: 'Length', default: 14, min: 1, max: 5000, step: 1 },
      { key: 'source', type: 'source', label: 'Source', default: 'close' },
    ],

    plots: [
      { key: 'rsx', type: 'line', title: 'RSX', style: { color: '#ffeb3b', lineWidth: 2 } },
    ],

    calc(bars, settings) {
      // A cleared number field arrives as '', and Number('') is 0.
      const len = Math.max(1, Math.floor(Number(settings.length) || 14))
      const src = sourceValues(bars, settings.source ?? 'close')
      const n = bars.length
      const out = new Array(n).fill(NaN)

      // Simple-int constants, computed once exactly as the Pine var block does.
      const POWER = 0.5
      const PHASE_VALUE = 0.5
      const BETA = (POWER * (len - 1)) / (POWER * (len - 1) + 2)
      // len = 1 makes the sqrt zero, so the log is -Infinity and LEN1 clamps to 0.
      const LEN1 = Math.max(Math.log(Math.sqrt(0.5 * (len - 1))) / Math.log(2) + 2, 0)
      const POW1 = Math.max(LEN1 - 2, 0.5)
      const LEN2 = Math.sqrt(0.5 * (len - 1)) * LEN1
      const POW1_RECIPROCAL = 1 / POW1
      const AVG_VOLTY_ALPHA = 2 / (Math.max(4 * len, 65) + 1)
      const DIV = 1 / (10 + (10 * Math.min(Math.max(len - 10, 0), 100)) / 100)
      const RVOLTY_CAP = Math.pow(LEN1, POW1_RECIPROCAL)
      const KV_BASE = LEN2 + 1 !== 0 ? LEN2 / (LEN2 + 1) : 0

      // One independent smoother per side. Per-instance scratch, created inside
      // calc so nothing leaks across instances or across recomputes.
      const makeSide = () => ({
        upperBand: NaN,
        lowerBand: NaN,
        ma1: NaN,
        jma: NaN,
        vSum: 0,
        det0: 0,
        det1: 0,
        avgVolty: NaN,
        smooth: NaN,
        volty: new Array(11).fill(0),
      })

      const step = (st, x) => {
        const del1 = x - (Number.isFinite(st.upperBand) ? st.upperBand : x)
        const del2 = x - (Number.isFinite(st.lowerBand) ? st.lowerBand : x)
        const a1 = Math.abs(del1)
        const a2 = Math.abs(del2)
        const volty = a1 === a2 ? 0 : Math.max(a1, a2)

        // unshift then pop keeps the ring at 11 entries; index 10 is the value
        // from ten processed bars ago.
        st.volty.unshift(Number.isFinite(volty) ? volty : 0)
        st.volty.pop()
        const oldest = st.volty[10]

        st.vSum = st.vSum + (volty - oldest) * DIV
        const prevAvg = Number.isFinite(st.avgVolty) ? st.avgVolty : st.vSum
        st.avgVolty = prevAvg + AVG_VOLTY_ALPHA * (st.vSum - prevAvg)

        const avgForTest = Number.isFinite(st.avgVolty) ? st.avgVolty : 0
        const avgForDiv = Number.isFinite(st.avgVolty) ? st.avgVolty : 1
        const ratio = avgForTest > 0 ? (Number.isFinite(volty) ? volty : 0) / avgForDiv : 1
        const rvolty = Math.min(Math.max(ratio, 1), RVOLTY_CAP)

        const pow2 = Math.pow(rvolty, POW1)
        const kv = Math.pow(KV_BASE, Math.sqrt(pow2))

        st.upperBand = del1 > 0 ? x : x - kv * del1
        st.lowerBand = del2 < 0 ? x : x - kv * del2

        const alpha = Math.pow(BETA, pow2)
        const alphaSquared = alpha * alpha
        const oneMinusAlpha = 1 - alpha
        const oneMinusAlphaSquared = oneMinusAlpha * oneMinusAlpha

        const prevMa1 = Number.isFinite(st.ma1) ? st.ma1 : x
        st.ma1 = x + alpha * (prevMa1 - x)
        st.det0 = (x - st.ma1) * (1 - BETA) + BETA * (Number.isFinite(st.det0) ? st.det0 : 0)
        const ma2 = st.ma1 + PHASE_VALUE * st.det0

        const prevJma = Number.isFinite(st.jma) ? st.jma : x
        st.det1 =
          (ma2 - prevJma) * oneMinusAlphaSquared +
          alphaSquared * (Number.isFinite(st.det1) ? st.det1 : 0)
        st.jma = prevJma + st.det1
        st.smooth = st.jma
      }

      const up = makeSide()
      const down = makeSide()

      for (let i = 0; i < n; i++) {
        const cur = src[i]
        const prev = i > 0 ? src[i - 1] : NaN
        // Pine: math.max(src - src[1], 0) is na on the first bar, so neither
        // side advances and the first RSX value is na.
        let u = NaN
        let d = NaN
        if (Number.isFinite(cur) && Number.isFinite(prev)) {
          u = Math.max(cur - prev, 0)
          d = Math.max(prev - cur, 0)
        }
        if (Number.isFinite(u)) step(up, u)
        if (Number.isFinite(d)) step(down, d)

        const su = up.smooth
        const sd = down.smooth
        if (!Number.isFinite(su) || !Number.isFinite(sd)) continue
        const rs = sd === 0 ? 0 : su / sd
        const denom = 1 + rs
        if (!Number.isFinite(rs) || denom === 0) continue
        const value = 100 - 100 / denom
        if (Number.isFinite(value)) out[i] = value
      }

      return { rsx: nulls(out) }
    },
  })
}
