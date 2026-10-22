/**
 * ICT Equal Highs and Lows with Screener - ported to openalgo-charts from
 * Pine Script v5.
 *
 * Source: https://github.com/ArunKBhaskar/PineScript/blob/c6821225c466494b01eee08f9dd88bf84d2b24ba/ICT Equal Highs and Lows/ICT Equal Highs and Lows with Screener.txt
 * Repo:   ArunKBhaskar/PineScript
 * License: MPL-2.0
 * SPDX-FileCopyrightText: (c) Arun_K_Bhaskar
 * SPDX-FileCopyrightText: (c) 2026 marketcalls (port to openalgo-charts)
 * SPDX-License-Identifier: MPL-2.0
 *
 * Marks pairs of consecutive swing pivots that print within a chosen percentage
 * of each other: an equal high is resting sell-side liquidity, an equal low is
 * resting buy-side liquidity. Each pair is boxed from the earlier pivot to the
 * later one and both pivot bars are tagged.
 *
 * Gap against the source: the 40-symbol screener is a request.security loop
 * over other instruments, which a chart study cannot express. The same
 * screening logic is evaluated on the chart's own symbol instead and its hits
 * are listed in the table.
 */

// The source's colour and transparency inputs, kept as constants. Plot styling
// belongs to the chart, and draws and markers are not styled from the settings
// dialog, so the script's own defaults are used.
const BEAR = '#F7525F' // equal highs
const BULL = '#22AB94' // equal lows
const NEUTRAL = '#B2B5BE'
const TRANSPARENCY = 25 // i_phl_eq_transp, percent
const OPACITY = 1 - TRANSPARENCY / 100

// Pine's default max_boxes_count. The script raises max_lines_count and
// max_labels_count but not the box limit, so only the newest 50 boxes survive.
const MAX_BOXES = 50

const TEXT_SIZE_PX = { auto: 11, tiny: 8, small: 10, normal: 12, large: 14, huge: 18 }

export default function ({
  registerIndicator,
  pivotHigh,
  pivotLow,
  nulls,
  withAlpha,
  roundToTick,
  utcSecondsToZonedParts,
  DEFAULT_TIMEZONE,
}) {
  // A cleared field arrives as '', and Number('') is 0, which would silently
  // replace a deliberate value. Fall back only when the field is truly empty.
  const numOr = (v, fallback) => {
    if (v === '' || v === null || v === undefined) return fallback
    const n = Number(v)
    return Number.isFinite(n) ? n : fallback
  }

  const pad2 = (n) => String(n).padStart(2, '0')

  // Pine's format_time: HH:mm dd-MM-yyyy intraday, dd-MM-yyyy otherwise.
  const formatTime = (seconds, intraday) => {
    const p = utcSecondsToZonedParts(seconds, DEFAULT_TIMEZONE)
    const date = `${pad2(p.day)}-${pad2(p.month)}-${p.year}`
    return intraday ? `${pad2(p.hour)}:${pad2(p.minute)}  ${date}` : date
  }

  registerIndicator({
    id: 'oa-ict-equal-highs-and-lows-with-screener',
    name: 'ICT Equal Highs and Lows with Screener',
    category: 'ICT',
    placement: 'onchart',

    inputs: [
      {
        key: 'method',
        type: 'select',
        label: 'Screening Method',
        default: 'Equals',
        group: 'Screener',
        options: [
          { label: 'Equals', value: 'Equals' },
          { label: 'Equals Sweep', value: 'Equals Sweep' },
        ],
        tooltip: 'Equals reports the pair as it forms. Equals Sweep waits for price to run through the level.',
      },
      {
        key: 'direction',
        type: 'select',
        label: 'Direction',
        default: 'Both',
        group: 'Screener',
        options: [
          { label: 'Both', value: 'Both' },
          { label: 'Bullish', value: 'Bullish' },
          { label: 'Bearish', value: 'Bearish' },
        ],
      },
      { key: 'showBull', type: 'boolean', label: 'Only Bullish', default: true, group: 'Screener' },
      { key: 'showBear', type: 'boolean', label: 'Only Bearish', default: true, group: 'Screener' },
      { key: 'displayRows', type: 'number', label: 'Display Rows', default: 16, min: 0, max: 100, step: 1, group: 'Screener' },
      {
        key: 'tablePosition',
        type: 'select',
        label: 'Table Position',
        default: 'bottom-left',
        group: 'Screener',
        options: [
          { label: 'Top Left', value: 'top-left' },
          { label: 'Top Center', value: 'top-center' },
          { label: 'Top Right', value: 'top-right' },
          { label: 'Middle Left', value: 'middle-left' },
          { label: 'Middle Center', value: 'middle-center' },
          { label: 'Middle Right', value: 'middle-right' },
          { label: 'Bottom Left', value: 'bottom-left' },
          { label: 'Bottom Center', value: 'bottom-center' },
          { label: 'Bottom Right', value: 'bottom-right' },
        ],
      },
      {
        key: 'tableTextSize',
        type: 'select',
        label: 'Table Size',
        default: 'small',
        group: 'Screener',
        options: [
          { label: 'Auto', value: 'auto' },
          { label: 'Tiny', value: 'tiny' },
          { label: 'Small', value: 'small' },
          { label: 'Normal', value: 'normal' },
          { label: 'Large', value: 'large' },
          { label: 'Huge', value: 'huge' },
        ],
      },

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

    // The source plots no series: everything it shows is a box, a shape or a
    // table cell. These two carry the confirmed pivots so the legend has
    // something to name, and are hidden by default like the source's output.
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
      const sweep = settings.method === 'Equals Sweep'
      const direction = settings.direction ?? 'Both'
      const showBull = settings.showBull !== false
      const showBear = settings.showBear !== false
      const tick = Number(ctx?.tickSize) || 0

      // Pine: math.round_to_mintick(close). Snapping multiplies back by the
      // tick, and that leaves a binary floating-point tail: 103.8 arrives as
      // 103.80000000000001, which the table would print in full. Trim the tail
      // while keeping far more significant digits than any price needs.
      const snap = (v) => {
        if (!Number.isFinite(v) || tick <= 0) return v
        return Number(roundToTick(v, tick).toPrecision(12))
      }

      // Pine: bull = not(direction == "Bearish"), bear = not(direction == "Bullish").
      const bullAllowed = direction !== 'Bearish'
      const bearAllowed = direction !== 'Bullish'

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
      const signal = new Array(n).fill(NaN)
      const signalPrice = new Array(n).fill(NaN)

      // The source keeps the last two pivot prices and the bar indexes that
      // confirmed them. Index 0 is the newest.
      let phPrice0 = NaN
      let phPrice1 = NaN
      let phBar0 = NaN
      let phBar1 = NaN
      let plPrice0 = NaN
      let plPrice1 = NaN
      let plBar0 = NaN
      let plBar1 = NaN
      // ph_price_0 and pl_price_0 as series, for the sweep crossovers.
      let prevPhLevel = NaN
      let prevPlLevel = NaN

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

        // pchg() runs on every bar in the source, so it holds the last computed
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

        // Screening method. The sweep variant waits for the raw high to cross
        // above the newest equal high, or the raw low to cross below the newest
        // equal low, rather than reporting the pair as it forms.
        let bullishCond = phCondition
        let bearishCond = plCondition
        if (sweep) {
          const h = bars[i].high
          const l = bars[i].low
          const hPrev = i > 0 ? bars[i - 1].high : NaN
          const lPrev = i > 0 ? bars[i - 1].low : NaN
          const crossOver =
            Number.isFinite(h) &&
            Number.isFinite(hPrev) &&
            Number.isFinite(phPrice0) &&
            Number.isFinite(prevPhLevel) &&
            h > phPrice0 &&
            hPrev <= prevPhLevel
          const crossUnder =
            Number.isFinite(l) &&
            Number.isFinite(lPrev) &&
            Number.isFinite(plPrice0) &&
            Number.isFinite(prevPlLevel) &&
            l < plPrice0 &&
            lPrev >= prevPlLevel
          bullishCond = Number.isFinite(phPchg) && phPchg < eqPercent && crossOver && confirmed
          bearishCond = Number.isFinite(plPchg) && plPchg < eqPercent && crossUnder && confirmed
        }

        // Ported as written: the source gates its bearish branch with the
        // 'Only Bullish' switch and its bullish branch with 'Only Bearish'.
        if (confirmed) {
          if (showBull && bearishCond && bearAllowed) {
            signal[i] = -1
            signalPrice[i] = snap(bars[i].close)
          } else if (showBear && bullishCond && bullAllowed) {
            signal[i] = 1
            signalPrice[i] = snap(bars[i].close)
          }
        }

        prevPhLevel = phPrice0
        prevPlLevel = plPrice0
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
        signal: nulls(signal),
        signalPrice: nulls(signalPrice),
      }
    },

    draws({ bars, values }) {
      if (bars.length === 0) return []
      const boxes = []

      for (let i = 0; i < bars.length; i++) {
        if (values.eqHighFrom[i] != null) {
          boxes.push({
            index: i,
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
            index: i,
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
      const kept = boxes.length > MAX_BOXES ? boxes.slice(boxes.length - MAX_BOXES) : boxes
      return kept.map(({ index, ...box }) => box)
    },

    markers({ bars, values, settings }) {
      if (bars.length === 0) return []
      const right = Math.max(1, Math.floor(numOr(settings.right, 30)))
      const out = []

      // The source draws its shape at location.absolute with offset=-right, so
      // the tag sits on the pivot bar itself at that bar's raw high or low.
      // 'atPrice' is the only position that anchors to the candle rather than
      // to this indicator's own plot line. The style set here has no xcross, so
      // a diamond stands in for it.
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

    table({ bars, values, settings }) {
      const rows = Math.max(0, Math.min(100, Math.floor(numOr(settings.displayRows, 16))))
      if (rows === 0 || bars.length === 0) return null

      // The chart's own bar spacing decides the time format, which is what
      // timeframe.isintraday answers in the source.
      const step = bars.length > 1 ? bars[bars.length - 1].time - bars[bars.length - 2].time : 0
      const intraday = step > 0 && step < 86400

      const hits = []
      for (let i = bars.length - 1; i >= 0 && hits.length < rows; i--) {
        const s = values.signal[i]
        if (s == null) continue
        const price = values.signalPrice[i]
        hits.push({
          time: formatTime(bars[i].time, intraday),
          dir: s === 1 ? 'H' : 'L',
          price: price == null ? '-' : String(price),
          color: s === 1 ? BEAR : BULL,
        })
      }

      const head = (t) => ({ text: t, textColor: NEUTRAL, bgColor: withAlpha(NEUTRAL, 0.1), align: 'left', bold: true })
      const cell = (t, colour) => ({ text: t, textColor: colour, bgColor: withAlpha(colour, 0.1), align: 'left' })

      const grid = [[head('Time'), head('Dir'), head('Price')]]
      if (hits.length === 0) {
        grid.push([cell('No hits yet', NEUTRAL), cell('', NEUTRAL), cell('', NEUTRAL)])
      } else {
        for (const h of hits) grid.push([cell(h.time, h.color), cell(h.dir, h.color), cell(h.price, h.color)])
      }

      return {
        rows: grid,
        options: {
          position: String(settings.tablePosition ?? 'bottom-left'),
          fontSize: TEXT_SIZE_PX[String(settings.tableTextSize ?? 'small')] ?? 10,
          borderColor: withAlpha(NEUTRAL, 0.4),
          borderWidth: 1,
          cellWidth: [130, 40, 80],
          cellHeight: 20,
        },
      }
    },
  })
}
