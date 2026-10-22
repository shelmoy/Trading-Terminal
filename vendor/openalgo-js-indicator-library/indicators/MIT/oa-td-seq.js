/**
 * TD Sequential (TD_SEQ) - ported to openalgo-charts from Pine Script v6.
 *
 * Source: https://github.com/mihakralj/pinescript/blob/c4e91b962be09733d8fc76caa5191e9e586c5cee/indicators/oscillators/td_seq.pine
 * Repo:   mihakralj/pinescript
 * License: MIT (c) mihakralj
 * SPDX-FileCopyrightText: (c) mihakralj
 * SPDX-FileCopyrightText: (c) 2026 marketcalls (port to openalgo-charts)
 * SPDX-License-Identifier: MIT
 *
 * Tom DeMark's exhaustion counting system: a setup phase counts consecutive
 * closes against the close of comparePeriod bars ago up to plus or minus 9, and
 * a completed setup opens a non-consecutive countdown toward plus or minus 13.
 */

export default function ({ registerIndicator, nulls }) {
  registerIndicator({
    id: 'oa-td-seq',
    name: 'TD Sequential (TD_SEQ)',
    category: 'Oscillators',
    placement: 'pane',

    inputs: [
      {
        key: 'comparePeriod',
        type: 'number',
        label: 'Compare Period',
        default: 4,
        min: 1,
        max: 500,
        step: 1,
        tooltip: 'Lookback used by the setup comparison: close against close of this many bars ago.',
      },
    ],

    plots: [
      { key: 'setup', type: 'histogram', title: 'Setup', style: { color: '#ffeb3b', lineWidth: 2 } },
      { key: 'countdown', type: 'line', title: 'Countdown', style: { color: '#00bcd4', lineWidth: 1 } },
    ],

    levels: () => [
      { price: 0, title: 'Zero', color: '#8892a6' },
      { price: 9, title: 'Sell Setup Complete', color: '#ef5350' },
      { price: -9, title: 'Buy Setup Complete', color: '#26a69a' },
      { price: 13, title: 'Sell Countdown', color: '#ef5350' },
      { price: -13, title: 'Buy Countdown', color: '#26a69a' },
    ],

    calc(bars, settings) {
      // A cleared number field arrives as '', and Number('') is 0.
      const comparePeriod = Math.max(1, Math.floor(Number(settings.comparePeriod) || 4))

      const setup = new Array(bars.length).fill(NaN)
      const countdown = new Array(bars.length).fill(NaN)

      // Pine carries all of this in var scalars, so it is plain loop state here.
      let setupCount = 0
      let countdownCount = 0
      let countdownDir = 0
      let setupComplete = false

      for (let i = 0; i < bars.length; i++) {
        // Pine wraps both closes in nz(), so a missing history bar reads as 0.
        const curClose = Number.isFinite(bars[i].close) ? bars[i].close : 0
        const prior = i >= comparePeriod ? bars[i - comparePeriod].close : NaN
        const prevClose = Number.isFinite(prior) ? prior : 0

        // Phase 1: setup counting.
        let newSetup = 0
        if (curClose < prevClose) newSetup = setupCount < 0 ? setupCount - 1 : -1
        else if (curClose > prevClose) newSetup = setupCount > 0 ? setupCount + 1 : 1
        else newSetup = 0

        if (newSetup > 9) newSetup = 9
        if (newSetup < -9) newSetup = -9

        // A setup that has just reached plus or minus 9 opens the countdown.
        if (Math.abs(newSetup) === 9 && !setupComplete) {
          setupComplete = true
          countdownCount = 0
          countdownDir = newSetup > 0 ? 1 : -1
        }

        if (
          Math.abs(newSetup) < Math.abs(setupCount) ||
          (newSetup > 0 && setupCount < 0) ||
          (newSetup < 0 && setupCount > 0)
        ) {
          setupComplete = false
        }

        setupCount = newSetup

        // Phase 2: countdown, incremented only on qualifying bars.
        if (countdownDir !== 0) {
          const rawLow2 = i >= 2 ? bars[i - 2].low : NaN
          const rawHigh2 = i >= 2 ? bars[i - 2].high : NaN
          const low2 = Number.isFinite(rawLow2) ? rawLow2 : 0
          const high2 = Number.isFinite(rawHigh2) ? rawHigh2 : 0

          if (countdownDir === -1 && curClose < low2) countdownCount -= 1
          else if (countdownDir === 1 && curClose > high2) countdownCount += 1

          if (Math.abs(countdownCount) >= 13) {
            countdownCount = countdownDir === 1 ? 13 : -13
            countdownDir = 0
          }

          // An opposite completed setup restarts the countdown the other way.
          if ((countdownDir === 1 && newSetup === -9) || (countdownDir === -1 && newSetup === 9)) {
            countdownCount = 0
            countdownDir = newSetup > 0 ? 1 : -1
          }
        }

        setup[i] = setupCount
        countdown[i] = countdownCount
      }

      return { setup: nulls(setup), countdown: nulls(countdown) }
    },
  })
}
