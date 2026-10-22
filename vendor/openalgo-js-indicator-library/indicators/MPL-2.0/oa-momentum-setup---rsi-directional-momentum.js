/**
 * Momentum Setup - RSI Directional Momentum Indicator - ported to
 * openalgo-charts from Pine Script v6.
 *
 * Source: https://github.com/ArunKBhaskar/PineScript/blob/c6821225c466494b01eee08f9dd88bf84d2b24ba/Momentum Setup - RSI Directional Momentum/[Indicator] Momentum Setup - RSI Directional Momentum.txt
 * Repo:   ArunKBhaskar/PineScript
 * License: MPL-2.0 (c) Arun_K_Bhaskar
 * SPDX-FileCopyrightText: (c) Arun_K_Bhaskar
 * SPDX-FileCopyrightText: (c) 2026 marketcalls (port to openalgo-charts)
 * SPDX-License-Identifier: MPL-2.0
 *
 * An RSI pane with a three-step directional state machine on top of it: RSI
 * breaks 60 (or 40), pulls back through the level, then takes out the high (or
 * low) of the bar that broke it. The breaking candle also anchors a Fibonacci
 * retracement level, and a failed sequence flips the side. Bullish, bearish and
 * hidden RSI divergences are the two remaining scan modes.
 */

export default function ({
  registerIndicator,
  sourceValues,
  rsi,
  sma,
  atr,
  pivotHigh,
  pivotLow,
  nulls,
  withAlpha,
  utcSecondsToZonedParts,
  isValidTimezone,
  DEFAULT_TIMEZONE,
}) {
  // The colours the Pine source hard-codes; its input.color calls are commented
  // out upstream, so these are constants there too.
  const POS = '#089981'
  const POS_LIGHT = '#70CCBD'
  const NEG_LIGHT = '#FAA1A4'
  const NEG = '#F23645'
  const INDICATOR = '#2962FF'
  const SIGNAL = '#FF6D00'
  const NEU = '#D1D4DC'
  const NEU_DARK = '#0F0F0F'
  // Pine paints each divergence line with color = cond ? colour : #00000000, so
  // the whole pivot-to-pivot line is plotted and only a diverging leg is seen.
  const NO_COLOR = 'rgba(0, 0, 0, 0)'

  // RSI bands, fixed in the source.
  const OVERBOUGHT = 70
  const BREAKOUT = 60
  const MIDDLE = 50
  const BREAKDOWN = 40
  const OVERSOLD = 30

  const CONT_BREAK = 'Continuous Break'
  const CONT_RET = 'Continuous Retracement'
  const FLIP_BREAK = 'Flip Break'
  const FLIP_RET = 'Flip Retracement'
  const DIVERGENCE = 'Divergence'
  const HIDDEN_DIVERGENCE = 'Hidden Divergence'
  const METHODS = [CONT_BREAK, CONT_RET, FLIP_BREAK, FLIP_RET, DIVERGENCE, HIDDEN_DIVERGENCE]

  const TABLE_SIZES = { auto: 11, tiny: 8, small: 10, normal: 12, large: 14, huge: 18 }
  const TABLE_POSITIONS = [
    'top-left', 'top-center', 'top-right',
    'middle-left', 'middle-center', 'middle-right',
    'bottom-left', 'bottom-center', 'bottom-right',
  ]

  // A cleared number field arrives as '' and Number('') is 0, which would turn
  // an hour of 0 or a multiplier of 0 into a legal value by accident. Keep a
  // real 0 and fall back only on an empty or unparseable field.
  const numOr = (v, fallback) => {
    if (v === '' || v === null || v === undefined) return fallback
    const x = Number(v)
    return Number.isFinite(x) ? x : fallback
  }
  const intOr = (v, fallback, lo) => Math.max(lo, Math.floor(numOr(v, fallback)))
  const fin = (x) => Number.isFinite(x)
  // str.tostring(x, '#.##'): two decimals at most, trailing zeros dropped.
  const fmt2 = (x) => (fin(x) ? String(Math.round(x * 100) / 100) : 'n/a')
  const scanMethodOf = (settings) =>
    METHODS.includes(settings.scanMethod) ? settings.scanMethod : CONT_BREAK

  registerIndicator({
    id: 'oa-momentum-setup---rsi-directional-momentum',
    name: 'Momentum Setup - RSI Directional Momentum Indicator',
    category: 'ICT',
    // The Pine indicator() call carries no overlay argument, so overlay is false
    // and the study owns a pane. The columns the source marks force_overlay
    // ride to the price pane on their own plots below.
    placement: 'pane',

    inputs: [
      {
        key: 'scanMethod',
        type: 'select',
        label: 'Scanning Method',
        default: CONT_BREAK,
        group: 'Scanner',
        options: METHODS.map((m) => ({ label: m, value: m })),
        tooltip:
          'Continuous Break: RSI crosses 60 (40), dips back, then breaks the previous high (low) while holding above 60 (below 40). ' +
          'Continuous Retracement: price returns to the Fibonacci level of the breaking candle and turns. ' +
          'Flip Break and Flip Retracement report only the direction changes. ' +
          'Divergence: price makes a lower low while RSI makes a higher low. ' +
          'Hidden Divergence: price makes a higher low while RSI makes a lower low.',
      },
      { key: 'showLong', type: 'boolean', label: 'Long Signals', default: true, group: 'Scanner' },
      { key: 'showShort', type: 'boolean', label: 'Short Signals', default: true, group: 'Scanner' },

      { key: 'rsiLength', type: 'number', label: 'RSI Length', default: 14, min: 1, max: 5000, step: 1, group: 'RSI' },
      { key: 'rsiSource', type: 'source', label: 'RSI Source', default: 'close', group: 'RSI' },
      { key: 'rsiMaLength', type: 'number', label: 'SMA Length', default: 14, min: 1, max: 5000, step: 1, group: 'RSI' },
      {
        key: 'fibValue',
        type: 'number',
        label: 'Fib Value',
        default: 0.5,
        min: 0,
        max: 1,
        step: 0.1,
        group: 'RSI',
        tooltip: '0 is the bottom of a bullish and the top of a bearish breaking candle, 1 the other end, 0.5 its midpoint.',
      },
      { key: 'showBull', type: 'boolean', label: 'Display Bullish Divergence', default: true, group: 'RSI' },
      { key: 'showBear', type: 'boolean', label: 'Display Bearish Divergence', default: true, group: 'RSI' },
      { key: 'showHiddenBull', type: 'boolean', label: 'Display Hidden Bullish Divergence', default: true, group: 'RSI' },
      { key: 'showHiddenBear', type: 'boolean', label: 'Display Hidden Bearish Divergence', default: true, group: 'RSI' },
      { key: 'pivotRight', type: 'number', label: 'Pivot Lookback Right', default: 5, min: 1, max: 200, step: 1, group: 'RSI' },
      { key: 'pivotLeft', type: 'number', label: 'Pivot Lookback Left', default: 5, min: 1, max: 200, step: 1, group: 'RSI' },
      { key: 'rangeMax', type: 'number', label: 'Max of Lookback Range', default: 60, min: 1, max: 1000, step: 1, group: 'RSI' },
      { key: 'rangeMin', type: 'number', label: 'Min of Lookback Range', default: 5, min: 1, max: 1000, step: 1, group: 'RSI' },

      {
        key: 'pchgFilter',
        type: 'boolean',
        label: 'Apply % Change Filter',
        default: false,
        group: 'Additional Filters',
        tooltip: 'Percentage change of the day. The source asks for the day to be both above +N and below -N, so switching this on blocks every signal.',
      },
      { key: 'pchgAboveBelow', type: 'number', label: '% Change Above/Below +/-', default: 2, min: 0, max: 1000, step: 0.1, group: 'Additional Filters' },

      {
        key: 'volFilter',
        type: 'boolean',
        label: 'Apply Volume Filter (Day Total)',
        default: false,
        group: 'Additional Filters',
        tooltip: 'Cumulative volume of the running day must clear the level below.',
      },
      { key: 'volAbove', type: 'number', label: 'Volume Above', default: 500000, min: 0, max: 1000000000, step: 1000, group: 'Additional Filters' },

      {
        key: 'volPchgFilter',
        type: 'boolean',
        label: 'Apply Volume % Change Filter',
        default: false,
        group: 'Additional Filters',
        tooltip: '0% means the running day volume must exceed the previous day total. 300%+ often marks a major breakout.',
      },
      { key: 'volPchgAbove', type: 'number', label: 'Volume % Change Above', default: 0, min: 0, max: 100000, step: 1, group: 'Additional Filters' },

      {
        key: 'atrFilter',
        type: 'boolean',
        label: 'Apply ATR Filter',
        default: false,
        group: 'Additional Filters',
        tooltip: 'Filters out longer or more volatile signal candles.',
      },
      { key: 'atrLength', type: 'number', label: 'ATR Length', default: 14, min: 1, max: 1000, step: 1, group: 'Additional Filters' },
      { key: 'atrMulti', type: 'number', label: 'ATR Multiplier', default: 1, min: 1, max: 100, step: 0.1, group: 'Additional Filters' },

      {
        key: 'bodyFilter',
        type: 'boolean',
        label: 'Apply Body % Filter',
        default: false,
        group: 'Additional Filters',
        tooltip: '80 means the body covers 80%+ of the candle.',
      },
      { key: 'bodyPercent', type: 'number', label: 'Body % Above', default: 70, min: 0, max: 100, step: 1, group: 'Additional Filters' },

      {
        key: 'bodySizeFilter',
        type: 'boolean',
        label: 'Apply Body Size Filter',
        default: false,
        group: 'Additional Filters',
        tooltip: '2 means the candle is twice the size of the previous one.',
      },
      { key: 'bodySizeMulti', type: 'number', label: 'Body Size Multiplier (x)', default: 2, min: 0, max: 100, step: 1, group: 'Additional Filters' },

      {
        key: 'volumeFilter',
        type: 'boolean',
        label: 'Apply Volume Filter (vs SMA)',
        default: false,
        group: 'Additional Filters',
        tooltip: 'Filter candles with volume above the SMA of volume.',
      },
      { key: 'volSmaLength', type: 'number', label: 'Volume SMA Length', default: 20, min: 1, max: 1000, step: 1, group: 'Additional Filters' },

      {
        key: 'relVolFilter',
        type: 'boolean',
        label: 'Apply Relative Volume Filter',
        default: false,
        group: 'Additional Filters',
        tooltip: 'Filter candles with relative volume above its own average times the multiplier.',
      },
      { key: 'relVolLength', type: 'number', label: 'Relative Volume Length', default: 90, min: 2, max: 1000, step: 1, group: 'Additional Filters' },
      { key: 'relVolMulti', type: 'number', label: 'Rel Vol SMA Multiplier', default: 5, min: 0, max: 100, step: 0.1, group: 'Additional Filters' },

      {
        key: 'timeFilter',
        type: 'boolean',
        label: 'Apply Time Filter',
        default: false,
        group: 'Additional Filters',
        tooltip: 'Keep signals inside a window of the exchange trading day.',
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
        tooltip: 'Keep signals on one calendar date only.',
      },
      { key: 'filterDay', type: 'number', label: 'Day', default: 25, min: 1, max: 31, step: 1, group: 'Additional Filters' },
      { key: 'filterMonth', type: 'number', label: 'Month', default: 10, min: 1, max: 12, step: 1, group: 'Additional Filters' },
      { key: 'filterYear', type: 'number', label: 'Year', default: 2024, min: 0, max: 2999, step: 1, group: 'Additional Filters' },

      { key: 'showTable', type: 'boolean', label: 'Display', default: true, group: 'Performance Table' },
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

    plots: [
      { key: 'rsi', type: 'line', title: 'RSI', style: { color: INDICATOR, lineWidth: 2 } },
      { key: 'rsiMa', type: 'line', title: 'RSI Moving Average', style: { color: SIGNAL, lineWidth: 1 } },

      // hline(60) and hline(40) are the two ends of the source's middle fill, so
      // they are real plots here; 70, 50 and 30 stay plain levels.
      { key: 'bandBull', type: 'line', title: 'Band Bullish', style: { color: withAlpha(NEU, 0.5), lineWidth: 1, lineStyle: 'dotted' } },
      { key: 'bandBear', type: 'line', title: 'Band Bearish', style: { color: withAlpha(NEU, 0.5), lineWidth: 1, lineStyle: 'dotted' } },

      // The divergence legs. Both divergence modes plot the same pivot series
      // and differ only in which leg they colour, so one column carries both.
      {
        key: 'divLowRsi',
        type: 'line',
        title: 'Line Bull Div',
        style: { color: POS, lineWidth: 2 },
        colorBy: ({ index, values }) => (values.divLowFlag[index] ? POS : NO_COLOR),
      },
      {
        key: 'divHighRsi',
        type: 'line',
        title: 'Line Bear Div',
        style: { color: NEG, lineWidth: 2 },
        colorBy: ({ index, values }) => (values.divHighFlag[index] ? NEG : NO_COLOR),
      },
      {
        key: 'divLowPrice',
        type: 'line',
        title: 'Line Bull Div (Price)',
        overlay: true,
        style: { color: POS, lineWidth: 2 },
        colorBy: ({ index, values }) => (values.divLowFlag[index] ? POS : NO_COLOR),
      },
      {
        key: 'divHighPrice',
        type: 'line',
        title: 'Line Bear Div (Price)',
        overlay: true,
        style: { color: NEG, lineWidth: 2 },
        colorBy: ({ index, values }) => (values.divHighFlag[index] ? NEG : NO_COLOR),
      },

      // The four line.new(force_overlay = true) guides. Each one is horizontal
      // between two bars, which is one value per bar on the price pane.
      { key: 'breakLineShort', type: 'line', title: 'Short Break Level', overlay: true, style: { color: NEG, lineWidth: 1, lineStyle: 'dotted' } },
      { key: 'breakLineLong', type: 'line', title: 'Long Break Level', overlay: true, style: { color: POS, lineWidth: 1, lineStyle: 'dotted' } },
      { key: 'retLineShort', type: 'line', title: 'Short Retracement Level', overlay: true, style: { color: NEG, lineWidth: 1, lineStyle: 'dotted' } },
      { key: 'retLineLong', type: 'line', title: 'Long Retracement Level', overlay: true, style: { color: POS, lineWidth: 1, lineStyle: 'dotted' } },
    ],

    fills: [{ between: ['bandBull', 'bandBear'], colorUp: NEU, colorDown: NEU, opacity: 0.05 }],

    levels: () => [
      { price: OVERBOUGHT, title: 'Band Overbought', color: withAlpha(NEG, 0.5), lineStyle: 'dotted' },
      { price: MIDDLE, title: 'Band Middle', color: withAlpha(NEU, 0.5), lineStyle: 'dotted' },
      { price: OVERSOLD, title: 'Band Oversold', color: withAlpha(POS, 0.5), lineStyle: 'dotted' },
    ],

    calc(bars, settings, store, ctx) {
      const n = bars.length
      const col = () => new Array(n).fill(NaN)
      const flagCol = () => new Array(n).fill(false)

      const rsiOut = col()
      const rsiMaOut = col()
      const bandBull = col()
      const bandBear = col()
      const divLowRsi = col()
      const divHighRsi = col()
      const divLowPrice = col()
      const divHighPrice = col()
      const breakLineShort = col()
      const breakLineLong = col()
      const retLineShort = col()
      const retLineLong = col()

      const divLowFlag = flagCol()
      const divHighFlag = flagCol()
      const sigShort1 = flagCol()
      const sigLong1 = flagCol()
      const sigShortBreak = flagCol()
      const sigLongBreak = flagCol()
      const sigShortRet = flagCol()
      const sigLongRet = flagCol()
      const sigShortFlipBreak = flagCol()
      const sigLongFlipBreak = flagCol()
      const sigShortFlipRet = flagCol()
      const sigLongFlipRet = flagCol()

      const cumPchgOut = col()
      const cumVolPchgOut = col()
      const cumVolOut = col()
      const prevVolOut = col()

      const result = () => ({
        rsi: nulls(rsiOut),
        rsiMa: nulls(rsiMaOut),
        bandBull: nulls(bandBull),
        bandBear: nulls(bandBear),
        divLowRsi: nulls(divLowRsi),
        divHighRsi: nulls(divHighRsi),
        divLowPrice: nulls(divLowPrice),
        divHighPrice: nulls(divHighPrice),
        breakLineShort: nulls(breakLineShort),
        breakLineLong: nulls(breakLineLong),
        retLineShort: nulls(retLineShort),
        retLineLong: nulls(retLineLong),
        divLowFlag,
        divHighFlag,
        sigShort1,
        sigLong1,
        sigShortBreak,
        sigLongBreak,
        sigShortRet,
        sigLongRet,
        sigShortFlipBreak,
        sigLongFlipBreak,
        sigShortFlipRet,
        sigLongFlipRet,
        cumPchg: nulls(cumPchgOut),
        cumVolPchg: nulls(cumVolPchgOut),
        cumVol: nulls(cumVolOut),
        prevVol: nulls(prevVolOut),
      })

      if (n === 0) return result()

      const rsiLen = intOr(settings.rsiLength, 14, 1)
      const rsiMaLen = intOr(settings.rsiMaLength, 14, 1)
      const fibVal = numOr(settings.fibValue, 0.5)
      const pLeft = intOr(settings.pivotLeft, 5, 1)
      const pRight = intOr(settings.pivotRight, 5, 1)
      const rangeMax = intOr(settings.rangeMax, 60, 1)
      const rangeMin = intOr(settings.rangeMin, 5, 1)
      const method = scanMethodOf(settings)

      const showBull = settings.showBull !== false
      const showBear = settings.showBear !== false
      const showHiddenBull = settings.showHiddenBull !== false
      const showHiddenBear = settings.showHiddenBear !== false

      const pchgFilter = settings.pchgFilter === true
      const pchgAboveBelow = Math.max(0, numOr(settings.pchgAboveBelow, 2))
      const volFilter = settings.volFilter === true
      const volAbove = Math.max(0, numOr(settings.volAbove, 500000))
      const volPchgFilter = settings.volPchgFilter === true
      const volPchgAbove = Math.max(0, numOr(settings.volPchgAbove, 0))
      const atrFilter = settings.atrFilter === true
      const atrLength = intOr(settings.atrLength, 14, 1)
      const atrMulti = Math.max(1, numOr(settings.atrMulti, 1))
      const bodyFilter = settings.bodyFilter === true
      const bodyPct = Math.min(100, Math.max(0, numOr(settings.bodyPercent, 70))) / 100
      const bodySizeFilter = settings.bodySizeFilter === true
      const bodySizeMulti = Math.max(0, numOr(settings.bodySizeMulti, 2))
      const volumeFilter = settings.volumeFilter === true
      const volSmaLength = intOr(settings.volSmaLength, 20, 1)
      const relVolFilter = settings.relVolFilter === true
      const relVolLength = intOr(settings.relVolLength, 90, 2)
      const relVolMulti = Math.max(0, numOr(settings.relVolMulti, 5))
      const timeFilter = settings.timeFilter === true
      const hourFrom = Math.min(23, intOr(settings.hourFrom, 9, 0))
      const minuteFrom = Math.min(59, intOr(settings.minuteFrom, 15, 0))
      const hourTo = Math.min(23, intOr(settings.hourTo, 10, 0))
      const minuteTo = Math.min(59, intOr(settings.minuteTo, 15, 0))
      const dateFilter = settings.dateFilter === true
      const filterDay = intOr(settings.filterDay, 25, 1)
      const filterMonth = intOr(settings.filterMonth, 10, 1)
      const filterYear = intOr(settings.filterYear, 2024, 0)

      const isDivergence = method === DIVERGENCE
      const isHidden = method === HIDDEN_DIVERGENCE
      const isContLine = method === CONT_BREAK
      const isContRetLine = method === CONT_RET

      // Bar times are UTC seconds and the source reads exchange wall clock
      // (hour, minute, dayofmonth, time('D')), so everything calendar goes
      // through the chart's zone and never the browser's.
      const tz = ctx && typeof ctx.timezone === 'string' && ctx.timezone !== '' ? ctx.timezone : null
      const zone = tz && isValidTimezone(tz) ? tz : DEFAULT_TIMEZONE

      const highs = new Array(n)
      const lows = new Array(n)
      const closes = new Array(n)
      const vols = new Array(n)
      for (let i = 0; i < n; i++) {
        const b = bars[i]
        highs[i] = b.high
        lows[i] = b.low
        closes[i] = b.close
        // A computed or index series carries no volume. Leaving it NaN keeps
        // the volume filters false rather than inventing a number.
        vols[i] = fin(b.volume) ? b.volume : NaN
      }

      const src = sourceValues(bars, settings.rsiSource || 'close')
      const rsiArr = rsi(src, rsiLen)
      const rsiMaArr = sma(rsiArr, rsiMaLen)
      const atrArr = atr(highs, lows, closes, atrLength)
      const volSmaArr = sma(vols, volSmaLength)
      const avgVolArr = sma(vols, relVolLength)

      // relative_volume = volume / nz(average_volume[1], volume): during warmup
      // the fallback makes it exactly 1, not na, and that is what feeds its SMA.
      const relVolArr = col()
      for (let i = 0; i < n; i++) {
        const denom = i > 0 && fin(avgVolArr[i - 1]) ? avgVolArr[i - 1] : vols[i]
        relVolArr[i] = fin(vols[i]) && fin(denom) && denom > 0 ? vols[i] / denom : NaN
      }
      const relVolSmaArr = sma(relVolArr, relVolLength)

      const pivotLowArr = pivotLow(rsiArr, pLeft, pRight)
      const pivotHighArr = pivotHigh(rsiArr, pLeft, pRight)

      // barstate.isconfirmed is only ever false for the bar still forming.
      const lastConfirmed = !(ctx && ctx.barState && ctx.barState.isConfirmed === false)

      // Per-day cumulative percentage change and volume: the inputs of both the
      // performance table and the first four filters.
      const parts = new Array(n)
      let prevDayKey = null
      let cumPchg = NaN
      let currCumVol = NaN
      let prevCumVol = NaN
      for (let i = 0; i < n; i++) {
        const p = utcSecondsToZonedParts(bars[i].time, zone)
        parts[i] = p
        const dayKey = p.year * 10000 + p.month * 100 + p.day
        // ta.change(time('D')) is na on the first bar, so it is not a new day.
        const isNewDay = i > 0 && dayKey !== prevDayKey
        prevDayKey = dayKey

        const prevClose = i > 0 ? closes[i - 1] : NaN
        const dayPchg =
          i > 0 && fin(prevClose) && prevClose !== 0 && fin(closes[i])
            ? ((closes[i] - prevClose) / prevClose) * 100
            : 0
        cumPchg = isNewDay ? dayPchg : !fin(cumPchg) ? dayPchg : cumPchg + dayPchg
        cumPchgOut[i] = cumPchg

        if (isNewDay) {
          prevCumVol = currCumVol
          currCumVol = vols[i]
        } else {
          currCumVol = !fin(currCumVol) ? vols[i] : currCumVol + vols[i]
        }
        const prevSafe = fin(prevCumVol) ? prevCumVol : currCumVol
        cumVolOut[i] = currCumVol
        prevVolOut[i] = prevSafe
        cumVolPchgOut[i] =
          fin(currCumVol) && fin(prevSafe) && prevSafe !== 0
            ? ((currCumVol - prevSafe) / prevSafe) * 100
            : NaN
      }

      // State carried across bars, exactly as the source's var declarations do.
      let state = 0
      let short1Low = NaN
      let short1Bar = -1
      let long1High = NaN
      let long1Bar = -1
      let shortSignalHigh = NaN
      let shortSignalLow = NaN
      let shortSignalBar = -1
      let longSignalHigh = NaN
      let longSignalLow = NaN
      let longSignalBar = -1
      let shortActive = false
      let longActive = false
      let shortRetDone = false
      let longRetDone = false
      let shortRetBar = -1
      let shortRetHigh = NaN
      let longRetBar = -1
      let longRetLow = NaN
      let prevShortFib = NaN
      let prevLongFib = NaN
      // exrem() keeps `var int signal`, whose history is na on the first bar, so
      // the very first break can never register as a flip.
      let flipBreakPrev = null
      let flipRetPrev = null
      // Most recent confirmed pivot bar, for valuewhen(..., 1) and barssince.
      let lastPlBar = -1
      let lastPhBar = -1

      for (let i = 0; i < n; i++) {
        const bar = bars[i]
        const r = rsiArr[i]
        const rm = rsiMaArr[i]
        const rPrev = i > 0 ? rsiArr[i - 1] : NaN

        rsiOut[i] = r
        rsiMaOut[i] = rm
        bandBull[i] = BREAKOUT
        bandBear[i] = BREAKDOWN

        /* ---- additional filters -------------------------------------- */
        const range = bar.high - bar.low
        const body = Math.abs(bar.close - bar.open)
        const prevRange = i > 0 ? highs[i - 1] - lows[i - 1] : NaN

        // The source asks for the day to be above +N and below -N at the same
        // time, so enabling this filter blocks every signal. Ported as written.
        const pchgAboveOk = !pchgFilter || (fin(cumPchgOut[i]) && cumPchgOut[i] > pchgAboveBelow)
        const pchgBelowOk = !pchgFilter || (fin(cumPchgOut[i]) && cumPchgOut[i] < -pchgAboveBelow)
        const volOk = !volFilter || (fin(cumVolOut[i]) && cumVolOut[i] >= volAbove)
        const volPchgOk = !volPchgFilter || (fin(cumVolPchgOut[i]) && cumVolPchgOut[i] >= volPchgAbove)
        const atrOk = !atrFilter || (fin(atrArr[i]) && range > atrArr[i] * atrMulti)
        const bodyOk = !bodyFilter || (range > 0 && body / range >= bodyPct)
        const bodySizeOk =
          !bodySizeFilter ||
          (range > 0 && body / range >= bodyPct && fin(prevRange) && range >= prevRange * bodySizeMulti)
        const volumeOk = !volumeFilter || (fin(vols[i]) && fin(volSmaArr[i]) && vols[i] > volSmaArr[i])
        const relVolOk =
          !relVolFilter ||
          (fin(relVolArr[i]) && fin(relVolSmaArr[i]) && relVolArr[i] > relVolSmaArr[i] * relVolMulti)
        const hour = parts[i].hour
        const minute = parts[i].minute
        const timeOk =
          !timeFilter ||
          ((hour > hourFrom || (hour === hourFrom && minute >= minuteFrom)) &&
            (hour < hourTo || (hour === hourTo && minute < minuteTo)))
        const dateOk =
          !dateFilter ||
          (parts[i].year === filterYear && parts[i].month === filterMonth && parts[i].day === filterDay)
        const filtersOk =
          pchgAboveOk &&
          pchgBelowOk &&
          volOk &&
          volPchgOk &&
          atrOk &&
          bodyOk &&
          bodySizeOk &&
          volumeOk &&
          relVolOk &&
          timeOk &&
          dateOk
        const confirmed = i < n - 1 || lastConfirmed

        /* ---- the state machine --------------------------------------- */
        // state := nz(state[1]) == 3 or nz(state[1]) == 6 ? 0 : nz(state[1])
        if (state === 3 || state === 6) state = 0

        const crossUnderBreakdown = fin(r) && fin(rPrev) && r < BREAKDOWN && rPrev >= BREAKDOWN
        const crossOverBreakout = fin(r) && fin(rPrev) && r > BREAKOUT && rPrev <= BREAKOUT

        const short1 =
          crossUnderBreakdown && fin(rm) && r < rm && (state === 0 || (state >= 4 && state <= 5))
        if (short1) {
          short1Low = bar.low
          short1Bar = i
        }
        const short2 = fin(r) && r > BREAKDOWN
        const short3 =
          fin(short1Low) &&
          fin(r) &&
          r < BREAKDOWN &&
          fin(rm) &&
          r < rm &&
          bar.close < short1Low &&
          filtersOk &&
          confirmed

        const long1 =
          crossOverBreakout && fin(rm) && r > rm && (state === 0 || (state >= 1 && state <= 2))
        if (long1) {
          long1High = bar.high
          long1Bar = i
        }
        const long2 = fin(r) && r < BREAKOUT
        const long3 =
          fin(long1High) &&
          fin(r) &&
          r > BREAKOUT &&
          fin(rm) &&
          r > rm &&
          bar.close > long1High &&
          filtersOk &&
          confirmed

        if (short1) state = 1
        else if (short2 && state === 1) state = 2
        else if (short3 && state === 2) state = 3
        else if (long1) state = 4
        else if (long2 && state === 4) state = 5
        else if (long3 && state === 5) state = 6

        const shortContBreak = state === 3
        const longContBreak = state === 6

        sigShort1[i] = short1
        sigLong1[i] = long1
        sigShortBreak[i] = shortContBreak
        sigLongBreak[i] = longContBreak

        /* ---- continuous retracement ---------------------------------- */
        if (shortContBreak) {
          shortSignalHigh = bar.high
          shortSignalLow = bar.low
          shortSignalBar = i
        }
        if (longContBreak) {
          longSignalHigh = bar.high
          longSignalLow = bar.low
          longSignalBar = i
        }
        const shortFib =
          fin(shortSignalHigh) && fin(shortSignalLow)
            ? shortSignalHigh - (shortSignalHigh - shortSignalLow) * fibVal
            : NaN
        const longFib =
          fin(longSignalHigh) && fin(longSignalLow)
            ? longSignalLow + (longSignalHigh - longSignalLow) * fibVal
            : NaN

        if (shortContBreak) {
          shortActive = true
          longActive = false
          shortRetDone = false
          longRetDone = false
        }
        if (longContBreak) {
          longActive = true
          shortActive = false
          longRetDone = false
          shortRetDone = false
        }

        const prevHigh = i > 0 ? highs[i - 1] : NaN
        const prevLow = i > 0 ? lows[i - 1] : NaN
        // ta.crossover(high, short_fib_val) compares against the PREVIOUS bar's
        // fib level; the source then adds high[1] < the current one.
        const shortContRet =
          shortActive &&
          !shortRetDone &&
          fin(shortFib) &&
          fin(prevShortFib) &&
          fin(prevHigh) &&
          bar.high > shortFib &&
          prevHigh <= prevShortFib &&
          prevHigh < shortFib
        const longContRet =
          longActive &&
          !longRetDone &&
          fin(longFib) &&
          fin(prevLongFib) &&
          fin(prevLow) &&
          bar.low < longFib &&
          prevLow >= prevLongFib &&
          prevLow > longFib

        if (shortContRet) {
          shortRetDone = true
          shortRetBar = i
          shortRetHigh = bar.high
        }
        if (longContRet) {
          longRetDone = true
          longRetBar = i
          longRetLow = bar.low
        }
        sigShortRet[i] = shortContRet
        sigLongRet[i] = longContRet

        /* ---- flip signals (exrem) ------------------------------------ */
        const fbNow = longContBreak ? 1 : shortContBreak ? -1 : flipBreakPrev
        const fbEntry = fbNow !== null && flipBreakPrev !== null && fbNow !== flipBreakPrev
        sigLongFlipBreak[i] = fbEntry && fbNow === 1
        sigShortFlipBreak[i] = fbEntry && fbNow === -1
        flipBreakPrev = fbNow

        const frNow = longContRet ? 1 : shortContRet ? -1 : flipRetPrev
        const frEntry = frNow !== null && flipRetPrev !== null && frNow !== flipRetPrev
        sigLongFlipRet[i] = frEntry && frNow === 1
        sigShortFlipRet[i] = frEntry && frNow === -1
        flipRetPrev = frNow

        /* ---- the drawn guide lines ----------------------------------- */
        if (shortContBreak && isContLine && fin(short1Low) && short1Bar >= 0 && shortSignalBar >= 0) {
          for (let k = short1Bar; k <= shortSignalBar; k++) breakLineShort[k] = short1Low
        }
        if (longContBreak && isContLine && fin(long1High) && long1Bar >= 0 && longSignalBar >= 0) {
          for (let k = long1Bar; k <= longSignalBar; k++) breakLineLong[k] = long1High
        }
        if (
          shortContRet &&
          isContRetLine &&
          fin(shortFib) &&
          fin(shortRetHigh) &&
          shortSignalBar >= 0 &&
          shortRetBar >= 0
        ) {
          for (let k = shortSignalBar; k <= shortRetBar; k++) retLineShort[k] = shortFib
        }
        if (
          longContRet &&
          isContRetLine &&
          fin(longFib) &&
          fin(longRetLow) &&
          longSignalBar >= 0 &&
          longRetBar >= 0
        ) {
          for (let k = longSignalBar; k <= longRetBar; k++) retLineLong[k] = longFib
        }

        prevShortFib = shortFib
        prevLongFib = longFib

        /* ---- divergence ---------------------------------------------- */
        const plFound = fin(pivotLowArr[i])
        const phFound = fin(pivotHighArr[i])
        const lbr = i - pRight
        const rsiLBR = lbr >= 0 ? rsiArr[lbr] : NaN
        const lowLBR = lbr >= 0 ? lows[lbr] : NaN
        const highLBR = lbr >= 0 ? highs[lbr] : NaN

        // _inRange(plFound[1]) is barssince of the shifted flag, which is the
        // gap back to the previous pivot less one bar.
        const plGap = lastPlBar >= 0 ? i - lastPlBar - 1 : NaN
        const phGap = lastPhBar >= 0 ? i - lastPhBar - 1 : NaN
        const plInRange = fin(plGap) && plGap >= rangeMin && plGap <= rangeMax
        const phInRange = fin(phGap) && phGap >= rangeMin && phGap <= rangeMax
        // ta.valuewhen(plFound, x, 1): the value carried at the previous pivot.
        const prevPlIdx = lastPlBar - pRight
        const prevPhIdx = lastPhBar - pRight
        const prevPlRsi = lastPlBar >= 0 && prevPlIdx >= 0 ? rsiArr[prevPlIdx] : NaN
        const prevPlLow = lastPlBar >= 0 && prevPlIdx >= 0 ? lows[prevPlIdx] : NaN
        const prevPhRsi = lastPhBar >= 0 && prevPhIdx >= 0 ? rsiArr[prevPhIdx] : NaN
        const prevPhHigh = lastPhBar >= 0 && prevPhIdx >= 0 ? highs[prevPhIdx] : NaN

        const rsiHL = fin(rsiLBR) && fin(prevPlRsi) && rsiLBR > prevPlRsi && plInRange
        const priceLL = fin(lowLBR) && fin(prevPlLow) && lowLBR < prevPlLow
        const bullDiv = isDivergence && showBull && priceLL && rsiHL && plFound

        const rsiLH = fin(rsiLBR) && fin(prevPhRsi) && rsiLBR < prevPhRsi && phInRange
        const priceHH = fin(highLBR) && fin(prevPhHigh) && highLBR > prevPhHigh
        const bearDiv = isDivergence && showBear && priceHH && rsiLH && phFound

        const rsiLL = fin(rsiLBR) && fin(prevPlRsi) && rsiLBR < prevPlRsi && plInRange
        const priceHL = fin(lowLBR) && fin(prevPlLow) && lowLBR > prevPlLow
        const hiddenBullDiv = isHidden && showHiddenBull && priceHL && rsiLL && plFound

        const rsiHH = fin(rsiLBR) && fin(prevPhRsi) && rsiLBR > prevPhRsi && phInRange
        const priceLH = fin(highLBR) && fin(prevPhHigh) && highLBR < prevPhHigh
        const hiddenBearDiv = isHidden && showHiddenBear && priceLH && rsiHH && phFound

        // offset = -i_rsi_p_right draws the point back on the pivot bar itself.
        if (lbr >= 0 && (isDivergence || isHidden)) {
          if (plFound) {
            divLowRsi[lbr] = rsiLBR
            divLowPrice[lbr] = lowLBR
            divLowFlag[lbr] = bullDiv || hiddenBullDiv
          }
          if (phFound) {
            divHighRsi[lbr] = rsiLBR
            divHighPrice[lbr] = highLBR
            divHighFlag[lbr] = bearDiv || hiddenBearDiv
          }
        }

        if (plFound) lastPlBar = i
        if (phFound) lastPhBar = i
      }

      return result()
    },

    markers({ bars, values, settings }) {
      const method = scanMethodOf(settings)
      const showLong = settings.showLong !== false
      const showShort = settings.showShort !== false
      const isCont = method === CONT_BREAK || method === CONT_RET
      const isContRet = method === CONT_RET
      const isFlip = method === FLIP_BREAK
      const isFlipRet = method === FLIP_RET
      const out = []
      if (!isCont && !isFlip && !isFlipRet) return out

      for (let i = 0; i < bars.length; i++) {
        const time = bars[i].time
        if (isCont && showShort && values.sigShort1[i]) {
          out.push({ time, position: 'aboveBar', shape: 'circle', color: NEG_LIGHT, size: 'small' })
        }
        if (isCont && showLong && values.sigLong1[i]) {
          out.push({ time, position: 'belowBar', shape: 'circle', color: POS_LIGHT, size: 'small' })
        }
        if (isCont && showShort && values.sigShortBreak[i]) {
          out.push({ time, position: 'aboveBar', shape: 'triangleDown', color: NEG_LIGHT, size: 'small', text: '2' })
        }
        if (isCont && showLong && values.sigLongBreak[i]) {
          out.push({ time, position: 'belowBar', shape: 'triangleUp', color: POS_LIGHT, size: 'small', text: '2' })
        }
        if (isContRet && showShort && values.sigShortRet[i]) {
          out.push({ time, position: 'aboveBar', shape: 'triangleDown', color: NEG_LIGHT, size: 'small', text: '3' })
        }
        if (isContRet && showLong && values.sigLongRet[i]) {
          out.push({ time, position: 'belowBar', shape: 'triangleUp', color: POS_LIGHT, size: 'small', text: '3' })
        }
        if (isFlip && showShort && values.sigShortFlipBreak[i]) {
          out.push({ time, position: 'aboveBar', shape: 'triangleDown', color: NEG_LIGHT, size: 'small', text: '2' })
        }
        if (isFlip && showLong && values.sigLongFlipBreak[i]) {
          out.push({ time, position: 'belowBar', shape: 'triangleUp', color: POS_LIGHT, size: 'small', text: '2' })
        }
        if (isFlipRet && showShort && values.sigShortFlipRet[i]) {
          out.push({ time, position: 'aboveBar', shape: 'triangleDown', color: NEG_LIGHT, size: 'small', text: '3' })
        }
        if (isFlipRet && showLong && values.sigLongFlipRet[i]) {
          out.push({ time, position: 'belowBar', shape: 'triangleUp', color: POS_LIGHT, size: 'small', text: '3' })
        }
      }
      return out
    },

    // bgcolor(), one entry per bar. The source paints a later call over an
    // earlier one, so the retracement and flip shades win where they overlap.
    background({ bars, values, settings }) {
      const method = scanMethodOf(settings)
      const showLong = settings.showLong !== false
      const showShort = settings.showShort !== false
      const isCont = method === CONT_BREAK || method === CONT_RET
      const isContRet = method === CONT_RET
      const isFlip = method === FLIP_BREAK
      const isFlipRet = method === FLIP_RET
      const shortShade = withAlpha(NEG_LIGHT, 0.1)
      const longShade = withAlpha(POS_LIGHT, 0.1)

      const out = new Array(bars.length).fill(null)
      for (let i = 0; i < bars.length; i++) {
        if (isFlipRet && showShort && values.sigShortFlipRet[i]) out[i] = shortShade
        else if (isFlipRet && showLong && values.sigLongFlipRet[i]) out[i] = longShade
        else if (isFlip && showShort && values.sigShortFlipBreak[i]) out[i] = shortShade
        else if (isFlip && showLong && values.sigLongFlipBreak[i]) out[i] = longShade
        else if (isContRet && showShort && values.sigShortRet[i]) out[i] = shortShade
        else if (isContRet && showLong && values.sigLongRet[i]) out[i] = longShade
        else if (isCont && showShort && values.sigShortBreak[i]) out[i] = shortShade
        else if (isCont && showLong && values.sigLongBreak[i]) out[i] = longShade
      }
      return out
    },

    // barcolor(), which repaints the price candles themselves.
    barColors({ bars, values, settings }) {
      const method = scanMethodOf(settings)
      const showLong = settings.showLong !== false
      const showShort = settings.showShort !== false
      const isCont = method === CONT_BREAK || method === CONT_RET
      const isContRet = method === CONT_RET
      const isFlip = method === FLIP_BREAK
      const isFlipRet = method === FLIP_RET

      const out = new Array(bars.length).fill(null)
      for (let i = 0; i < bars.length; i++) {
        if (isFlipRet && showShort && values.sigShortFlipRet[i]) out[i] = NEG_LIGHT
        else if (isFlipRet && showLong && values.sigLongFlipRet[i]) out[i] = POS_LIGHT
        else if (isFlip && showShort && values.sigShortFlipBreak[i]) out[i] = NEG_LIGHT
        else if (isFlip && showLong && values.sigLongFlipBreak[i]) out[i] = POS_LIGHT
        else if (isContRet && showShort && values.sigShortRet[i]) out[i] = NEG_LIGHT
        else if (isContRet && showLong && values.sigLongRet[i]) out[i] = POS_LIGHT
        else if (isCont && showShort && values.sigShortBreak[i]) out[i] = NEG_LIGHT
        else if (isCont && showLong && values.sigLongBreak[i]) out[i] = POS_LIGHT
        else if (isCont && showShort && values.sigShort1[i]) out[i] = NEG_LIGHT
        else if (isCont && showLong && values.sigLong1[i]) out[i] = POS_LIGHT
      }
      return out
    },

    table({ bars, values, settings }) {
      if (settings.showTable === false || bars.length === 0) return null
      const i = bars.length - 1
      const cumPchg = values.cumPchg[i]
      const cumVolPchg = values.cumVolPchg[i]
      const cumVol = values.cumVol[i]
      const prevVol = values.prevVol[i]

      const pchgCol = fin(cumPchg) && cumPchg > 0 ? POS : NEG
      const volPchgCol = fin(cumVolPchg) && cumVolPchg > 0 ? POS : NEG
      const prevVolCol = fin(prevVol) && fin(cumVol) && prevVol < cumVol ? NEG : POS

      const label = (text) => ({ text, bgColor: NEU_DARK, textColor: NEU, align: 'left' })
      const value = (text, textColor) => ({ text, bgColor: NEU_DARK, textColor, align: 'right' })
      const lakh = (v) => (fin(v) ? fmt2(v / 100000) + ' L' : 'n/a')

      return {
        rows: [
          [label('%Chg'), value(fmt2(cumPchg) + ' %', pchgCol)],
          [label('Vol %Chg'), value(fmt2(cumVolPchg) + ' %', volPchgCol)],
          [label('Vol'), value(lakh(cumVol), volPchgCol)],
          [label('PD Vol'), value(lakh(prevVol), prevVolCol)],
        ],
        options: {
          position: TABLE_POSITIONS.includes(settings.tablePosition)
            ? settings.tablePosition
            : 'bottom-right',
          fontSize: TABLE_SIZES[settings.tableSize] ?? TABLE_SIZES.normal,
          cellWidth: [90, 90],
          cellHeight: 20,
          borderColor: withAlpha(NEU, 0.35),
        },
      }
    },
  })
}
