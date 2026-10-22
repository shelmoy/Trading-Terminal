/**
 * Ehlers Deviation-Scaled Moving Average (EDSMA) - ported to openalgo-charts from Pine Script v3.
 *
 * Source: https://github.com/everget/tradingview-pinescript-indicators/blob/60c93d3711d222b8f2db96160defe568429348e0/movings/ehlers_deviation_scaled_moving_average.pine
 * Repo:   everget/tradingview-pinescript-indicators
 * License: GPL-3.0
 * SPDX-FileCopyrightText: (c) 2018-present Alex Orekhov (everget)
 * SPDX-FileCopyrightText: (c) 2026 marketcalls (port to openalgo-charts)
 * SPDX-License-Identifier: GPL-3.0-only
 *
 * An adaptive average whose smoothing factor is driven by a super-smoothed
 * second difference of price rescaled into standard deviations, so it tracks
 * price closely when the move is large relative to recent dispersion and stalls
 * when it is not.
 */

export default function ({ registerIndicator, sourceValues, nulls }) {
  const nz = (v) => (Number.isFinite(v) ? v : 0)

  // ssf := c1 * src + c2 * nz(ssf[1]) + c3 * nz(ssf[2])
  const twoPoleSuperSmoother = (values, length) => {
    const arg = (Math.SQRT2 * Math.PI) / length
    const a1 = Math.exp(-arg)
    const b1 = 2 * a1 * Math.cos(arg)
    const c2 = b1
    const c3 = -Math.pow(a1, 2)
    const c1 = 1 - c2 - c3

    const out = new Array(values.length).fill(NaN)
    for (let i = 0; i < values.length; i++) {
      if (!Number.isFinite(values[i])) continue
      out[i] = c1 * values[i] + c2 * nz(out[i - 1]) + c3 * nz(out[i - 2])
    }
    return out
  }

  // ssf := coef1 * src + coef2 * nz(ssf[1]) + coef3 * nz(ssf[2]) + coef4 * nz(ssf[3])
  const threePoleSuperSmoother = (values, length) => {
    const arg = Math.PI / length
    const a1 = Math.exp(-arg)
    const b1 = 2 * a1 * Math.cos(1.738 * arg)
    const c1 = Math.pow(a1, 2)

    const coef2 = b1 + c1
    const coef3 = -(c1 + b1 * c1)
    const coef4 = Math.pow(c1, 2)
    const coef1 = 1 - coef2 - coef3 - coef4

    const out = new Array(values.length).fill(NaN)
    for (let i = 0; i < values.length; i++) {
      if (!Number.isFinite(values[i])) continue
      out[i] = coef1 * values[i] + coef2 * nz(out[i - 1]) + coef3 * nz(out[i - 2]) + coef4 * nz(out[i - 3])
    }
    return out
  }

  // Pine's stdev is the population deviation and propagates na: a window that
  // still contains the na first filter value yields na, not a partial figure.
  const pineStdev = (values, period) => {
    const out = new Array(values.length).fill(NaN)
    for (let i = period - 1; i < values.length; i++) {
      let sum = 0
      let ok = true
      for (let j = i - period + 1; j <= i; j++) {
        if (!Number.isFinite(values[j])) { ok = false; break }
        sum += values[j]
      }
      if (!ok) continue
      const mean = sum / period
      let acc = 0
      for (let j = i - period + 1; j <= i; j++) {
        const d = values[j] - mean
        acc += d * d
      }
      out[i] = Math.sqrt(Math.max(0, acc / period))
    }
    return out
  }

  registerIndicator({
    id: 'oa-ehlers-deviation-scaled-moving-average',
    name: 'Ehlers Deviation-Scaled Moving Average (EDSMA)',
    category: 'Moving Averages',
    placement: 'onchart',

    inputs: [
      { key: 'length', type: 'number', label: 'Length', default: 40, min: 2, max: 1000, step: 1 },
      { key: 'ssfLength', type: 'number', label: 'Super Smoother Filter Length', default: 20, min: 1, max: 1000, step: 1 },
      {
        key: 'numberOfPoles',
        type: 'select',
        label: 'Number of Poles',
        default: '2',
        options: [
          { label: '2', value: '2' },
          { label: '3', value: '3' },
        ],
      },
      { key: 'source', type: 'source', label: 'Source', default: 'close' },
    ],

    plots: [{ key: 'edsma', type: 'line', title: 'EDSMA', style: { color: '#6d1e7f', lineWidth: 2 } }],

    calc(bars, settings) {
      // A cleared number field arrives as '', and Number('') is 0.
      const length = Math.max(2, Math.floor(Number(settings.length) || 40))
      const ssfLength = Math.max(1, Math.floor(Number(settings.ssfLength) || 20))
      const threePole = String(settings.numberOfPoles ?? '2') === '3'
      const src = sourceValues(bars, settings.source ?? 'close')

      const n = bars.length

      // zeros = src - nz(src[2]); the first two bars subtract 0.
      const zeros = new Array(n).fill(NaN)
      for (let i = 0; i < n; i++) {
        if (!Number.isFinite(src[i])) continue
        zeros[i] = src[i] - (i >= 2 ? nz(src[i - 2]) : 0)
      }

      // (zeros + zeros[1]) / 2 is na on the first bar, which is what makes the
      // filter and therefore the deviation window na for that bar.
      const filterInput = new Array(n).fill(NaN)
      for (let i = 1; i < n; i++) {
        if (!Number.isFinite(zeros[i]) || !Number.isFinite(zeros[i - 1])) continue
        filterInput[i] = (zeros[i] + zeros[i - 1]) / 2
      }

      const ssf = threePole
        ? threePoleSuperSmoother(filterInput, ssfLength)
        : twoPoleSuperSmoother(filterInput, ssfLength)

      const sd = pineStdev(ssf, length)

      const out = new Array(n).fill(NaN)
      let edsma = 0 // nz(edsma[1]) seeds the recursion at zero

      for (let i = 0; i < n; i++) {
        // Pine takes the else branch whenever the deviation is still na, so the
        // scaled filter, and with it alpha, is exactly zero during warmup.
        const scaled = Number.isFinite(sd[i]) && sd[i] !== 0 && Number.isFinite(ssf[i]) ? ssf[i] / sd[i] : 0
        const alpha = (Math.abs(scaled) * 5) / length
        const price = Number.isFinite(src[i]) ? src[i] : 0
        edsma = alpha * price + (1 - alpha) * edsma

        // Before the first finite deviation alpha is pinned at zero, so Pine
        // plots a literal 0 there. That is warmup, not a price, and a zero on
        // the price pane destroys autoscale, so it is emitted as a gap instead.
        // The recursion still carries the zero, so every later bar matches Pine.
        if (Number.isFinite(sd[i])) out[i] = edsma
      }

      return { edsma: nulls(out) }
    },
  })
}
