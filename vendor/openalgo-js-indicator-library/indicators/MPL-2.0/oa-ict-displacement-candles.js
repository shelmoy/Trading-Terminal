/**
 * ICT Displacement Candles Indicator - ported to openalgo-charts from Pine Script v6.
 *
 * Source: https://github.com/ArunKBhaskar/PineScript/blob/c6821225c466494b01eee08f9dd88bf84d2b24ba/ICT Displacement Candles/[Indicator] ICT Displacement Candles.txt
 * Repo:   ArunKBhaskar/PineScript
 * License: MPL-2.0, (c) Arun_K_Bhaskar
 * SPDX-FileCopyrightText: (c) Arun_K_Bhaskar
 * SPDX-FileCopyrightText: (c) 2026 marketcalls (port to openalgo-charts)
 * SPDX-License-Identifier: MPL-2.0
 *
 * Counts runs of one-way candles whose range clears a multiple of the recent
 * average range (displacement), labels each run with its length, and optionally
 * marks the bar where price first pulls back to a Fibonacci level of that run.
 */

export default function ({
  registerIndicator,
  atr,
  sma,
  nulls,
  DEFAULT_TIMEZONE,
  isValidTimezone,
  utcSecondsToZonedParts,
  isNewZonedDay,
}) {
  const POS_COLOR = '#089981'
  const POS_LIGHT_COLOR = '#70CCBD'
  const NEG_LIGHT_COLOR = '#FAA1A4'
  const NEG_COLOR = '#F23645'
  const NEU_DARK_COLOR = '#0F0F0F'
  const HEAD_TEXT_COLOR = '#E6E9EF'

  // Pine's str.tostring(x, '#.##'): at most two decimals, trailing zeros dropped.
  const fmt = (v) => (Number.isFinite(v) ? String(Number(v.toFixed(2))) : '0')

  const TABLE_FONT_SIZE = { auto: 11, tiny: 8, small: 10, normal: 11, large: 14, huge: 18 }

  const zoneOf = (ctx) => {
    const zone = ctx?.timezone
    return typeof zone === 'string' && isValidTimezone(zone) ? zone : DEFAULT_TIMEZONE
  }

  registerIndicator({
    id: 'oa-ict-displacement-candles',
    name: 'ICT Displacement Candles Indicator',
    category: 'ICT',
    placement: 'onchart',

    inputs: [
      {
        key: 'scanMethod',
        type: 'select',
        label: 'Scanning Method',
        default: 'Displacement',
        options: [
          { label: 'Displacement', value: 'Displacement' },
          { label: 'Retracement', value: 'Retracement' },
        ],
        group: 'Scanner',
        tooltip:
          'Displacement: strong, sudden price move (up or down) with long candles and minimal wicks. Retracement: price pulls back to a Fibonacci level of the displacement, a potential entry for trend continuation.',
      },
      { key: 'showLong', type: 'boolean', label: 'Long Signals', default: true, group: 'Scanner' },
      { key: 'showShort', type: 'boolean', label: 'Short Signals', default: true, group: 'Scanner' },

      {
        key: 'minBars',
        type: 'number',
        label: 'Minimum Bars',
        default: 3,
        min: 1,
        max: 500,
        step: 1,
        group: 'Displacement Candles',
        tooltip: 'Shows if bars exceed the set value.',
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
        tooltip: 'Minimal size of a displacement candle, as a percentage of the average high-low range of the last 14 bars.',
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
        key: 'fibVal',
        type: 'number',
        label: 'Fibonacci Value',
        default: 0.5,
        min: 0,
        max: 1,
        step: 0.1,
        group: 'Displacement Candles',
        tooltip:
          '0: top of a bullish and bottom of a bearish displacement. 1: bottom of a bullish and top of a bearish displacement. 0.5: the midpoint.',
      },

      {
        key: 'atrFilter',
        type: 'boolean',
        label: 'Apply ATR Filter',
        default: false,
        group: 'Additional Filters',
        tooltip: 'Filters out longer or more volatile displacement candles.',
      },
      { key: 'atrLength', type: 'number', label: 'ATR Length', default: 14, min: 1, max: 5000, step: 1, group: 'Additional Filters' },
      {
        key: 'atrMulti',
        type: 'number',
        label: 'ATR Multiplier',
        default: 1,
        min: 1,
        max: 100,
        step: 0.1,
        group: 'Additional Filters',
        tooltip: 'Higher values filter longer or more volatile candles.',
      },

      {
        key: 'timeFilter',
        type: 'boolean',
        label: 'Apply Time Filter',
        default: false,
        group: 'Additional Filters',
        tooltip: 'Filter retracement signals to a window of the trading day.',
      },
      { key: 'hour1', type: 'number', label: 'Time From (hour)', default: 9, min: 0, max: 23, step: 1, group: 'Additional Filters' },
      { key: 'minute1', type: 'number', label: 'Time From (minute)', default: 15, min: 0, max: 59, step: 1, group: 'Additional Filters' },
      { key: 'hour2', type: 'number', label: 'Time To (hour)', default: 10, min: 0, max: 23, step: 1, group: 'Additional Filters' },
      { key: 'minute2', type: 'number', label: 'Time To (minute)', default: 15, min: 0, max: 59, step: 1, group: 'Additional Filters' },

      {
        key: 'dateFilter',
        type: 'boolean',
        label: 'Apply Date Filter',
        default: false,
        group: 'Additional Filters',
        tooltip: 'Filter retracement signals to one specified date.',
      },
      { key: 'day', type: 'number', label: 'Day', default: 30, min: 1, max: 31, step: 1, group: 'Additional Filters' },
      { key: 'month', type: 'number', label: 'Month', default: 3, min: 1, max: 12, step: 1, group: 'Additional Filters' },
      { key: 'year', type: 'number', label: 'Year', default: 2025, min: 0, max: 9999, step: 1, group: 'Additional Filters' },

      { key: 'showTable', type: 'boolean', label: 'Display', default: true, group: 'Performance Table' },
      {
        key: 'tablePos',
        type: 'select',
        label: 'Position',
        default: 'bottom-right',
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
        group: 'Performance Table',
      },
      {
        key: 'tableSize',
        type: 'select',
        label: 'Size',
        default: 'normal',
        options: [
          { label: 'Auto', value: 'auto' },
          { label: 'Tiny', value: 'tiny' },
          { label: 'Small', value: 'small' },
          { label: 'Normal', value: 'normal' },
          { label: 'Large', value: 'large' },
          { label: 'Huge', value: 'huge' },
        ],
        group: 'Performance Table',
        tooltip: 'The table layer has no automatic sizing, so Auto renders at the Normal size.',
      },
    ],

    // Both Pine plots carry display.none: the Fibonacci levels drive the
    // retracement test rather than being drawn, so they start hidden here too.
    plots: [
      {
        key: 'bearFib',
        type: 'step',
        title: 'Bearish Fib Line',
        style: { color: NEG_COLOR, lineWidth: 1, visible: false },
      },
      {
        key: 'bullFib',
        type: 'step',
        title: 'Bullish Fib Line',
        style: { color: POS_COLOR, lineWidth: 1, visible: false },
      },
    ],

    calc(bars, settings, store, ctx) {
      const n = bars.length
      // A cleared field arrives as '', and Number('') is 0.
      const minBars = Math.max(1, Math.floor(Number(settings.minBars) || 3))
      const devPercent = Math.max(1, Number(settings.devPercent) || 60)
      // 0 is a meaningful Fibonacci value here, so only a cleared or unreadable
      // field falls back to the default.
      const fibRaw = settings.fibVal === '' || settings.fibVal == null ? NaN : Number(settings.fibVal)
      const fibVal = Number.isFinite(fibRaw) ? fibRaw : 0.5
      const closeFilter = settings.closeFilter !== false
      const hlFilter = settings.hlFilter === true
      const useAtrFilter = settings.atrFilter === true
      const atrLength = Math.max(1, Math.floor(Number(settings.atrLength) || 14))
      const atrMulti = Math.max(1, Number(settings.atrMulti) || 1)
      const useTimeFilter = settings.timeFilter === true
      const hour1 = Math.max(0, Math.floor(Number(settings.hour1) || 0))
      const minute1 = Math.max(0, Math.floor(Number(settings.minute1) || 0))
      const hour2 = Math.max(0, Math.floor(Number(settings.hour2) || 0))
      const minute2 = Math.max(0, Math.floor(Number(settings.minute2) || 0))
      const useDateFilter = settings.dateFilter === true
      const wantDay = Math.max(1, Math.floor(Number(settings.day) || 1))
      const wantMonth = Math.max(1, Math.floor(Number(settings.month) || 1))
      const wantYear = Math.max(0, Math.floor(Number(settings.year) || 0))
      const method = settings.scanMethod === 'Retracement' ? 'Retracement' : 'Displacement'
      const showLong = settings.showLong !== false
      const showShort = settings.showShort !== false
      const zone = zoneOf(ctx)

      const high = new Array(n)
      const low = new Array(n)
      const close = new Array(n)
      const range = new Array(n)
      for (let i = 0; i < n; i += 1) {
        high[i] = bars[i].high
        low[i] = bars[i].low
        close[i] = bars[i].close
        range[i] = bars[i].high - bars[i].low
      }

      // The deviation threshold is a series: Pine wraps it in nz(), so during
      // the 14-bar SMA warmup it is 0 and every candle clears it.
      const avgRange = sma(range, 14)
      const atrLine = useAtrFilter ? atr(high, low, close, atrLength) : null

      const bearFib = new Array(n).fill(NaN)
      const bullFib = new Array(n).fill(NaN)
      const bearSig = new Array(n).fill(NaN)
      const bullSig = new Array(n).fill(NaN)
      const bearFrom = new Array(n).fill(NaN)
      const bullFrom = new Array(n).fill(NaN)
      const bearLabel = new Array(n).fill(NaN)
      const bullLabel = new Array(n).fill(NaN)
      const cumPchg = new Array(n).fill(NaN)
      const cumVolPchg = new Array(n).fill(NaN)
      const currVol = new Array(n).fill(NaN)
      const prevVol = new Array(n).fill(NaN)

      // Run state carried across bars, exactly as the Pine var declarations do.
      let bullCnt = 0
      let bearCnt = 0
      let prevBullCnt = 0
      let prevBearCnt = 0
      let bullHighs = []
      let bullLows = []
      let bearHighs = []
      let bearLows = []
      let curBullFib = NaN
      let curBearFib = NaN
      let prevBullFib = NaN
      let prevBearFib = NaN

      let bullActive = false
      let bearActive = false
      let bullDone = false
      let bearDone = false
      let bullStart = NaN
      let bearStart = NaN

      let cumPchgState = NaN
      let currCumVol = NaN
      let prevCumVol = NaN

      for (let i = 0; i < n; i += 1) {
        const h = high[i]
        const l = low[i]
        const c = close[i]
        const o = bars[i].open
        const prevClose = i > 0 ? close[i - 1] : NaN
        const prevHigh = i > 0 ? high[i - 1] : NaN
        const prevLow = i > 0 ? low[i - 1] : NaN

        // ---- Performance figures -------------------------------------------
        // Pine's ta.change(time('D')) is na on the first bar, which compares
        // false, so the first bar never counts as a new day.
        const isNewDay = i > 0 ? isNewZonedDay(bars[i - 1].time, bars[i].time, zone) : false

        const dayPchg =
          Number.isFinite(prevClose) && prevClose !== 0 && Number.isFinite(c)
            ? ((c - prevClose) / prevClose) * 100
            : 0
        cumPchgState = isNewDay || !Number.isFinite(cumPchgState) ? dayPchg : cumPchgState + dayPchg

        // Volume is absent on index series, so it counts as zero rather than
        // poisoning the running total.
        const vol = Number.isFinite(bars[i].volume) ? bars[i].volume : 0
        if (isNewDay) {
          prevCumVol = currCumVol
          currCumVol = vol
        } else {
          currCumVol = Number.isFinite(currCumVol) ? currCumVol + vol : vol
        }
        const prevVolSafe = Number.isFinite(prevCumVol) ? prevCumVol : currCumVol
        const volPchg =
          Number.isFinite(prevVolSafe) && prevVolSafe !== 0
            ? ((currCumVol - prevVolSafe) / prevVolSafe) * 100
            : 0

        cumPchg[i] = cumPchgState
        cumVolPchg[i] = volPchg
        currVol[i] = Number.isFinite(currCumVol) ? currCumVol : 0
        prevVol[i] = Number.isFinite(prevVolSafe) ? prevVolSafe : 0

        // ---- Filters --------------------------------------------------------
        // Pine compares against na as false, so a warmup ATR blocks the filter.
        const atrOk =
          !useAtrFilter ||
          (atrLine !== null && Number.isFinite(atrLine[i]) && Number.isFinite(range[i]) && range[i] > atrLine[i] * atrMulti)

        let timeOk = true
        let dateOk = true
        if (useTimeFilter || useDateFilter) {
          const parts = utcSecondsToZonedParts(bars[i].time, zone)
          if (useTimeFilter) {
            timeOk =
              (parts.hour > hour1 || (parts.hour === hour1 && parts.minute >= minute1)) &&
              (parts.hour < hour2 || (parts.hour === hour2 && parts.minute < minute2))
          }
          if (useDateFilter) {
            dateOk = parts.year === wantYear && parts.month === wantMonth && parts.day === wantDay
          }
        }

        // ---- Displacement runs ---------------------------------------------
        const threshold = Number.isFinite(avgRange[i]) ? (devPercent / 100) * avgRange[i] : 0
        const bigEnough = Number.isFinite(range[i]) && range[i] >= threshold

        const bullish =
          bigEnough &&
          Number.isFinite(c) &&
          Number.isFinite(o) &&
          c > o &&
          (!closeFilter || (Number.isFinite(prevClose) && c > prevClose)) &&
          (!hlFilter || (Number.isFinite(prevHigh) && c > prevHigh)) &&
          atrOk
        const bearish =
          bigEnough &&
          Number.isFinite(c) &&
          Number.isFinite(o) &&
          c < o &&
          (!closeFilter || (Number.isFinite(prevClose) && c < prevClose)) &&
          (!hlFilter || (Number.isFinite(prevLow) && c < prevLow)) &&
          atrOk

        prevBullCnt = bullCnt
        prevBearCnt = bearCnt

        if (bullish) {
          bullCnt += 1
          bearCnt = 0
          bullHighs.push(h)
          bullLows.push(l)
          if (bullCnt === 1) {
            bearHighs = []
            bearLows = []
          }
        } else if (bearish) {
          bearCnt += 1
          bullCnt = 0
          bearHighs.push(h)
          bearLows.push(l)
          if (bearCnt === 1) {
            bullHighs = []
            bullLows = []
          }
        } else {
          bullCnt = 0
          bearCnt = 0
          bullHighs = []
          bullLows = []
          bearHighs = []
          bearLows = []
        }

        prevBullFib = curBullFib
        prevBearFib = curBearFib

        if (bullCnt >= minBars && bullHighs.length > 0) {
          const hi = Math.max(...bullHighs)
          const lo = Math.min(...bullLows)
          if (Number.isFinite(hi) && Number.isFinite(lo)) curBullFib = hi - (hi - lo) * fibVal
        }
        if (bearCnt >= minBars && bearHighs.length > 0) {
          const hi = Math.max(...bearHighs)
          const lo = Math.min(...bearLows)
          if (Number.isFinite(hi) && Number.isFinite(lo)) curBearFib = lo + (hi - lo) * fibVal
        }

        bullFib[i] = curBullFib
        bearFib[i] = curBearFib

        // A run that just ended is labelled on the bar before this one, which is
        // the last bar of the run.
        if (i > 0 && prevBearCnt >= minBars && bearCnt === 0 && showShort) bearLabel[i - 1] = prevBearCnt
        if (i > 0 && prevBullCnt >= minBars && bullCnt === 0 && showLong) bullLabel[i - 1] = prevBullCnt

        // ---- Retracement tracking -------------------------------------------
        if (i > 0 && bullCnt >= minBars && prevBullCnt < minBars) {
          bullActive = true
          bearActive = false
          bullDone = false
          bearDone = false
          bullStart = i - bullCnt + 1
        }
        if (i > 0 && bearCnt >= minBars && prevBearCnt < minBars) {
          bearActive = true
          bullActive = false
          bearDone = false
          bullDone = false
          bearStart = i - bearCnt + 1
        }

        // ta.crossover(high, bearFib) compares against the previous bar's fib,
        // and every operand has to be a real number or Pine reads the test as
        // false while JavaScript would read null as zero.
        const bearCross =
          i > 0 &&
          Number.isFinite(h) &&
          Number.isFinite(curBearFib) &&
          Number.isFinite(prevHigh) &&
          Number.isFinite(prevBearFib) &&
          h > curBearFib &&
          prevHigh <= prevBearFib
        const bullCross =
          i > 0 &&
          Number.isFinite(l) &&
          Number.isFinite(curBullFib) &&
          Number.isFinite(prevLow) &&
          Number.isFinite(prevBullFib) &&
          l < curBullFib &&
          prevLow >= prevBullFib

        const bearRet =
          bearActive && !bearDone && bearCross && Number.isFinite(prevHigh) && prevHigh < curBearFib && timeOk && dateOk
        const bullRet =
          bullActive && !bullDone && bullCross && Number.isFinite(prevLow) && prevLow > curBullFib && timeOk && dateOk

        if (bearRet && method === 'Retracement' && showShort) {
          bearDone = true
          bearSig[i] = curBearFib
          if (Number.isFinite(bearStart)) bearFrom[i] = bearStart
        }
        if (bullRet && method === 'Retracement' && showLong) {
          bullDone = true
          bullSig[i] = curBullFib
          if (Number.isFinite(bullStart)) bullFrom[i] = bullStart
        }
      }

      return {
        bearFib: nulls(bearFib),
        bullFib: nulls(bullFib),
        bearSig: nulls(bearSig),
        bullSig: nulls(bullSig),
        bearFrom: nulls(bearFrom),
        bullFrom: nulls(bullFrom),
        bearLabel: nulls(bearLabel),
        bullLabel: nulls(bullLabel),
        cumPchg: nulls(cumPchg),
        cumVolPchg: nulls(cumVolPchg),
        currVol: nulls(currVol),
        prevVol: nulls(prevVol),
      }
    },

    markers({ bars, values }) {
      const n = bars.length
      if (n === 0) return []

      // aboveBar and belowBar anchor to this indicator's own plot, so the marks
      // are priced off the candle with a gap scaled to the instrument.
      let sumRange = 0
      let counted = 0
      for (let i = 0; i < n; i += 1) {
        const r = bars[i].high - bars[i].low
        if (Number.isFinite(r)) {
          sumRange += r
          counted += 1
        }
      }
      const meanRange = counted > 0 ? sumRange / counted : 0
      const lastClose = Number.isFinite(bars[n - 1].close) ? bars[n - 1].close : 0
      const pad = Math.max(meanRange * 0.5, Math.abs(lastClose) * 0.0005)

      const out = []
      for (let i = 0; i < n; i += 1) {
        const bearCount = values.bearLabel[i]
        if (Number.isFinite(bearCount) && Number.isFinite(bars[i].low)) {
          out.push({
            time: bars[i].time,
            position: 'atPrice',
            price: bars[i].low - pad,
            shape: 'labelUp',
            size: 'small',
            color: NEG_LIGHT_COLOR,
            text: String(bearCount),
          })
        }
        const bullCount = values.bullLabel[i]
        if (Number.isFinite(bullCount) && Number.isFinite(bars[i].high)) {
          out.push({
            time: bars[i].time,
            position: 'atPrice',
            price: bars[i].high + pad,
            shape: 'labelDown',
            size: 'small',
            color: POS_LIGHT_COLOR,
            text: String(bullCount),
          })
        }
        if (Number.isFinite(values.bearSig[i]) && Number.isFinite(bars[i].high)) {
          out.push({
            time: bars[i].time,
            position: 'atPrice',
            price: bars[i].high + pad,
            shape: 'triangleDown',
            size: 'tiny',
            color: NEG_LIGHT_COLOR,
          })
        }
        if (Number.isFinite(values.bullSig[i]) && Number.isFinite(bars[i].low)) {
          out.push({
            time: bars[i].time,
            position: 'atPrice',
            price: bars[i].low - pad,
            shape: 'triangleUp',
            size: 'tiny',
            color: POS_LIGHT_COLOR,
          })
        }
      }
      return out
    },

    draws({ bars, values }) {
      const out = []
      for (let i = 0; i < bars.length; i += 1) {
        const bearPrice = values.bearSig[i]
        const bearAt = values.bearFrom[i]
        if (Number.isFinite(bearPrice) && Number.isFinite(bearAt) && bars[bearAt]) {
          out.push({
            kind: 'line',
            from: { time: bars[bearAt].time, price: bearPrice },
            to: { time: bars[i].time, price: bearPrice },
            color: NEG_LIGHT_COLOR,
            lineStyle: 'dotted',
            lineWidth: 1,
          })
        }
        const bullPrice = values.bullSig[i]
        const bullAt = values.bullFrom[i]
        if (Number.isFinite(bullPrice) && Number.isFinite(bullAt) && bars[bullAt]) {
          out.push({
            kind: 'line',
            from: { time: bars[bullAt].time, price: bullPrice },
            to: { time: bars[i].time, price: bullPrice },
            color: POS_LIGHT_COLOR,
            lineStyle: 'dotted',
            lineWidth: 1,
          })
        }
      }
      return out
    },

    barColors({ bars, values }) {
      return bars.map((bar, i) => {
        if (Number.isFinite(values.bearSig[i])) return NEG_LIGHT_COLOR
        if (Number.isFinite(values.bullSig[i])) return POS_LIGHT_COLOR
        return null
      })
    },

    table({ bars, values, settings }) {
      if (settings.showTable === false || bars.length === 0) return null
      const i = bars.length - 1
      const pchg = Number(values.cumPchg[i])
      const volPchg = Number(values.cumVolPchg[i])
      const cur = Number(values.currVol[i])
      const prior = Number(values.prevVol[i])

      const pchgCol = pchg > 0 ? POS_COLOR : NEG_COLOR
      const volCol = volPchg > 0 ? POS_COLOR : NEG_COLOR
      const priorCol = prior < cur ? NEG_COLOR : POS_COLOR

      const label = (text) => ({ text, bgColor: NEU_DARK_COLOR, textColor: HEAD_TEXT_COLOR, align: 'left' })
      const value = (text, textColor) => ({ text, bgColor: NEU_DARK_COLOR, textColor, align: 'right' })

      const size = TABLE_FONT_SIZE[settings.tableSize] ?? TABLE_FONT_SIZE.normal
      const positions = [
        'top-left', 'top-center', 'top-right',
        'middle-left', 'middle-center', 'middle-right',
        'bottom-left', 'bottom-center', 'bottom-right',
      ]
      const position = positions.includes(settings.tablePos) ? settings.tablePos : 'bottom-right'

      return {
        rows: [
          [label('%Chg'), value(fmt(pchg) + ' %', pchgCol)],
          [label('Vol %Chg'), value(fmt(volPchg) + ' %', volCol)],
          [label('Vol'), value(fmt(cur / 100000) + ' L', volCol)],
          [label('PD Vol'), value(fmt(prior / 100000) + ' L', priorCol)],
        ],
        options: {
          position,
          fontSize: size,
          cellWidth: [Math.round(size * 7), Math.round(size * 8)],
          cellHeight: Math.round(size * 2),
          borderColor: '#5a6b8c',
          borderWidth: 1,
        },
      }
    },
  })
}
