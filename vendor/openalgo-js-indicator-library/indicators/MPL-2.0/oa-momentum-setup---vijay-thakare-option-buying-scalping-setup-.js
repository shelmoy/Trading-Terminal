/**
 * Momentum Setup: Vijay Thakare Option Buying Scalping Setup Scanner - ported
 * to openalgo-charts from Pine Script v6.
 *
 * Source: https://github.com/ArunKBhaskar/PineScript/blob/c6821225c466494b01eee08f9dd88bf84d2b24ba/Momentum Setup - Vijay Thakare Option Buying Scalping Setup/Momentum Setup - Vijay Thakare Option Buying Scalping Setup with Scanner.txt
 * Repo:   ArunKBhaskar/PineScript
 * License: MPL-2.0 (c) Arun_K_Bhaskar
 * SPDX-FileCopyrightText: (c) Arun_K_Bhaskar
 * SPDX-FileCopyrightText: (c) 2026 marketcalls (port to openalgo-charts)
 * SPDX-License-Identifier: MPL-2.0
 *
 * A directional scalping setup: four EMAs, an anchored VWAP or TWAP and a
 * Supertrend on the price, with MACD, Stochastic and Volume redrawn as scaled
 * mini panels over the last N bars of the price pane. A signal needs price on
 * the correct side of both Supertrend and VWAP, MACD and Stochastic agreeing,
 * and any enabled candle, volume or time filter to pass.
 *
 * Two signal modes match the source. "Continuous Signals" arms on a MACD sign
 * that opposes the trade, then fires when the full entry condition appears.
 * "Flip Signals" reports only the bar where the long and short entry states
 * change hands.
 *
 * Not ported, and why:
 * - The 40-symbol screener and its table. It reads other symbols through
 *   request.security, which a chart study on one instrument cannot do.
 * - The STOC, MACD and VOL captions sit three bars past the last bar in the
 *   source. There is no such bar here, so they are anchored on the last bar.
 *   Their hover tooltips (live %K/%D and buying/selling volume shares) have no
 *   equivalent in a drawing and are dropped.
 * - The source's Supertrend fill and its "Body Middle" plot carry
 *   display = display.none, so they draw nothing there and nothing here.
 *
 * Colours follow the source's own defaults. The chart generates the colour,
 * width and style controls for every plot, so the source's colour inputs are
 * not redeclared.
 */

export default function ({
  registerIndicator,
  sourceValues,
  sma,
  smaSeededEma,
  stoch,
  supertrend,
  atr,
  nulls,
  withAlpha,
  DEFAULT_TIMEZONE,
  isValidTimezone,
  utcSecondsToZonedParts,
  zoneOffsetSeconds,
  isNewZonedDay,
  isNewZonedPeriod,
  calendarPeriodFlags,
}) {
  // The source's Chart Settings palette, kept as constants.
  const POS = '#26A69A'
  const POS_LIGHT = '#ACE5DC'
  const NEU = '#D1D4DC'
  const NEG_LIGHT = '#FCCBCD'
  const NEG = '#FF5252'
  const IND = '#2962FF'
  const SIG = '#FF6D00'

  /* ---- input coercion ---------------------------------------------------
   * A cleared field arrives as '', and Number('') is 0, which would silently
   * become a zero-length window or an 00:00 time boundary. An explicit empty
   * test keeps a legitimate 0 (hour 0, multiplier 0) working.
   */
  const numOf = (v, dflt) => {
    if (v === '' || v === null || v === undefined) return dflt
    const x = Number(v)
    return Number.isFinite(x) ? x : dflt
  }
  const clampTo = (x, lo, hi) => {
    let y = x
    if (lo !== undefined && y < lo) y = lo
    if (hi !== undefined && y > hi) y = hi
    return y
  }
  const intIn = (v, dflt, lo, hi) => clampTo(Math.floor(numOf(v, dflt)), lo, hi)
  const fltIn = (v, dflt, lo, hi) => clampTo(numOf(v, dflt), lo, hi)
  const boolIn = (v, dflt) => (typeof v === 'boolean' ? v : dflt)
  const textIn = (v, dflt) => {
    const s = typeof v === 'string' ? v.trim() : ''
    return s === '' ? dflt : s
  }

  // Pine treats every comparison involving na as false. JavaScript does not:
  // 5 > null is true, so an unguarded test fires straight through warmup.
  const gt = (a, b) => Number.isFinite(a) && Number.isFinite(b) && a > b
  const lt = (a, b) => Number.isFinite(a) && Number.isFinite(b) && a < b

  /**
   * Pine's ta.ema: seeded from the SMA of the first `period` values.
   *
   * smaSeededEma does the same, but poisons on a leading gap, and the MACD
   * signal line is an EMA of the MACD line, which is NaN through its own
   * warmup. sma is NaN-safe, so seeding from it starts the average on the
   * first bar that has `period` finite inputs behind it, exactly as Pine does.
   */
  const pineEma = (values, period) => {
    const n = values.length
    const out = new Array(n).fill(NaN)
    const seed = sma(values, period)
    const alpha = 2 / (period + 1)
    let prev = NaN
    for (let i = 0; i < n; i++) {
      if (!Number.isFinite(prev)) {
        if (Number.isFinite(seed[i])) {
          prev = seed[i]
          out[i] = prev
        }
        continue
      }
      const s = values[i]
      if (Number.isFinite(s)) prev = alpha * s + (1 - alpha) * prev
      out[i] = prev
    }
    return out
  }

  /**
   * Pine's input.timeframe string, as an anchor period.
   *
   * A bare number is minutes, S is seconds, D days, W weeks, M months. A
   * multiple of days or weeks anchors on the base period, which is what a
   * chart study can express without a second bar series.
   */
  const parseAnchor = (spec) => {
    const s = String(spec).trim().toUpperCase()
    const m = /^(\d*)([SDWM]?)$/.exec(s)
    if (!m || (m[1] === '' && m[2] === '')) return { kind: 'day', mult: 1 }
    const mult = m[1] === '' ? 1 : Math.max(1, Math.floor(Number(m[1])))
    switch (m[2]) {
      case 'D': return { kind: 'day', mult }
      case 'W': return { kind: 'week', mult }
      case 'M': return { kind: 'month', mult }
      case 'S': return { kind: 'seconds', secs: mult }
      default: return { kind: 'seconds', secs: mult * 60 }
    }
  }

  /** Pine's timeframe.change(tf): true on the first bar of each new period. */
  const anchorFlags = (times, spec, zone) => {
    const n = times.length
    const flags = new Array(n).fill(false)
    if (n === 0) return flags
    if (spec.kind === 'seconds') {
      const secs = Math.max(1, Math.floor(spec.secs))
      let prevBucket = null
      for (let i = 0; i < n; i++) {
        // Bucket on exchange wall clock, never on the viewer's local time.
        const local = times[i] + zoneOffsetSeconds(times[i], zone)
        const bucket = Math.floor(local / secs)
        if (prevBucket === null || bucket !== prevBucket) flags[i] = true
        prevBucket = bucket
      }
      return flags
    }
    let isNew
    if (spec.kind === 'week') isNew = (a, b) => isNewZonedPeriod(a, b, 'week', zone)
    else if (spec.kind === 'month') {
      const period = spec.mult === 3 ? 'quarter' : spec.mult === 12 ? 'year' : 'month'
      isNew = (a, b) => isNewZonedPeriod(a, b, period, zone)
    } else isNew = (a, b) => isNewZonedDay(a, b, zone)
    // calendarPeriodFlags is session-aware, so a session that straddles a
    // calendar boundary is not cut in half.
    const raw = calendarPeriodFlags(times, isNew)
    for (let i = 0; i < n; i++) flags[i] = raw[i] === true
    flags[0] = true
    return flags
  }

  /** Every setting the port reads, coerced once, shared by calc and draws. */
  const readSettings = (settings) => ({
    sigMethod: settings.sigMethod === 'Flip Signals' ? 'Flip Signals' : 'Continuous Signals',

    stAtrPeriod: intIn(settings.stAtrPeriod, 10, 1),
    stFactor: fltIn(settings.stFactor, 3, 0.01),

    maDisplay: boolIn(settings.maDisplay, true),
    maLen1: intIn(settings.maLen1, 20, 1),
    maLen2: intIn(settings.maLen2, 50, 1),
    maLen3: intIn(settings.maLen3, 100, 1),
    maLen4: intIn(settings.maLen4, 200, 1),

    vtwapDisplay: boolIn(settings.vtwapDisplay, true),
    vtwapChoice: settings.vtwapChoice === 'TWAP' ? 'TWAP' : 'VWAP',
    vtwapTimeframe: textIn(settings.vtwapTimeframe, '1D'),

    macdDisplay: boolIn(settings.macdDisplay, true),
    macdFast: intIn(settings.macdFast, 3, 1),
    macdSlow: intIn(settings.macdSlow, 9, 1),
    macdSignalLen: intIn(settings.macdSignalLen, 15, 1),
    macdVOffset: fltIn(settings.macdVOffset, 0.5),
    macdHeight: fltIn(settings.macdHeight, 0.7),

    stocDisplay: boolIn(settings.stocDisplay, true),
    stocKLen: intIn(settings.stocKLen, 5, 1),
    stocKSmooth: intIn(settings.stocKSmooth, 3, 1),
    stocDSmooth: intIn(settings.stocDSmooth, 3, 1),
    stocOverBought: intIn(settings.stocOverBought, 60, 1),
    stocOverSold: intIn(settings.stocOverSold, 40, 1),
    stocVOffset: fltIn(settings.stocVOffset, 1.8),
    stocHeight: fltIn(settings.stocHeight, 0.6),

    volDisplay: boolIn(settings.volDisplay, true),
    volType: settings.volType === 'Buying/Selling Volume' || settings.volType === 'None'
      ? settings.volType
      : 'Regular Volume',
    volVOffset: fltIn(settings.volVOffset, 0.5),
    volHeight: fltIn(settings.volHeight, 0.6),

    atrFilterOn: boolIn(settings.atrFilter, false),
    atrLength: intIn(settings.atrLength, 14, 1),
    atrMulti: fltIn(settings.atrMulti, 1, 1),
    bodyFilterOn: boolIn(settings.bodyFilter, false),
    // The source divides this input by 100 where it is declared.
    bodyPercent: fltIn(settings.bodyPercent, 80, 0, 100) / 100,
    bodySizeFilterOn: boolIn(settings.bodySizeFilter, false),
    bodySizeMultiplier: intIn(settings.bodySizeMultiplier, 2, 0),
    volumeFilterOn: boolIn(settings.volumeFilter, false),
    volSmaLength: intIn(settings.volSmaLength, 20, 1),
    relVolFilterOn: boolIn(settings.relVolFilter, false),
    relVolLen: intIn(settings.relVolLen, 90, 2),
    relVolMulti: fltIn(settings.relVolMulti, 2, 0),
    timeFilterOn: boolIn(settings.timeFilter, false),
    hourFrom: intIn(settings.hourFrom, 9, 0, 23),
    minuteFrom: intIn(settings.minuteFrom, 15, 0, 59),
    hourTo: intIn(settings.hourTo, 10, 0, 23),
    minuteTo: intIn(settings.minuteTo, 15, 0, 59),

    displayLen: intIn(settings.displayLen, 50, 1, 500),
  })

  registerIndicator({
    id: 'oa-momentum-setup---vijay-thakare-option-buying-scalping-setup-',
    name: 'Momentum Setup: Vijay Thakare Option Buying Scalping Setup Scanner',
    category: 'ICT',
    placement: 'onchart',

    inputs: [
      {
        key: 'sigMethod',
        type: 'select',
        label: 'Signal Method',
        default: 'Continuous Signals',
        options: [
          { label: 'Continuous Signals', value: 'Continuous Signals' },
          { label: 'Flip Signals', value: 'Flip Signals' },
        ],
        tooltip: 'Continuous arms on an opposing MACD sign and fires on the full entry condition. Flip reports only the bar where the long and short states change hands.',
        group: 'Signals',
      },

      { key: 'stAtrPeriod', type: 'number', label: 'ATR Length', default: 10, min: 1, max: 1000, step: 1, group: 'Supertrend' },
      { key: 'stFactor', type: 'number', label: 'Factor', default: 3, min: 0.01, max: 100, step: 0.01, group: 'Supertrend' },

      { key: 'maDisplay', type: 'boolean', label: 'Display', default: true, group: 'Exponential Moving Average' },
      { key: 'maLen1', type: 'number', label: 'Length 1', default: 20, min: 1, max: 5000, step: 1, group: 'Exponential Moving Average' },
      { key: 'maLen2', type: 'number', label: 'Length 2', default: 50, min: 1, max: 5000, step: 1, group: 'Exponential Moving Average' },
      { key: 'maLen3', type: 'number', label: 'Length 3', default: 100, min: 1, max: 5000, step: 1, group: 'Exponential Moving Average' },
      { key: 'maLen4', type: 'number', label: 'Length 4', default: 200, min: 1, max: 5000, step: 1, group: 'Exponential Moving Average' },

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
        tooltip: 'Choose TWAP if volume is not available for the symbol.',
        group: 'VWAP / TWAP',
      },
      {
        key: 'vtwapTimeframe',
        type: 'text',
        label: 'Anchor Timeframe',
        default: '1D',
        tooltip: 'Anchor period in Pine notation: a bare number is minutes, 1D is daily, 1W weekly, 1M monthly, 3M quarterly, 12M yearly.',
        group: 'VWAP / TWAP',
      },

      { key: 'macdDisplay', type: 'boolean', label: 'Display', default: true, group: 'MACD' },
      { key: 'macdFast', type: 'number', label: 'Fast Length', default: 3, min: 1, max: 5000, step: 1, group: 'MACD' },
      { key: 'macdSlow', type: 'number', label: 'Slow Length', default: 9, min: 1, max: 5000, step: 1, group: 'MACD' },
      { key: 'macdSignalLen', type: 'number', label: 'Signal Smoothing', default: 15, min: 1, max: 5000, step: 1, group: 'MACD' },
      { key: 'macdVOffset', type: 'number', label: 'Vertical Offset', default: 0.5, min: -20, max: 20, step: 0.1, group: 'MACD' },
      { key: 'macdHeight', type: 'number', label: 'Height', default: 0.7, min: -20, max: 20, step: 0.1, group: 'MACD' },

      { key: 'stocDisplay', type: 'boolean', label: 'Display', default: true, group: 'Stochastic' },
      { key: 'stocKLen', type: 'number', label: '%K Length', default: 5, min: 1, max: 5000, step: 1, group: 'Stochastic' },
      { key: 'stocKSmooth', type: 'number', label: '%K Smoothing', default: 3, min: 1, max: 5000, step: 1, group: 'Stochastic' },
      { key: 'stocDSmooth', type: 'number', label: '%D Smoothing', default: 3, min: 1, max: 5000, step: 1, group: 'Stochastic' },
      { key: 'stocOverBought', type: 'number', label: 'Over Bought', default: 60, min: 1, max: 100, step: 1, group: 'Stochastic' },
      { key: 'stocOverSold', type: 'number', label: 'Over Sold', default: 40, min: 1, max: 100, step: 1, group: 'Stochastic' },
      { key: 'stocVOffset', type: 'number', label: 'Vertical Offset', default: 1.8, min: -20, max: 20, step: 0.1, group: 'Stochastic' },
      { key: 'stocHeight', type: 'number', label: 'Height', default: 0.6, min: -20, max: 20, step: 0.1, group: 'Stochastic' },

      { key: 'volDisplay', type: 'boolean', label: 'Display Volume Average', default: true, group: 'Volume' },
      {
        key: 'volType',
        type: 'select',
        label: 'Type',
        default: 'Regular Volume',
        options: [
          { label: 'Buying/Selling Volume', value: 'Buying/Selling Volume' },
          { label: 'Regular Volume', value: 'Regular Volume' },
          { label: 'None', value: 'None' },
        ],
        group: 'Volume',
      },
      { key: 'volVOffset', type: 'number', label: 'Vertical Offset', default: 0.5, min: -20, max: 20, step: 0.1, group: 'Volume' },
      { key: 'volHeight', type: 'number', label: 'Height', default: 0.6, min: -20, max: 20, step: 0.1, group: 'Volume' },

      { key: 'atrFilter', type: 'boolean', label: 'Apply ATR Filter', default: false, tooltip: 'ATR helps filter out longer or more volatile signal candles.', group: 'Additional Filters' },
      { key: 'atrLength', type: 'number', label: 'ATR Length', default: 14, min: 1, max: 5000, step: 1, group: 'Additional Filters' },
      { key: 'atrMulti', type: 'number', label: 'ATR Multiplier', default: 1, min: 1, max: 100, step: 0.1, tooltip: 'A higher multiplier filters out a longer or more volatile signal candle.', group: 'Additional Filters' },
      { key: 'bodyFilter', type: 'boolean', label: 'Apply Body % Filter', default: false, tooltip: 'If the input is 80, the body must cover over 80 percent of the candle.', group: 'Additional Filters' },
      { key: 'bodyPercent', type: 'number', label: 'Body % Above', default: 80, min: 0, max: 100, step: 1, group: 'Additional Filters' },
      { key: 'bodySizeFilter', type: 'boolean', label: 'Apply Body Size Filter', default: false, tooltip: '2 means the candle is 2 times larger than the previous candle.', group: 'Additional Filters' },
      { key: 'bodySizeMultiplier', type: 'number', label: 'Body Size Multiplier (x)', default: 2, min: 0, max: 1000, step: 1, group: 'Additional Filters' },
      { key: 'volumeFilter', type: 'boolean', label: 'Apply Volume Filter', default: false, tooltip: 'Keep a candle only when its volume is greater than the SMA of volume.', group: 'Additional Filters' },
      { key: 'volSmaLength', type: 'number', label: 'Volume SMA Length', default: 20, min: 1, max: 5000, step: 1, group: 'Additional Filters' },
      { key: 'relVolFilter', type: 'boolean', label: 'Apply Relative Volume Filter', default: false, tooltip: 'Keep a candle only when its relative volume is greater than the multiplied average.', group: 'Additional Filters' },
      { key: 'relVolLen', type: 'number', label: 'Relative Volume Length', default: 90, min: 2, max: 5000, step: 1, group: 'Additional Filters' },
      { key: 'relVolMulti', type: 'number', label: 'Rel Vol SMA Multiplier', default: 2, min: 0, max: 100, step: 0.1, group: 'Additional Filters' },
      { key: 'timeFilter', type: 'boolean', label: 'Apply Time Filter', default: false, tooltip: 'Keep signals only between the two exchange times below.', group: 'Additional Filters' },
      { key: 'hourFrom', type: 'number', label: 'Time From (hour)', default: 9, min: 0, max: 23, step: 1, group: 'Additional Filters' },
      { key: 'minuteFrom', type: 'number', label: 'Time From (minute)', default: 15, min: 0, max: 59, step: 1, group: 'Additional Filters' },
      { key: 'hourTo', type: 'number', label: 'Time To (hour)', default: 10, min: 0, max: 23, step: 1, group: 'Additional Filters' },
      { key: 'minuteTo', type: 'number', label: 'Time To (minute)', default: 15, min: 0, max: 59, step: 1, group: 'Additional Filters' },

      { key: 'displayLen', type: 'number', label: 'Display Length', default: 50, min: 1, max: 500, step: 1, tooltip: 'How many recent bars the MACD, Stochastic and Volume mini panels cover.', group: 'Chart Settings' },
    ],

    plots: [
      { key: 'ema1', type: 'line', title: 'EMA 1', style: { color: POS, lineWidth: 1 } },
      { key: 'ema2', type: 'line', title: 'EMA 2', style: { color: IND, lineWidth: 1 } },
      { key: 'ema3', type: 'line', title: 'EMA 3', style: { color: SIG, lineWidth: 1 } },
      { key: 'ema4', type: 'line', title: 'EMA 4', style: { color: NEG, lineWidth: 1 } },
      { key: 'vtwap', type: 'line', title: 'VWAP/TWAP', style: { color: NEU, lineWidth: 2 } },
      { key: 'stUp', type: 'line', title: 'Supertrend Up', style: { color: POS, lineWidth: 2 } },
      { key: 'stDown', type: 'line', title: 'Supertrend Down', style: { color: NEG, lineWidth: 2 } },
    ],

    calc(bars, settings, store, ctx) {
      const n = bars.length
      const s = readSettings(settings)
      const blank = () => new Array(n).fill(NaN)

      const out = {
        ema1: blank(), ema2: blank(), ema3: blank(), ema4: blank(),
        vtwap: blank(), stUp: blank(), stDown: blank(),
        stocK: blank(), stocD: blank(),
        macd: blank(), macdSignal: blank(), macdHist: blank(),
        volMa: blank(), sellVol: blank(),
        longSignal: new Array(n).fill(0), shortSignal: new Array(n).fill(0),
      }
      if (n === 0) return out

      const zoneRaw = ctx && ctx.timezone
      const zone = typeof zoneRaw === 'string' && isValidTimezone(zoneRaw) ? zoneRaw : DEFAULT_TIMEZONE

      const closeArr = bars.map((b) => Number(b.close))
      const highArr = bars.map((b) => Number(b.high))
      const lowArr = bars.map((b) => Number(b.low))
      const openArr = bars.map((b) => Number(b.open))
      // Index series carry no volume, so nz(volume) is the only safe read.
      const volArr = bars.map((b) => (Number.isFinite(Number(b.volume)) ? Number(b.volume) : 0))
      const hlc3 = sourceValues(bars, 'hlc3')
      const ohlc4 = sourceValues(bars, 'ohlc4')

      /* -- 1. EMA 20, 50, 100, 200 ---------------------------------------- */
      const ema1 = smaSeededEma(closeArr, s.maLen1)
      const ema2 = smaSeededEma(closeArr, s.maLen2)
      const ema3 = smaSeededEma(closeArr, s.maLen3)
      const ema4 = smaSeededEma(closeArr, s.maLen4)

      /* -- 2. VWAP / TWAP, anchored --------------------------------------- */
      const flags = anchorFlags(bars.map((b) => b.time), parseAnchor(s.vtwapTimeframe), zone)
      const vtwapCol = blank()
      let pv = 0
      let vv = 0
      let psum = 0
      let pcount = 0
      for (let i = 0; i < n; i++) {
        if (flags[i]) {
          pv = 0
          vv = 0
          psum = 0
          pcount = 0
        }
        if (Number.isFinite(hlc3[i])) {
          pv += hlc3[i] * volArr[i]
          vv += volArr[i]
        }
        if (Number.isFinite(ohlc4[i])) {
          psum += ohlc4[i]
          pcount += 1
        }
        if (s.vtwapChoice === 'TWAP') vtwapCol[i] = pcount > 0 ? psum / pcount : NaN
        else vtwapCol[i] = vv > 0 ? pv / vv : NaN
      }

      /* -- 3. MACD --------------------------------------------------------- */
      const macdFastMa = smaSeededEma(closeArr, s.macdFast)
      const macdSlowMa = smaSeededEma(closeArr, s.macdSlow)
      const macdLine = blank()
      for (let i = 0; i < n; i++) {
        if (Number.isFinite(macdFastMa[i]) && Number.isFinite(macdSlowMa[i])) {
          macdLine[i] = macdFastMa[i] - macdSlowMa[i]
        }
      }
      const signalLine = pineEma(macdLine, s.macdSignalLen)
      const histLine = blank()
      for (let i = 0; i < n; i++) {
        if (Number.isFinite(macdLine[i]) && Number.isFinite(signalLine[i])) {
          histLine[i] = macdLine[i] - signalLine[i]
        }
      }

      /* -- 4. Stochastic --------------------------------------------------- */
      const stocK = sma(stoch(closeArr, highArr, lowArr, s.stocKLen), s.stocKSmooth)
      const stocD = sma(stocK, s.stocDSmooth)

      /* -- 5. Volume average and the selling half of the split ------------- */
      const volMa = sma(volArr, s.volSmaLength)
      const sellVol = blank()
      for (let i = 0; i < n; i++) {
        const range = highArr[i] - lowArr[i]
        if (Number.isFinite(range) && range > 0) {
          sellVol[i] = (volArr[i] * (highArr[i] - closeArr[i])) / range
        }
      }

      /* -- 6. Supertrend --------------------------------------------------- */
      const st = supertrend(bars, s.stAtrPeriod, s.stFactor)
      const stVal = blank()
      const stDir = new Array(n).fill(NaN)
      for (let i = 0; i < n; i++) {
        const row = st[i] || {}
        // The source forces the first bar to na.
        stVal[i] = i === 0 ? NaN : Number(row.value)
        stDir[i] = Number(row.direction)
      }

      /* -- Additional filters ---------------------------------------------- */
      const atrCol = atr(highArr, lowArr, closeArr, s.atrLength)
      const volSmaFilterCol = sma(volArr, s.volSmaLength)
      const avgVol = sma(volArr, s.relVolLen)
      const relVol = blank()
      for (let i = 0; i < n; i++) {
        const prev = i > 0 ? avgVol[i - 1] : NaN
        if (Number.isFinite(prev) && prev !== 0) relVol[i] = volArr[i] / prev
      }
      const relVolSma = sma(relVol, s.relVolLen)

      // barstate.isconfirmed: every historical bar is confirmed; only a bar
      // still forming under a live feed is not.
      const barState = (ctx && ctx.barState) || {}
      const lastForming = barState.isRealtime === true && barState.isConfirmed === false

      /* -- Entry conditions and the two signal state machines -------------- */
      const longTrigger = new Array(n).fill(false)
      const shortTrigger = new Array(n).fill(false)
      const longFlip = new Array(n).fill(false)
      const shortFlip = new Array(n).fill(false)

      let bearState = 0
      let bullState = 0
      // Pine's `var entry_signal = 0`; a flip is only reported when the state
      // actually differs from the previous bar, so bar 0 never reports one.
      let entrySignal = 0

      for (let i = 0; i < n; i++) {
        const hi = highArr[i]
        const lo = lowArr[i]
        const cl = closeArr[i]
        const op = openArr[i]
        const range = hi - lo
        const body = Math.abs(cl - op)

        let atrPass = true
        if (s.atrFilterOn) atrPass = gt(range, atrCol[i] * s.atrMulti)

        // A zero range makes the source's body ratio 0/0, which is na, so false.
        const bodyRatioPass = Number.isFinite(range) && range > 0 && body / range >= s.bodyPercent
        let bodyPass = true
        if (s.bodyFilterOn) bodyPass = bodyRatioPass

        let bodySizePass = true
        if (s.bodySizeFilterOn) {
          // The source reuses the body percent here rather than its own input.
          const prevRange = i > 0 ? highArr[i - 1] - lowArr[i - 1] : NaN
          bodySizePass = bodyRatioPass
            && Number.isFinite(prevRange)
            && range >= prevRange * s.bodySizeMultiplier
        }

        let volPass = true
        if (s.volumeFilterOn) volPass = gt(volArr[i], volSmaFilterCol[i])

        let relVolPass = true
        if (s.relVolFilterOn) relVolPass = gt(relVol[i], relVolSma[i] * s.relVolMulti)

        let timePass = true
        if (s.timeFilterOn) {
          const parts = utcSecondsToZonedParts(bars[i].time, zone)
          const hh = parts.hour
          const mm = parts.minute
          timePass = (hh > s.hourFrom || (hh === s.hourFrom && mm >= s.minuteFrom))
            && (hh < s.hourTo || (hh === s.hourTo && mm < s.minuteTo))
        }

        const confirmed = i < n - 1 || !lastForming
        const filtersPass = atrPass && bodyPass && bodySizePass && volPass && relVolPass && timePass && confirmed

        const shortCont1 = gt(macdLine[i], 0)
        const shortCont2 = lt(cl, stVal[i])
          && lt(cl, vtwapCol[i])
          && lt(stocK[i], s.stocOverBought)
          && lt(stocK[i], stocD[i])
          && lt(macdLine[i], 0)
          && lt(macdLine[i], signalLine[i])
          && lt(macdLine[i], histLine[i])
          && filtersPass

        const longCont1 = lt(macdLine[i], 0)
        const longCont2 = gt(cl, stVal[i])
          && gt(cl, vtwapCol[i])
          && gt(stocK[i], s.stocOverSold)
          && gt(stocK[i], stocD[i])
          && gt(macdLine[i], 0)
          && gt(macdLine[i], signalLine[i])
          && gt(macdLine[i], histLine[i])
          && filtersPass

        // Continuous: arm on the opposing MACD sign, fire on the full entry,
        // then fall straight back to unarmed on the next bar.
        let bear = bearState === 2 ? 0 : bearState
        if (shortCont1 && bear === 0) bear = 1
        if (shortCont2 && bear === 1) bear = 2
        bearState = bear
        shortTrigger[i] = bear === 2

        let bull = bullState === 2 ? 0 : bullState
        if (longCont1 && bull === 0) bull = 1
        if (longCont2 && bull === 1) bull = 2
        bullState = bull
        longTrigger[i] = bull === 2

        // Flip: the exrem idiom, one signal per change of side.
        const prevEntry = entrySignal
        const nextEntry = longCont2 ? 1 : shortCont2 ? -1 : prevEntry
        const changed = i > 0 && nextEntry !== prevEntry
        longFlip[i] = changed && nextEntry === 1
        shortFlip[i] = changed && nextEntry === -1
        entrySignal = nextEntry
      }

      const useFlip = s.sigMethod === 'Flip Signals'
      for (let i = 0; i < n; i++) {
        out.longSignal[i] = (useFlip ? longFlip[i] : longTrigger[i]) ? 1 : 0
        out.shortSignal[i] = (useFlip ? shortFlip[i] : shortTrigger[i]) ? 1 : 0
      }

      /* -- Plot columns ---------------------------------------------------- */
      const upCol = blank()
      const downCol = blank()
      for (let i = 0; i < n; i++) {
        // plot.style_linebr: the side that is not active is na, which breaks
        // the line rather than joining it across the flip.
        if (stDir[i] < 0) upCol[i] = stVal[i]
        else downCol[i] = stVal[i]
      }

      out.ema1 = nulls(s.maDisplay ? ema1 : blank())
      out.ema2 = nulls(s.maDisplay ? ema2 : blank())
      out.ema3 = nulls(s.maDisplay ? ema3 : blank())
      out.ema4 = nulls(s.maDisplay ? ema4 : blank())
      out.vtwap = nulls(s.vtwapDisplay ? vtwapCol : blank())
      out.stUp = nulls(upCol)
      out.stDown = nulls(downCol)
      out.stocK = nulls(stocK)
      out.stocD = nulls(stocD)
      out.macd = nulls(macdLine)
      out.macdSignal = nulls(signalLine)
      out.macdHist = nulls(histLine)
      out.volMa = nulls(volMa)
      out.sellVol = nulls(sellVol)
      return out
    },

    /* plotshape(style = shape.triangleup / triangledown, location = belowbar / abovebar) */
    markers({ bars, values }) {
      const n = bars.length
      if (n === 0) return []
      let sumRange = 0
      let count = 0
      for (const b of bars) {
        const r = Number(b.high) - Number(b.low)
        if (Number.isFinite(r)) {
          sumRange += r
          count += 1
        }
      }
      const meanRange = count > 0 ? sumRange / count : 0
      const lastClose = Number(bars[n - 1].close)
      // aboveBar and belowBar would pin to this indicator's own line rather
      // than to the candle, so the marker is priced explicitly with a pad
      // scaled to the instrument.
      const pad = Math.max(
        meanRange * 0.5,
        Math.abs(Number.isFinite(lastClose) ? lastClose : 0) * 0.0005,
        1e-8
      )

      const out = []
      for (let i = 0; i < n; i++) {
        if (values.shortSignal[i] === 1) {
          out.push({
            time: bars[i].time,
            position: 'atPrice',
            price: Number(bars[i].high) + pad,
            shape: 'triangleDown',
            color: NEG_LIGHT,
            size: 'tiny',
          })
        }
        if (values.longSignal[i] === 1) {
          out.push({
            time: bars[i].time,
            position: 'atPrice',
            price: Number(bars[i].low) - pad,
            shape: 'triangleUp',
            color: POS_LIGHT,
            size: 'tiny',
          })
        }
      }
      return out
    },

    /* bgcolor(..., show_last = i_display_len) */
    background({ bars, values, settings }) {
      const n = bars.length
      const s = readSettings(settings)
      const out = new Array(n).fill(null)
      const from = Math.max(0, n - s.displayLen)
      for (let i = from; i < n; i++) {
        if (values.shortSignal[i] === 1) out[i] = withAlpha(NEG_LIGHT, 0.1)
        else if (values.longSignal[i] === 1) out[i] = withAlpha(POS_LIGHT, 0.1)
      }
      return out
    },

    /* barcolor() */
    barColors({ bars, values }) {
      const n = bars.length
      const out = new Array(n).fill(null)
      for (let i = 0; i < n; i++) {
        if (values.shortSignal[i] === 1) out[i] = NEG_LIGHT
        else if (values.longSignal[i] === 1) out[i] = POS_LIGHT
      }
      return out
    },

    /**
     * The source's "Overlay Charts" section: MACD, Stochastic and Volume
     * redrawn as scaled mini panels across the last `displayLen` bars of the
     * price pane, built there from line.new and box.new.
     *
     * The curves are polylines rather than one line object per bar segment:
     * the geometry is identical, and the source's own 500-object cap existed
     * only because Pine counts drawing objects.
     *
     * A zero-width box with a border is a vertical stroke, so the MACD
     * histogram and the volume bars are drawn as vertical lines.
     */
    draws({ bars, values, settings }) {
      const n = bars.length
      const s = readSettings(settings)
      const len = s.displayLen
      // ta.highest and ta.lowest over `len` bars are na until `len` bars
      // exist, and the panel's left edge is bar_index[len], so it needs one
      // bar more than that.
      if (n < len + 1) return []
      const last = n - 1
      const first = last - len
      // The source's two loops do not cover the same bars. Its curves join
      // bar_index[barIndex] to bar_index[barIndex + 1] for barIndex 0..len-1,
      // so they reach back to bar_index[len], which is `first`. Its per-bar
      // boxes sit on bar_index[barIndex] alone, so they stop at
      // bar_index[len - 1], one bar later. `firstBox` is that bar.
      const firstBox = first + 1

      const finite = (v) => Number.isFinite(v)
      const out = []
      const pushLine = (t1, p1, t2, p2, color, width) => {
        if (!finite(p1) || !finite(p2)) return
        out.push({
          kind: 'line',
          from: { time: t1, price: p1 },
          to: { time: t2, price: p2 },
          color,
          lineWidth: width,
        })
      }
      const pushPolyline = (points, color, width) => {
        if (points.length < 2) return
        out.push({ kind: 'polyline', points, color, lineWidth: width })
      }

      let priceHighest = -Infinity
      let priceLowest = Infinity
      let volumeHighest = 0
      let macdHi = -Infinity
      let macdLo = Infinity
      for (let i = last - len + 1; i <= last; i++) {
        const h = Number(bars[i].high)
        const l = Number(bars[i].low)
        if (finite(h) && h > priceHighest) priceHighest = h
        if (finite(l) && l < priceLowest) priceLowest = l
        const v = Number(bars[i].volume)
        if (finite(v) && v > volumeHighest) volumeHighest = v
        const m = values.macd[i]
        if (finite(m)) {
          if (m > macdHi) macdHi = m
          if (m < macdLo) macdLo = m
        }
      }
      if (!finite(priceHighest) || !finite(priceLowest) || priceHighest === 0) return []

      const priceChangeRate = (priceHighest - priceLowest) / priceHighest
      const oscHighest = 100
      const macdHighest = finite(macdHi) && finite(macdLo) ? macdHi - macdLo : NaN

      const timeAt = (i) => bars[i].time

      /* -- Stochastic panel ------------------------------------------------ */
      const stocBase = priceLowest * (1 - priceChangeRate * s.stocVOffset)
      const stocY = (v) => (finite(v)
        ? stocBase * (1 + (v / oscHighest) * priceChangeRate * s.stocHeight)
        : NaN)

      if (s.stocDisplay) {
        const midLine = (100 + 0) / 2
        pushLine(timeAt(first), stocY(s.stocOverBought), timeAt(last), stocY(s.stocOverBought), withAlpha(NEG, 0.25), 1)
        pushLine(timeAt(first), stocY(midLine), timeAt(last), stocY(midLine), withAlpha(NEU, 0.25), 1)
        pushLine(timeAt(first), stocY(s.stocOverSold), timeAt(last), stocY(s.stocOverSold), withAlpha(POS, 0.25), 1)

        const kPts = []
        const dPts = []
        for (let i = first; i <= last; i++) {
          const yk = stocY(values.stocK[i])
          const yd = stocY(values.stocD[i])
          if (finite(yk)) kPts.push({ time: timeAt(i), price: yk })
          if (finite(yd)) dPts.push({ time: timeAt(i), price: yd })
        }
        pushPolyline(kPts, IND, 1)
        pushPolyline(dPts, SIG, 1)

        const stocLabelY = stocY(midLine)
        if (finite(stocLabelY)) {
          out.push({
            kind: 'label',
            at: { time: timeAt(last), price: stocLabelY },
            text: 'STOC',
            color: IND,
            align: 'left',
          })
        }
      }

      /* -- MACD panel ------------------------------------------------------ */
      const macdBase = priceLowest * (1 - priceChangeRate * s.macdVOffset)
      const macdY = (v) => (finite(v) && finite(macdHighest) && macdHighest !== 0
        ? macdBase * (1 + (v / macdHighest) * priceChangeRate * s.macdHeight)
        : NaN)

      if (s.macdDisplay) {
        const mPts = []
        const sPts = []
        for (let i = first; i <= last; i++) {
          const ym = macdY(values.macd[i])
          const ys = macdY(values.macdSignal[i])
          if (finite(ym)) mPts.push({ time: timeAt(i), price: ym })
          if (finite(ys)) sPts.push({ time: timeAt(i), price: ys })
          const h = values.macdHist[i]
          const hPrev = i > 0 ? values.macdHist[i - 1] : NaN
          if (i >= firstBox && finite(h)) {
            const rising = finite(hPrev) && hPrev < h
            const colour = h >= 0 ? (rising ? POS : POS_LIGHT) : (rising ? NEG_LIGHT : NEG)
            pushLine(timeAt(i), macdBase, timeAt(i), macdY(h), colour, 2)
          }
        }
        pushPolyline(mPts, IND, 1)
        pushPolyline(sPts, SIG, 1)

        // The source prices this caption from 50 / oscHighest, not from the
        // MACD range, so it still sits correctly on a flat MACD.
        const macdLabelY = macdBase * (1 + 0.5 * priceChangeRate * s.macdHeight)
        if (finite(macdLabelY)) {
          out.push({
            kind: 'label',
            at: { time: timeAt(last), price: macdLabelY },
            text: 'MACD',
            color: IND,
            align: 'left',
          })
        }
      }

      /* -- Volume panel ---------------------------------------------------- */
      const lastVolume = Number(bars[last].volume)
      const volBase = priceHighest * (1 + priceChangeRate * s.volVOffset)
      const volY = (v) => (finite(v) && volumeHighest > 0
        ? volBase * (1 + (v / volumeHighest) * priceChangeRate * s.volHeight)
        : NaN)

      // The caption is gated only on the volume type; the bars themselves
      // additionally need the last bar to carry volume, as in the source.
      if (s.volType !== 'None' && finite(volBase)) {
        out.push({
          kind: 'label',
          at: { time: timeAt(last), price: volBase },
          text: 'VOL',
          color: NEU,
          align: 'left',
        })
      }

      if (finite(lastVolume) && lastVolume !== 0 && s.volType !== 'None') {
        const buySell = s.volType === 'Buying/Selling Volume'
        const maPts = []
        for (let i = first; i <= last; i++) {
          const v = Number(bars[i].volume)
          const bull = Number(bars[i].close) > Number(bars[i].open)
          const barColour = buySell || bull ? POS : NEG
          if (i >= firstBox) {
            pushLine(timeAt(i), volBase, timeAt(i), volY(v), barColour, 2)
            if (buySell) pushLine(timeAt(i), volBase, timeAt(i), volY(values.sellVol[i]), NEG, 2)
          }

          if (s.volDisplay) {
            // volumeMARate is volume / volMa, so volume divided by it is the
            // average itself: this traces the volume SMA on the panel scale.
            const ma = values.volMa[i]
            const rate = finite(v) && finite(ma) && ma !== 0 ? v / ma : NaN
            if (finite(rate) && rate !== 0 && volumeHighest > 0) {
              const y = volBase * (1 + ((v / volumeHighest) * priceChangeRate * s.volHeight) / rate)
              if (finite(y)) maPts.push({ time: timeAt(i), price: y })
            }
          }
        }
        pushPolyline(maPts, NEU, 1)
      }

      return out
    },
  })
}
