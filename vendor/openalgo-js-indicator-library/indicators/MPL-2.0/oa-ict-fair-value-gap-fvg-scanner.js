/**
 * ICT Fair Value Gap (FVG) Scanner v2 - ported to openalgo-charts from Pine Script v6.
 *
 * Source: https://github.com/ArunKBhaskar/PineScript/blob/c6821225c466494b01eee08f9dd88bf84d2b24ba/ICT Fair Value Gap (FVG) Scanner/Scanner - ICT Fair Value Gap (FVG) Scanner.txt
 * Repo:   ArunKBhaskar/PineScript
 * License: MPL-2.0, (c) Arun_K_Bhaskar. This code is subject to the terms of the
 *          Mozilla Public License 2.0 at https://mozilla.org/MPL/2.0/
 * SPDX-FileCopyrightText: (c) Arun_K_Bhaskar
 * SPDX-FileCopyrightText: (c) 2026 marketcalls (port to openalgo-charts)
 * SPDX-License-Identifier: MPL-2.0
 *
 * Marks the three-bar imbalance between bar[i-2] and bar[i], trails each gap as
 * a box until price fills it, and runs a six-stage scan (raw gap, first touch,
 * full fill, reversal and the confirmations of the first two) that the source
 * fed into a multi-symbol screener table.
 */

// Pine chart-settings colours, kept verbatim so the port looks like the source.
const POS = '#089981'
const POS_LIGHT = '#ACE5DC'
const NEG = '#F23645'
const NEG_LIGHT = '#FCCBCD'
const NEU = '#9598A1'
const NEU_MID = '#2A2E39'
const NEU_DARK = '#141516'

// Pine's `add_transp = 20`: the border is 20 points more transparent than the fill.
const ADD_TRANSP = 20

const METHOD_FVG_PCT = 'FVG %'
const METHOD_FIRST_TOUCH = 'First Touch'
const METHOD_FIRST_TOUCH_CONF = 'First Touch Confirmed'
const METHOD_FULL_FILL = 'Full Fill'
const METHOD_FULL_FILL_CONF = 'Full Fill Confirmed'
const METHOD_REVERSAL = 'Reversal'

const FONT_PX = { tiny: 9, small: 10, normal: 12, large: 15, huge: 19 }

export default function ({
  registerIndicator,
  sma,
  nulls,
  withAlpha,
  clamp,
  DEFAULT_TIMEZONE,
  isValidTimezone,
  utcSecondsToZonedParts,
  zonedDayIndex,
}) {
  // A cleared field arrives as '', and Number('') is 0, which would silently
  // become a zero threshold or a zero-length window. Fall back to the default
  // for anything that is not a real number, while keeping a deliberate 0.
  const num = (value, fallback) => {
    if (value === '' || value === null || value === undefined) return fallback
    const n = Number(value)
    return Number.isFinite(n) ? n : fallback
  }
  const int = (value, fallback) => Math.floor(num(value, fallback))

  const readConfig = (settings) => ({
    closePartially: settings.closeGapsPartially !== false,
    boxLimit: clamp(int(settings.boxLimit, 15), 1, 500),
    minDevPct: clamp(num(settings.minimalDeviation, 70), 1, 100),
    limitLength: settings.limitBoxLength === true,
    limitBars: Math.max(1, int(settings.limitBoxLengthBars, 300)),
    transp: clamp(num(settings.transparency, 70), 0, 100),
  })

  // Pine's fullClose: stop extending, mark the gap done, and when partial
  // closing is on also remove the remnant box that partialClose just pushed.
  const closeGap = (gap, closePartially) => {
    const last = gap.boxes[gap.boxes.length - 1]
    last.extend = false
    gap.active = false
    if (closePartially) last.deleted = true
  }

  /**
   * The gap engine: one pass over the bars reproducing Pine's `allGaps` array,
   * `checkForClose`, `partialClose` and `registerNewGap`.
   *
   * Pure in (bars, cfg), so `calc` and `draws` can both run it. `draws` is
   * handed no store, and a gap is a variable number of boxes rather than one
   * value per bar, so the geometry cannot travel as a column.
   *
   * The field the source calls `isBull` is assigned `isFVGDown`: it is true for
   * a DOWN gap, the one price has to rise into. It is named `isDown` here so
   * the fill tests read the way they behave.
   */
  const detectGaps = (bars, cfg) => {
    const n = bars.length
    const isDown = new Array(n).fill(false)
    const isUp = new Array(n).fill(false)
    const gaps = []
    if (n === 0) return { isDown, isUp, gaps }

    const range = new Array(n)
    for (let i = 0; i < n; i++) {
      const r = bars[i].high - bars[i].low
      range[i] = Number.isFinite(r) ? r : NaN
    }
    // Pine wraps the whole product in nz(), so while ta.sma(high - low, 14) is
    // still warming up the minimal deviation is 0 and every gap qualifies.
    const avgRange = sma(range, 14)

    for (let i = 0; i < n; i++) {
      const hi = bars[i].high
      const lo = bars[i].low

      // Detect covering of gaps. This runs over every gap registered so far,
      // before this bar is allowed to register one of its own.
      for (const gap of gaps) {
        if (!gap.active) continue
        const active = gap.boxes[gap.boxes.length - 1]
        const top = active.top
        const bot = active.bottom
        const down = gap.isDown
        active.right = i

        const touched = (down && hi > bot) || (!down && lo < top)
        if (touched) {
          if (cfg.closePartially) {
            // partialClose: freeze the current box and start a smaller one
            // covering only the part of the gap price has not traded through.
            active.extend = false
            gap.boxes.push({
              left: i,
              right: i,
              top: down ? active.top : lo,
              bottom: down ? hi : active.bottom,
              extend: false,
              deleted: false,
            })
          } else {
            closeGap(gap, cfg.closePartially)
          }
        }

        // Both tests below read the box as it was BEFORE partialClose pushed a
        // new one, exactly as the source's local `activeBox` does.
        const forced = cfg.limitLength && i - active.left >= cfg.limitBars
        const filled = (down && hi > top) || (!down && lo < bot)
        if (filled || forced) closeGap(gap, cfg.closePartially)
      }

      // high[2] and low[2] are na on the first two bars, and every Pine
      // comparison with na is false, so no gap can form there.
      if (i < 2) continue
      const dev = Number.isFinite(avgRange[i]) ? (cfg.minDevPct / 100) * avgRange[i] : 0
      const prevHigh2 = bars[i - 2].high
      const prevLow2 = bars[i - 2].low
      const down = hi < prevLow2 && prevLow2 - hi >= dev
      const up = lo > prevHigh2 && lo - prevHigh2 >= dev
      isDown[i] = down
      isUp[i] = up
      if (!down && !up) continue

      // registerNewGap: box.new(bar_index - 2, top, bar_index, bottom).
      gaps.push({
        active: true,
        isDown: down,
        boxes: [{
          left: i - 2,
          right: i,
          top: down ? prevLow2 : lo,
          bottom: down ? hi : prevHigh2,
          extend: true,
          deleted: false,
        }],
      })
      // Drop the oldest gap, which deletes every box it drew.
      if (gaps.length > cfg.boxLimit) gaps.shift()
    }

    return { isDown, isUp, gaps }
  }

  // ta.crossover and ta.crossunder. Pine's comparisons against na are all
  // false, so every operand has to be finite before the test means anything:
  // in JavaScript `5 > null` is true and the signal fires through the warmup.
  const crossOver = (aPrev, aCur, bPrev, bCur) =>
    Number.isFinite(aPrev) && Number.isFinite(aCur) &&
    Number.isFinite(bPrev) && Number.isFinite(bCur) &&
    aCur > bCur && aPrev <= bPrev

  const crossUnder = (aPrev, aCur, bPrev, bCur) =>
    Number.isFinite(aPrev) && Number.isFinite(aCur) &&
    Number.isFinite(bPrev) && Number.isFinite(bCur) &&
    aCur < bCur && aPrev >= bPrev

  // The two-stage and three-stage state machines. Each resets one bar after it
  // fires, which is what lets the next gap re-arm it.
  const step2 = (state, first, second) => {
    let s = state === 2 ? 0 : state
    if (first && s === 0) s = 1
    if (second && s === 1) s = 2
    return s
  }
  const step3 = (state, first, second, third) => {
    let s = state === 3 ? 0 : state
    if (first && s === 0) s = 1
    if (second && s === 1) s = 2
    if (third && s === 2) s = 3
    return s
  }

  // Pine's '#.##': two decimals with trailing zeros dropped. A non-finite
  // reading prints as a dash rather than NaN, which a trader can read.
  const fmt2 = (v) => (Number.isFinite(v) ? String(Number(v.toFixed(2))) : '-')

  // atPrice adds no padding of its own, and a fixed number of points looks
  // right on one instrument and wrong on every other.
  const markerPad = (bars) => {
    let sum = 0
    let count = 0
    for (let i = Math.max(0, bars.length - 200); i < bars.length; i++) {
      const r = bars[i].high - bars[i].low
      if (Number.isFinite(r)) {
        sum += r
        count += 1
      }
    }
    const mean = count > 0 ? sum / count : 0
    const last = bars.length > 0 ? bars[bars.length - 1].close : 0
    const ref = Number.isFinite(last) ? Math.abs(last) : 0
    const pad = Math.max(mean * 0.5, ref * 0.0005)
    return Number.isFinite(pad) ? pad : 0
  }

  registerIndicator({
    id: 'oa-ict-fair-value-gap-fvg-scanner',
    name: 'ICT Fair Value Gap (FVG) Scanner v2',
    category: 'ICT',
    placement: 'onchart',

    inputs: [
      {
        key: 'method',
        type: 'select',
        label: 'Scanning Method',
        default: METHOD_FIRST_TOUCH_CONF,
        group: 'Scanner',
        tooltip: 'Which stage of the gap the scan reports. The source draws nothing on the chart for FVG %: that stage was reported only through its multi-symbol screener table, which a chart study cannot reach.',
        options: [
          { label: 'FVG %', value: METHOD_FVG_PCT },
          { label: 'First Touch', value: METHOD_FIRST_TOUCH },
          { label: 'First Touch Confirmed', value: METHOD_FIRST_TOUCH_CONF },
          { label: 'Full Fill', value: METHOD_FULL_FILL },
          { label: 'Full Fill Confirmed', value: METHOD_FULL_FILL_CONF },
          { label: 'Reversal', value: METHOD_REVERSAL },
        ],
      },
      { key: 'showLong', type: 'boolean', label: 'Long Signals', default: true, group: 'Scanner' },
      { key: 'showShort', type: 'boolean', label: 'Short Signals', default: true, group: 'Scanner' },

      { key: 'closeGapsPartially', type: 'boolean', label: 'Close FVG Partially', default: true, group: 'FVG' },
      { key: 'boxLimit', type: 'number', label: 'Max Number of FVG', default: 15, min: 1, max: 500, step: 1, group: 'FVG' },
      {
        key: 'minimalDeviation',
        type: 'number',
        label: 'Minimal Deviation (%)',
        default: 70,
        min: 1,
        max: 100,
        step: 1,
        group: 'FVG',
        tooltip: 'Smallest gap that counts, as a percentage of the average high-low range of the last 14 bars. If no gap is ever found, either this is set too high or the feed aligns every bar open to the previous close.',
      },
      {
        key: 'limitBoxLength',
        type: 'boolean',
        label: 'Max Bars',
        default: false,
        group: 'FVG',
        tooltip: 'Stop trailing a gap once it has run this many bars, whether or not price filled it.',
      },
      { key: 'limitBoxLengthBars', type: 'number', label: 'Max Gap Trail Length (bars)', default: 300, min: 1, max: 5000, step: 1, group: 'FVG' },
      {
        key: 'transparency',
        type: 'number',
        label: 'Transp',
        default: 70,
        min: 0,
        max: 100,
        step: 1,
        group: 'FVG',
        tooltip: 'Transparency of the gap boxes, as in the source. The border is drawn 20 points more transparent than the fill.',
      },

      {
        key: 'timeFilter',
        type: 'boolean',
        label: 'Apply Time Filter',
        default: false,
        group: 'Additional Filters',
        tooltip: 'Accept a signal only between the two clock times below, read in the chart timezone.',
      },
      { key: 'hourFrom', type: 'number', label: 'Time From (hour)', default: 9, min: 0, max: 23, step: 1, group: 'Additional Filters' },
      { key: 'minuteFrom', type: 'number', label: 'Time From (minute)', default: 15, min: 0, max: 59, step: 1, group: 'Additional Filters' },
      { key: 'hourTo', type: 'number', label: 'Time To (hour)', default: 10, min: 0, max: 23, step: 1, group: 'Additional Filters' },
      { key: 'minuteTo', type: 'number', label: 'Time To (minute)', default: 15, min: 0, max: 59, step: 1, group: 'Additional Filters' },
      { key: 'dateFilter', type: 'boolean', label: 'Apply Date Filter', default: false, group: 'Additional Filters' },
      { key: 'day', type: 'number', label: 'Day', default: 25, min: 1, max: 31, step: 1, group: 'Additional Filters' },
      { key: 'month', type: 'number', label: 'Month', default: 10, min: 1, max: 12, step: 1, group: 'Additional Filters' },
      { key: 'year', type: 'number', label: 'Year', default: 2024, min: 0, max: 9999, step: 1, group: 'Additional Filters' },

      { key: 'showTable', type: 'boolean', label: 'Display Table', default: true, group: 'Data Table' },
      {
        key: 'tablePosition',
        type: 'select',
        label: 'Position',
        default: 'bottom-right',
        group: 'Data Table',
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
        key: 'tableSize',
        type: 'select',
        label: 'Size',
        default: 'normal',
        group: 'Data Table',
        options: [
          { label: 'Tiny', value: 'tiny' },
          { label: 'Small', value: 'small' },
          { label: 'Normal', value: 'normal' },
          { label: 'Large', value: 'large' },
          { label: 'Huge', value: 'huge' },
        ],
      },
    ],

    // The four series the source plots, all with display.none: they carry the
    // live gap edges into the legend and the crosshair without drawing a line.
    plots: [
      { key: 'fvgDownTop', type: 'line', title: 'FVG Down Top', style: { color: NEG, visible: false } },
      { key: 'fvgDownBottom', type: 'line', title: 'FVG Down Bottom', style: { color: NEG, visible: false } },
      { key: 'fvgUpTop', type: 'line', title: 'FVG Up Top', style: { color: POS, visible: false } },
      { key: 'fvgUpBottom', type: 'line', title: 'FVG Up Bottom', style: { color: POS, visible: false } },
    ],

    calc(bars, settings, store, ctx) {
      const n = bars.length
      const cfg = readConfig(settings)
      const method = String(settings.method ?? METHOD_FIRST_TOUCH_CONF)

      // Bar times are UTC seconds while Pine's hour and dayofmonth are exchange
      // wall clock, so the browser's local time would compute a different chart
      // in every city.
      const zoneCandidate = ctx && typeof ctx.timezone === 'string' ? ctx.timezone : ''
      const zone = zoneCandidate && isValidTimezone(zoneCandidate) ? zoneCandidate : DEFAULT_TIMEZONE

      // barstate.isconfirmed: every historical bar is closed, and the last one
      // is closed only when the host says so.
      const lastUnconfirmed = ctx && ctx.barState ? ctx.barState.isConfirmed === false : false

      const { isDown, isUp, gaps } = detectGaps(bars, cfg)

      const hourFrom = clamp(int(settings.hourFrom, 9), 0, 23)
      const minuteFrom = clamp(int(settings.minuteFrom, 15), 0, 59)
      const hourTo = clamp(int(settings.hourTo, 10), 0, 23)
      const minuteTo = clamp(int(settings.minuteTo, 15), 0, 59)
      const wantDay = clamp(int(settings.day, 25), 1, 31)
      const wantMonth = clamp(int(settings.month, 10), 1, 12)
      const wantYear = Math.max(0, int(settings.year, 2024))
      const useTimeFilter = settings.timeFilter === true
      const useDateFilter = settings.dateFilter === true

      const fvgDownTop = new Array(n).fill(NaN)
      const fvgDownBottom = new Array(n).fill(NaN)
      const fvgUpTop = new Array(n).fill(NaN)
      const fvgUpBottom = new Array(n).fill(NaN)
      const fvgDownPercent = new Array(n).fill(NaN)
      const fvgUpPercent = new Array(n).fill(NaN)
      const cumPchgCol = new Array(n).fill(NaN)
      const cumVolCol = new Array(n).fill(NaN)
      const prevCumVolCol = new Array(n).fill(NaN)
      const cumVolPchgCol = new Array(n).fill(NaN)
      const signalShort = new Array(n).fill(NaN)
      const signalLong = new Array(n).fill(NaN)
      const gapCount = new Array(n).fill(gaps.length)

      // Every `var` in the source is one of these: a value that survives the
      // bar it was written on until something overwrites it.
      let dTop = NaN
      let dBottom = NaN
      let dPercent = NaN
      let uTop = NaN
      let uBottom = NaN
      let uPercent = NaN
      let cumPchg = NaN
      let curCumVol = NaN
      let prevCumVol = NaN
      let s2low = NaN
      let s3low = NaN
      let l2high = NaN
      let l3high = NaN
      let sFirstTouch = 0
      let sFirstTouchConf = 0
      let sFullFill = 0
      let sFullFillConf = 0
      let sReversal = 0
      let lFirstTouch = 0
      let lFirstTouchConf = 0
      let lFullFill = 0
      let lFullFillConf = 0
      let lReversal = 0
      let prevDayIndex = NaN

      for (let i = 0; i < n; i++) {
        const bar = bars[i]
        const prevBar = i > 0 ? bars[i - 1] : null
        const prevHigh = prevBar ? prevBar.high : NaN
        const prevLow = prevBar ? prevBar.low : NaN
        const prevClose = prevBar ? prevBar.close : NaN

        // What each var series carried at the close of the previous bar.
        // ta.crossover needs it, and it has to be read before this bar writes.
        const pDTop = dTop
        const pDBottom = dBottom
        const pUTop = uTop
        const pUBottom = uBottom
        const pS2low = s2low
        const pS3low = s3low
        const pL2high = l2high
        const pL3high = l3high

        // ta.change(time('D')) != 0. Pine's change is na on the first bar and a
        // comparison with na is false, so bar 0 never counts as a new day.
        const dayIndex = zonedDayIndex(bar.time, zone)
        const isNewDay = i > 0 && dayIndex !== prevDayIndex
        prevDayIndex = dayIndex

        // Cumulative percentage change, reset every session.
        const dailyPct =
          prevBar && Number.isFinite(prevBar.close) && prevBar.close !== 0 && Number.isFinite(bar.close)
            ? ((bar.close - prevBar.close) / prevBar.close) * 100
            : 0
        cumPchg = isNewDay ? dailyPct : !Number.isFinite(cumPchg) ? dailyPct : cumPchg + dailyPct

        // Cumulative volume. Index series carry no volume at all, and the
        // source's `na + volume` is na, so an absent figure stays absent rather
        // than being reported as zero traded.
        const vol = Number.isFinite(bar.volume) ? bar.volume : NaN
        if (isNewDay) {
          prevCumVol = curCumVol
          curCumVol = vol
        } else {
          curCumVol = curCumVol + vol
        }
        const volBase = Number.isFinite(prevCumVol) ? prevCumVol : curCumVol
        const cumVolPchg =
          Number.isFinite(volBase) && volBase !== 0 && Number.isFinite(curCumVol)
            ? ((curCumVol - volBase) / volBase) * 100
            : NaN

        // The only two filters the source's signal conditions actually read.
        const parts = utcSecondsToZonedParts(bar.time, zone)
        let timeOk = true
        if (useTimeFilter) {
          const h = parts.hour
          const m = parts.minute
          timeOk =
            (h > hourFrom || (h === hourFrom && m >= minuteFrom)) &&
            (h < hourTo || (h === hourTo && m < minuteTo))
        }
        let dateOk = true
        if (useDateFilter) {
          dateOk = parts.year === wantYear && parts.month === wantMonth && parts.day === wantDay
        }
        const confirmed = !(lastUnconfirmed && i === n - 1)
        const gate = timeOk && dateOk && confirmed

        // The var gap edges, written before the signal block reads them, which
        // is why a gap can never trigger its own touch on its own bar.
        if (isDown[i]) {
          const top = bars[i - 2].low
          dTop = top
          dBottom = bar.high
          dPercent = Number.isFinite(top) && top !== 0 ? ((top - bar.high) / top) * 100 : NaN
        }
        if (isUp[i]) {
          const bottom = bars[i - 2].high
          uTop = bar.low
          uBottom = bottom
          uPercent = Number.isFinite(bottom) && bottom !== 0 ? ((bar.low - bottom) / bottom) * 100 : NaN
        }

        // Short side: a down gap sits above price, so filling it is a rally.
        const sc1 = isDown[i] && gate
        const sc2 = gate && crossOver(prevHigh, bar.high, pDBottom, dBottom)
        if (sc2) s2low = bar.low
        const sc2conf = gate && crossUnder(prevClose, bar.close, pS2low, s2low)
        const sc3 =
          gate && crossOver(prevHigh, bar.high, pDTop, dTop) &&
          Number.isFinite(dTop) && bar.close < dTop
        if (sc3) s3low = bar.low
        const sc3conf = gate && crossUnder(prevClose, bar.close, pS3low, s3low)
        const sc4 = gate && crossOver(prevClose, bar.close, pDTop, dTop)

        // Long side: an up gap sits below price, so filling it is a decline.
        const lc1 = isUp[i] && gate
        const lc2 = gate && crossUnder(prevLow, bar.low, pUTop, uTop)
        if (lc2) l2high = bar.high
        const lc2conf = gate && crossOver(prevClose, bar.close, pL2high, l2high)
        const lc3 =
          gate && crossUnder(prevLow, bar.low, pUBottom, uBottom) &&
          Number.isFinite(uBottom) && bar.close > uBottom
        if (lc3) l3high = bar.high
        const lc3conf = gate && crossOver(prevClose, bar.close, pL3high, l3high)
        const lc4 = gate && crossUnder(prevClose, bar.close, pUBottom, uBottom)

        sFirstTouch = step2(sFirstTouch, sc1, sc2)
        sFirstTouchConf = step3(sFirstTouchConf, sc1, sc2, sc2conf)
        sFullFill = step2(sFullFill, sc1, sc3)
        sFullFillConf = step3(sFullFillConf, sc1, sc3, sc3conf)
        sReversal = step2(sReversal, sc1, sc4)

        lFirstTouch = step2(lFirstTouch, lc1, lc2)
        lFirstTouchConf = step3(lFirstTouchConf, lc1, lc2, lc2conf)
        lFullFill = step2(lFullFill, lc1, lc3)
        lFullFillConf = step3(lFullFillConf, lc1, lc3, lc3conf)
        lReversal = step2(lReversal, lc1, lc4)

        let shortCond
        let longCond
        switch (method) {
          case METHOD_FVG_PCT:
            shortCond = sc1
            longCond = lc1
            break
          case METHOD_FIRST_TOUCH:
            shortCond = sFirstTouch === 2
            longCond = lFirstTouch === 2
            break
          case METHOD_FULL_FILL:
            shortCond = sFullFill === 2
            longCond = lFullFill === 2
            break
          case METHOD_FULL_FILL_CONF:
            shortCond = sFullFillConf === 3
            longCond = lFullFillConf === 3
            break
          case METHOD_REVERSAL:
            shortCond = sReversal === 2
            longCond = lReversal === 2
            break
          default:
            shortCond = sFirstTouchConf === 3
            longCond = lFirstTouchConf === 3
        }

        fvgDownTop[i] = dTop
        fvgDownBottom[i] = dBottom
        fvgUpTop[i] = uTop
        fvgUpBottom[i] = uBottom
        fvgDownPercent[i] = dPercent
        fvgUpPercent[i] = uPercent
        cumPchgCol[i] = cumPchg
        cumVolCol[i] = curCumVol
        prevCumVolCol[i] = prevCumVol
        cumVolPchgCol[i] = cumVolPchg
        if (shortCond) signalShort[i] = 1
        if (longCond) signalLong[i] = 1
      }

      return {
        fvgDownTop: nulls(fvgDownTop),
        fvgDownBottom: nulls(fvgDownBottom),
        fvgUpTop: nulls(fvgUpTop),
        fvgUpBottom: nulls(fvgUpBottom),
        fvgDownPercent: nulls(fvgDownPercent),
        fvgUpPercent: nulls(fvgUpPercent),
        cumPchg: nulls(cumPchgCol),
        cumVol: nulls(cumVolCol),
        prevCumVol: nulls(prevCumVolCol),
        cumVolPchg: nulls(cumVolPchgCol),
        signalShort: nulls(signalShort),
        signalLong: nulls(signalLong),
        gapCount,
      }
    },

    // box.new, box.set_right and box.delete. A gap still being trailed runs to
    // the last bar: extend.right carries on into the empty space past the data,
    // which has no bar to anchor to here.
    draws({ bars, settings }) {
      if (bars.length === 0) return []
      const cfg = readConfig(settings)
      const { gaps } = detectGaps(bars, cfg)
      const lastIndex = bars.length - 1
      const fillAlpha = (100 - cfg.transp) / 100
      const borderAlpha = Math.max(0, 100 - (cfg.transp + ADD_TRANSP)) / 100
      const out = []

      for (const gap of gaps) {
        const colour = gap.isDown ? NEG : POS
        for (const box of gap.boxes) {
          if (box.deleted) continue
          if (!Number.isFinite(box.top) || !Number.isFinite(box.bottom)) continue
          const leftIndex = clamp(box.left, 0, lastIndex)
          const rightIndex = clamp(box.extend ? lastIndex : box.right, 0, lastIndex)
          out.push({
            kind: 'box',
            from: { time: bars[leftIndex].time, price: box.top },
            to: { time: bars[rightIndex].time, price: box.bottom },
            color: withAlpha(colour, borderAlpha),
            fillColor: colour,
            opacity: fillAlpha,
          })
        }
      }
      return out
    },

    // plotchar and plotshape. The source draws nothing for the FVG % stage:
    // that one reported only through the multi-symbol screener table.
    //
    // aboveBar and belowBar resolve against this indicator's own series, which
    // here is a hidden gap edge, so the anchors are explicit prices.
    markers({ bars, values, settings }) {
      const method = String(settings.method ?? METHOD_FIRST_TOUCH_CONF)
      if (method === METHOD_FVG_PCT) return []
      const showShort = settings.showShort !== false
      const showLong = settings.showLong !== false
      if (!showShort && !showLong) return []

      // Reversal is the one stage the source flips: a short-side reversal is
      // price closing back above a bearish gap, which is a bullish event, so it
      // is drawn below the bar in the positive colour and the long side above.
      const flipped = method === METHOD_REVERSAL
      const shortShape = flipped ? 'triangleUp' : 'triangleDown'
      const longShape = flipped ? 'triangleDown' : 'triangleUp'
      const shortColour = flipped ? POS_LIGHT : NEG_LIGHT
      const longColour = flipped ? NEG_LIGHT : POS_LIGHT

      const pad = markerPad(bars)
      const out = []
      for (let i = 0; i < bars.length; i++) {
        const bar = bars[i]
        if (showShort && values.signalShort[i] != null) {
          const price = flipped ? bar.low - pad : bar.high + pad
          if (Number.isFinite(price)) {
            out.push({ time: bar.time, position: 'atPrice', price, shape: shortShape, color: shortColour, size: 'tiny' })
          }
        }
        if (showLong && values.signalLong[i] != null) {
          const price = flipped ? bar.high + pad : bar.low - pad
          if (Number.isFinite(price)) {
            out.push({ time: bar.time, position: 'atPrice', price, shape: longShape, color: longColour, size: 'tiny' })
          }
        }
      }
      return out
    },

    // barcolor(). The source pairs the short side with the negative colour on
    // the two touch stages and with the positive colour on the two fill stages
    // and the reversal; that asymmetry is carried over as written.
    barColors({ bars, values, settings }) {
      const method = String(settings.method ?? METHOD_FIRST_TOUCH_CONF)
      const out = new Array(bars.length).fill(null)
      if (method === METHOD_FVG_PCT) return out
      const showShort = settings.showShort !== false
      const showLong = settings.showLong !== false
      const touchStage = method === METHOD_FIRST_TOUCH || method === METHOD_FIRST_TOUCH_CONF
      const shortColour = touchStage ? NEG_LIGHT : POS_LIGHT
      const longColour = touchStage ? POS_LIGHT : NEG_LIGHT

      for (let i = 0; i < bars.length; i++) {
        if (showShort && values.signalShort[i] != null) out[i] = shortColour
        else if (showLong && values.signalLong[i] != null) out[i] = longColour
      }
      return out
    },

    // The source's own four-row data table, which it draws only on the last
    // bar, which is all this hook is ever asked for.
    table({ bars, values, settings }) {
      if (settings.showTable === false || bars.length === 0) return null
      const i = bars.length - 1
      const pchg = values.cumPchg[i]
      const volPchg = values.cumVolPchg[i]
      const curVol = values.cumVol[i]
      const prevVol = values.prevCumVol[i]
      const noGaps = values.gapCount[i] === 0

      const pchgColour = Number.isFinite(pchg) && pchg > 0 ? POS : NEG
      const volPchgColour = Number.isFinite(volPchg) && volPchg > 0 ? POS : NEG
      const prevVolColour =
        Number.isFinite(prevVol) && Number.isFinite(curVol) && prevVol < curVol ? NEG : POS

      const lakh = (v) => (Number.isFinite(v) ? `${fmt2(v / 100000)} L` : '-')
      const pct = (v) => (Number.isFinite(v) ? `${fmt2(v)} %` : '-')

      const label = (text, bg) => ({ text, textColor: NEU, bgColor: bg, align: 'left' })
      const value = (text, colour, bg) => ({ text, textColor: colour, bgColor: bg, align: 'right' })

      const rows = [
        [label('%Chg', NEU_DARK), value(pct(pchg), pchgColour, NEU_DARK)],
        [label('Vol %Chg', NEU_MID), value(pct(volPchg), volPchgColour, NEU_MID)],
        [label('Vol', NEU_DARK), value(lakh(curVol), volPchgColour, NEU_DARK)],
        [label('PD Vol', NEU_MID), value(lakh(prevVol), prevVolColour, NEU_MID)],
      ]
      // The source pops a separate note when the chart holds no gap at all.
      if (noGaps) rows.push([label('FVG', NEU_DARK), value('None found', NEU, NEU_DARK)])

      const size = String(settings.tableSize ?? 'normal')
      return {
        rows,
        options: {
          position: String(settings.tablePosition ?? 'bottom-right'),
          fontSize: FONT_PX[size] ?? FONT_PX.normal,
          cellWidth: [90, 95],
          cellHeight: 20,
          borderColor: NEU_MID,
          borderWidth: 1,
        },
      }
    },
  })
}
