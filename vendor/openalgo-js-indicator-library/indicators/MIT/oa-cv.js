/**
 * Conditional Volatility (CV) - ported to openalgo-charts from Pine Script v6.
 *
 * Source: https://github.com/mihakralj/pinescript/blob/c4e91b962be09733d8fc76caa5191e9e586c5cee/indicators/volatility/cv.pine
 * Repo:   mihakralj/pinescript
 * License: MIT (c) mihakralj
 * SPDX-FileCopyrightText: (c) mihakralj
 * SPDX-FileCopyrightText: (c) 2026 marketcalls (port to openalgo-charts)
 * SPDX-License-Identifier: MIT
 *
 * A GARCH(1,1) estimate of volatility: today's variance is a blend of a long
 * run level, yesterday's squared log return and yesterday's variance, reported
 * annualised in percent.
 */

export default function ({ registerIndicator, nulls }) {
  registerIndicator({
    id: 'oa-cv',
    name: 'Conditional Volatility (CV)',
    category: 'Volatility',
    placement: 'pane',

    inputs: [
      {
        key: 'length',
        type: 'number',
        label: 'Length',
        default: 20,
        min: 10,
        max: 500,
        step: 1,
        tooltip: 'Initial period for estimation.',
      },
      {
        key: 'alpha',
        type: 'number',
        label: 'Alpha',
        default: 0.2,
        min: 0.01,
        max: 0.99,
        step: 0.01,
        tooltip: 'Weight on the previous squared return.',
      },
      {
        key: 'beta',
        type: 'number',
        label: 'Beta',
        default: 0.7,
        min: 0.01,
        max: 0.99,
        step: 0.01,
        tooltip: 'Weight on the previous variance. Alpha plus Beta must stay below 1.',
      },
    ],

    plots: [
      { key: 'cv', type: 'line', title: 'CV', style: { color: '#ffeb3b', lineWidth: 2 } },
    ],

    calc(bars, settings) {
      const n = bars.length
      // A cleared number field arrives as '', and Number('') is 0.
      const length = Math.min(500, Math.max(10, Math.floor(Number(settings.length) || 20)))
      const alpha = Math.min(0.99, Math.max(0.01, Number(settings.alpha) || 0.2))
      let beta = Math.min(0.99, Math.max(0.01, Number(settings.beta) || 0.7))
      // Pine aborts with runtime.error when alpha + beta >= 1, the GARCH
      // stationarity condition. A chart indicator cannot raise, so beta is held
      // just under the line instead of letting the recursion run away.
      if (alpha + beta >= 1) beta = Math.max(0.001, 1 - alpha - 0.001)

      const DAYS_IN_YEAR = 252
      const MIN_PRICE = 1e-10
      const DEFAULT_VARIANCE = 0.0001

      let omega = 0
      let longRunVar = 0
      let prevVariance = 0

      const out = new Array(n).fill(NaN)
      for (let i = 0; i < n; i++) {
        const c0 = bars[i].close
        const c1 = i >= 1 ? bars[i - 1].close : NaN
        const c2 = i >= 2 ? bars[i - 2].close : NaN

        // nz(close, close[1]) then a floor at MIN_PRICE.
        let safeClose = Number.isFinite(c0) ? c0 : c1
        if (!Number.isFinite(safeClose)) safeClose = MIN_PRICE
        safeClose = Math.max(safeClose, MIN_PRICE)

        // nz(close[1], close[2] != 0 ? close[2] : safeClose). A na close[2]
        // makes that comparison na, which Pine reads as false, so the fallback
        // on the very first bars is safeClose itself and the return is zero.
        let safePrevClose
        if (Number.isFinite(c1)) safePrevClose = c1
        else if (Number.isFinite(c2) && c2 !== 0) safePrevClose = c2
        else safePrevClose = safeClose
        safePrevClose = Math.max(safePrevClose, MIN_PRICE)

        let logReturn = 0
        if (safeClose > 0 && safePrevClose > 0) logReturn = Math.log(safeClose / safePrevClose)
        if (Math.abs(logReturn) > 0.2) logReturn = Math.sign(logReturn) * 0.2
        const squaredReturn = logReturn * logReturn

        if (i < length) {
          // Running mean of the squared returns, carried as the long run level.
          longRunVar = (i * longRunVar + squaredReturn) / (i + 1)
          prevVariance = longRunVar
        } else if (i === length) {
          omega = (1 - alpha - beta) * longRunVar
          prevVariance = longRunVar
        }

        let variance = Number.isFinite(prevVariance) ? prevVariance : DEFAULT_VARIANCE
        variance = omega + alpha * squaredReturn + beta * variance
        variance = Math.max(variance, 0.0000001)
        prevVariance = variance

        out[i] = Math.sqrt(DAYS_IN_YEAR * variance) * 100
      }

      return { cv: nulls(out) }
    },
  })
}
