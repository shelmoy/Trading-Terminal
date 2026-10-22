/**
 * Regularized EMA (REMA) - ported to openalgo-charts from Pine Script v6.
 *
 * Source: https://github.com/mihakralj/pinescript/blob/c4e91b962be09733d8fc76caa5191e9e586c5cee/indicators/trends_IIR/rema.pine
 * Repo:   mihakralj/pinescript
 * License: MIT (c) mihakralj
 * SPDX-FileCopyrightText: (c) mihakralj
 * SPDX-FileCopyrightText: (c) 2026 marketcalls (port to openalgo-charts)
 * SPDX-License-Identifier: MIT
 *
 * An exponential moving average blended against a regularization term, so
 * lambda trades responsiveness for smoothness: 1 is the plain EMA step and 0
 * holds the line still.
 */

export default function ({ registerIndicator, sourceValues, nulls }) {
  registerIndicator({
    id: 'oa-rema',
    name: 'Regularized EMA (REMA)',
    category: 'Trends IIR',
    placement: 'onchart',

    inputs: [
      { key: 'source', type: 'source', label: 'Source', default: 'close' },
      { key: 'period', type: 'number', label: 'Period', default: 10, min: 1, max: 5000, step: 1 },
      {
        key: 'lambda',
        type: 'number',
        label: 'Lambda',
        default: 0.5,
        min: 0,
        max: 1,
        step: 0.1,
        tooltip: 'Regularization parameter: 0 = maximum regularization, 1 = standard EMA',
      },
    ],

    plots: [{ key: 'rema', type: 'line', title: 'REMA', style: { color: '#ffeb3b', lineWidth: 2 } }],

    calc(bars, settings) {
      // A cleared number field arrives as '', and Number('') is 0, which is a
      // legal lambda, so an empty field has to be told apart from a real zero.
      const period = Math.max(1, Math.floor(Number(settings.period) || 10))
      const rawLambda = Number(settings.lambda)
      const lambda =
        settings.lambda === '' || settings.lambda == null || !Number.isFinite(rawLambda)
          ? 0.5
          : Math.min(1, Math.max(0, rawLambda))

      const alpha = 2.0 / (period + 1.0)
      const src = sourceValues(bars, settings.source ?? 'close')
      const out = new Array(bars.length).fill(NaN)

      let remaVal = NaN
      let prevRema = NaN

      for (let i = 0; i < bars.length; i++) {
        const source = src[i]
        if (Number.isFinite(source)) {
          if (!Number.isFinite(remaVal)) {
            remaVal = source
            prevRema = source
          } else {
            // The source assigns prev_rema from rema_val before reading it, so
            // reg_component collapses to rema_val itself. Kept as written: the
            // published behaviour is an EMA stepped by alpha * lambda.
            prevRema = remaVal
            const emaComponent = alpha * (source - remaVal) + remaVal
            const regComponent = remaVal + (remaVal - prevRema)
            remaVal = lambda * (emaComponent - regComponent) + regComponent
          }
        }
        // An na source carries the previous value forward, exactly as Pine does.
        out[i] = remaVal
      }

      return { rema: nulls(out) }
    },
  })
}
