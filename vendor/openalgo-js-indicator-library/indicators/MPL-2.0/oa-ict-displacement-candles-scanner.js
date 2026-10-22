/**
 * ICT Displacement Candles Scanner - ported to openalgo-charts from Pine Script v6.
 *
 * Source: https://github.com/ArunKBhaskar/PineScript/blob/c6821225c466494b01eee08f9dd88bf84d2b24ba/ICT Displacement Candles/[Scanner] ICT Displacement Candles.txt
 * Repo:   ArunKBhaskar/PineScript
 * License: MPL-2.0, (c) Arun_K_Bhaskar
 * SPDX-FileCopyrightText: (c) Arun_K_Bhaskar
 * SPDX-FileCopyrightText: (c) 2026 marketcalls (port to openalgo-charts)
 * SPDX-License-Identifier: MPL-2.0
 *
 * Counts runs of displacement candles: consecutive bars whose high-low range
 * clears a percentage of the 14-bar average range and that close in one
 * direction. When a run ends the run length is labelled on its last bar, and in
 * Retracement mode the first pull-back back through the run's Fibonacci level
 * is flagged and joined to the start of the run with a dotted line.
 *
 * Ported from the current symbol only. The source is a screener: it calls
 * request.security over a pasted list of up to 40 other symbols and lists the
 * ones signalling on the latest bar in a table. A chart study sees one
 * instrument, so the symbol list, the scan and the scanner table are not
 * expressible here. Everything the source computes on the chart's own symbol
 * (displacement runs, count labels, Fibonacci levels, retracement signals, bar
 * colouring and the performance table) is ported in full.
 *
 * The source also computes a body-percent filter (i_body_filter / i_body_percent)
 * and never references it: it changes nothing in the original, so no dead
 * control is carried over.
 */

export default function ({
  registerIndicator,
  sma,
  atr,
  nulls,
  utcSecondsToZonedParts,
  isNewZonedDay,
  isValidTimezone,
  DEFAULT_TIMEZONE,
}) {
  // The source's fixed palette.
  const POS = '#089981'
  const POS_LIGHT = '#70CCBD'
  const NEG = '#F23645'
  const NEG_LIGHT = '#FAA1A4'
  const NEU = '#D1D4DC'
  const NEU_DARK = '#0F0F0F'

  const fin = Number.isFinite

  const TABLE_POSITIONS = new Set([
    'top-left', 'top-center', 'top-right',
    'middle-left', 'middle-center', 'middle-right',
    'bottom-left', 'bottom-center', 'bottom-right',
  ])
  const FONT_SIZES = { auto: 11, tiny: 8, small: 10, normal: 12, large: 15, huge: 19 }

  // A cleared number field arrives as '', and Number('') is 0, so fall back to
  // the default rather than to a zero-length window or a zero hour.
  const numOr = (value, fallback) => {
    if (value === '' || value === null || value === undefined) return fallback
    const x = Number(value)
    return fin(x) ? x : fallback
  }
  const intOr = (value, fallback, lo, hi) => {
    const x = Math.floor(numOr(value, fallback))
    return Math.min(hi, Math.max(lo, fin(x) ? x : fallback))
  }

  const methodOf = (settings) => (settings.method === 'Retracement' ? 'Retracement' : 'Displacement')
  const showLongOf = (settings) => settings.showLong !== false
  const showShortOf = (settings) => settings.showShort !== false

  // 'atPrice' adds no padding of its own, so scale the gap to the instrument
  // instead of using a fixed number of points.
  const markerPad = (bars) => {
    let sum = 0
    let count = 0
    for (let i = Math.max(0, bars.length - 50); i < bars.length; i++) {
      const range = bars[i].high - bars[i].low
      if (fin(range)) {
        sum += range
        count += 1
      }
    }
    const mean = count > 0 ? sum / count : 0
    const last = bars.length > 0 && fin(bars[bars.length - 1].close) ? Math.abs(bars[bars.length - 1].close) : 0
    const pad = Math.max(mean * 0.5, last * 0.0005)
    return fin(pad) ? pad : 0
  }

  // Pine's '#.##': at most two decimals, trailing zeros dropped.
  const fmt2 = (value) => (fin(value) ? String(Number(value.toFixed(2))) : '-')

  registerIndicator({
    id: 'oa-ict-displacement-candles-scanner',
    name: 'ICT Displacement Candles Scanner',
    category: 'ICT',
    placement: 'onchart',

    inputs: [
      {
        key: 'method',
        type: 'select',
        label: 'Scanning Method',
        default: 'Displacement',
        group: 'Scanner',
        options: [
          { label: 'Displacement', value: 'Displacement' },
          { label: 'Retracement', value: 'Retracement' },
        ],
        tooltip: 'Displacement: a strong, sudden move with long candles and small wicks. Retracement: price pulls back to a Fibonacci level of that move.',
      },
      { key: 'showLong', type: 'boolean', label: 'Long Signals', default: true, group: 'Scanner' },
      { key: 'showShort', type: 'boolean', label: 'Short Signals', default: true, group: 'Scanner' },

      {
        key: 'minBars',
        type: 'number',
        label: 'Minimum Bars',
        default: 3,
        min: 1,
        max: 100,
        step: 1,
        group: 'Displacement Candles',
        tooltip: 'A run is only marked once it reaches this many displacement candles.',
      },
      {
        key: 'devPercent',
        type: 'number',
        label: 'Minimal Deviation (%)',
        default: 60,
        min: 1,
        max: 1000,
        step: 10,
        group: 'Displacement Candles',
        tooltip: 'Smallest displacement, as a percentage of the average high-low range of the last 14 bars.',
      },
      {
        key: 'closeFilter',
        type: 'boolean',
        label: 'Apply Close Above/Below Prev Close',
        default: true,
        group: 'Displacement Candles',
      },
      {
        key: 'hlFilter',
        type: 'boolean',
        label: 'Apply Close Above/Below Prev High/Low',
        default: false,
        group: 'Displacement Candles',
      },
      {
        key: 'fibValue',
        type: 'number',
        label: 'Fibonacci Value',
        default: 0.5,
        min: -5,
        max: 5,
        step: 0.1,
        group: 'Displacement Candles',
        tooltip: '0 is the top of a bullish and the bottom of a bearish run, 1 the opposite end, 0.5 the midpoint.',
      },

      {
        key: 'atrFilter',
        type: 'boolean',
        label: 'Apply ATR Filter',
        default: false,
        group: 'Additional Filters',
        tooltip: 'Keeps only candles whose range clears the ATR times the multiplier.',
      },
      { key: 'atrLength', type: 'number', label: 'ATR Length', default: 14, min: 1, max: 1000, step: 1, group: 'Additional Filters' },
      {
        key: 'atrMult',
        type: 'number',
        label: 'ATR Multiplier',
        default: 1,
        min: 1,
        max: 100,
        step: 0.1,
        group: 'Additional Filters',
        tooltip: 'Higher values filter out longer or more volatile candles.',
      },

      {
        key: 'timeFilter',
        type: 'boolean',
        label: 'Apply Time Filter',
        default: false,
        group: 'Additional Filters',
        tooltip: 'Keeps retracement signals inside a window of the exchange trading day.',
      },
      { key: 'hourFrom', type: 'number', label: 'Time From (Hour)', default: 9, min: 0, max: 23, step: 1, group: 'Additional Filters' },
      { key: 'minuteFrom', type: 'number', label: 'Time From (Minute)', default: 15, min: 0, max: 59, step: 1, group: 'Additional Filters' },
      { key: 'hourTo', type: 'number', label: 'Time To (Hour)', default: 10, min: 0, max: 23, step: 1, group: 'Additional Filters' },
      { key: 'minuteTo', type: 'number', label: 'Time To (Minute)', default: 15, min: 0, max: 59, step: 1, group: 'Additional Filters' },

      {
        key: 'dateFilter',
        type: 'boolean',
        label: 'Apply Date Filter',
        default: false,
        group: 'Additional Filters',
        tooltip: 'Keeps retracement signals on one calendar date only.',
      },
      { key: 'day', type: 'number', label: 'Day', default: 30, min: 1, max: 31, step: 1, group: 'Additional Filters' },
      { key: 'month', type: 'number', label: 'Month', default: 3, min: 1, max: 12, step: 1, group: 'Additional Filters' },
      { key: 'year', type: 'number', label: 'Year', default: 2025, min: 0, max: 2999, step: 1, group: 'Additional Filters' },

      { key: 'showPerfTable', type: 'boolean', label: 'Display', default: true, group: 'Performance Table' },
      {
        key: 'tablePosition',
        type: 'select',
        label: 'Position',
        default: 'bottom-right',
        group: 'Performance Table',
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
        group: 'Performance Table',
        options: [
          { label: 'Auto', value: 'auto' },
          { label: 'Tiny', value: 'tiny' },
          { label: 'Small', value: 'small' },
          { label: 'Normal', value: 'normal' },
          { label: 'Large', value: 'large' },
          { label: 'Huge', value: 'huge' },
        ],
      },
    ],

    // Both Fibonacci lines are plotted with display.none in the source: they
    // carry the level the retracement test and the dotted line read, and are
    // not meant to be drawn.
    plots: [
      { key: 'bearFib', type: 'step', title: 'Bearish Fib Line', style: { color: NEG, lineWidth: 1, visible: false } },
      { key: 'bullFib', type: 'step', title: 'Bullish Fib Line', style: { color: POS, lineWidth: 1, visible: false } },
    ],

    calc(bars, settings, store, ctx) {
      const n = bars.length

      const minBars = Math.max(1, Math.floor(numOr(settings.minBars, 3)))
      const devPercent = Math.max(1, numOr(settings.devPercent, 60))
      const closeFilter = settings.closeFilter !== false
      const hlFilter = settings.hlFilter === true
      const fibValue = numOr(settings.fibValue, 0.5)

      const useAtr = settings.atrFilter === true
      const atrLength = Math.max(1, Math.floor(numOr(settings.atrLength, 14)))
      const atrMult = Math.max(1, numOr(settings.atrMult, 1))

      const useTime = settings.timeFilter === true
      const hourFrom = intOr(settings.hourFrom, 9, 0, 23)
      const minuteFrom = intOr(settings.minuteFrom, 15, 0, 59)
      const hourTo = intOr(settings.hourTo, 10, 0, 23)
      const minuteTo = intOr(settings.minuteTo, 15, 0, 59)

      const useDate = settings.dateFilter === true
      const dayWanted = intOr(settings.day, 30, 1, 31)
      const monthWanted = intOr(settings.month, 3, 1, 12)
      const yearWanted = intOr(settings.year, 2025, 0, 2999)

      const method = methodOf(settings)
      const showLong = showLongOf(settings)
      const showShort = showShortOf(settings)

      const zoneRaw = ctx?.timezone ?? settings.timezone ?? DEFAULT_TIMEZONE
      const zone =
        typeof zoneRaw === 'string' && zoneRaw !== '' && isValidTimezone(zoneRaw) ? zoneRaw : DEFAULT_TIMEZONE

      const high = new Array(n)
      const low = new Array(n)
      const close = new Array(n)
      const open = new Array(n)
      const hl = new Array(n)
      for (let i = 0; i < n; i++) {
        high[i] = bars[i].high
        low[i] = bars[i].low
        close[i] = bars[i].close
        open[i] = bars[i].open
        hl[i] = bars[i].high - bars[i].low
      }

      // Pine: nz(input / 100 * ta.sma(high - low, 14)). The nz() makes the
      // threshold 0 for the first 13 bars, so every early bar clears it.
      const avgRange = sma(hl, 14)
      const atrValues = atr(high, low, close, atrLength)

      // Exchange wall clock, never the browser's zone.
      const timeOk = new Array(n).fill(true)
      const dateOk = new Array(n).fill(true)
      if (useTime || useDate) {
        for (let i = 0; i < n; i++) {
          const parts = utcSecondsToZonedParts(bars[i].time, zone)
          if (useTime) {
            const hour = parts.hour
            const minute = parts.minute
            timeOk[i] =
              (hour > hourFrom || (hour === hourFrom && minute >= minuteFrom)) &&
              (hour < hourTo || (hour === hourTo && minute < minuteTo))
          }
          if (useDate) {
            dateOk[i] = parts.year === yearWanted && parts.month === monthWanted && parts.day === dayWanted
          }
        }
      }

      const bullFibCol = new Array(n).fill(NaN)
      const bearFibCol = new Array(n).fill(NaN)
      const bullCntCol = new Array(n).fill(0)
      const bearCntCol = new Array(n).fill(0)
      const bullMaxCol = new Array(n).fill(0)
      const bearMaxCol = new Array(n).fill(0)
      const bullRetCol = new Array(n).fill(0)
      const bearRetCol = new Array(n).fill(0)
      const bullRangePctCol = new Array(n).fill(NaN)
      const bearRangePctCol = new Array(n).fill(NaN)
      const bullLineFrom = new Array(n).fill(NaN)
      const bearLineFrom = new Array(n).fill(NaN)
      const cumPchgCol = new Array(n).fill(NaN)
      const volPchgCol = new Array(n).fill(NaN)
      const curVolCol = new Array(n).fill(NaN)
      const prevVolCol = new Array(n).fill(NaN)

      // var-carried state, exactly as the source declares it.
      let bullCnt = 0
      let bearCnt = 0
      let bullRunHi = NaN
      let bullRunLo = NaN
      let bearRunHi = NaN
      let bearRunLo = NaN
      let bullFib = NaN
      let bearFib = NaN
      let bullActive = false
      let bearActive = false
      let bullDone = false
      let bearDone = false
      let bullStart = -1
      let bearStart = -1
      let cumPchg = NaN
      let currCumVol = NaN
      let prevCumVol = NaN

      for (let i = 0; i < n; i++) {
        // bullCnt / bearCnt still hold the previous bar's values here. On bar 0
        // Pine reads them as na, and every comparison with na is false.
        const prevBullCnt = i > 0 ? bullCnt : NaN
        const prevBearCnt = i > 0 ? bearCnt : NaN
        const prevClose = i > 0 ? close[i - 1] : NaN
        const prevHigh = i > 0 ? high[i - 1] : NaN
        const prevLow = i > 0 ? low[i - 1] : NaN

        const threshold = fin(avgRange[i]) ? (devPercent / 100) * avgRange[i] : 0
        const priceChg = hl[i]
        const atrOk = !useAtr || (fin(atrValues[i]) && priceChg > atrValues[i] * atrMult)

        const bullish =
          fin(priceChg) &&
          priceChg >= threshold &&
          close[i] > open[i] &&
          (!closeFilter || (fin(prevClose) && close[i] > prevClose)) &&
          (!hlFilter || (fin(prevHigh) && close[i] > prevHigh)) &&
          atrOk
        const bearish =
          fin(priceChg) &&
          priceChg >= threshold &&
          close[i] < open[i] &&
          (!closeFilter || (fin(prevClose) && close[i] < prevClose)) &&
          (!hlFilter || (fin(prevLow) && close[i] < prevLow)) &&
          atrOk

        // The source keeps one array of highs and one of lows per side and
        // clears them when the other side starts, so a running extreme reset at
        // the first bar of a run is the same thing.
        if (bullish) {
          bullCnt += 1
          bearCnt = 0
          if (bullCnt === 1) {
            bullRunHi = high[i]
            bullRunLo = low[i]
          } else {
            bullRunHi = Math.max(bullRunHi, high[i])
            bullRunLo = Math.min(bullRunLo, low[i])
          }
        } else if (bearish) {
          bearCnt += 1
          bullCnt = 0
          if (bearCnt === 1) {
            bearRunHi = high[i]
            bearRunLo = low[i]
          } else {
            bearRunHi = Math.max(bearRunHi, high[i])
            bearRunLo = Math.min(bearRunLo, low[i])
          }
        } else {
          bullCnt = 0
          bearCnt = 0
        }

        bullCntCol[i] = bullCnt
        bearCntCol[i] = bearCnt

        let bullRangePct = NaN
        let bearRangePct = NaN
        if (bullCnt >= minBars) {
          const range = bullRunHi - bullRunLo
          if (fin(range) && fin(bullRunLo) && bullRunLo !== 0) bullRangePct = (range / bullRunLo) * 100
          bullFib = bullRunHi - range * fibValue
        }
        if (bearCnt >= minBars) {
          const range = bearRunHi - bearRunLo
          if (fin(range) && fin(bearRunLo) && bearRunLo !== 0) bearRangePct = (range / bearRunLo) * 100
          bearFib = bearRunLo + range * fibValue
        }
        bullFibCol[i] = bullFib
        bearFibCol[i] = bearFib
        bullRangePctCol[i] = bullRangePct
        bearRangePctCol[i] = bearRangePct

        const bullMax = fin(prevBullCnt) && prevBullCnt >= minBars && bullCnt === 0
        const bearMax = fin(prevBearCnt) && prevBearCnt >= minBars && bearCnt === 0
        bullMaxCol[i] = bullMax ? 1 : 0
        bearMaxCol[i] = bearMax ? 1 : 0

        // A run becomes active on the bar it first reaches the minimum length.
        if (bullCnt >= minBars && fin(prevBullCnt) && prevBullCnt < minBars) {
          bullActive = true
          bearActive = false
          bullDone = false
          bearDone = false
          bullStart = i - bullCnt + 1
        }
        if (bearCnt >= minBars && fin(prevBearCnt) && prevBearCnt < minBars) {
          bearActive = true
          bullActive = false
          bearDone = false
          bullDone = false
          bearStart = i - bearCnt + 1
        }

        const prevBearFib = i > 0 ? bearFibCol[i - 1] : NaN
        const prevBullFib = i > 0 ? bullFibCol[i - 1] : NaN
        // ta.crossover(high, bearFib), plus the source's extra high[1] < bearFib.
        const bearCross =
          i > 0 && fin(bearFib) && fin(prevBearFib) && fin(prevHigh) && high[i] > bearFib && prevHigh <= prevBearFib
        const bullCross =
          i > 0 && fin(bullFib) && fin(prevBullFib) && fin(prevLow) && low[i] < bullFib && prevLow >= prevBullFib

        const bearRet = bearActive && !bearDone && bearCross && prevHigh < bearFib && timeOk[i] && dateOk[i]
        const bullRet = bullActive && !bullDone && bullCross && prevLow > bullFib && timeOk[i] && dateOk[i]
        bearRetCol[i] = bearRet ? 1 : 0
        bullRetCol[i] = bullRet ? 1 : 0

        // Only the marked retracement closes a run and draws its line, which is
        // why a run can re-signal while the Displacement method is selected.
        if (bearRet && method === 'Retracement' && showShort) {
          bearDone = true
          if (bearStart >= 0 && bearStart < n) bearLineFrom[i] = bars[bearStart].time
        }
        if (bullRet && method === 'Retracement' && showLong) {
          bullDone = true
          if (bullStart >= 0 && bullStart < n) bullLineFrom[i] = bars[bullStart].time
        }

        // Performance: cumulative percentage change and cumulative volume,
        // both reset on the first bar of each exchange day.
        const isNewDay = i > 0 && isNewZonedDay(bars[i - 1].time, bars[i].time, zone)
        const dayPchg =
          i > 0 && fin(prevClose) && prevClose !== 0 ? ((close[i] - prevClose) / prevClose) * 100 : 0
        cumPchg = isNewDay ? dayPchg : !fin(cumPchg) ? dayPchg : cumPchg + dayPchg

        const volume = fin(bars[i].volume) ? bars[i].volume : NaN
        if (isNewDay) {
          prevCumVol = currCumVol
          currCumVol = volume
        } else {
          currCumVol = !fin(currCumVol) ? volume : currCumVol + volume
        }
        const prevSafe = fin(prevCumVol) ? prevCumVol : currCumVol
        cumPchgCol[i] = cumPchg
        curVolCol[i] = fin(currCumVol) ? currCumVol : NaN
        prevVolCol[i] = fin(prevSafe) ? prevSafe : NaN
        volPchgCol[i] =
          fin(currCumVol) && fin(prevSafe) && prevSafe !== 0 ? ((currCumVol - prevSafe) / prevSafe) * 100 : NaN
      }

      return {
        bearFib: nulls(bearFibCol),
        bullFib: nulls(bullFibCol),
        bullCnt: bullCntCol,
        bearCnt: bearCntCol,
        bullMax: bullMaxCol,
        bearMax: bearMaxCol,
        bullRet: bullRetCol,
        bearRet: bearRetCol,
        bullRangePct: bullRangePctCol,
        bearRangePct: bearRangePctCol,
        bullLineFrom: bullLineFrom,
        bearLineFrom: bearLineFrom,
        cumPchg: cumPchgCol,
        volPchg: volPchgCol,
        curVol: curVolCol,
        prevVol: prevVolCol,
      }
    },

    markers({ bars, values, settings }) {
      const n = bars.length
      if (n === 0) return []
      const method = methodOf(settings)
      const showLong = showLongOf(settings)
      const showShort = showShortOf(settings)
      const pad = markerPad(bars)

      const labels = []
      const shapes = []
      for (let i = 1; i < n; i++) {
        // The run-length label sits on the last bar of the run, which is the
        // bar before the one that ended it.
        if (showShort && values.bearMax[i] === 1) {
          const count = values.bearCnt[i - 1]
          if (fin(count) && fin(bars[i - 1].low)) {
            labels.push({
              time: bars[i - 1].time,
              position: 'atPrice',
              price: bars[i - 1].low - pad,
              shape: 'labelUp',
              size: 'small',
              color: NEG_LIGHT,
              text: String(Math.round(count)),
            })
          }
        }
        if (showLong && values.bullMax[i] === 1) {
          const count = values.bullCnt[i - 1]
          if (fin(count) && fin(bars[i - 1].high)) {
            labels.push({
              time: bars[i - 1].time,
              position: 'atPrice',
              price: bars[i - 1].high + pad,
              shape: 'labelDown',
              size: 'small',
              color: POS_LIGHT,
              text: String(Math.round(count)),
            })
          }
        }

        if (method !== 'Retracement') continue
        if (showShort && values.bearRet[i] === 1 && fin(bars[i].high)) {
          shapes.push({
            time: bars[i].time,
            position: 'atPrice',
            price: bars[i].high + pad,
            shape: 'triangleDown',
            size: 'tiny',
            color: NEG_LIGHT,
          })
        }
        if (showLong && values.bullRet[i] === 1 && fin(bars[i].low)) {
          shapes.push({
            time: bars[i].time,
            position: 'atPrice',
            price: bars[i].low - pad,
            shape: 'triangleUp',
            size: 'tiny',
            color: POS_LIGHT,
          })
        }
      }
      // The source caps itself at 500 labels.
      return labels.slice(-500).concat(shapes)
    },

    draws({ bars, values }) {
      const n = bars.length
      if (n === 0) return []
      const out = []
      for (let i = 0; i < n; i++) {
        const bearFrom = values.bearLineFrom[i]
        const bearPrice = values.bearFib[i]
        if (fin(bearFrom) && fin(bearPrice)) {
          out.push({
            kind: 'line',
            from: { time: bearFrom, price: bearPrice },
            to: { time: bars[i].time, price: bearPrice },
            color: NEG_LIGHT,
            lineWidth: 1,
            lineStyle: 'dotted',
          })
        }
        const bullFrom = values.bullLineFrom[i]
        const bullPrice = values.bullFib[i]
        if (fin(bullFrom) && fin(bullPrice)) {
          out.push({
            kind: 'line',
            from: { time: bullFrom, price: bullPrice },
            to: { time: bars[i].time, price: bullPrice },
            color: POS_LIGHT,
            lineWidth: 1,
            lineStyle: 'dotted',
          })
        }
      }
      // The source caps itself at 500 lines.
      return out.slice(-500)
    },

    barColors({ bars, values, settings }) {
      const method = methodOf(settings)
      const showLong = showLongOf(settings)
      const showShort = showShortOf(settings)
      return bars.map((bar, i) => {
        if (method !== 'Retracement') return null
        if (showShort && values.bearRet[i] === 1) return NEG_LIGHT
        if (showLong && values.bullRet[i] === 1) return POS_LIGHT
        return null
      })
    },

    table({ bars, values, settings }) {
      if (settings.showPerfTable === false || bars.length === 0) return null
      const i = bars.length - 1
      const pchg = values.cumPchg[i]
      const volPchg = values.volPchg[i]
      const curVol = values.curVol[i]
      const prevVol = values.prevVol[i]

      const pchgColor = fin(pchg) && pchg > 0 ? POS : NEG
      const volColor = fin(volPchg) && volPchg > 0 ? POS : NEG
      const prevColor = fin(prevVol) && fin(curVol) && prevVol < curVol ? NEG : POS

      const label = (text) => ({ text, align: 'left', bgColor: NEU_DARK, textColor: NEU })
      const value = (text, color) => ({ text, align: 'right', bgColor: NEU_DARK, textColor: color })
      const pct = (v) => (fin(v) ? `${fmt2(v)} %` : '-')
      const lakhs = (v) => (fin(v) ? `${fmt2(v / 100000)} L` : '-')

      const position = TABLE_POSITIONS.has(settings.tablePosition) ? settings.tablePosition : 'bottom-right'
      const fontSize = FONT_SIZES[settings.tableSize] ?? FONT_SIZES.normal

      return {
        rows: [
          [label('%Chg'), value(pct(pchg), pchgColor)],
          [label('Vol %Chg'), value(pct(volPchg), volColor)],
          [label('Vol'), value(lakhs(curVol), volColor)],
          [label('PD Vol'), value(lakhs(prevVol), prevColor)],
        ],
        options: {
          position,
          fontSize,
          cellWidth: [90, 90],
          cellHeight: 20,
          borderColor: '#5a6b8c',
          borderWidth: 1,
        },
      }
    },
  })
}
