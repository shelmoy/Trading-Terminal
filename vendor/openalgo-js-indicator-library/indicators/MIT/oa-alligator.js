/**
 * Williams Alligator - ported to openalgo-charts from Pine Script v6.
 *
 * Source: https://github.com/mihakralj/pinescript/blob/c4e91b962be09733d8fc76caa5191e9e586c5cee/indicators/dynamics/alligator.pine
 * Repo:   mihakralj/pinescript
 * License: MIT
 * SPDX-FileCopyrightText: (c) mihakralj
 * SPDX-FileCopyrightText: (c) 2026 marketcalls (port to openalgo-charts)
 * SPDX-License-Identifier: MIT
 *
 * Three Wilder-smoothed averages of different lengths, each displaced forward
 * by its own number of bars. Their spacing and crossing order describe whether
 * the market is trending or sleeping.
 */

export default function ({ registerIndicator, sourceValues, nulls }) {
  registerIndicator({
    id: 'oa-alligator',
    name: 'Williams Alligator',
    category: 'Dynamics',
    placement: 'onchart',

    inputs: [
      { key: 'source', type: 'source', label: 'Source', default: 'hlc3' },
      { key: 'jawPeriod', type: 'number', label: 'Jaw Period', default: 13, min: 1, max: 5000, step: 1 },
      { key: 'jawOffset', type: 'number', label: 'Jaw Offset', default: 8, min: 0, max: 500, step: 1 },
      { key: 'teethPeriod', type: 'number', label: 'Teeth Period', default: 8, min: 1, max: 5000, step: 1 },
      { key: 'teethOffset', type: 'number', label: 'Teeth Offset', default: 5, min: 0, max: 500, step: 1 },
      { key: 'lipsPeriod', type: 'number', label: 'Lips Period', default: 5, min: 1, max: 5000, step: 1 },
      { key: 'lipsOffset', type: 'number', label: 'Lips Offset', default: 3, min: 0, max: 500, step: 1 },
    ],

    plots: [
      { key: 'jaw', type: 'line', title: 'Jaw', style: { color: '#2962ff', lineWidth: 2 } },
      { key: 'teeth', type: 'line', title: 'Teeth', style: { color: '#f23645', lineWidth: 2 } },
      { key: 'lips', type: 'line', title: 'Lips', style: { color: '#26a69a', lineWidth: 2 } },
    ],

    calc(bars, settings) {
      // A cleared number field arrives as '', and Number('') is 0, so floor at
      // the minimum rather than falling back to the default for offsets, where
      // 0 is itself a legitimate value.
      const intInput = (raw, fallback, min) => {
        const n = Number(raw)
        if (!Number.isFinite(n)) return Math.max(min, fallback)
        return Math.max(min, Math.floor(n))
      }
      const jawPeriod = Math.max(1, Math.floor(Number(settings.jawPeriod) || 13))
      const teethPeriod = Math.max(1, Math.floor(Number(settings.teethPeriod) || 8))
      const lipsPeriod = Math.max(1, Math.floor(Number(settings.lipsPeriod) || 5))
      const jawOffset = intInput(settings.jawOffset, 8, 0)
      const teethOffset = intInput(settings.teethOffset, 5, 0)
      const lipsOffset = intInput(settings.lipsOffset, 3, 0)

      const src = sourceValues(bars, settings.source ?? 'hlc3')
      const len = bars.length

      const alphaJaw = 1 / jawPeriod
      const alphaTeeth = 1 / teethPeriod
      const alphaLips = 1 / lipsPeriod

      // Wilder smoothing carried from 0 with an exponential warmup compensator,
      // exactly as the source does, so the first bar already reads as the source.
      let warmupJaw = true
      let warmupTeeth = true
      let warmupLips = true
      let eJaw = 1
      let eTeeth = 1
      let eLips = 1
      let emaJaw = 0
      let emaTeeth = 0
      let emaLips = 0

      const jawRaw = new Array(len).fill(NaN)
      const teethRaw = new Array(len).fill(NaN)
      const lipsRaw = new Array(len).fill(NaN)

      for (let i = 0; i < len; i++) {
        const s = src[i]
        // A non-finite source would poison every later bar, so hold the state.
        if (!Number.isFinite(s)) continue

        emaJaw = alphaJaw * (s - emaJaw) + emaJaw
        emaTeeth = alphaTeeth * (s - emaTeeth) + emaTeeth
        emaLips = alphaLips * (s - emaLips) + emaLips

        if (warmupJaw) {
          eJaw *= 1 - alphaJaw
          const d = 1 - eJaw
          jawRaw[i] = d !== 0 ? emaJaw / d : emaJaw
          warmupJaw = eJaw > 1e-10
        } else {
          jawRaw[i] = emaJaw
        }

        if (warmupTeeth) {
          eTeeth *= 1 - alphaTeeth
          const d = 1 - eTeeth
          teethRaw[i] = d !== 0 ? emaTeeth / d : emaTeeth
          warmupTeeth = eTeeth > 1e-10
        } else {
          teethRaw[i] = emaTeeth
        }

        if (warmupLips) {
          eLips *= 1 - alphaLips
          const d = 1 - eLips
          lipsRaw[i] = d !== 0 ? emaLips / d : emaLips
          warmupLips = eLips > 1e-10
        } else {
          lipsRaw[i] = emaLips
        }
      }

      // Pine plots jaw[jawOffset], which reads the value from `offset` bars ago
      // and therefore draws the line displaced that many bars to the right.
      const shift = (arr, off) => {
        const out = new Array(len).fill(NaN)
        for (let i = off; i < len; i++) out[i] = arr[i - off]
        return out
      }

      return {
        jaw: nulls(shift(jawRaw, jawOffset)),
        teeth: nulls(shift(teethRaw, teethOffset)),
        lips: nulls(shift(lipsRaw, lipsOffset)),
      }
    },
  })
}
