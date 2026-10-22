/**
 * Momentum Setup: Vijay Thakare Option Buying Scalping Setup - ported to
 * openalgo-charts from Pine Script (the source carries //@version=5).
 *
 * Source: https://github.com/ArunKBhaskar/PineScript/blob/c6821225c466494b01eee08f9dd88bf84d2b24ba/Momentum Setup - Vijay Thakare Option Buying Scalping Setup/Momentum Setup - Vijay Thakare Option Buying Scalping Setup.txt
 * Repo:   ArunKBhaskar/PineScript
 * License: MPL-2.0 (c) Arun_K_Bhaskar
 * SPDX-FileCopyrightText: (c) Arun_K_Bhaskar
 * SPDX-FileCopyrightText: (c) 2026 marketcalls (port to openalgo-charts)
 * SPDX-License-Identifier: MPL-2.0
 *
 * A directional scalping setup: EMA 20/50/100/200, an anchored VWAP (or TWAP
 * where the symbol carries no volume), Supertrend, MACD 3/9/15 and Stochastic
 * 5/3/3 have to agree on one side, and the signal fires on the retracement that
 * follows the opposite MACD reading. Stochastic, MACD and volume are also drawn
 * as miniature panels over the price pane, as the source does.
 *
 * Deviations from the source, none of them silent:
 * - The seven colour inputs are constants here, because the chart generates its
 *   own colour, width and style controls for every plot.
 * - The screener inputs (symbol list, direction, table rows, position, size)
 *   have no body left in the source, and a scan of other symbols is not a chart
 *   study in any case. Only the Continuous / Flip choice, which does drive the
 *   signals, is kept.
 * - The panel captions are anchored to the last bar rather than three bars past
 *   it, and their Pine tooltips have no equivalent on a drawing label.
 * - `bodyMiddle` and the two Supertrend fills are `display.none` in the source,
 *   so nothing here draws them.
 */

// The Chart Settings colours from the source, as constants.
const POS = '#26A69A'
const POS_LIGHT = '#ACE5DC'
const NEU = '#D1D4DC'
const NEG_LIGHT = '#FCCBCD'
const NEG = '#FF5252'
const INDICATOR = '#2962FF'
const SIGNAL = '#FF6D00'
// Pine reads chart.fg_color for the panel captions, which follows the theme and
// is not readable from an indicator. A mid grey carries on both themes.
const FG = '#787B86'
const TRANSPARENT = '#00000000'

const CONTINUOUS = 'Continuous Signals'
const FLIP = 'Flip Signals'
const BUY_SELL_VOLUME = 'Buying/Selling Volume'

export default function ({
  registerIndicator,
  sourceValues,
  sma,
  smaSeededEma,
  stoch,
  atr,
  supertrend,
  nulls,
  clamp,
  withAlpha,
  calendarPeriodFlags,
  isNewZonedPeriod,
  zonedDayIndex,
  zonedWeekIndex,
  startOfZonedDay,
  utcSecondsToZonedParts,
  isValidTimezone,
  DEFAULT_TIMEZONE,
}) {
  /* ── input coercion ─────────────────────────────────────────────────────
   * A cleared field arrives as '', and Number('') is 0, so `Number(x) || d`
   * would turn a legitimate 0 (an hour, a body percent) into the default.
   */
  const numberOr = (v, fallback) => {
    if (v === '' || v === null || v === undefined) return fallback
    const n = Number(v)
    return Number.isFinite(n) ? n : fallback
  }
  const intIn = (v, fallback, min, max) => clamp(Math.floor(numberOr(v, fallback)), min, max)
  const floatIn = (v, fallback, min, max) => clamp(numberOr(v, fallback), min, max)

  const read = (settings) => ({
    signalMode: settings.signalMode === FLIP ? FLIP : CONTINUOUS,

    stAtrPeriod: intIn(settings.stAtrPeriod, 10, 1, 5000),
    stFactor: floatIn(settings.stFactor, 3, 0.01, 1000),

    maDisplay: settings.maDisplay !== false,
    maLen1: intIn(settings.maLen1, 20, 1, 5000),
    maLen2: intIn(settings.maLen2, 50, 1, 5000),
    maLen3: intIn(settings.maLen3, 100, 1, 5000),
    maLen4: intIn(settings.maLen4, 200, 1, 5000),

    vtwapDisplay: settings.vtwapDisplay !== false,
    vtwapChoice: settings.vtwapChoice === 'TWAP' ? 'TWAP' : 'VWAP',
    vtwapTimeframe: String(settings.vtwapTimeframe ?? '').trim() || '1D',

    macdDisplay: settings.macdDisplay !== false,
    macdFast: intIn(settings.macdFast, 3, 1, 5000),
    macdSlow: intIn(settings.macdSlow, 9, 1, 5000),
    macdSignal: intIn(settings.macdSignal, 15, 1, 5000),
    macdVOffset: floatIn(settings.macdVOffset, 0.5, -100, 100),
    macdHeight: floatIn(settings.macdHeight, 0.7, 0, 100),

    stocDisplay: settings.stocDisplay !== false,
    stocKLen: intIn(settings.stocKLen, 5, 1, 5000),
    stocKSmooth: intIn(settings.stocKSmooth, 3, 1, 5000),
    stocDSmooth: intIn(settings.stocDSmooth, 3, 1, 5000),
    stocOverBought: intIn(settings.stocOverBought, 60, 1, 100),
    stocOverSold: intIn(settings.stocOverSold, 40, 1, 100),
    stocVOffset: floatIn(settings.stocVOffset, 1.8, -100, 100),
    stocHeight: floatIn(settings.stocHeight, 0.6, 0, 100),

    volDisplay: settings.volDisplay !== false,
    volType:
      settings.volType === BUY_SELL_VOLUME || settings.volType === 'None'
        ? settings.volType
        : 'Regular Volume',
    volVOffset: floatIn(settings.volVOffset, 0.5, -100, 100),
    volHeight: floatIn(settings.volHeight, 0.6, 0, 100),

    atrFilter: settings.atrFilter === true,
    atrLength: intIn(settings.atrLength, 14, 1, 5000),
    atrMulti: floatIn(settings.atrMulti, 1, 1, 1000),

    bodyFilter: settings.bodyFilter === true,
    // Pine divides this input by 100 on the input line itself.
    bodyPercent: floatIn(settings.bodyPercent, 80, 0, 100) / 100,

    bodySizeFilter: settings.bodySizeFilter === true,
    bodySizeMultiplier: intIn(settings.bodySizeMultiplier, 2, 0, 1000),

    volumeFilter: settings.volumeFilter === true,
    volSmaLength: intIn(settings.volSmaLength, 20, 1, 5000),

    relVolFilter: settings.relVolFilter === true,
    relVolLen: intIn(settings.relVolLen, 90, 2, 5000),
    relVolMulti: floatIn(settings.relVolMulti, 2, 0, 1000),

    timeFilter: settings.timeFilter === true,
    hourFrom: intIn(settings.hourFrom, 9, 0, 23),
    minuteFrom: intIn(settings.minuteFrom, 15, 0, 59),
    hourTo: intIn(settings.hourTo, 10, 0, 23),
    minuteTo: intIn(settings.minuteTo, 15, 0, 59),

    displayLen: intIn(settings.displayLen, 50, 1, 5000),
  })

  /* ── series helpers ───────────────────────────────────────────────────── */

  // Pine's ta.ema seeds from the SMA of the first `period` values, which is what
  // smaSeededEma does, but that helper poisons on a leading NaN. The MACD signal
  // line is an EMA of a series that is NaN through its own warmup, and Pine
  // starts counting from the first real value, so start there too.
  const emaFromFirstFinite = (values, period) => {
    const out = new Array(values.length).fill(NaN)
    let first = 0
    while (first < values.length && !Number.isFinite(values[first])) first += 1
    if (first >= values.length) return out
    const tail = smaSeededEma(values.slice(first), period)
    for (let i = 0; i < tail.length; i++) out[first + i] = tail[i]
    return out
  }

  // Highest and lowest over an inclusive index window, finite values only.
  const winExtreme = (values, lo, hi, better) => {
    let best = NaN
    for (let i = lo; i <= hi; i++) {
      const v = values[i]
      if (!Number.isFinite(v)) continue
      if (!Number.isFinite(best) || better(v, best)) best = v
    }
    return best
  }
  const winMax = (values, lo, hi) => winExtreme(values, lo, hi, (a, b) => a > b)
  const winMin = (values, lo, hi) => winExtreme(values, lo, hi, (a, b) => a < b)

  /* ── the VWAP / TWAP anchor ───────────────────────────────────────────────
   * Pine anchors on timeframe.change(tf). There is no timeframe input type
   * here, so the string is parsed: '1D' or 'D' by day, '1W' or 'W' by week,
   * '1M' by month, '3M' by quarter, '12M' or '1Y' by year, a bare number as
   * that many minutes and '15S' as seconds, bucketed inside the trading day.
   * A multi-day or multi-week anchor buckets the day or week index.
   */
  const parseAnchorSpec = (spec) => {
    const text = String(spec ?? '').trim().toUpperCase()
    if (text === '') return { kind: 'period', period: 'day', mult: 1 }
    const m = /^(\d*\.?\d*)\s*([SDWMY]?)$/.exec(text)
    if (!m) return { kind: 'period', period: 'day', mult: 1 }
    const mult = Math.max(1, Math.floor(Number(m[1]) || 1))
    const unit = m[2]
    if (unit === 'D') return { kind: 'period', period: 'day', mult }
    if (unit === 'W') return { kind: 'period', period: 'week', mult }
    if (unit === 'Y') return { kind: 'period', period: 'year', mult: 1 }
    if (unit === 'M') {
      if (mult === 3) return { kind: 'period', period: 'quarter', mult: 1 }
      if (mult === 12) return { kind: 'period', period: 'year', mult: 1 }
      return { kind: 'period', period: 'month', mult: 1 }
    }
    if (unit === 'S') return { kind: 'intraday', seconds: mult }
    return { kind: 'intraday', seconds: mult * 60 }
  }

  const anchorFlags = (bars, spec, zone) => {
    const flags = new Array(bars.length).fill(false)
    if (bars.length === 0) return flags
    const times = bars.map((b) => b.time)
    const parsed = parseAnchorSpec(spec)

    if (parsed.kind === 'intraday') {
      const seconds = Math.max(1, parsed.seconds)
      let prevKey = null
      for (let i = 0; i < bars.length; i++) {
        const t = times[i]
        const dayStart = startOfZonedDay(t, zone)
        const key = `${dayStart}|${Math.floor((t - dayStart) / seconds)}`
        if (prevKey !== null && key !== prevKey) flags[i] = true
        prevKey = key
      }
      return flags
    }

    if (parsed.mult > 1 && (parsed.period === 'day' || parsed.period === 'week')) {
      const index = parsed.period === 'day' ? zonedDayIndex : zonedWeekIndex
      let prevBucket = null
      for (let i = 0; i < bars.length; i++) {
        const bucket = Math.floor(index(times[i], zone) / parsed.mult)
        if (prevBucket !== null && bucket !== prevBucket) flags[i] = true
        prevBucket = bucket
      }
      return flags
    }

    // calendarPeriodFlags tests the boundary at session starts where the bars
    // are intraday, so a session straddling midnight is not cut in half.
    const raw = calendarPeriodFlags(times, (prev, now) =>
      isNewZonedPeriod(prev, now, parsed.period, zone)
    )
    for (let i = 0; i < bars.length; i++) flags[i] = raw[i] === true
    return flags
  }

  const zoneOf = (ctx) => {
    const zone = ctx?.timezone
    return typeof zone === 'string' && isValidTimezone(zone) ? zone : DEFAULT_TIMEZONE
  }

  // A run of finite points becomes one polyline; a gap breaks it, the way a
  // per-segment line.new leaves nothing where a value is na.
  const pushRuns = (out, points, color, lineWidth) => {
    let run = []
    const flush = () => {
      if (run.length >= 2) out.push({ kind: 'polyline', points: run, color, lineWidth })
      run = []
    }
    for (const p of points) {
      if (p === null) flush()
      else run.push(p)
    }
    flush()
  }

  registerIndicator({
    id: 'oa-momentum-setup---vijay-thakare-option-buying-scalping-setup',
    name: 'Momentum Setup: Vijay Thakare Option Buying Scalping Setup',
    category: 'ICT',
    placement: 'onchart',

    inputs: [
      {
        key: 'signalMode',
        type: 'select',
        label: 'Screening Method',
        default: CONTINUOUS,
        options: [
          { label: 'Continuous Signals', value: CONTINUOUS },
          { label: 'Flip Signals', value: FLIP },
        ],
        tooltip:
          'Continuous repeats the signal while the setup holds; Flip marks only the bar the side changes on.',
        group: 'Screener',
      },

      { key: 'stAtrPeriod', type: 'number', label: 'ATR Length', default: 10, min: 1, max: 5000, step: 1, group: 'Supertrend' },
      { key: 'stFactor', type: 'number', label: 'Factor', default: 3, min: 0.01, max: 1000, step: 0.01, group: 'Supertrend' },

      { key: 'maDisplay', type: 'boolean', label: 'Display', default: true, group: 'Exponential Moving Average (EMA)' },
      { key: 'maLen1', type: 'number', label: 'Length 1', default: 20, min: 1, max: 5000, step: 1, group: 'Exponential Moving Average (EMA)' },
      { key: 'maLen2', type: 'number', label: 'Length 2', default: 50, min: 1, max: 5000, step: 1, group: 'Exponential Moving Average (EMA)' },
      { key: 'maLen3', type: 'number', label: 'Length 3', default: 100, min: 1, max: 5000, step: 1, group: 'Exponential Moving Average (EMA)' },
      { key: 'maLen4', type: 'number', label: 'Length 4', default: 200, min: 1, max: 5000, step: 1, group: 'Exponential Moving Average (EMA)' },

      { key: 'vtwapDisplay', type: 'boolean', label: 'Display', default: true, group: 'VWAP / TWAP' },
      {
        key: 'vtwapChoice',
        type: 'select',
        label: 'Choose',
        default: 'VWAP',
        options: [
          { label: 'VWAP', value: 'VWAP' },
          { label: 'TWAP', value: 'TWAP' },
        ],
        tooltip: 'Choose TWAP if Volume is not available for the Symbol.',
        group: 'VWAP / TWAP',
      },
      {
        key: 'vtwapTimeframe',
        type: 'text',
        label: 'Timeframe',
        default: '1D',
        tooltip: 'Anchor period: 1D, 1W, 1M, 3M, 12M, or a bare number of minutes such as 60.',
        group: 'VWAP / TWAP',
      },

      { key: 'macdDisplay', type: 'boolean', label: 'Display', default: true, group: 'MACD' },
      { key: 'macdFast', type: 'number', label: 'Fast Length', default: 3, min: 1, max: 5000, step: 1, group: 'MACD' },
      { key: 'macdSlow', type: 'number', label: 'Slow Length', default: 9, min: 1, max: 5000, step: 1, group: 'MACD' },
      { key: 'macdSignal', type: 'number', label: 'Signal Smoothing', default: 15, min: 1, max: 5000, step: 1, group: 'MACD' },
      { key: 'macdVOffset', type: 'number', label: 'Vertical Offset', default: 0.5, min: -100, max: 100, step: 0.1, tooltip: 'Where the drawn MACD panel sits below the price range.', group: 'MACD' },
      { key: 'macdHeight', type: 'number', label: 'Height', default: 0.7, min: 0, max: 100, step: 0.1, group: 'MACD' },

      { key: 'stocDisplay', type: 'boolean', label: 'Display', default: true, group: 'Stochastic' },
      { key: 'stocKLen', type: 'number', label: '%K Length', default: 5, min: 1, max: 5000, step: 1, group: 'Stochastic' },
      { key: 'stocKSmooth', type: 'number', label: '%K Smoothing', default: 3, min: 1, max: 5000, step: 1, group: 'Stochastic' },
      { key: 'stocDSmooth', type: 'number', label: '%D Smoothing', default: 3, min: 1, max: 5000, step: 1, group: 'Stochastic' },
      { key: 'stocOverBought', type: 'number', label: 'Over Bought', default: 60, min: 1, max: 100, step: 1, group: 'Stochastic' },
      { key: 'stocOverSold', type: 'number', label: 'Over Sold', default: 40, min: 1, max: 100, step: 1, group: 'Stochastic' },
      { key: 'stocVOffset', type: 'number', label: 'Vertical Offset', default: 1.8, min: -100, max: 100, step: 0.1, tooltip: 'Where the drawn Stochastic panel sits below the price range.', group: 'Stochastic' },
      { key: 'stocHeight', type: 'number', label: 'Height', default: 0.6, min: 0, max: 100, step: 0.1, group: 'Stochastic' },

      { key: 'volDisplay', type: 'boolean', label: 'Display Volume MA', default: true, group: 'Volume' },
      {
        key: 'volType',
        type: 'select',
        label: 'Type',
        default: 'Regular Volume',
        options: [
          { label: 'Buying/Selling Volume', value: BUY_SELL_VOLUME },
          { label: 'Regular Volume', value: 'Regular Volume' },
          { label: 'None', value: 'None' },
        ],
        group: 'Volume',
      },
      { key: 'volVOffset', type: 'number', label: 'Vertical Offset', default: 0.5, min: -100, max: 100, step: 0.1, tooltip: 'Where the drawn volume panel sits above the price range.', group: 'Volume' },
      { key: 'volHeight', type: 'number', label: 'Height', default: 0.6, min: 0, max: 100, step: 0.1, group: 'Volume' },

      { key: 'atrFilter', type: 'boolean', label: 'Apply ATR Filter', default: false, tooltip: 'ATR helps filter out longer or more volatile signal candles.', group: 'Additional Filters' },
      { key: 'atrLength', type: 'number', label: 'ATR Length', default: 14, min: 1, max: 5000, step: 1, group: 'Additional Filters' },
      { key: 'atrMulti', type: 'number', label: 'ATR Multiplier', default: 1, min: 1, max: 1000, step: 1, tooltip: 'A higher multiplier filters out a longer or more volatile signal candle.', group: 'Additional Filters' },
      { key: 'bodyFilter', type: 'boolean', label: 'Apply Body % Filter', default: false, tooltip: "If the input is 80, the body has to cover over 80% of the candle.", group: 'Additional Filters' },
      { key: 'bodyPercent', type: 'number', label: 'Body % Above', default: 80, min: 0, max: 100, step: 1, group: 'Additional Filters' },
      { key: 'bodySizeFilter', type: 'boolean', label: 'Apply Body Size Filter', default: false, tooltip: '2 means the candle is 2 times larger than the previous candle.', group: 'Additional Filters' },
      { key: 'bodySizeMultiplier', type: 'number', label: 'Body Size Multiplier (x)', default: 2, min: 0, max: 1000, step: 1, group: 'Additional Filters' },
      { key: 'volumeFilter', type: 'boolean', label: 'Apply Volume Filter', default: false, tooltip: 'Keep a candle only when its volume is greater than the SMA of the volume.', group: 'Additional Filters' },
      { key: 'volSmaLength', type: 'number', label: 'Volume SMA Length', default: 20, min: 1, max: 5000, step: 1, group: 'Additional Filters' },
      { key: 'relVolFilter', type: 'boolean', label: 'Apply Relative Volume Filter', default: false, tooltip: 'Keep a candle only when its relative volume is greater than its own average.', group: 'Additional Filters' },
      { key: 'relVolLen', type: 'number', label: 'Relative Volume Length', default: 90, min: 2, max: 5000, step: 1, group: 'Additional Filters' },
      { key: 'relVolMulti', type: 'number', label: 'Rel Vol SMA Multiplier', default: 2, min: 0, max: 1000, step: 1, group: 'Additional Filters' },
      { key: 'timeFilter', type: 'boolean', label: 'Apply Time Filter', default: false, tooltip: 'Drop signals outside the given exchange-time window.', group: 'Additional Filters' },
      { key: 'hourFrom', type: 'number', label: 'Time From (hour)', default: 9, min: 0, max: 23, step: 1, group: 'Additional Filters' },
      { key: 'minuteFrom', type: 'number', label: 'Time From (minute)', default: 15, min: 0, max: 59, step: 1, group: 'Additional Filters' },
      { key: 'hourTo', type: 'number', label: 'Time To (hour)', default: 10, min: 0, max: 23, step: 1, group: 'Additional Filters' },
      { key: 'minuteTo', type: 'number', label: 'Time To (minute)', default: 15, min: 0, max: 59, step: 1, group: 'Additional Filters' },

      { key: 'displayLen', type: 'number', label: 'Display Length', default: 50, min: 1, max: 5000, step: 1, tooltip: 'How many recent bars the drawn panels and the signal shading cover.', group: 'Chart Settings' },
    ],

    plots: [
      { key: 'ema1', type: 'line', title: 'EMA 1', style: { color: POS, lineWidth: 1 } },
      { key: 'ema2', type: 'line', title: 'EMA 2', style: { color: INDICATOR, lineWidth: 1 } },
      { key: 'ema3', type: 'line', title: 'EMA 3', style: { color: SIGNAL, lineWidth: 1 } },
      { key: 'ema4', type: 'line', title: 'EMA 4', style: { color: NEG, lineWidth: 1 } },
      { key: 'vwap', type: 'line', title: 'VWAP/TWAP', style: { color: NEU, lineWidth: 2 } },
      { key: 'stUp', type: 'line', title: 'Supertrend Up', style: { color: POS, lineWidth: 2 } },
      { key: 'stDown', type: 'line', title: 'Supertrend Down', style: { color: NEG, lineWidth: 2 } },
    ],

    calc(bars, settings, store, ctx) {
      const s = read(settings)
      const n = bars.length
      const zone = zoneOf(ctx)

      const blank = () => new Array(n).fill(NaN)
      const out = {
        ema1: blank(), ema2: blank(), ema3: blank(), ema4: blank(),
        vwap: blank(), stUp: blank(), stDown: blank(),
        stocK: blank(), stocD: blank(),
        macd: blank(), signal: blank(), hist: blank(), volMa: blank(),
        shortTrigger: blank(), longTrigger: blank(),
        longEntry: blank(), shortEntry: blank(),
      }
      if (n === 0) return out

      const open = bars.map((b) => b.open)
      const high = bars.map((b) => b.high)
      const low = bars.map((b) => b.low)
      const close = bars.map((b) => b.close)
      // Pine's `volume` is na where the feed carries none, and nz(volume) is
      // what the drawn panel uses, so both forms are kept.
      const volume = bars.map((b) => (Number.isFinite(b.volume) ? b.volume : NaN))
      const nzVolume = volume.map((v) => (Number.isFinite(v) ? v : 0))
      const hlc3 = sourceValues(bars, 'hlc3')
      const ohlc4 = sourceValues(bars, 'ohlc4')

      /* 1. EMA 20, 50, 100, 200 */
      const ema1 = smaSeededEma(close, s.maLen1)
      const ema2 = smaSeededEma(close, s.maLen2)
      const ema3 = smaSeededEma(close, s.maLen3)
      const ema4 = smaSeededEma(close, s.maLen4)
      if (s.maDisplay) {
        for (let i = 0; i < n; i++) {
          out.ema1[i] = ema1[i]
          out.ema2[i] = ema2[i]
          out.ema3[i] = ema3[i]
          out.ema4[i] = ema4[i]
        }
      }

      /* 2. VWAP / TWAP, anchored on the chosen timeframe */
      const anchors = anchorFlags(bars, s.vtwapTimeframe, zone)
      const vwapLine = blank()
      const twapLine = blank()
      let sumPV = 0
      let sumV = 0
      let sumP = 0
      let count = 0
      for (let i = 0; i < n; i++) {
        if (i === 0 || anchors[i]) {
          sumPV = 0
          sumV = 0
          sumP = 0
          count = 0
        }
        // A missing volume poisons the running sums exactly as na does in Pine,
        // which is why the source offers TWAP for symbols without volume.
        sumPV += hlc3[i] * volume[i]
        sumV += volume[i]
        vwapLine[i] = sumV > 0 ? sumPV / sumV : NaN
        sumP += ohlc4[i]
        count += 1
        twapLine[i] = count > 0 ? sumP / count : NaN
      }
      const vtwap = s.vtwapChoice === 'VWAP' ? vwapLine : twapLine
      if (s.vtwapDisplay) for (let i = 0; i < n; i++) out.vwap[i] = vtwap[i]

      /* 3. MACD */
      const macdFast = smaSeededEma(close, s.macdFast)
      const macdSlow = smaSeededEma(close, s.macdSlow)
      const macdLine = blank()
      for (let i = 0; i < n; i++) {
        if (Number.isFinite(macdFast[i]) && Number.isFinite(macdSlow[i])) {
          macdLine[i] = macdFast[i] - macdSlow[i]
        }
      }
      const signalLine = emaFromFirstFinite(macdLine, s.macdSignal)
      const histLine = blank()
      for (let i = 0; i < n; i++) {
        if (Number.isFinite(macdLine[i]) && Number.isFinite(signalLine[i])) {
          histLine[i] = macdLine[i] - signalLine[i]
        }
      }

      /* 4. Stochastic */
      const stocK = sma(stoch(close, high, low, s.stocKLen), s.stocKSmooth)
      const stocD = sma(stocK, s.stocDSmooth)

      /* 5. Volume SMA. The drawn panel uses nz(volume), the filter uses volume. */
      const volSma = sma(volume, s.volSmaLength)
      const volMa = sma(nzVolume, s.volSmaLength)

      /* 6. Supertrend. The helper takes (bars, atrPeriod, factor). */
      const st = supertrend(bars, s.stAtrPeriod, s.stFactor)
      const stValue = blank()
      for (let i = 1; i < n; i++) {
        // Pine blanks the value on the first bar outright.
        const v = st[i] ? st[i].value : NaN
        if (Number.isFinite(v)) stValue[i] = v
      }
      for (let i = 0; i < n; i++) {
        if (!Number.isFinite(stValue[i])) continue
        if (st[i].direction < 0) out.stUp[i] = stValue[i]
        else out.stDown[i] = stValue[i]
      }

      /* Additional filters */
      const atrSeries = atr(high, low, close, s.atrLength)
      const avgVolume = sma(volume, s.relVolLen)
      const relativeVolume = blank()
      for (let i = 1; i < n; i++) {
        const prevAvg = avgVolume[i - 1]
        if (Number.isFinite(volume[i]) && Number.isFinite(prevAvg) && prevAvg > 0) {
          relativeVolume[i] = volume[i] / prevAvg
        }
      }
      const relVolSma = sma(relativeVolume, s.relVolLen)

      const lastIndex = n - 1
      const lastConfirmed = ctx?.barState?.isConfirmed !== false

      /* Signals. Every comparison is guarded: in Pine a test against na is
       * false, while in JavaScript `5 > null` is true. */
      let bearState = 0
      let bullState = 0
      let prevFlip = NaN
      for (let i = 0; i < n; i++) {
        const macd = macdLine[i]
        const sig = signalLine[i]
        const hist = histLine[i]
        const k = stocK[i]
        const d = stocD[i]
        const stv = stValue[i]
        const anchorVal = vtwap[i]
        const c = close[i]
        const range = high[i] - low[i]

        const coreFinite =
          Number.isFinite(macd) && Number.isFinite(sig) && Number.isFinite(hist) &&
          Number.isFinite(k) && Number.isFinite(d) && Number.isFinite(stv) &&
          Number.isFinite(anchorVal) && Number.isFinite(c)

        // ATR filter
        let atrOk = true
        if (s.atrFilter) {
          atrOk =
            Number.isFinite(atrSeries[i]) && Number.isFinite(range) &&
            range > atrSeries[i] * s.atrMulti
        }
        // Body percent filter
        const bodyRatio = range > 0 ? Math.abs(c - open[i]) / range : NaN
        let bodyOk = true
        if (s.bodyFilter) bodyOk = Number.isFinite(bodyRatio) && bodyRatio >= s.bodyPercent
        // Body size filter. The source reuses the body percent here even when
        // the body percent filter itself is switched off.
        let bodySizeOk = true
        if (s.bodySizeFilter) {
          const prevRange = i > 0 ? high[i - 1] - low[i - 1] : NaN
          bodySizeOk =
            Number.isFinite(bodyRatio) && bodyRatio >= s.bodyPercent &&
            Number.isFinite(prevRange) && Number.isFinite(range) &&
            range >= prevRange * s.bodySizeMultiplier
        }
        // Volume SMA filter
        let volumeOk = true
        if (s.volumeFilter) {
          volumeOk =
            Number.isFinite(volume[i]) && Number.isFinite(volSma[i]) && volume[i] > volSma[i]
        }
        // Relative volume filter
        let relVolOk = true
        if (s.relVolFilter) {
          relVolOk =
            Number.isFinite(relativeVolume[i]) && Number.isFinite(relVolSma[i]) &&
            relativeVolume[i] > relVolSma[i] * s.relVolMulti
        }
        // Time filter, on exchange wall clock rather than the viewer's browser.
        let timeOk = true
        if (s.timeFilter) {
          const parts = utcSecondsToZonedParts(bars[i].time, zone)
          const hour = parts.hour
          const minute = parts.minute
          timeOk =
            (hour > s.hourFrom || (hour === s.hourFrom && minute >= s.minuteFrom)) &&
            (hour < s.hourTo || (hour === s.hourTo && minute < s.minuteTo))
        }

        const confirmed = i < lastIndex || lastConfirmed
        const filtersOk =
          atrOk && bodyOk && bodySizeOk && volumeOk && relVolOk && timeOk && confirmed

        const shortCond1 = coreFinite && macd > 0
        const longCond1 = coreFinite && macd < 0

        const shortCond2 =
          coreFinite && filtersOk &&
          c < stv && c < anchorVal && k < s.stocOverBought && k < d &&
          macd < 0 && macd < sig && macd < hist

        const longCond2 =
          coreFinite && filtersOk &&
          c > stv && c > anchorVal && k > s.stocOverSold && k > d &&
          macd > 0 && macd > sig && macd > hist

        // Continuous: a two-step state machine that re-arms after it fires.
        const bearPrev = bearState
        bearState = bearPrev === 2 ? 0 : bearPrev
        if (shortCond1 && bearState === 0) bearState = 1
        if (shortCond2 && bearState === 1) bearState = 2
        out.shortTrigger[i] = bearState === 2 ? 1 : 0

        const bullPrev = bullState
        bullState = bullPrev === 2 ? 0 : bullPrev
        if (longCond1 && bullState === 0) bullState = 1
        if (longCond2 && bullState === 1) bullState = 2
        out.longTrigger[i] = bullState === 2 ? 1 : 0

        // Flip: Pine's exrem. `entry_signal[1]` is na on the first bar and the
        // variable is never nz'd, so the first change of side compares against
        // na and does not count as an entry. Reproduced rather than corrected.
        const cur = longCond2 ? 1 : shortCond2 ? -1 : prevFlip
        const entry = Number.isFinite(cur) && Number.isFinite(prevFlip) && cur !== prevFlip
        out.longEntry[i] = entry && cur === 1 ? 1 : 0
        out.shortEntry[i] = entry && cur === -1 ? 1 : 0
        prevFlip = cur

        out.stocK[i] = k
        out.stocD[i] = d
        out.macd[i] = macd
        out.signal[i] = sig
        out.hist[i] = hist
        out.volMa[i] = volMa[i]
      }

      const cols = {}
      for (const key of Object.keys(out)) cols[key] = nulls(out[key])
      return cols
    },

    markers({ bars, values, settings }) {
      const n = bars.length
      if (n === 0) return []
      const s = read(settings)

      // aboveBar and belowBar anchor to this indicator's own line, so the
      // triangles go at an explicit price with a pad scaled to the instrument
      // rather than to a fixed number of points.
      let rangeSum = 0
      let rangeCount = 0
      for (let i = 0; i < n; i++) {
        const r = bars[i].high - bars[i].low
        if (Number.isFinite(r)) {
          rangeSum += r
          rangeCount += 1
        }
      }
      const meanRange = rangeCount > 0 ? rangeSum / rangeCount : 0
      const lastClose = bars[n - 1].close
      const pad = Math.max(
        meanRange * 0.5,
        Math.abs(Number.isFinite(lastClose) ? lastClose : 0) * 0.0005
      )

      const shortCol = s.signalMode === CONTINUOUS ? values.shortTrigger : values.shortEntry
      const longCol = s.signalMode === CONTINUOUS ? values.longTrigger : values.longEntry

      const out = []
      for (let i = 0; i < n; i++) {
        if (shortCol[i] === 1 && Number.isFinite(bars[i].high)) {
          out.push({
            time: bars[i].time,
            position: 'atPrice',
            price: bars[i].high + pad,
            shape: 'triangleDown',
            size: 'tiny',
            color: NEG_LIGHT,
          })
        }
        if (longCol[i] === 1 && Number.isFinite(bars[i].low)) {
          out.push({
            time: bars[i].time,
            position: 'atPrice',
            price: bars[i].low - pad,
            shape: 'triangleUp',
            size: 'tiny',
            color: POS_LIGHT,
          })
        }
      }
      return out
    },

    // Pine shades only the last i_display_len bars (show_last).
    background({ bars, values, settings }) {
      const s = read(settings)
      const out = new Array(bars.length).fill(null)
      const shortCol = s.signalMode === CONTINUOUS ? values.shortTrigger : values.shortEntry
      const longCol = s.signalMode === CONTINUOUS ? values.longTrigger : values.longEntry
      const from = Math.max(0, bars.length - s.displayLen)
      for (let i = from; i < bars.length; i++) {
        if (shortCol[i] === 1) out[i] = withAlpha(NEG_LIGHT, 0.1)
        else if (longCol[i] === 1) out[i] = withAlpha(POS_LIGHT, 0.1)
      }
      return out
    },

    // barcolor() carries no show_last, so it repaints every signal bar.
    barColors({ bars, values, settings }) {
      const s = read(settings)
      const out = new Array(bars.length).fill(null)
      const shortCol = s.signalMode === CONTINUOUS ? values.shortTrigger : values.shortEntry
      const longCol = s.signalMode === CONTINUOUS ? values.longTrigger : values.longEntry
      for (let i = 0; i < bars.length; i++) {
        if (shortCol[i] === 1) out[i] = NEG_LIGHT
        else if (longCol[i] === 1) out[i] = POS_LIGHT
      }
      return out
    },

    /* The miniature Stochastic, MACD and volume panels the source paints over
     * the price pane on the last bar. Every y is the source's own mapping of a
     * panel value onto the recent price range. */
    draws({ bars, values, settings }) {
      const n = bars.length
      if (n === 0) return []
      const s = read(settings)
      const last = n - 1
      const lo = Math.max(0, last - s.displayLen)
      const winLo = Math.max(0, last - s.displayLen + 1)

      const high = bars.map((b) => b.high)
      const low = bars.map((b) => b.low)
      const nzVolume = bars.map((b) => (Number.isFinite(b.volume) ? b.volume : 0))

      const priceHighest = winMax(high, winLo, last)
      const priceLowest = winMin(low, winLo, last)
      if (!Number.isFinite(priceHighest) || !Number.isFinite(priceLowest) || priceHighest === 0) {
        return []
      }
      const priceChangeRate = (priceHighest - priceLowest) / priceHighest
      const out = []
      const at = (i, price) => ({ time: bars[i].time, price })
      const caption = (i, price, text) =>
        out.push({ kind: 'label', at: at(i, price), text, color: TRANSPARENT, textColor: FG, align: 'left' })

      /* Stochastic panel. oscHighest is a literal 100 in the source. */
      const stocBase = priceLowest * (1 - priceChangeRate * s.stocVOffset)
      const yStoc = (v) => stocBase * (1 + (v / 100) * priceChangeRate * s.stocHeight)
      if (s.stocDisplay) {
        for (const [level, color] of [
          [s.stocOverBought, withAlpha(NEG, 0.25)],
          [50, withAlpha(NEU, 0.25)],
          [s.stocOverSold, withAlpha(POS, 0.25)],
        ]) {
          const y = yStoc(level)
          if (!Number.isFinite(y)) continue
          out.push({ kind: 'line', from: at(lo, y), to: at(last, y), color, lineWidth: 1 })
        }
        const kPts = []
        const dPts = []
        for (let i = lo; i <= last; i++) {
          const k = values.stocK[i]
          const d = values.stocD[i]
          const yk = Number.isFinite(k) ? yStoc(k) : NaN
          const yd = Number.isFinite(d) ? yStoc(d) : NaN
          kPts.push(Number.isFinite(yk) ? at(i, yk) : null)
          dPts.push(Number.isFinite(yd) ? at(i, yd) : null)
        }
        pushRuns(out, kPts, INDICATOR, 1)
        pushRuns(out, dPts, SIGNAL, 1)
        const yMid = yStoc(50)
        if (Number.isFinite(yMid)) caption(last, yMid, 'STOC')
      }

      /* MACD panel */
      const macdHi = winMax(values.macd, winLo, last)
      const macdLo = winMin(values.macd, winLo, last)
      const macdHighest =
        Number.isFinite(macdHi) && Number.isFinite(macdLo) ? macdHi - macdLo : NaN
      const macdBase = priceLowest * (1 - priceChangeRate * s.macdVOffset)
      const yMacd = (v) => macdBase * (1 + (v / macdHighest) * priceChangeRate * s.macdHeight)
      if (s.macdDisplay) {
        if (Number.isFinite(macdHighest) && macdHighest > 0) {
          const macdPts = []
          const signalPts = []
          for (let i = lo; i <= last; i++) {
            const m = values.macd[i]
            const g = values.signal[i]
            const ym = Number.isFinite(m) ? yMacd(m) : NaN
            const yg = Number.isFinite(g) ? yMacd(g) : NaN
            macdPts.push(Number.isFinite(ym) ? at(i, ym) : null)
            signalPts.push(Number.isFinite(yg) ? at(i, yg) : null)

            // The histogram is a zero-width box in Pine, which is a vertical
            // segment from the panel's zero line to the histogram value.
            const h = values.hist[i]
            if (!Number.isFinite(h)) continue
            const yh = yMacd(h)
            if (!Number.isFinite(yh)) continue
            const prevH = i > 0 ? values.hist[i - 1] : null
            const rising = Number.isFinite(prevH) && prevH < h
            const color = h >= 0 ? (rising ? POS : POS_LIGHT) : rising ? NEG_LIGHT : NEG
            out.push({ kind: 'line', from: at(i, macdBase), to: at(i, yh), color, lineWidth: 2 })
          }
          pushRuns(out, macdPts, INDICATOR, 1)
          pushRuns(out, signalPts, SIGNAL, 1)
        }
        // The caption sits at half height, which the source writes as 50/100
        // rather than against the MACD range.
        const yCap = macdBase * (1 + 0.5 * priceChangeRate * s.macdHeight)
        if (Number.isFinite(yCap)) caption(last, yCap, 'MACD')
      }

      /* Volume panel. The bars are gated on the last bar carrying volume at
       * all, the caption only on the volume type. */
      const volumeHighest = winMax(nzVolume, winLo, last)
      const volBase = priceHighest * (1 + priceChangeRate * s.volVOffset)
      const yVol = (v) => volBase * (1 + (v / volumeHighest) * priceChangeRate * s.volHeight)
      if (s.volType !== 'None' && Number.isFinite(volBase)) {
        if (nzVolume[last] > 0 && Number.isFinite(volumeHighest) && volumeHighest > 0) {
          const maPts = []
          for (let i = lo; i <= last; i++) {
            const v = nzVolume[i]
            const range = high[i] - low[i]
            const yTotal = yVol(v)
            if (Number.isFinite(yTotal)) {
              const bull = bars[i].close > bars[i].open
              const color = s.volType === BUY_SELL_VOLUME ? POS : bull ? POS : NEG
              out.push({ kind: 'line', from: at(i, volBase), to: at(i, yTotal), color, lineWidth: 2 })
              if (s.volType === BUY_SELL_VOLUME && Number.isFinite(range) && range > 0) {
                // Selling volume is drawn over the total, leaving the buying
                // share showing above it.
                const sell = (v * (high[i] - bars[i].close)) / range
                const ySell = yVol(sell)
                if (Number.isFinite(ySell)) {
                  out.push({ kind: 'line', from: at(i, volBase), to: at(i, ySell), color: NEG, lineWidth: 2 })
                }
              }
            }
            const ma = values.volMa[i]
            const yMa = Number.isFinite(ma) ? yVol(ma) : NaN
            maPts.push(Number.isFinite(yMa) ? at(i, yMa) : null)
          }
          if (s.volDisplay) pushRuns(out, maPts, NEU, 1)
        }
        caption(last, volBase, 'VOL')
      }

      return out
    },
  })
}
