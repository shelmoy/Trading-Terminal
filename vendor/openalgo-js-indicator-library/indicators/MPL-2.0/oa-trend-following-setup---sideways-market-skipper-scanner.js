/**
 * Trend Following Setup - Sideways Market Skipper Scanner - ported to
 * openalgo-charts from Pine Script v6.
 *
 * Source: https://github.com/ArunKBhaskar/PineScript/blob/c6821225c466494b01eee08f9dd88bf84d2b24ba/Trend Following Setup - Sideways Market Skipper Scanner/Scanner - Trend Following Setup - Sideways Market Skipper Scanner.txt
 * Repo:   ArunKBhaskar/PineScript
 * License: MPL-2.0, (c) Arun_K_Bhaskar. This code is subject to the terms of the
 *          Mozilla Public License 2.0 at https://mozilla.org/MPL/2.0/
 * SPDX-FileCopyrightText: (c) Arun_K_Bhaskar
 * SPDX-FileCopyrightText: (c) 2026 marketcalls (port to openalgo-charts)
 * SPDX-License-Identifier: MPL-2.0
 *
 * A Supertrend cross arms a setup and projects a volatility box one ATR-derived
 * distance beyond the crossing close. The trade is only taken when price leaves
 * that box while volatility is expanding (ATR above its own SMA) and the chosen
 * candle filters agree, which is what skips the sideways drift that usually
 * follows a Supertrend flip.
 *
 * Notes on the translation:
 *
 * 1. The Pine script declares `overlay=false` but force-overlays everything a
 *    trader looks at: the Supertrend, its shading, the range levels, both
 *    barcolor layers and the shape signals. Only ATR and its SMA live in the
 *    study pane. Fills, tables and drawings here are bound to the indicator's
 *    own pane, so keeping the descriptor `onchart` is what preserves the
 *    Supertrend shading; ATR and ATR SMA instead take the left price scale,
 *    which autoscales independently of price.
 * 2. `offset=-1` on the two range plots shifts them one bar into the past, which
 *    is an ordinary column write at `i - 1`, not a future bar. Combined with the
 *    source's `top_price == top_price[1]` guard the level starts drawing on the
 *    bar it was set on, exactly as the original does.
 * 3. The 40-symbol scanner (`request.security` over a pasted symbol list, its
 *    matrix and its second table) is a screener, not a chart study, and has no
 *    expression here. Everything it scans FOR runs on the current symbol, so the
 *    signal itself is fully ported; only the cross-symbol table is absent.
 * 4. Colour inputs are dropped. The chart generates colour, width and style per
 *    plot, and the source's palette is carried as the plot and table defaults.
 */

// The source's chart palette, carried over as defaults rather than as inputs.
const POS = '#26A69A' // Positive Mid
const POS_LIGHT = '#ACE5DC' // Positive Light
const POS_DARK = '#03110F' // Positive Dark
const NEG = '#FF5252' // Negative Mid
const NEG_LIGHT = '#FCCBCD' // Negative Light
const INDICATOR = '#2962FF' // Indicator
const SIGNAL = '#FF6D00' // Signal
const NEU = '#D1D4DC' // Neutral Light
const NEU_MID = '#2A2E39' // Neutral Mid
const NEU_DARK = '#141516' // Neutral Dark

const FONT_PX = { tiny: 9, small: 10, normal: 12, large: 14, huge: 18 }

export default function ({
  registerIndicator,
  supertrend,
  trueRange,
  atr,
  sma,
  rma,
  wma,
  smaSeededEma,
  nulls,
  clamp,
  zonedDayIndex,
  utcSecondsToZonedParts,
  isValidTimezone,
  DEFAULT_TIMEZONE,
}) {
  /**
   * A cleared settings field arrives as '' and `Number('')` is 0, so a plain
   * `Number(x) || fallback` both accepts the cleared field as a zero-length
   * window and rejects a deliberate zero. Treating empty as absent separates
   * the two.
   */
  const num = (raw, fallback) => {
    if (raw === '' || raw === null || raw === undefined) return fallback
    const v = Number(raw)
    return Number.isFinite(v) ? v : fallback
  }
  const int = (raw, fallback, min) => Math.max(min, Math.floor(num(raw, fallback)))

  // Pine's str.tostring(x, '#.##'): at most two decimals, trailing zeros gone.
  const fmt2 = (v) => (Number.isFinite(v) ? String(Math.round(v * 100) / 100) : '-')

  registerIndicator({
    id: 'oa-trend-following-setup---sideways-market-skipper-scanner',
    name: 'Trend Following Setup - Sideways Market Skipper Scanner',
    category: 'ICT',
    placement: 'onchart',

    inputs: [
      // Supertrend
      { key: 'stAtrPeriod', type: 'number', label: 'ATR Length', default: 10, min: 1, max: 1000, step: 1, group: 'Supertrend' },
      { key: 'stFactor', type: 'number', label: 'Factor', default: 3, min: 0.01, max: 100, step: 0.01, group: 'Supertrend' },

      // Volatility Range
      { key: 'showRange', type: 'boolean', label: 'Display', default: true, group: 'Volatility Range' },
      {
        key: 'rangeType',
        type: 'select',
        label: 'Range Type',
        default: 'Auto ATR',
        group: 'Volatility Range',
        options: [
          { label: 'Auto ATR', value: 'Auto ATR' },
          { label: 'Type Points', value: 'Type Points' },
        ],
        tooltip:
          'Auto ATR sets the range from the ATR below, so it rescales with the symbol. Type Points uses a fixed number of points instead, for example 60 for NIFTY and 120 for BANKNIFTY.',
      },
      {
        key: 'rangePoints',
        type: 'number',
        label: 'Type Points',
        default: 120,
        min: 0.01,
        max: 1000000,
        step: 0.01,
        group: 'Volatility Range',
        tooltip: "Applicable only when Range Type is set to 'Type Points'.",
      },
      { key: 'rangeAtrLength', type: 'number', label: 'ATR Length', default: 14, min: 1, max: 1000, step: 1, group: 'Volatility Range' },
      {
        key: 'rangeAtrSmoothing',
        type: 'select',
        label: 'ATR Smoothing',
        default: 'RMA',
        group: 'Volatility Range',
        options: [
          { label: 'RMA', value: 'RMA' },
          { label: 'SMA', value: 'SMA' },
          { label: 'EMA', value: 'EMA' },
          { label: 'WMA', value: 'WMA' },
        ],
      },
      { key: 'rangeAtrMultiplier', type: 'number', label: 'ATR Multiplier', default: 1.5, min: 1, max: 100, step: 0.5, group: 'Volatility Range' },
      { key: 'rangeAtrSmaLength', type: 'number', label: 'ATR SMA Length', default: 14, min: 1, max: 1000, step: 1, group: 'Volatility Range' },
      { key: 'showAtr', type: 'boolean', label: 'Display ATR and ATR SMA', default: true, group: 'Volatility Range' },

      // Additional Filters
      {
        key: 'pchgFilter',
        type: 'boolean',
        label: 'Apply % Change Filter',
        default: false,
        group: 'Additional Filters',
        tooltip:
          'With 4, relative volume is considered when the price change is above +4% for longs and below -4% for shorts. The change is cumulative from the start of the day.',
      },
      { key: 'pchgAboveBelow', type: 'number', label: '% Change Above/Below +/-', default: 2, min: 0, max: 1000, step: 0.1, group: 'Additional Filters' },

      {
        key: 'volPchgFilter',
        type: 'boolean',
        label: 'Apply Volume % Change Filter',
        default: false,
        group: 'Additional Filters',
        tooltip:
          "With 0, today's cumulative volume only has to beat the previous day's. 300% or more often marks a major breakout.",
      },
      { key: 'volPchgAbove', type: 'number', label: 'Volume % Change Above', default: 0, min: 0, max: 100000, step: 1, group: 'Additional Filters' },

      { key: 'atrFilter', type: 'boolean', label: 'Apply ATR Filter', default: true, group: 'Additional Filters', tooltip: 'Filters out longer or more volatile signal candles.' },
      { key: 'atrLength', type: 'number', label: 'ATR Length', default: 14, min: 1, max: 1000, step: 1, group: 'Additional Filters' },
      { key: 'atrMulti', type: 'number', label: 'ATR Multiplier', default: 1, min: 1, max: 100, step: 0.1, group: 'Additional Filters', tooltip: 'A higher multiplier filters a longer or more volatile signal candle.' },

      { key: 'bodyFilter', type: 'boolean', label: 'Apply Body % Filter', default: false, group: 'Additional Filters', tooltip: 'With 80, the body has to cover over 80% of the candle.' },
      { key: 'bodyPercent', type: 'number', label: 'Body % Above', default: 80, min: 0, max: 100, step: 1, group: 'Additional Filters' },

      { key: 'bodySizeFilter', type: 'boolean', label: 'Apply Body Size Filter', default: false, group: 'Additional Filters', tooltip: '2 means the candle is 2 times larger than the previous candle.' },
      { key: 'bodySizeMultiplier', type: 'number', label: 'Body Size Multiplier (x)', default: 2, min: 0, max: 100, step: 1, group: 'Additional Filters' },

      { key: 'volumeFilter', type: 'boolean', label: 'Apply Volume Filter', default: false, group: 'Additional Filters', tooltip: 'Keeps a candle only when its volume is above the SMA of volume.' },
      { key: 'volSmaLength', type: 'number', label: 'Volume SMA Length', default: 20, min: 1, max: 1000, step: 1, group: 'Additional Filters' },

      { key: 'relVolFilter', type: 'boolean', label: 'Apply Relative Volume Filter', default: false, group: 'Additional Filters', tooltip: 'Keeps a candle only when its relative volume is above its own average.' },
      { key: 'relVolAvgLen', type: 'number', label: 'Relative Volume Length', default: 90, min: 2, max: 5000, step: 1, group: 'Additional Filters' },
      { key: 'relVolMulti', type: 'number', label: 'Rel Vol SMA Multiplier', default: 5, min: 0, max: 100, step: 0.1, group: 'Additional Filters' },

      { key: 'timeFilter', type: 'boolean', label: 'Apply Time Filter', default: false, group: 'Additional Filters', tooltip: 'Keeps signals only between the given exchange times.' },
      { key: 'hourFrom', type: 'number', label: 'Time From (hour)', default: 9, min: 0, max: 23, step: 1, group: 'Additional Filters' },
      { key: 'minuteFrom', type: 'number', label: 'Time From (minute)', default: 15, min: 0, max: 59, step: 1, group: 'Additional Filters' },
      { key: 'hourTo', type: 'number', label: 'Time To (hour)', default: 10, min: 0, max: 23, step: 1, group: 'Additional Filters' },
      { key: 'minuteTo', type: 'number', label: 'Time To (minute)', default: 15, min: 0, max: 59, step: 1, group: 'Additional Filters' },

      // Data Table
      { key: 'showDataTable', type: 'boolean', label: 'Display Table', default: true, group: 'Data Table' },
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

    plots: [
      { key: 'stUp', type: 'line', title: 'Supertrend Up', style: { color: POS, lineWidth: 2 } },
      { key: 'stDown', type: 'line', title: 'Supertrend Down', style: { color: NEG, lineWidth: 2 } },
      // Only there to anchor the two Supertrend fills, exactly as the source's
      // display=none "Body Middle" plot is.
      { key: 'bodyMid', type: 'line', title: 'Body Middle', style: { color: NEU_MID, lineWidth: 1, visible: false } },
      { key: 'topRange', type: 'step', title: 'Top Range', style: { color: POS, lineWidth: 1 } },
      { key: 'bottomRange', type: 'step', title: 'Bottom Range', style: { color: NEG, lineWidth: 1 } },
      // The source's own pane. On the price pane they need a scale of their own,
      // or they flatten against the instrument's range.
      { key: 'atr', type: 'line', title: 'ATR', priceScaleId: 'left', style: { color: INDICATOR, lineWidth: 1 } },
      { key: 'atrSma', type: 'line', title: 'ATR SMA', priceScaleId: 'left', style: { color: SIGNAL, lineWidth: 1 } },
    ],

    fills: [
      { between: ['bodyMid', 'stUp'], colorUp: POS, colorDown: POS, opacity: 0.1 },
      { between: ['bodyMid', 'stDown'], colorUp: NEG, colorDown: NEG, opacity: 0.1 },
    ],

    calc(bars, settings, store, ctx) {
      const n = bars.length

      const stAtrPeriod = int(settings.stAtrPeriod, 10, 1)
      const stFactor = Math.max(0.01, num(settings.stFactor, 3))

      const showRange = settings.showRange !== false
      const rangeType = settings.rangeType === 'Type Points' ? 'Type Points' : 'Auto ATR'
      const rangePoints = Math.max(0.01, num(settings.rangePoints, 120))
      const rangeAtrLength = int(settings.rangeAtrLength, 14, 1)
      const rangeAtrSmoothing = String(settings.rangeAtrSmoothing || 'RMA')
      const rangeAtrMultiplier = Math.max(1, num(settings.rangeAtrMultiplier, 1.5))
      const rangeAtrSmaLength = int(settings.rangeAtrSmaLength, 14, 1)
      const showAtr = settings.showAtr !== false

      const pchgFilterOn = settings.pchgFilter === true
      const pchgAboveBelow = Math.max(0, num(settings.pchgAboveBelow, 2))
      const volPchgFilterOn = settings.volPchgFilter === true
      const volPchgAbove = Math.max(0, num(settings.volPchgAbove, 0))
      const atrFilterOn = settings.atrFilter !== false
      const atrLength = int(settings.atrLength, 14, 1)
      const atrMulti = Math.max(1, num(settings.atrMulti, 1))
      const bodyFilterOn = settings.bodyFilter === true
      // The source divides the input by 100 at declaration.
      const bodyPercent = clamp(num(settings.bodyPercent, 80), 0, 100) / 100
      const bodySizeFilterOn = settings.bodySizeFilter === true
      const bodySizeMultiplier = Math.max(0, Math.floor(num(settings.bodySizeMultiplier, 2)))
      const volumeFilterOn = settings.volumeFilter === true
      const volSmaLength = int(settings.volSmaLength, 20, 1)
      const relVolFilterOn = settings.relVolFilter === true
      const relVolAvgLen = int(settings.relVolAvgLen, 90, 2)
      const relVolMulti = Math.max(0, num(settings.relVolMulti, 5))
      const timeFilterOn = settings.timeFilter === true
      const hourFrom = clamp(Math.floor(num(settings.hourFrom, 9)), 0, 23)
      const minuteFrom = clamp(Math.floor(num(settings.minuteFrom, 15)), 0, 59)
      const hourTo = clamp(Math.floor(num(settings.hourTo, 10)), 0, 23)
      const minuteTo = clamp(Math.floor(num(settings.minuteTo, 15)), 0, 59)

      const col = () => new Array(n).fill(NaN)
      const stUp = col()
      const stDown = col()
      const bodyMid = col()
      const topRange = col()
      const bottomRange = col()
      const atrOut = col()
      const atrSmaOut = col()
      const signalCol = new Array(n).fill(0)
      const crossCol = new Array(n).fill(0)
      const cumPchgCol = col()
      const cumVolPchgCol = col()
      const cumVolCol = col()
      const prevCumVolCol = col()

      if (n === 0) {
        return {
          stUp, stDown, bodyMid, topRange, bottomRange, atr: atrOut, atrSma: atrSmaOut,
          signal: signalCol, cross: crossCol, cumPchg: cumPchgCol, cumVolPchg: cumVolPchgCol,
          cumVol: cumVolCol, prevCumVol: prevCumVolCol,
        }
      }

      const open = bars.map((b) => b.open)
      const high = bars.map((b) => b.high)
      const low = bars.map((b) => b.low)
      const close = bars.map((b) => b.close)
      // Index series carry no volume at all, so every volume filter has to cope
      // with a missing field rather than divide by it.
      const volume = bars.map((b) => (Number.isFinite(b.volume) ? b.volume : 0))

      const zoneRaw = ctx && typeof ctx.timezone === 'string' ? ctx.timezone : null
      const zone = zoneRaw && isValidTimezone(zoneRaw) ? zoneRaw : DEFAULT_TIMEZONE

      // ta.supertrend(factor, atrPeriod). direction is -1 up, +1 down here too.
      const st = supertrend(bars, stAtrPeriod, stFactor)

      // The source's ATR is the chosen moving average of ta.tr(true), not
      // ta.atr, so RMA only coincides with Wilder at the default setting.
      const tr = trueRange(high, low, close)
      let atrSeries
      switch (rangeAtrSmoothing) {
        case 'SMA':
          atrSeries = sma(tr, rangeAtrLength)
          break
        // Pine's ta.ema seeds from the SMA of the first `length` values, which
        // `ema` here does not: `smaSeededEma` is the matching one.
        case 'EMA':
          atrSeries = smaSeededEma(tr, rangeAtrLength)
          break
        case 'WMA':
          atrSeries = wma(tr, rangeAtrLength)
          break
        default:
          atrSeries = rma(tr, rangeAtrLength)
      }
      const atrSmaSeries = sma(atrSeries, rangeAtrSmaLength)

      // The candle filter runs its own Wilder ATR at its own length.
      const filterAtr = atr(high, low, close, atrLength)
      const volSma = sma(volume, volSmaLength)

      // relative_volume = volume / average_volume[1]
      const averageVolume = sma(volume, relVolAvgLen)
      const relVol = col()
      for (let i = 1; i < n; i++) {
        const base = averageVolume[i - 1]
        if (!Number.isFinite(base) || base === 0) continue
        relVol[i] = volume[i] / base
      }
      const relVolSma = sma(relVol, relVolAvgLen)

      const lastIdx = n - 1
      // barstate.isconfirmed: every historical bar is confirmed, the forming one
      // is not. The context is optional, so a host that says nothing means the
      // series is history.
      const lastConfirmed = ctx && ctx.barState ? ctx.barState.isConfirmed !== false : true

      let cumPchg = NaN
      let currentCumVol = NaN
      let prevCumVol = NaN
      let topPrice = NaN
      let bottomPrice = NaN
      // The previous bar's level, which is what `top_price[1]` reads.
      let topRangeState = NaN
      let bottomRangeState = NaN
      let shortState = 0
      let longState = 0
      let prevDayIdx = null

      for (let i = 0; i < n; i++) {
        const confirmed = i < lastIdx ? true : lastConfirmed

        // ta.change(time('D')) != 0, which is false on the very first bar.
        const dayIdx = zonedDayIndex(bars[i].time, zone)
        const isNewDay = prevDayIdx !== null && dayIdx !== prevDayIdx
        prevDayIdx = dayIdx

        // Cumulative percentage change of close, reset each day.
        const prevClose = i > 0 ? close[i - 1] : NaN
        const dailyPct =
          i > 0 && Number.isFinite(prevClose) && prevClose !== 0 && Number.isFinite(close[i])
            ? ((close[i] - prevClose) / prevClose) * 100
            : 0
        cumPchg = isNewDay ? dailyPct : Number.isFinite(cumPchg) ? cumPchg + dailyPct : dailyPct
        cumPchgCol[i] = cumPchg

        // Cumulative volume. The source starts from na, so the first day of a
        // chart genuinely has no previous-day figure to compare against and its
        // volume readings stay unavailable, filters included.
        if (isNewDay) {
          prevCumVol = currentCumVol
          currentCumVol = volume[i]
        } else {
          currentCumVol += volume[i]
        }
        cumVolCol[i] = currentCumVol
        prevCumVolCol[i] = prevCumVol

        const volBase = Number.isFinite(prevCumVol) ? prevCumVol : currentCumVol
        const cumVolPchg =
          Number.isFinite(currentCumVol) && Number.isFinite(volBase) && volBase !== 0
            ? ((currentCumVol - volBase) / volBase) * 100
            : NaN
        cumVolPchgCol[i] = cumVolPchg

        // Additional filters. Every one of them is `true` while switched off,
        // and every comparison is guarded: an unavailable operand makes a Pine
        // comparison false, where in JavaScript it would sail through.
        const pchgAboveOk = !pchgFilterOn || (Number.isFinite(cumPchg) && cumPchg > pchgAboveBelow)
        const pchgBelowOk = !pchgFilterOn || (Number.isFinite(cumPchg) && cumPchg < -pchgAboveBelow)
        const volPchgOk = !volPchgFilterOn || (Number.isFinite(cumVolPchg) && cumVolPchg >= volPchgAbove)

        const barRange = high[i] - low[i]
        const atrOk =
          !atrFilterOn ||
          (Number.isFinite(filterAtr[i]) && Number.isFinite(barRange) && barRange > filterAtr[i] * atrMulti)

        // A doji or a halted bar makes this 0/0, which is unavailable in Pine
        // and so fails the filter rather than passing it.
        const bodyRatio = Number.isFinite(barRange) && barRange > 0 ? Math.abs(close[i] - open[i]) / barRange : NaN
        const bodyOk = !bodyFilterOn || (Number.isFinite(bodyRatio) && bodyRatio >= bodyPercent)

        const prevRange = i > 0 ? high[i - 1] - low[i - 1] : NaN
        const bodySizeOk =
          !bodySizeFilterOn ||
          (Number.isFinite(bodyRatio) &&
            bodyRatio >= bodyPercent &&
            Number.isFinite(prevRange) &&
            Number.isFinite(barRange) &&
            barRange >= prevRange * bodySizeMultiplier)

        const volumeOk = !volumeFilterOn || (Number.isFinite(volSma[i]) && volume[i] > volSma[i])

        const relVolLimit = Number.isFinite(relVolSma[i]) ? relVolSma[i] * relVolMulti : NaN
        const relVolOk =
          !relVolFilterOn || (Number.isFinite(relVol[i]) && Number.isFinite(relVolLimit) && relVol[i] > relVolLimit)

        let timeOk = true
        if (timeFilterOn) {
          // Pine's `hour` and `minute` are exchange wall clock, never the
          // viewer's, so the chart's zone decides this and not the browser.
          const parts = utcSecondsToZonedParts(bars[i].time, zone)
          const hour = parts.hour
          const minute = parts.minute
          timeOk =
            (hour > hourFrom || (hour === hourFrom && minute >= minuteFrom)) &&
            (hour < hourTo || (hour === hourTo && minute < minuteTo))
        }

        // Supertrend, blanked on the first bar exactly as the source does.
        const stValue = i === 0 ? NaN : st[i].value
        const stPrev = i > 0 ? (i - 1 === 0 ? NaN : st[i - 1].value) : NaN
        if (Number.isFinite(stValue)) {
          if (st[i].direction < 0) stUp[i] = stValue
          else stDown[i] = stValue
        }
        if (i > 0) bodyMid[i] = (open[i] + close[i]) / 2

        atrOut[i] = showAtr ? atrSeries[i] : NaN
        atrSmaOut[i] = showAtr ? atrSmaSeries[i] : NaN

        // ta.crossunder / ta.crossover, both operands guarded on both bars.
        const crossable =
          i > 0 &&
          Number.isFinite(stValue) &&
          Number.isFinite(stPrev) &&
          Number.isFinite(close[i]) &&
          Number.isFinite(close[i - 1])
        const shortCont = crossable && close[i] < stValue && close[i - 1] >= stPrev && confirmed
        const longCont = crossable && close[i] > stValue && close[i - 1] <= stPrev && confirmed
        crossCol[i] = shortCont ? -1 : longCont ? 1 : 0

        // Volatility range, carried forward until the next cross replaces it.
        const rangeSource =
          rangeType === 'Type Points'
            ? rangePoints
            : Number.isFinite(atrSeries[i])
              ? atrSeries[i] * rangeAtrMultiplier
              : NaN
        if (shortCont) {
          bottomPrice = close[i] - rangeSource
          topPrice = NaN
        }
        if (longCont) {
          topPrice = close[i] + rangeSource
          bottomPrice = NaN
        }

        // Condition 2: price leaves the box while volatility is expanding.
        const atrRising =
          Number.isFinite(atrSeries[i]) && Number.isFinite(atrSmaSeries[i]) && atrSeries[i] > atrSmaSeries[i]

        const shortBreak =
          Number.isFinite(bottomPrice) &&
          close[i] < bottomPrice &&
          open[i] > close[i] &&
          atrRising &&
          pchgBelowOk &&
          volPchgOk &&
          atrOk &&
          bodyOk &&
          bodySizeOk &&
          volumeOk &&
          relVolOk &&
          timeOk &&
          confirmed

        const longBreak =
          Number.isFinite(topPrice) &&
          close[i] > topPrice &&
          open[i] < close[i] &&
          atrRising &&
          pchgAboveOk &&
          volPchgOk &&
          atrOk &&
          bodyOk &&
          bodySizeOk &&
          volumeOk &&
          relVolOk &&
          timeOk &&
          confirmed

        // Two one-shot state machines: 0 idle, 1 armed by a cross, 2 fired, and
        // 2 falls back to 0 on the next bar so a signal lasts exactly one bar.
        const prevShort = shortState
        shortState = prevShort === 2 ? 0 : prevShort
        if (shortCont && shortState === 0) shortState = 1
        if (shortBreak && shortState === 1) shortState = 2

        const prevLong = longState
        longState = prevLong === 2 ? 0 : prevLong
        if (longCont && longState === 0) longState = 1
        if (longBreak && longState === 1) longState = 2

        signalCol[i] = longState === 2 ? 1 : shortState === 2 ? -1 : 0

        // The range plots carry offset=-1, so this bar's level is written onto
        // the previous bar, and only once it has survived a bar unchanged.
        if (showRange && i > 0) {
          if (Number.isFinite(topPrice) && topPrice === topRangeState) topRange[i - 1] = topPrice
          if (Number.isFinite(bottomPrice) && bottomPrice === bottomRangeState) bottomRange[i - 1] = bottomPrice
        }
        topRangeState = topPrice
        bottomRangeState = bottomPrice
      }

      return {
        stUp: nulls(stUp),
        stDown: nulls(stDown),
        bodyMid: nulls(bodyMid),
        topRange: nulls(topRange),
        bottomRange: nulls(bottomRange),
        atr: nulls(atrOut),
        atrSma: nulls(atrSmaOut),
        signal: signalCol,
        cross: crossCol,
        cumPchg: nulls(cumPchgCol),
        cumVolPchg: nulls(cumVolPchgCol),
        cumVol: nulls(cumVolCol),
        prevCumVol: nulls(prevCumVolCol),
      }
    },

    // plotshape(..., location.belowbar / location.abovebar). On an overlay
    // aboveBar and belowBar anchor to this indicator's own line, so the
    // triangles are placed at an explicit price scaled to the instrument.
    markers({ bars, values }) {
      const n = bars.length
      if (n === 0) return []
      const signal = values.signal
      if (!signal) return []

      let sum = 0
      let count = 0
      for (let i = 0; i < n; i++) {
        const r = bars[i].high - bars[i].low
        if (Number.isFinite(r)) {
          sum += r
          count += 1
        }
      }
      const meanRange = count > 0 ? sum / count : 0
      const lastClose = bars[n - 1].close
      let pad = Math.max(meanRange * 0.5, (Number.isFinite(lastClose) ? Math.abs(lastClose) : 0) * 0.0005)
      if (!Number.isFinite(pad) || pad < 0) pad = 0

      const out = []
      for (let i = 0; i < n; i++) {
        const s = signal[i]
        if (s === 1 && Number.isFinite(bars[i].low)) {
          out.push({
            time: bars[i].time,
            position: 'atPrice',
            price: bars[i].low - pad,
            shape: 'triangleUp',
            size: 'tiny',
            color: POS_LIGHT,
          })
        } else if (s === -1 && Number.isFinite(bars[i].high)) {
          out.push({
            time: bars[i].time,
            position: 'atPrice',
            price: bars[i].high + pad,
            shape: 'triangleDown',
            size: 'tiny',
            color: NEG_LIGHT,
          })
        }
      }
      return out
    },

    // Two barcolor() layers in the source: the Supertrend cross candle, then the
    // signal candle, which is declared last and so wins where both apply.
    barColors({ bars, values }) {
      const n = bars.length
      const out = new Array(n).fill(null)
      const signal = values.signal
      const cross = values.cross
      for (let i = 0; i < n; i++) {
        const s = signal ? signal[i] : 0
        const x = cross ? cross[i] : 0
        if (s === -1) out[i] = NEG_LIGHT
        else if (s === 1) out[i] = POS_LIGHT
        else if (x === -1) out[i] = NEG_LIGHT
        else if (x === 1) out[i] = POS_LIGHT
      }
      return out
    },

    table({ bars, values, settings }) {
      if (settings.showDataTable === false || bars.length === 0) return null
      const i = bars.length - 1
      const read = (key) => {
        const v = values[key] ? values[key][i] : null
        return Number.isFinite(v) ? v : null
      }

      const cumPchg = read('cumPchg')
      const cumVolPchg = read('cumVolPchg')
      const cumVol = read('cumVol')
      const prevCumVol = read('prevCumVol')

      const pchgColor = cumPchg !== null && cumPchg > 0 ? POS : NEG
      const volPchgColor = cumVolPchg !== null && cumVolPchg > 0 ? POS : NEG
      const prevVolColor = prevCumVol !== null && cumVol !== null && prevCumVol < cumVol ? NEG : POS

      // The source reports volume in lakhs.
      const lakh = (v) => (v === null ? '-' : `${fmt2(v / 100000)} L`)
      const pct = (v) => (v === null ? '-' : `${fmt2(v)} %`)

      const label = (text, bg) => ({ text, textColor: NEU, bgColor: bg, align: 'left' })
      const value = (text, color, bg) => ({ text, textColor: color, bgColor: bg, align: 'right' })

      const fontSize = FONT_PX[String(settings.tableSize || 'normal')] ?? FONT_PX.normal

      return {
        rows: [
          [label('%Chg', NEU_DARK), value(pct(cumPchg), pchgColor, NEU_DARK)],
          [label('Vol %Chg', NEU_MID), value(pct(cumVolPchg), volPchgColor, NEU_MID)],
          [label('Vol', NEU_DARK), value(lakh(cumVol), volPchgColor, NEU_DARK)],
          [label('PD Vol', NEU_MID), value(lakh(prevCumVol), prevVolColor, NEU_MID)],
        ],
        options: {
          position: String(settings.tablePosition || 'bottom-right'),
          fontSize,
          borderColor: POS_DARK,
          borderWidth: 1,
          cellWidth: [90, 90],
          cellHeight: Math.round(fontSize * 1.8),
        },
      }
    },
  })
}
