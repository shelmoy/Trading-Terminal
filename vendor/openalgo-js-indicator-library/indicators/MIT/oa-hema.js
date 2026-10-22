/**
 * Hull Exponential Moving Average (HEMA) - ported to openalgo-charts from Pine
 * Script v6.
 *
 * Source: https://github.com/mihakralj/pinescript/blob/c4e91b962be09733d8fc76caa5191e9e586c5cee/indicators/trends_IIR/hema.pine
 * Repo:   mihakralj/pinescript
 * License: MIT (c) mihakralj
 * SPDX-FileCopyrightText: (c) mihakralj
 * SPDX-FileCopyrightText: (c) 2026 marketcalls (port to openalgo-charts)
 * SPDX-License-Identifier: MIT
 *
 * Hull's lag cancellation rebuilt on exponential averages instead of weighted
 * ones: a fast and a slow EMA are combined with logarithmic weights and the
 * result is smoothed again, so the average tracks price closely without the
 * step-shaped turns of a windowed Hull.
 */

export default function ({ registerIndicator, sourceValues, nulls }) {
  registerIndicator({
    id: 'oa-hema',
    name: 'Hull Exponential Moving Average (HEMA)',
    category: 'Trends IIR',
    placement: 'onchart',

    inputs: [
      { key: 'period', type: 'number', label: 'Period', default: 10, min: 1, max: 5000, step: 1 },
      { key: 'source', type: 'source', label: 'Source', default: 'close' },
    ],

    plots: [{ key: 'hema', type: 'line', title: 'HEMA', style: { color: '#ffeb3b', lineWidth: 2 } }],

    calc(bars, settings) {
      // A cleared number field arrives as '', and Number('') is 0.
      const period = Math.max(1, Math.floor(Number(settings.period) || 10))
      const src = sourceValues(bars, settings.source ?? 'close')
      const n = bars.length
      const N = period

      const alphaSlow = 3.0 / (2.0 * N - 1.0)
      const lambdaSlow = -Math.log(1.0 - alphaSlow)
      const ratio = Math.log(2.0) / (1.0 + Math.log(2.0))
      const alphaFast = 1.0 - Math.exp(-lambdaSlow / ratio)
      const alphaSmooth = 2.0 / (Math.sqrt(N) / 2.0 + 1.0)
      const betaSlow = 1.0 - alphaSlow
      const betaFast = 1.0 - alphaFast
      const betaSmooth = 1.0 - alphaSmooth

      // Pine's three var-carried decay compensators. While they are still far
      // from zero the raw EMAs are divided by (1 - decay), which removes the
      // bias of seeding each average at zero; once the slow decay has collapsed
      // the raw values are used as they stand. Period 1 makes alphaSlow 3, so
      // log(1 - 3) is undefined and the whole chain is na, in Pine and here.
      let warmup = true
      let decaySlow = 1.0
      let decayFast = 1.0
      let decaySmooth = 1.0
      let emaSlowRaw = 0.0
      let emaFastRaw = 0.0
      let emaSmoothRaw = 0.0

      const out = new Array(n).fill(NaN)
      for (let i = 0; i < n; i++) {
        const s = src[i]
        // A missing price would poison every later bar through the recursion,
        // so the bar is skipped and the carried state left untouched.
        if (!Number.isFinite(s)) continue

        emaSlowRaw = alphaSlow * (s - emaSlowRaw) + emaSlowRaw
        emaFastRaw = alphaFast * (s - emaFastRaw) + emaFastRaw

        let emaSlow
        let emaFast
        let hemaVal
        if (warmup) {
          decaySlow *= betaSlow
          decayFast *= betaFast
          decaySmooth *= betaSmooth
          emaSlow = (1.0 / (1.0 - decaySlow)) * emaSlowRaw
          emaFast = (1.0 / (1.0 - decayFast)) * emaFastRaw
          const deLag = emaFast / (1.0 - ratio) - (ratio * emaSlow) / (1.0 - ratio)
          emaSmoothRaw = alphaSmooth * (deLag - emaSmoothRaw) + emaSmoothRaw
          hemaVal = (1.0 / (1.0 - decaySmooth)) * emaSmoothRaw
          warmup = decaySlow > 1e-10
        } else {
          emaSlow = emaSlowRaw
          emaFast = emaFastRaw
          const deLag = emaFast / (1.0 - ratio) - (ratio * emaSlow) / (1.0 - ratio)
          emaSmoothRaw = alphaSmooth * (deLag - emaSmoothRaw) + emaSmoothRaw
          hemaVal = emaSmoothRaw
        }

        if (Number.isFinite(hemaVal)) out[i] = hemaVal
      }

      return { hema: nulls(out) }
    },
  })
}
