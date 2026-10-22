/**
 * ICT Market Structure Shift (MSS) Screener - ported to openalgo-charts from Pine Script v6.
 *
 * Source: https://github.com/ArunKBhaskar/PineScript/blob/c6821225c466494b01eee08f9dd88bf84d2b24ba/ICT Market Structure Shift (MSS)/ICT Market Structure Shift (MSS) Screener.txt
 * Repo:   ArunKBhaskar/PineScript
 * License: MPL-2.0 (c) Arun_K_Bhaskar
 * SPDX-FileCopyrightText: (c) Arun_K_Bhaskar
 * SPDX-FileCopyrightText: (c) 2026 marketcalls (port to openalgo-charts)
 * SPDX-License-Identifier: MPL-2.0
 *
 * A zig zag built from rolling highest/lowest bars names the last three swings.
 * When price closes through the middle swing against the prevailing structure,
 * and the swing displacement passes the filter, the structure has shifted: the
 * break is marked, the swing range is boxed and the broken level is drawn
 * across. A one third retracement back into that range is then tracked as the
 * optimal trade entry follow up.
 *
 * Gaps against the source, both in the screener half rather than the study:
 *  - The 40 symbol CSV list and its 40 request.security calls cannot be
 *    expressed: a chart study sees one instrument. Everything that runs on the
 *    current symbol is ported, and the table reports that symbol's own signals.
 *  - The table therefore reads Time / Price / Signal rather than
 *    Symbol / Time / Price: with one instrument the symbol column would repeat
 *    the chart's own name, and the table hook is handed no symbol anyway.
 *    All nine of Pine's table positions are carried over.
 *
 * The '% Difference >' input of the source is declared there and never read by
 * any expression, so it is not carried over: a control that changes nothing is
 * worse than no control. Colour inputs are dropped because the chart generates
 * its own colour controls; the Pine defaults are kept as the constants below.
 */

// Pine defaults, kept verbatim so the port looks like the original out of the box.
const POS_COLOR = '#22AB94'          // i_pos_color, bullish box and level
const NEG_COLOR = '#F7525F'          // i_neg_color, bearish box and level
const BULL_SIGNAL_COLOR = '#70CCBD'  // i_zz_bull_signal_color
const BEAR_SIGNAL_COLOR = '#FAA1A4'  // i_zz_bear_signal_color
const ZZ_LINE_COLOR = '#1E53E5'      // i_zz_bull_color and i_zz_bear_color, both the same
const NEUTRAL_COLOR = '#B2B5BE'      // i_neu_color, table text

// Pine caps the drawing layer at max_lines_count=500 / max_boxes_count=500 and
// silently drops the oldest beyond that. The same ceiling is applied here, from
// the newest backwards, so a long history cannot flood the draw layer.
const MAX_EVENTS = 500
const MAX_ZZ_POINTS = 500

const TABLE_FONT_SIZE = { auto: 11, tiny: 8, small: 10, normal: 12, large: 14, huge: 18 }

export default function ({
  registerIndicator,
  highestBars,
  lowestBars,
  nulls,
  clamp,
  withAlpha,
  roundToTick,
  utcSecondsToZonedParts,
  isValidTimezone,
  DEFAULT_TIMEZONE,
}) {
  // A cleared number field arrives as '', and Number('') is 0, which would turn
  // a legitimate 0 default and an emptied box into the same thing.
  const numOr = (value, fallback) => {
    if (value === '' || value === null || value === undefined) return fallback
    const n = Number(value)
    return Number.isFinite(n) ? n : fallback
  }

  const pad2 = (v) => String(v).padStart(2, '0')

  // str.tostring() of a mintick-rounded price: no trailing zeros, no exponent.
  const priceText = (v) => {
    if (!Number.isFinite(v)) return '-'
    return v.toFixed(4).replace(/0+$/, '').replace(/\.$/, '')
  }

  registerIndicator({
    id: 'oa-ict-market-structure-shift-mss-screener',
    name: 'ICT Market Structure Shift (MSS) Screener',
    category: 'ICT',
    placement: 'onchart',

    inputs: [
      {
        key: 'scrMethod',
        type: 'select',
        label: 'Screening Method',
        default: 'Market Structure Shift',
        group: 'Screener',
        options: [
          { label: 'Market Structure Shift', value: 'Market Structure Shift' },
          { label: 'Retracement to OTE / OB', value: 'Retracement to OTE / OB' },
        ],
        tooltip: 'Which event fills the table: the structure shift itself, or the retracement back into the shifted range.',
      },
      {
        key: 'scrDirection',
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
      { key: 'scrShowBull', type: 'boolean', label: 'Only Bullish', default: true, group: 'Screener' },
      { key: 'scrShowBear', type: 'boolean', label: 'Only Bearish', default: true, group: 'Screener' },
      { key: 'tblRows', type: 'number', label: 'Display Rows', default: 16, min: 0, max: 100, step: 1, group: 'Screener' },
      {
        key: 'tblPosition',
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
        key: 'tblSize',
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

      { key: 'bearShow', type: 'boolean', label: 'Bearish', default: true, group: 'Zig Zag' },
      { key: 'bearShiftShow', type: 'boolean', label: 'Bearish Shift', default: true, group: 'Zig Zag' },
      { key: 'bearRetShow', type: 'boolean', label: 'Bearish Retracement', default: true, group: 'Zig Zag' },
      { key: 'bullShow', type: 'boolean', label: 'Bullish', default: true, group: 'Zig Zag' },
      { key: 'bullShiftShow', type: 'boolean', label: 'Bullish Shift', default: true, group: 'Zig Zag' },
      { key: 'bullRetShow', type: 'boolean', label: 'Bullish Retracement', default: true, group: 'Zig Zag' },
      {
        key: 'zzPeriod',
        type: 'number',
        label: 'Zig Zag Length',
        default: 4,
        min: 2,
        max: 500,
        step: 1,
        group: 'Zig Zag',
        tooltip: 'A bar is a swing point when it is the highest or lowest of this many bars.',
      },
      {
        key: 'zzSource',
        type: 'select',
        label: 'Source',
        default: 'High/Low',
        group: 'Zig Zag',
        options: [
          { label: 'High/Low', value: 'High/Low' },
          { label: 'Open/Close', value: 'Open/Close' },
        ],
      },
      { key: 'zzShow', type: 'boolean', label: 'Show Zig Zag', default: false, group: 'Zig Zag' },
      {
        key: 'boxTransp',
        type: 'number',
        label: 'Box Transparency',
        default: 75,
        min: 0,
        max: 100,
        step: 1,
        group: 'Zig Zag',
        tooltip: 'Transparency of the swing range box, 0 solid to 100 invisible.',
      },

      {
        key: 'filterChoice',
        type: 'select',
        label: 'Filter Using',
        default: 'Percentage',
        group: 'Additional Filters',
        options: [
          { label: 'Multiplier', value: 'Multiplier' },
          { label: 'Percentage', value: 'Percentage' },
        ],
        tooltip: 'Filters remove narrow swing displacements. Multiplier adapts to the timeframe; Percentage stays constant across all of them. Set Percentage to 0 for no filtering.',
      },
      {
        key: 'filterMultiplier',
        type: 'number',
        label: 'Multiplier',
        default: 2,
        min: 1,
        max: 100,
        step: 0.1,
        group: 'Additional Filters',
        tooltip: 'The new swing displacement must be this many times the previous one.',
      },
      {
        key: 'filterPercentage',
        type: 'number',
        label: 'Percentage Above',
        default: 0.7,
        min: 0,
        max: 100,
        step: 0.1,
        group: 'Additional Filters',
        tooltip: 'Filters liquidity displacement above the given percentage.',
      },
    ],

    // Everything this study draws is geometry (boxes, levels, the zig zag) or a
    // marker, none of which is one value per bar. The zig zag pivot column is
    // the one honest per-bar series and it carries the polyline, so it is the
    // declared plot, hidden by default because on its own it is a row of dots.
    plots: [
      { key: 'zzPivot', type: 'line', title: 'Zig Zag Pivot', style: { color: ZZ_LINE_COLOR, lineWidth: 2, visible: false } },
    ],

    calc(bars, settings, store, ctx) {
      const n = bars.length

      const period = Math.max(2, Math.floor(numOr(settings.zzPeriod, 4)))
      const useBody = settings.zzSource === 'Open/Close'
      const byMultiplier = settings.filterChoice === 'Multiplier'
      const multiplier = Math.max(1, numOr(settings.filterMultiplier, 2))
      const percentage = Math.max(0, numOr(settings.filterPercentage, 0.7))
      const byRetracement = settings.scrMethod === 'Retracement to OTE / OB'
      const direction = settings.scrDirection === 'Bullish' || settings.scrDirection === 'Bearish'
        ? settings.scrDirection
        : 'Both'
      const showBullOnly = settings.scrShowBull !== false
      const showBearOnly = settings.scrShowBear !== false

      // syminfo.mintick: the chart knows it, so never ask the user for it.
      const tick = Number(ctx?.tickSize) || 0
      const snap = (v) => (Number.isFinite(v) && tick > 0 ? roundToTick(v, tick) : v)

      // barstate.isconfirmed. Every bar but the last is closed; the last is only
      // closed when the host says so, and a host that says nothing is history.
      const lastIndex = Number.isFinite(ctx?.barState?.lastIndex) ? ctx.barState.lastIndex : n - 1
      const lastConfirmed = ctx?.barState?.isConfirmed !== false

      const zzPivot = new Array(n).fill(NaN)
      const zz1Col = new Array(n).fill(NaN)
      const zz2Col = new Array(n).fill(NaN)
      const zz3Col = new Array(n).fill(NaN)
      const bi1Col = new Array(n).fill(NaN)
      const bi2Col = new Array(n).fill(NaN)
      const bi3Col = new Array(n).fill(NaN)
      const bearSignal = new Array(n).fill(NaN)
      const bullSignal = new Array(n).fill(NaN)
      const bearRetSignal = new Array(n).fill(NaN)
      const bullRetSignal = new Array(n).fill(NaN)
      const bearRetLevel = new Array(n).fill(NaN)
      const bullRetLevel = new Array(n).fill(NaN)
      const bearRetAnchor = new Array(n).fill(NaN)
      const bullRetAnchor = new Array(n).fill(NaN)
      const screenSignal = new Array(n).fill(NaN)
      const screenPrice = new Array(n).fill(NaN)

      const columns = {
        zzPivot: nulls(zzPivot),
        zz1: zz1Col,
        zz2: zz2Col,
        zz3: zz3Col,
        bi1: bi1Col,
        bi2: bi2Col,
        bi3: bi3Col,
        bearSignal,
        bullSignal,
        bearRetSignal,
        bullRetSignal,
        bearRetLevel,
        bullRetLevel,
        bearRetAnchor,
        bullRetAnchor,
        screenSignal,
        screenPrice,
      }
      if (n === 0) return columns

      // _high / _low: the swing source, body extremes or the wick extremes.
      const hiSrc = new Array(n)
      const loSrc = new Array(n)
      for (let i = 0; i < n; i++) {
        const b = bars[i]
        hiSrc[i] = useBody ? Math.max(b.open, b.close) : b.high
        loSrc[i] = useBody ? Math.min(b.open, b.close) : b.low
      }
      // ta.highestbars(...) == 0 means this bar is the extreme of the window.
      // Both helpers are NaN for the first period - 1 bars, exactly as Pine is.
      const hiBars = highestBars(hiSrc, period)
      const loBars = lowestBars(loSrc, period)

      // The Pine zigzag array holds five pivots as ten slots, newest first:
      // [price0, index0, price1, index1, ...]. It is kept here as an ordered
      // list of pivots instead, oldest first, because the drawing needs the
      // whole chain and the ten slot window is derived from it.
      const pivots = []
      const pineSize = () => Math.min(pivots.length, 5) * 2
      const pineSlot = (j) => {
        const p = pivots[pivots.length - 1 - Math.floor(j / 2)]
        if (!p) return NaN
        return j % 2 === 0 ? p.price : p.index
      }

      // filter(): both bearish_filter and bullish_filter are the same call in
      // the source, so one result serves both.
      const swingFilter = (s3, s2, s1) => {
        if (!Number.isFinite(s1) || !Number.isFinite(s2) || !Number.isFinite(s3)) return false
        if (byMultiplier) return Math.abs(s1 - s2) > Math.abs(s3 - s2) * multiplier
        if (s3 === 0) return false
        return Math.abs(((s3 - s1) / s3) * 100) > percentage
      }

      let dir = 0
      let prevDir = null
      let prevClose = NaN
      let prevZz2 = NaN
      let prevHigh = NaN
      let prevLow = NaN
      let bearPrice = NaN
      let bearAnchor = NaN
      let bullPrice = NaN
      let bullAnchor = NaN
      let bearState = 0
      let bullState = 0

      for (let i = 0; i < n; i++) {
        const bar = bars[i]
        const close = bar.close

        const ph = hiBars[i] === 0 ? hiSrc[i] : NaN
        const pl = loBars[i] === 0 ? loSrc[i] : NaN
        const hasPh = Number.isFinite(ph)
        const hasPl = Number.isFinite(pl)

        // dir := pl and na(ph) ? -1 : ph and na(pl) ? 1 : dir
        // Pine casts the float to bool, where na is false. A price of exactly
        // zero would also read false there; no traded instrument produces one.
        if (hasPl && !hasPh) dir = -1
        else if (hasPh && !hasPl) dir = 1

        // ta.change(dir) is na on the first bar, which Pine reads as false.
        const dirChanged = prevDir !== null && dir !== prevDir

        if (hasPh || hasPl) {
          const value = dir === 1 ? ph : pl
          if (Number.isFinite(value)) {
            if (dirChanged || pivots.length === 0) {
              // add_to_zigzag: a new leg begins.
              pivots.push({ price: value, index: i })
            } else {
              // update_zigzag: the newest pivot extends in the current direction.
              const last = pivots[pivots.length - 1]
              if ((dir === 1 && value > last.price) || (dir === -1 && value < last.price)) {
                last.price = value
                last.index = i
              }
            }
          }
        }

        // The source reads the swings from the END of the array, so zz_1 is the
        // newest settled swing, zz_2 the one before it and zz_3 older still.
        const size = pineSize()
        const zz1 = size > 7 ? pineSlot(size - 8) : NaN
        const bi1 = size > 6 ? pineSlot(size - 7) : NaN
        const zz2 = size > 5 ? pineSlot(size - 6) : NaN
        const bi2 = size > 4 ? pineSlot(size - 5) : NaN
        const zz3 = size > 3 ? pineSlot(size - 4) : NaN
        const bi3 = size > 2 ? pineSlot(size - 3) : NaN

        const filterOk = swingFilter(zz3, zz2, zz1)
        const confirmed = i < lastIndex ? true : lastConfirmed
        const swingsReady = Number.isFinite(zz1) && Number.isFinite(zz2) && Number.isFinite(zz3)

        // ta.crossunder / ta.crossover against the middle swing. Every operand
        // is checked first: in JavaScript a comparison with null is not false.
        const crossReady = swingsReady && Number.isFinite(prevZz2) && Number.isFinite(prevClose)
        const crossUnder2 = crossReady && close < zz2 && prevClose >= prevZz2
        const crossOver2 = crossReady && close > zz2 && prevClose <= prevZz2

        const bearCond = swingsReady &&
          zz1 > zz2 && zz1 > zz3 &&
          zz2 < zz1 && zz2 < zz3 &&
          zz3 < zz1 && zz3 > zz2 &&
          close < zz1 && close < zz2 && close < zz3 &&
          crossUnder2 && filterOk && confirmed

        const bullCond = swingsReady &&
          zz1 < zz2 && zz1 < zz3 &&
          zz2 > zz1 && zz2 > zz3 &&
          zz3 > zz1 && zz3 < zz2 &&
          close > zz1 && close > zz2 && close > zz3 &&
          crossOver2 && filterOk && confirmed

        // One third of the way back into the broken range.
        const bearLevel = zz1 - (zz1 - zz2) / 3
        const bullLevel = zz1 + (zz2 - zz1) / 3

        // var series: the level and its anchor persist until the next shift.
        const heldBearPrice = bearPrice
        const heldBullPrice = bullPrice
        if (bearCond) {
          bearPrice = bearLevel
          bearAnchor = bi1
        }
        if (bullCond) {
          bullPrice = bullLevel
          bullAnchor = bi1
        }

        // ta.crossover(high, level) and ta.crossunder(low, level), against the
        // raw bar extremes rather than the zig zag source.
        const bearRetCond = confirmed &&
          Number.isFinite(bearPrice) && Number.isFinite(heldBearPrice) && Number.isFinite(prevHigh) &&
          bar.high > bearPrice && prevHigh <= heldBearPrice
        const bullRetCond = confirmed &&
          Number.isFinite(bullPrice) && Number.isFinite(heldBullPrice) && Number.isFinite(prevLow) &&
          bar.low < bullPrice && prevLow >= heldBullPrice

        // Shift, then retracement, then reset: state 2 lasts exactly one bar.
        let bearNext = bearState === 2 ? 0 : bearState
        if (bearCond && bearNext === 0) bearNext = 1
        if (bearRetCond && bearNext === 1) bearNext = 2
        const bearTrigger = bearNext === 2
        bearState = bearNext

        let bullNext = bullState === 2 ? 0 : bullState
        if (bullCond && bullNext === 0) bullNext = 1
        if (bullRetCond && bullNext === 1) bullNext = 2
        const bullTrigger = bullNext === 2
        bullState = bullNext

        // The screener, run on this symbol. The source pairs i_scr_show_bull
        // with the bearish branch and i_scr_show_bear with the bullish one;
        // that crossover is upstream behaviour and is reproduced, not tidied.
        const bearMethod = byRetracement ? bearTrigger && bearRetCond : bearCond
        const bullMethod = byRetracement ? bullTrigger && bullRetCond : bullCond
        const allowBull = direction !== 'Bearish'
        const allowBear = direction !== 'Bullish'
        if (confirmed) {
          let signal = NaN
          if (showBullOnly && bearMethod && allowBear) signal = -1
          else if (showBearOnly && bullMethod && allowBull) signal = 1
          if (Number.isFinite(signal)) {
            screenSignal[i] = signal
            screenPrice[i] = snap(close)
          }
        }

        zz1Col[i] = zz1
        zz2Col[i] = zz2
        zz3Col[i] = zz3
        bi1Col[i] = bi1
        bi2Col[i] = bi2
        bi3Col[i] = bi3
        if (bearCond) bearSignal[i] = 1
        if (bullCond) bullSignal[i] = 1
        if (bearTrigger) bearRetSignal[i] = 1
        if (bullTrigger) bullRetSignal[i] = 1
        bearRetLevel[i] = bearPrice
        bullRetLevel[i] = bullPrice
        bearRetAnchor[i] = bearAnchor
        bullRetAnchor[i] = bullAnchor

        prevDir = dir
        prevClose = close
        prevZz2 = zz2
        prevHigh = bar.high
        prevLow = bar.low
      }

      // A pivot keeps moving while its leg is live, so the chain is only final
      // once the whole pass is done.
      for (const p of pivots) {
        if (p.index >= 0 && p.index < n) zzPivot[p.index] = p.price
      }
      columns.zzPivot = nulls(zzPivot)

      return columns
    },

    markers({ bars, values, settings }) {
      const n = bars.length
      if (n === 0) return []

      const bearShow = settings.bearShow !== false
      const bullShow = settings.bullShow !== false
      const bearShift = settings.bearShiftShow !== false
      const bullShift = settings.bullShiftShow !== false
      const bearRet = settings.bearRetShow !== false
      const bullRet = settings.bullRetShow !== false

      // location.abovebar / location.belowbar are relative to the candle, so
      // the marker is anchored atPrice with a gap scaled to the instrument.
      let rangeSum = 0
      let rangeCount = 0
      for (const b of bars) {
        const r = b.high - b.low
        if (Number.isFinite(r)) {
          rangeSum += r
          rangeCount += 1
        }
      }
      const meanRange = rangeCount > 0 ? rangeSum / rangeCount : 0
      const lastClose = Number.isFinite(bars[n - 1].close) ? bars[n - 1].close : 0
      const gap = Math.max(meanRange * 0.5, Math.abs(lastClose) * 0.0005)

      const out = []
      for (let i = 0; i < n; i++) {
        const b = bars[i]
        if (!Number.isFinite(b.high) || !Number.isFinite(b.low)) continue
        if (bearShow && bearShift && values.bearSignal[i] === 1) {
          out.push({
            time: b.time,
            position: 'atPrice',
            price: b.high + gap,
            shape: 'triangleDown',
            size: 'tiny',
            color: BEAR_SIGNAL_COLOR,
          })
        }
        if (bullShow && bullShift && values.bullSignal[i] === 1) {
          out.push({
            time: b.time,
            position: 'atPrice',
            price: b.low - gap,
            shape: 'triangleUp',
            size: 'tiny',
            color: BULL_SIGNAL_COLOR,
          })
        }
        // plotchar() with a rotation arrow becomes a short text marker: the
        // glyph was decoration, the position and the colour carry the meaning.
        // Marker text always renders above its anchor, so the one that belongs
        // under the candle is dropped a further gap to clear the low.
        if (bearShow && bearRet && values.bearRetSignal[i] === 1) {
          out.push({
            time: b.time,
            position: 'atPrice',
            price: b.high + gap,
            shape: 'text',
            size: 'tiny',
            text: 'Ret',
            color: BEAR_SIGNAL_COLOR,
          })
        }
        if (bullShow && bullRet && values.bullRetSignal[i] === 1) {
          out.push({
            time: b.time,
            position: 'atPrice',
            price: b.low - gap * 2,
            shape: 'text',
            size: 'tiny',
            text: 'Ret',
            color: BULL_SIGNAL_COLOR,
          })
        }
      }
      return out
    },

    barColors({ bars, values, settings }) {
      const n = bars.length
      const out = new Array(n).fill(null)
      const bearShow = settings.bearShow !== false
      const bullShow = settings.bullShow !== false
      const bearShift = settings.bearShiftShow !== false
      const bullShift = settings.bullShiftShow !== false
      const bearRet = settings.bearRetShow !== false
      const bullRet = settings.bullRetShow !== false

      for (let i = 0; i < n; i++) {
        // Two barcolor() calls in the source, shift first and retracement
        // second, so the retracement colour wins where both land on one bar.
        let colour = null
        if (bearShow && bearShift && values.bearSignal[i] === 1) colour = BEAR_SIGNAL_COLOR
        else if (bullShow && bullShift && values.bullSignal[i] === 1) colour = BULL_SIGNAL_COLOR
        if (bearShow && bearRet && values.bearRetSignal[i] === 1) colour = BEAR_SIGNAL_COLOR
        else if (bullShow && bullRet && values.bullRetSignal[i] === 1) colour = BULL_SIGNAL_COLOR
        out[i] = colour
      }
      return out
    },

    draws({ bars, values, settings }) {
      const n = bars.length
      if (n === 0) return []

      const bearShow = settings.bearShow !== false
      const bullShow = settings.bullShow !== false
      const bearShift = settings.bearShiftShow !== false
      const bullShift = settings.bullShiftShow !== false
      const bearRet = settings.bearRetShow !== false
      const bullRet = settings.bullRetShow !== false
      const transparency = clamp(numOr(settings.boxTransp, 75), 0, 100)
      const boxOpacity = (100 - transparency) / 100

      // bar_index anchors become bar times: paging older history in shifts every
      // index, and a box welded to an index would slide off its swings.
      const timeAt = (idx) => {
        if (!Number.isFinite(idx)) return NaN
        const k = Math.round(idx)
        if (k < 0 || k >= n) return NaN
        return bars[k].time
      }
      const anchored = (t, p) => Number.isFinite(t) && Number.isFinite(p)

      const out = []

      // line.new between consecutive zig zag pivots. Both Pine colour defaults
      // are the same, so the whole chain is one polyline rather than a segment
      // per leg.
      if (settings.zzShow === true) {
        const points = []
        for (let i = 0; i < n; i++) {
          const p = values.zzPivot[i]
          if (p != null && Number.isFinite(p)) points.push({ time: bars[i].time, price: p })
        }
        const kept = points.length > MAX_ZZ_POINTS ? points.slice(points.length - MAX_ZZ_POINTS) : points
        if (kept.length >= 2) {
          out.push({ kind: 'polyline', points: kept, color: ZZ_LINE_COLOR, lineWidth: 2 })
        }
      }

      // The swing range box and the broken level, newest first up to the cap.
      let events = 0
      for (let i = n - 1; i >= 0 && events < MAX_EVENTS; i--) {
        const isBear = bearShow && values.bearSignal[i] === 1
        const isBull = bullShow && values.bullSignal[i] === 1
        if (!isBear && !isBull) continue
        events += 1

        const colour = isBear ? NEG_COLOR : POS_COLOR
        const t3 = timeAt(values.bi3[i])
        const t1 = timeAt(values.bi1[i])
        const zz3 = values.zz3[i]
        const zz1 = values.zz1[i]
        if (anchored(t3, zz3) && anchored(t1, zz1)) {
          out.push({
            kind: 'box',
            from: { time: t3, price: zz3 },
            to: { time: t1, price: zz1 },
            // border_color=#00000000 in the source: the box is a shade, not an outline.
            color: withAlpha(colour, 0),
            fillColor: colour,
            opacity: boxOpacity,
          })
        }

        const showLevel = isBear ? bearShift : bullShift
        const t2 = timeAt(values.bi2[i])
        const zz2 = values.zz2[i]
        if (showLevel && anchored(t2, zz2)) {
          out.push({
            kind: 'line',
            from: { time: t2, price: zz2 },
            to: { time: bars[i].time, price: zz2 },
            color: colour,
            lineWidth: 1,
            lineStyle: 'dashed',
          })
        }
      }

      // The retracement level, drawn back to the swing it was measured from.
      let retracements = 0
      for (let i = n - 1; i >= 0 && retracements < MAX_EVENTS; i--) {
        const isBear = bearShow && bearRet && values.bearRetSignal[i] === 1
        const isBull = bullShow && bullRet && values.bullRetSignal[i] === 1
        if (!isBear && !isBull) continue
        retracements += 1

        const price = isBear ? values.bearRetLevel[i] : values.bullRetLevel[i]
        const anchor = timeAt(isBear ? values.bearRetAnchor[i] : values.bullRetAnchor[i])
        if (!anchored(anchor, price)) continue
        out.push({
          kind: 'line',
          from: { time: anchor, price },
          to: { time: bars[i].time, price },
          color: isBear ? NEG_COLOR : POS_COLOR,
          lineWidth: 1,
          lineStyle: 'dotted',
        })
      }

      return out
    },

    table({ bars, values, settings }) {
      const n = bars.length
      if (n === 0) return null

      const rows = Math.max(0, Math.floor(numOr(settings.tblRows, 16)))
      const method = settings.scrMethod === 'Retracement to OTE / OB'
        ? 'Retracement to OTE / OB'
        : 'Market Structure Shift'
      const zone = typeof settings.timezone === 'string' && isValidTimezone(settings.timezone)
        ? settings.timezone
        : DEFAULT_TIMEZONE

      // timeframe.isintraday, read from the bars because the table hook is
      // handed no context: anything under a day apart is an intraday series.
      let intraday = false
      for (let i = Math.max(1, n - 10); i < n; i++) {
        const step = bars[i].time - bars[i - 1].time
        if (step > 0 && step < 86400) {
          intraday = true
          break
        }
      }
      const stamp = (t) => {
        const p = utcSecondsToZonedParts(t, zone)
        const date = `${pad2(p.day)}-${pad2(p.month)}-${p.year}`
        return intraday ? `${pad2(p.hour)}:${pad2(p.minute)}  ${date}` : date
      }

      const head = (text) => ({
        text,
        textColor: NEUTRAL_COLOR,
        bgColor: withAlpha(NEUTRAL_COLOR, 0.1),
        align: 'center',
      })
      const cell = (text, colour) => ({
        text,
        textColor: colour,
        bgColor: withAlpha(colour, 0.1),
        align: 'left',
      })

      // The source builds its matrix newest first and trims the tail, so the
      // newest signals are the ones that survive.
      const body = []
      for (let i = n - 1; i >= 0 && body.length < rows; i--) {
        const signal = values.screenSignal[i]
        if (signal !== 1 && signal !== -1) continue
        const colour = signal === 1 ? POS_COLOR : NEG_COLOR
        body.push([
          cell(stamp(bars[i].time), colour),
          cell(priceText(values.screenPrice[i]), colour),
          cell(signal === 1 ? 'Bullish' : 'Bearish', colour),
        ])
      }

      return {
        rows: [
          [head(method), head(''), head('')],
          [head('Time'), head('Price'), head('Signal')],
          ...body,
        ],
        options: {
          position: String(settings.tblPosition ?? 'bottom-left'),
          fontSize: TABLE_FONT_SIZE[settings.tblSize] ?? TABLE_FONT_SIZE.small,
          borderColor: withAlpha(NEUTRAL_COLOR, 0.35),
          borderWidth: 1,
          cellWidth: [130, 80, 70],
          cellHeight: 20,
        },
      }
    },
  })
}
