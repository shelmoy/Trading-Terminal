/**
 * Stochastic RSI (STOCHRSI) - ported to openalgo-charts from Pine Script v6.
 *
 * Source: https://github.com/mihakralj/pinescript/blob/c4e91b962be09733d8fc76caa5191e9e586c5cee/indicators/oscillators/stochrsi.pine
 * Repo:   mihakralj/pinescript
 * License: MIT
 * SPDX-FileCopyrightText: (c) mihakralj
 * SPDX-FileCopyrightText: (c) 2026 marketcalls (port to openalgo-charts)
 * SPDX-License-Identifier: MIT
 *
 * A stochastic oscillator applied to RSI rather than to price: it reports where
 * the current RSI sits inside its own recent range, then smooths that into a
 * %K line and a %D signal line.
 */

export default function ({ registerIndicator, sourceValues, nulls }) {
  registerIndicator({
    id: 'oa-stochrsi',
    name: 'Stochastic RSI (STOCHRSI)',
    category: 'Oscillators',
    placement: 'pane',

    inputs: [
      {
        key: 'rsiLength',
        type: 'number',
        label: 'RSI Length',
        default: 14,
        min: 1,
        max: 100,
        step: 1,
        tooltip: 'Period for the RSI calculation.',
      },
      {
        key: 'stochLength',
        type: 'number',
        label: 'Stochastic Length',
        default: 14,
        min: 1,
        max: 100,
        step: 1,
        tooltip: 'Lookback period for the stochastic calculation on RSI.',
      },
      {
        key: 'kSmooth',
        type: 'number',
        label: '%K Smooth',
        default: 3,
        min: 1,
        max: 20,
        step: 1,
        tooltip: 'Smoothing period for the %K line.',
      },
      {
        key: 'dSmooth',
        type: 'number',
        label: '%D Smooth',
        default: 3,
        min: 1,
        max: 20,
        step: 1,
        tooltip: 'Smoothing period for the %D line.',
      },
      {
        key: 'source',
        type: 'source',
        label: 'Source',
        default: 'close',
        tooltip: 'Price series to analyse.',
      },
    ],

    plots: [
      { key: 'k', type: 'line', title: 'StochRSI %K', style: { color: '#ffeb3b', lineWidth: 2 } },
      { key: 'd', type: 'line', title: 'StochRSI %D', style: { color: '#2962ff', lineWidth: 2 } },
    ],

    calc(bars, settings) {
      // A cleared number field arrives as '', and Number('') is 0.
      const rsiLength = Math.min(100, Math.max(1, Math.floor(Number(settings.rsiLength) || 14)))
      const stochLength = Math.min(100, Math.max(1, Math.floor(Number(settings.stochLength) || 14)))
      const kSmooth = Math.min(20, Math.max(1, Math.floor(Number(settings.kSmooth) || 3)))
      const dSmooth = Math.min(20, Math.max(1, Math.floor(Number(settings.dSmooth) || 3)))
      const src = sourceValues(bars, settings.source ?? 'close')
      const n = bars.length

      const kOut = new Array(n).fill(NaN)
      const dOut = new Array(n).fill(NaN)

      // The source smooths up and down moves with alpha = 1 / length, seeded by
      // assigning the raw move outright for the first `rsiLength` bars rather
      // than by averaging them, so reproduce that seeding exactly.
      const alpha = 1 / rsiLength
      let smoothUp = 0
      let smoothDown = 0

      const rsiBuffer = []
      const kBuffer = []
      const dBuffer = []

      for (let i = 0; i < n; i++) {
        // src_clean = na(source) ? 0 : source, and nz(src_clean[1]) on the prior bar.
        const current = Number.isFinite(src[i]) ? src[i] : 0
        const prevRaw = i >= 1 ? src[i - 1] : NaN
        const previous = Number.isFinite(prevRaw) ? prevRaw : 0

        const up = Math.max(current - previous, 0)
        const down = Math.max(previous - current, 0)

        if (i < rsiLength) {
          smoothUp = up
          smoothDown = down
        } else {
          smoothUp = smoothUp * (1 - alpha) + up * alpha
          smoothDown = smoothDown * (1 - alpha) + down * alpha
        }

        const rs = smoothDown === 0 ? 0 : smoothUp / smoothDown
        const rsiValue = smoothDown === 0 ? 100 : 100 - 100 / (1 + rs)

        // Rolling window of the last `stochLength` RSI readings, expanding
        // until it fills, exactly as the source's array buffer does.
        rsiBuffer.push(rsiValue)
        if (rsiBuffer.length > stochLength) rsiBuffer.shift()

        let highestRsi = -Infinity
        let lowestRsi = Infinity
        for (let j = 0; j < rsiBuffer.length; j++) {
          if (rsiBuffer[j] > highestRsi) highestRsi = rsiBuffer[j]
          if (rsiBuffer[j] < lowestRsi) lowestRsi = rsiBuffer[j]
        }

        const rsiRange = highestRsi - lowestRsi
        const kRaw = rsiRange > 0 ? (100 * (rsiValue - lowestRsi)) / rsiRange : 50

        kBuffer.push(kRaw)
        if (kBuffer.length > kSmooth) kBuffer.shift()
        let kSum = 0
        for (let j = 0; j < kBuffer.length; j++) kSum += kBuffer[j]
        const kSmoothed = kSum / kBuffer.length

        dBuffer.push(kSmoothed)
        if (dBuffer.length > dSmooth) dBuffer.shift()
        let dSum = 0
        for (let j = 0; j < dBuffer.length; j++) dSum += dBuffer[j]
        const dSmoothed = dSum / dBuffer.length

        kOut[i] = kSmoothed
        dOut[i] = dSmoothed
      }

      return { k: nulls(kOut), d: nulls(dOut) }
    },
  })
}
