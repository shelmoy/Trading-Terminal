/**
 * ICT Equal Highs and Lows - ported to openalgo-charts from Pine Script v5.
 *
 * Source: https://github.com/ArunKBhaskar/PineScript/blob/c6821225c466494b01eee08f9dd88bf84d2b24ba/ICT Equal Highs and Lows/ICT Equal Highs and Lows Indicator.txt
 * Repo:   ArunKBhaskar/PineScript
 * License: MPL-2.0
 * SPDX-FileCopyrightText: (c) Arun_K_Bhaskar
 * SPDX-FileCopyrightText: (c) 2026 marketcalls (port to openalgo-charts)
 * SPDX-License-Identifier: MPL-2.0
 *
 * Marks two consecutive swing pivots that print within a chosen percentage of
 * each other. Equal highs are resting sell-side liquidity, equal lows resting
 * buy-side liquidity. Each pair is boxed from the earlier pivot bar to the
 * later one and both pivot bars are tagged.
 */

// The source's colour and transparency inputs, kept as constants. Plot styling
// belongs to the chart, and draws and markers are not styled from the settings
// dialog, so the script's own defaults are used.
const BEAR = '#F7525F' // equal highs
const BULL = '#22AB94' // equal lows
const TRANSPARENCY = 25 // i_phl_eq_transp, percent
const OPACITY = 1 - TRANSPARENCY / 100

// Pine's default max_boxes_count. The script raises max_lines_count and
// max_labels_count but leaves the box limit alone, so only the newest 50
// boxes survive.
const MAX_BOXES = 50

export default function ({ registerIndicator, pivotHigh, pivotLow, nulls, withAlpha }) {
  // A cleared field arrives as '', and Number('') is 0, which would silently
  // replace a deliberate value. Fall back only when the field is truly empty.
  const numOr = (v, fallback) => {
    if (v === '' || v === null || v === undefined) return fallback
    const n = Number(v)
    return Number.isFinite(n) ? n : fallback
  }

  registerIndicator({
    id: 'oa-ict-equal-highs-and-lows-indicator',
    name: 'ICT Equal Highs and Lows',
    category: 'ICT',
    placement: 'onchart',

    inputs: [
      { key: 'left', type: 'number', label: 'Left', default: 60, min: 1, max: 1000, step: 1, group: 'Equal High Low' },
      { key: 'right', type: 'number', label: 'Right', default: 30, min: 1, max: 1000, step: 1, group: 'Equal High Low' },
      {
        key: 'eqPercent',
        type: 'number',
        label: 'Equal HL %',
        default: 0.05,
        min: 0,
        max: 100,
        step: 0.01,
        group: 'Equal High Low',
        tooltip: 'Lower values mean highs and lows are closer.',
      },
      {
        key: 'srcMode',
        type: 'select',
        label: 'Source',
        default: 'High/Low',
        group: 'Equal High Low',
        options: [
          { label: 'High/Low', value: 'High/Low' },
          { label: 'Open/Close', value: 'Open/Close' },
        ],
      },
    ],

    // The source plots no series: everything it shows is a box or a shape.
    // These two carry the confirmed pivots so the legend has something to
    // name, and are hidden by default like the source's own output.
    plots: [
      { key: 'ph', type: 'line', title: 'Pivot High', style: { color: BEAR, visible: false } },
      { key: 'pl', type: 'line', title: 'Pivot Low', style: { color: BULL, visible: false } },
    ],

    calc(bars, settings, store, ctx) {
      const n = bars.length
      const left = Math.max(1, Math.floor(numOr(settings.left, 60)))
      const right = Math.max(1, Math.floor(numOr(settings.right, 30)))
      const eqPercent = Math.max(0, numOr(settings.eqPercent, 0.05))
      const useOpenClose = settings.srcMode === 'Open/Close'

      const srcHigh = new Array(n)
      const srcLow = new Array(n)
      for (let i = 0; i < n; i++) {
        const b = bars[i]
        srcHigh[i] = useOpenClose ? Math.max(b.open, b.close) : b.high
        srcLow[i] = useOpenClose ? Math.min(b.open, b.close) : b.low
      }

      const phRaw = pivotHigh(srcHigh, left, right)
      const plRaw = pivotLow(srcLow, left, right)

      const phCol = new Array(n).fill(NaN)
      const plCol = new Array(n).fill(NaN)
      // One column per box corner, written on the bar that confirms the pair.
      const eqHighFrom = new Array(n).fill(NaN)
      const eqHighTo = new Array(n).fill(NaN)
      const eqHighTop = new Array(n).fill(NaN)
      const eqHighBottom = new Array(n).fill(NaN)
      const eqLowFrom = new Array(n).fill(NaN)
      const eqLowTo = new Array(n).fill(NaN)
      const eqLowTop = new Array(n).fill(NaN)
      const eqLowBottom = new Array(n).fill(NaN)
      // The tag prices, read from the raw high and low as the source does.
      const eqHighMark = new Array(n).fill(NaN)
      const eqLowMark = new Array(n).fill(NaN)

      // The source keeps the last two pivot prices and the bar indexes that
      // confirmed them. Index 0 is the newest, and both start na.
      let phPrice0 = NaN
      let phPrice1 = NaN
      let phBar0 = NaN
      let phBar1 = NaN
      let plPrice0 = NaN
      let plPrice1 = NaN
      let plBar0 = NaN
      let plBar1 = NaN

      for (let i = 0; i < n; i++) {
        // barstate.isconfirmed. Every loaded bar but the last is closed, and
        // the chart tells us whether the last one is.
        const confirmed = i < n - 1 ? true : ctx?.barState?.isConfirmed !== false

        const isPh = Number.isFinite(phRaw[i])
        const isPl = Number.isFinite(plRaw[i])

        if (isPh) {
          phPrice1 = phPrice0
          phPrice0 = phRaw[i]
          phBar1 = phBar0
          phBar0 = i
          phCol[i] = phRaw[i]
        }
        if (isPl) {
          plPrice1 = plPrice0
          plPrice0 = plRaw[i]
          plBar1 = plBar0
          plBar0 = i
          plCol[i] = plRaw[i]
        }

        // pchg() runs on every bar in the source, so it holds its last computed
        // value between pivots and is na until two pivots of that side exist.
        const phPchg =
          Number.isFinite(phPrice0) && Number.isFinite(phPrice1) && phPrice1 !== 0
            ? Math.abs(((phPrice0 - phPrice1) / phPrice1) * 100)
            : NaN
        const plPchg =
          Number.isFinite(plPrice0) && Number.isFinite(plPrice1) && plPrice1 !== 0
            ? Math.abs(((plPrice0 - plPrice1) / plPrice1) * 100)
            : NaN

        // Every comparison against na is false in Pine, so guard before testing.
        const phCondition = isPh && Number.isFinite(phPchg) && phPchg < eqPercent && confirmed
        const plCondition = isPl && Number.isFinite(plPchg) && plPchg < eqPercent && confirmed

        // A box runs from the earlier pivot bar to the later one. The stored
        // bar indexes are the confirming bars, so the source subtracts `right`
        // from each to reach the pivot itself.
        if (phCondition) {
          const from = phBar1 - right
          const to = phBar0 - right
          if (from >= 0 && to >= 0 && from < n && to < n) {
            eqHighFrom[i] = bars[from].time
            eqHighTo[i] = bars[to].time
            eqHighTop[i] = phPrice1
            eqHighBottom[i] = phPrice0
            eqHighMark[i] = bars[to].high
          }
        }
        if (plCondition) {
          const from = plBar1 - right
          const to = plBar0 - right
          if (from >= 0 && to >= 0 && from < n && to < n) {
            eqLowFrom[i] = bars[from].time
            eqLowTo[i] = bars[to].time
            eqLowTop[i] = plPrice1
            eqLowBottom[i] = plPrice0
            eqLowMark[i] = bars[to].low
          }
        }
      }

      return {
        ph: nulls(phCol),
        pl: nulls(plCol),
        eqHighFrom: nulls(eqHighFrom),
        eqHighTo: nulls(eqHighTo),
        eqHighTop: nulls(eqHighTop),
        eqHighBottom: nulls(eqHighBottom),
        eqLowFrom: nulls(eqLowFrom),
        eqLowTo: nulls(eqLowTo),
        eqLowTop: nulls(eqLowTop),
        eqLowBottom: nulls(eqLowBottom),
        eqHighMark: nulls(eqHighMark),
        eqLowMark: nulls(eqLowMark),
      }
    },

    draws({ bars, values }) {
      if (bars.length === 0) return []
      const boxes = []

      for (let i = 0; i < bars.length; i++) {
        if (values.eqHighFrom[i] != null) {
          boxes.push({
            kind: 'box',
            from: { time: values.eqHighFrom[i], price: values.eqHighTop[i] },
            to: { time: values.eqHighTo[i], price: values.eqHighBottom[i] },
            color: withAlpha(BEAR, OPACITY),
            fillColor: BEAR,
            opacity: OPACITY,
          })
        }
        if (values.eqLowFrom[i] != null) {
          boxes.push({
            kind: 'box',
            from: { time: values.eqLowFrom[i], price: values.eqLowTop[i] },
            to: { time: values.eqLowTo[i], price: values.eqLowBottom[i] },
            color: withAlpha(BULL, OPACITY),
            fillColor: BULL,
            opacity: OPACITY,
          })
        }
      }

      // Pine keeps only the newest max_boxes_count boxes, which defaults to 50.
      return boxes.length > MAX_BOXES ? boxes.slice(boxes.length - MAX_BOXES) : boxes
    },

    markers({ bars, values, settings }) {
      if (bars.length === 0) return []
      const right = Math.max(1, Math.floor(numOr(settings.right, 30)))
      const out = []

      // The source draws its shape at location.absolute with offset=-right, so
      // the tag sits on the pivot bar itself at that bar's raw high or low.
      // 'atPrice' is the only position that anchors to the candle rather than
      // to this indicator's own plot line. The marker set here has no xcross,
      // so a diamond stands in for it.
      for (let i = 0; i < bars.length; i++) {
        const at = i - right
        if (at < 0) continue
        if (values.eqHighMark[i] != null) {
          out.push({
            time: bars[at].time,
            position: 'atPrice',
            price: values.eqHighMark[i],
            shape: 'diamond',
            size: 'small',
            color: withAlpha(BEAR, OPACITY),
          })
        }
        if (values.eqLowMark[i] != null) {
          out.push({
            time: bars[at].time,
            position: 'atPrice',
            price: values.eqLowMark[i],
            shape: 'diamond',
            size: 'small',
            color: withAlpha(BULL, OPACITY),
          })
        }
      }
      return out
    },
  })
}
