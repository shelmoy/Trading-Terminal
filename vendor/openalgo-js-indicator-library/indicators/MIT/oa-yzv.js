/**
 * Yang-Zhang Volatility (YZV) - ported to openalgo-charts from Pine Script v6.
 *
 * Source: https://github.com/mihakralj/pinescript/blob/c4e91b962be09733d8fc76caa5191e9e586c5cee/indicators/volatility/yzv.pine
 * Repo:   mihakralj/pinescript
 * License: MIT
 * SPDX-FileCopyrightText: (c) mihakralj
 * SPDX-FileCopyrightText: (c) 2026 marketcalls (port to openalgo-charts)
 * SPDX-License-Identifier: MIT
 *
 * A range-based volatility estimate that combines the overnight gap, the
 * open-to-close move and the Rogers-Satchell intraday term, then smooths the
 * daily variance with a bias-corrected Wilder average and takes the root.
 */

export default function ({ registerIndicator, nulls }) {
  registerIndicator({
    id: 'oa-yzv',
    name: 'Yang-Zhang Volatility (YZV)',
    category: 'Volatility',
    placement: 'pane',

    inputs: [
      {
        key: 'length',
        type: 'number',
        label: 'Length',
        default: 20,
        min: 1,
        max: 5000,
        step: 1,
        tooltip: 'The lookback period for smoothing Yang-Zhang daily variance estimates.',
      },
    ],

    plots: [{ key: 'yzv', type: 'line', title: 'YZV', style: { color: '#ffeb3b', lineWidth: 2 } }],

    calc(bars, settings) {
      // A cleared number field arrives as '', and Number('') is 0.
      const length = Math.max(1, Math.floor(Number(settings.length) || 20))
      const len = bars.length
      const out = new Array(len).fill(NaN)

      const ratioN = length <= 1 ? 1 : (length + 1) / (length - 1)
      const kYz = 0.34 / (1.34 + ratioN)
      const rmaAlpha = 1 / length
      const EPSILON = 1e-10

      let rawRma = 0
      let eComp = 1

      for (let i = 0; i < len; i++) {
        const bar = bars[i]
        const o = Number(bar.open)
        const h = Number(bar.high)
        const l = Number(bar.low)
        const c = Number(bar.close)
        // Pine: pc = na(close[1]) ? open : close[1]
        const prev = i > 0 ? Number(bars[i - 1].close) : NaN
        const pc = Number.isFinite(prev) ? prev : o

        // Every term is a log ratio, so a non-positive price has no estimate.
        if (!(o > 0) || !(h > 0) || !(l > 0) || !(c > 0) || !(pc > 0)) continue

        const ro = Math.log(o / pc)
        const rc = Math.log(c / o)
        const rh = Math.log(h / o)
        const rl = Math.log(l / o)
        const sOsq = ro * ro
        const sCsq = rc * rc
        const sRsSq = rh * (rh - rc) + rl * (rl - rc)
        const sSqDaily = sOsq + kYz * sCsq + (1 - kYz) * sRsSq
        if (!Number.isFinite(sSqDaily)) continue

        // Pine seeds the running Wilder value with the first daily estimate
        // itself, then applies the warmup compensator on top of it.
        if (i === 0) rawRma = sSqDaily
        else rawRma = (rawRma * (length - 1) + sSqDaily) / length

        eComp = (1 - rmaAlpha) * eComp
        const d = 1 - eComp
        const smoothed = eComp > EPSILON && d !== 0 ? rawRma / d : rawRma
        out[i] = smoothed >= 0 ? Math.sqrt(smoothed) : NaN
      }

      return { yzv: nulls(out) }
    },
  })
}
