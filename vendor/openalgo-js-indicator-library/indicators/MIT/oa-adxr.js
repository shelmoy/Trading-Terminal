/**
 * Average Directional Movement Index Rating (ADXR) - ported to openalgo-charts from Pine Script v6.
 *
 * Source: https://github.com/mihakralj/pinescript/blob/c4e91b962be09733d8fc76caa5191e9e586c5cee/indicators/dynamics/adxr.pine
 * Repo:   mihakralj/pinescript
 * License: MIT (c) mihakralj
 * SPDX-FileCopyrightText: (c) mihakralj
 * SPDX-FileCopyrightText: (c) 2026 marketcalls (port to openalgo-charts)
 * SPDX-License-Identifier: MIT
 *
 * ADXR averages the current ADX with the ADX of a set number of bars ago, so
 * it smooths the trend-strength reading and makes a change of regime easier to
 * see than the raw ADX alone.
 */

export default function ({ registerIndicator, nulls }) {
  registerIndicator({
    id: 'oa-adxr',
    name: 'Average Directional Movement Index Rating (ADXR)',
    category: 'Dynamics',
    placement: 'pane',

    inputs: [
      {
        key: 'period',
        type: 'number',
        label: 'ADX Period',
        default: 14,
        min: 1,
        max: 5000,
        step: 1,
        tooltip: 'Number of bars used in the ADX calculation.',
      },
      {
        key: 'ratingPeriod',
        type: 'number',
        label: 'Rating Period',
        default: 14,
        min: 1,
        max: 5000,
        step: 1,
        tooltip: 'Number of bars between the current and the historical ADX.',
      },
    ],

    // The source plots all four series with color.yellow and linewidth 2, and
    // draws no hline at all. The chart generates a colour control per plot, so
    // a reader who wants them apart can restyle them there.
    plots: [
      { key: 'adxr', type: 'line', title: 'ADXR', style: { color: '#ffeb3b', lineWidth: 2 } },
      { key: 'adx', type: 'line', title: 'ADX', style: { color: '#ffeb3b', lineWidth: 2 } },
      { key: 'plusDi', type: 'line', title: '+DI', style: { color: '#ffeb3b', lineWidth: 2 } },
      { key: 'minusDi', type: 'line', title: '-DI', style: { color: '#ffeb3b', lineWidth: 2 } },
    ],

    calc(bars, settings) {
      // A cleared number field arrives as '', and Number('') is 0.
      const period = Math.max(1, Math.floor(Number(settings.period) || 14))
      const ratingPeriod = Math.max(1, Math.floor(Number(settings.ratingPeriod) || 14))

      const EPSILON = 1e-10
      const alpha = 1 / period
      const n = bars.length

      const adxr = new Array(n).fill(NaN)
      const adx = new Array(n).fill(NaN)
      const plusDiOut = new Array(n).fill(NaN)
      const minusDiOut = new Array(n).fill(NaN)

      // Wilder smoothing carried by hand. The source divides each running value
      // by (1 - e), where e = (1 - alpha)^barIndex, to undo the bias of its own
      // seeding; the factor cancels out of the DI ratio and only matters to ADX,
      // whose raw series starts at zero.
      let e = 1
      let trRaw = NaN
      let pdmRaw = NaN
      let mdmRaw = NaN
      let adxRaw = NaN

      for (let i = 0; i < n; i++) {
        const high = bars[i].high
        const low = bars[i].low
        if (!Number.isFinite(high) || !Number.isFinite(low)) continue

        const prevClose = i > 0 ? bars[i - 1].close : NaN
        const prevHigh = i > 0 ? bars[i - 1].high : NaN
        const prevLow = i > 0 ? bars[i - 1].low : NaN

        let tr
        if (!Number.isFinite(prevClose)) {
          tr = high - low
        } else {
          tr = Math.max(high - low, Math.max(Math.abs(high - prevClose), Math.abs(low - prevClose)))
        }

        // Pine treats every comparison against na as false, so both moves have
        // to be real numbers before either can set a directional movement.
        let plusDm = 0
        let minusDm = 0
        if (Number.isFinite(prevHigh) && Number.isFinite(prevLow)) {
          const upMove = high - prevHigh
          const downMove = prevLow - low
          if (upMove > downMove && upMove > 0) plusDm = upMove
          if (downMove > upMove && downMove > 0) minusDm = downMove
        }

        trRaw = Number.isFinite(trRaw) ? (trRaw * (period - 1) + tr) / period : tr
        pdmRaw = Number.isFinite(pdmRaw) ? (pdmRaw * (period - 1) + plusDm) / period : plusDm
        mdmRaw = Number.isFinite(mdmRaw) ? (mdmRaw * (period - 1) + minusDm) / period : minusDm
        // The ADX accumulator is seeded at zero rather than at the first value,
        // which is exactly what the (1 - e) compensator below corrects for.
        const dxSeeded = Number.isFinite(adxRaw)

        const compensate = e > EPSILON
        const denominator = 1 - e
        // On the very first bar e is still 1, so the compensated values are
        // undefined (a division by zero, which Pine carries through as na).
        const usable = !compensate || denominator !== 0
        const scale = compensate ? (denominator !== 0 ? 1 / denominator : NaN) : 1

        const trSmooth = usable ? trRaw * scale : NaN
        const pdmSmooth = usable ? pdmRaw * scale : NaN
        const mdmSmooth = usable ? mdmRaw * scale : NaN

        let plusDi = NaN
        let minusDi = NaN
        let dx = NaN
        if (Number.isFinite(trSmooth) && Number.isFinite(pdmSmooth) && Number.isFinite(mdmSmooth)) {
          // Pine caps each DI at 50 before the DX ratio is taken.
          plusDi = trSmooth !== 0 ? Math.min((100 * pdmSmooth) / trSmooth, 50) : 0
          minusDi = trSmooth !== 0 ? Math.min((100 * mdmSmooth) / trSmooth, 50) : 0
          const diSum = plusDi + minusDi
          dx = diSum !== 0 ? (100 * Math.abs(plusDi - minusDi)) / diSum : 0
        }

        if (!dxSeeded) {
          adxRaw = 0
        } else if (Number.isFinite(dx)) {
          adxRaw = (adxRaw * (period - 1) + dx) / period
        }

        const adxValue = usable && Number.isFinite(adxRaw) ? adxRaw * scale : NaN

        if (Number.isFinite(plusDi)) plusDiOut[i] = plusDi
        if (Number.isFinite(minusDi)) minusDiOut[i] = minusDi
        if (Number.isFinite(adxValue)) adx[i] = adxValue

        // adx_value[math.min(rating_period, bar_index)]: before the rating
        // period is reached this reaches bar zero, whose ADX is na, and nz()
        // turns that into a zero, halving the reading.
        const back = Math.min(ratingPeriod, i)
        const historical = adx[i - back]
        if (Number.isFinite(adxValue)) {
          adxr[i] = (adxValue + (Number.isFinite(historical) ? historical : 0)) / 2
        }

        e *= 1 - alpha
      }

      return {
        adxr: nulls(adxr),
        adx: nulls(adx),
        plusDi: nulls(plusDiOut),
        minusDi: nulls(minusDiOut),
      }
    },
  })
}
