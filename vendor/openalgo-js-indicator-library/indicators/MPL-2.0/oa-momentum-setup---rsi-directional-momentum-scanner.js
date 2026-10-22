/**
 * Momentum Setup - RSI Directional Momentum Scanner - ported to openalgo-charts
 * from Pine Script v6.
 *
 * Source: https://github.com/ArunKBhaskar/PineScript/blob/c6821225c466494b01eee08f9dd88bf84d2b24ba/Momentum Setup - RSI Directional Momentum/[Scanner] Momentum Setup - RSI Directional Momentum.txt
 * Repo:   ArunKBhaskar/PineScript
 * License: MPL-2.0 (c) Arun_K_Bhaskar
 * SPDX-FileCopyrightText: (c) Arun_K_Bhaskar
 * SPDX-FileCopyrightText: (c) 2026 marketcalls (port to openalgo-charts)
 * SPDX-License-Identifier: MPL-2.0
 *
 * An RSI state machine: RSI crosses 60 (or 40), pulls back through it, then
 * breaks the high (or low) of the crossing candle while still on the right side
 * of the band. A Fibonacci level of the breaking candle gives the retracement
 * entry, a failed sequence flips the side, and classic and hidden RSI
 * divergences are the two remaining scan modes.
 */

export default function ({
  registerIndicator,
  sourceValues,
  rsi,
  sma,
  atr,
  pivotHigh,
  pivotLow,
  barsSince,
  valueWhen,
  nulls,
  isValidTimezone,
  utcSecondsToZonedParts,
  isNewZonedDay,
  DEFAULT_TIMEZONE,
}) {
  // The palette is hard-coded in the source: its input.color lines are all
  // commented out, so none of these is a user setting.
  const POS = '#089981'
  const POS_LIGHT = '#70CCBD'
  const NEG_LIGHT = '#FAA1A4'
  const NEG = '#F23645'
  const INDICATOR = '#2962FF'
  const SIGNAL = '#FF6D00'
  const NEU = '#D1D4DC'
  const NEU_DARK = '#0F0F0F'

  // Pine's fixed RSI bands.
  const OVERBOUGHT = 70
  const BREAKOUT = 60
  const MIDDLE = 50
  const BREAKDOWN = 40
  const OVERSOLD = 30

  const METHODS = [
    'Continuous Break',
    'Continuous Retracement',
    'Flip Break',
    'Flip Retracement',
    'Divergence',
    'Hidden Divergence',
  ]

  const SOURCES = ['open', 'high', 'low', 'close', 'hl2', 'hlc3', 'ohlc4']

  const TABLE_POSITIONS = [
    'top-left',
    'top-center',
    'top-right',
    'middle-left',
    'middle-center',
    'middle-right',
    'bottom-left',
    'bottom-center',
    'bottom-right',
  ]

  // A cleared number or text field arrives as '', and Number('') is 0, which is
  // a legal value for several of these inputs. Treat only an empty field as
  // missing so a deliberate 0 survives.
  const num = (v, fallback) => {
    if (v === '' || v === null || v === undefined) return fallback
    const x = Number(v)
    return Number.isFinite(x) ? x : fallback
  }
  const int = (v, fallback, min, max) => {
    let x = Math.floor(num(v, fallback))
    if (!Number.isFinite(x)) x = fallback
    if (min !== undefined) x = Math.max(min, x)
    if (max !== undefined) x = Math.min(max, x)
    return x
  }
  const pick = (v, list, fallback) => (list.indexOf(v) >= 0 ? v : fallback)

  // Pine's '#.##' drops trailing zeros and the bare decimal point.
  const fmt2 = (v) => {
    if (!Number.isFinite(v)) return 'n/a'
    const s = v.toFixed(2)
    return s.indexOf('.') >= 0 ? s.replace(/\.?0+$/, '') : s
  }

  registerIndicator({
    id: 'oa-momentum-setup---rsi-directional-momentum-scanner',
    name: 'Momentum Setup - RSI Directional Momentum Scanner',
    category: 'ICT',
    // The Pine indicator() call carries no overlay argument, so it is a pane
    // study: RSI, its moving average and five bands are what it plots. The
    // signal shapes, bar colours and level lines were force_overlay, and reach
    // the price pane here through markers, barColors and one overlay plot.
    placement: 'pane',

    inputs: [
      {
        key: 'scanMethod',
        type: 'select',
        label: 'Scanning Method',
        default: 'Continuous Break',
        group: 'Scanner',
        options: METHODS.map((m) => ({ label: m, value: m })),
        tooltip:
          'Continuous Break: RSI crosses above 60, dips below, then breaks the previous high while staying above 60 (mirrored for shorts). ' +
          'Continuous Retracement: price returns to the Fibonacci level of the breaking candle and turns. ' +
          'Flip Break and Flip Retracement: a failed sequence flips the side. ' +
          'Divergence: price lower low with RSI higher low. Hidden Divergence: trend continuation.',
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
        tooltip:
          '0 is the bottom of a bullish and the top of a bearish breaking candle, 1 is the opposite edge, 0.5 is its midpoint.',
      },
      { key: 'showBull', type: 'boolean', label: 'Display Bullish Divergence', default: true, group: 'RSI' },
      { key: 'showBear', type: 'boolean', label: 'Display Bearish Divergence', default: true, group: 'RSI' },
      { key: 'showHiddenBull', type: 'boolean', label: 'Display Hidden Bullish Divergence', default: true, group: 'RSI' },
      { key: 'showHiddenBear', type: 'boolean', label: 'Display Hidden Bearish Divergence', default: true, group: 'RSI' },
      { key: 'pivotRight', type: 'number', label: 'Pivot Lookback Right', default: 5, min: 1, max: 500, step: 1, group: 'RSI' },
      { key: 'pivotLeft', type: 'number', label: 'Pivot Lookback Left', default: 5, min: 1, max: 500, step: 1, group: 'RSI' },
      { key: 'rangeMax', type: 'number', label: 'Max of Lookback Range', default: 60, min: 1, max: 5000, step: 1, group: 'RSI' },
      { key: 'rangeMin', type: 'number', label: 'Min of Lookback Range', default: 5, min: 0, max: 5000, step: 1, group: 'RSI' },

      {
        key: 'pchgFilter',
        type: 'boolean',
        label: 'Apply % Change Filter',
        default: false,
        group: 'Additional Filters',
        tooltip:
          'Day percentage change filter. The source requires the change to be both above +N and below -N at once, so turning this on silences every signal. Kept as written.',
      },
      { key: 'pchgAboveBelow', type: 'number', label: '% Change Above/Below +/-', default: 2, min: 0, max: 1000, step: 0.1, group: 'Additional Filters' },
      { key: 'volFilter', type: 'boolean', label: 'Apply Volume Filter', default: false, group: 'Additional Filters', tooltip: 'Cumulative volume so far today must clear the figure below.' },
      { key: 'volAbove', type: 'number', label: 'Volume Above', default: 500000, min: 0, max: 1000000000000, step: 1, group: 'Additional Filters' },
      {
        key: 'volPchgFilter',
        type: 'boolean',
        label: 'Apply Volume % Change Filter',
        default: false,
        group: 'Additional Filters',
        tooltip: "0% means today's volume must exceed the previous day's. 300%+ often signals a major breakout.",
      },
      { key: 'volPchgAbove', type: 'number', label: 'Volume % Change Above', default: 0, min: 0, max: 100000, step: 1, group: 'Additional Filters' },
      { key: 'atrFilter', type: 'boolean', label: 'Apply ATR Filter', default: false, group: 'Additional Filters', tooltip: 'Filters out longer or more volatile signal candles.' },
      { key: 'atrLength', type: 'number', label: 'ATR Length', default: 14, min: 1, max: 5000, step: 1, group: 'Additional Filters' },
      { key: 'atrMulti', type: 'number', label: 'ATR Multiplier', default: 1, min: 1, max: 100, step: 0.1, group: 'Additional Filters' },
      { key: 'bodyFilter', type: 'boolean', label: 'Apply Body % Filter', default: false, group: 'Additional Filters', tooltip: '80 means the body covers 80 percent or more of the candle.' },
      { key: 'bodyPercent', type: 'number', label: 'Body % Above', default: 70, min: 0, max: 100, step: 1, group: 'Additional Filters' },
      { key: 'bodySizeFilter', type: 'boolean', label: 'Apply Body Size Filter', default: false, group: 'Additional Filters', tooltip: '2 means the candle is twice the size of the previous one.' },
      { key: 'bodySizeMulti', type: 'number', label: 'Body Size Multiplier (x)', default: 2, min: 0, max: 1000, step: 1, group: 'Additional Filters' },
      { key: 'volumeSmaFilter', type: 'boolean', label: 'Apply Volume SMA Filter', default: false, group: 'Additional Filters', tooltip: 'Filter candles with volume above the SMA of volume.' },
      { key: 'volSmaLength', type: 'number', label: 'Volume SMA Length', default: 20, min: 1, max: 5000, step: 1, group: 'Additional Filters' },
      { key: 'relVolFilter', type: 'boolean', label: 'Apply Relative Volume Filter', default: false, group: 'Additional Filters', tooltip: 'Filter candles with volume above the relative volume threshold.' },
      { key: 'relVolLength', type: 'number', label: 'Relative Volume Length', default: 90, min: 2, max: 5000, step: 1, group: 'Additional Filters' },
      { key: 'relVolMulti', type: 'number', label: 'Rel Vol SMA Multiplier', default: 5, min: 0, max: 1000, step: 0.1, group: 'Additional Filters' },
      { key: 'timeFilter', type: 'boolean', label: 'Apply Time Filter', default: false, group: 'Additional Filters', tooltip: 'Accept signals only inside this exchange-clock window.' },
      { key: 'hourFrom', type: 'number', label: 'Time From (hour)', default: 9, min: 0, max: 23, step: 1, group: 'Additional Filters' },
      { key: 'minuteFrom', type: 'number', label: 'Time From (minute)', default: 15, min: 0, max: 59, step: 1, group: 'Additional Filters' },
      { key: 'hourTo', type: 'number', label: 'Time To (hour)', default: 10, min: 0, max: 23, step: 1, group: 'Additional Filters' },
      { key: 'minuteTo', type: 'number', label: 'Time To (minute)', default: 15, min: 0, max: 59, step: 1, group: 'Additional Filters' },
      { key: 'dateFilter', type: 'boolean', label: 'Apply Date Filter', default: false, group: 'Additional Filters', tooltip: 'Accept signals on one calendar date only.' },
      { key: 'day', type: 'number', label: 'Day', default: 25, min: 1, max: 31, step: 1, group: 'Additional Filters' },
      { key: 'month', type: 'number', label: 'Month', default: 10, min: 1, max: 12, step: 1, group: 'Additional Filters' },
      { key: 'year', type: 'number', label: 'Year', default: 2024, min: 0, max: 9999, step: 1, group: 'Additional Filters' },

      { key: 'showPerfTable', type: 'boolean', label: 'Display', default: true, group: 'Performance Table' },
      {
        key: 'perfTablePosition',
        type: 'select',
        label: 'Position',
        default: 'bottom-right',
        group: 'Performance Table',
        options: TABLE_POSITIONS.map((p) => ({ label: p, value: p })),
      },
    ],

    plots: [
      { key: 'rsi', type: 'line', title: 'RSI', style: { color: INDICATOR, lineWidth: 2 } },
      { key: 'rsiMa', type: 'line', title: 'RSI Moving Average', style: { color: SIGNAL, lineWidth: 1 } },
      { key: 'bandUpper', type: 'line', title: 'Band Bullish', style: { color: NEU, lineWidth: 1, lineStyle: 'dotted' } },
      { key: 'bandLower', type: 'line', title: 'Band Bearish', style: { color: NEU, lineWidth: 1, lineStyle: 'dotted' } },
      {
        // The Pine line.new calls, which were force_overlay: the break level of
        // the first candle in Continuous Break mode, the Fibonacci level in
        // Continuous Retracement mode. Only one of the two can be live at a
        // time, because the scanning method picks it, so one column carries
        // both and colorBy reads the side off `levelSide`.
        key: 'level',
        type: 'line',
        title: 'Signal Level',
        overlay: true,
        style: { color: NEG, lineWidth: 1, lineStyle: 'dotted' },
        colorBy({ index, values }) {
          const side = values.levelSide ? values.levelSide[index] : null
          if (side === 1) return POS
          if (side === -1) return NEG
          return undefined
        },
      },
    ],

    fills: [{ between: ['bandUpper', 'bandLower'], colorUp: NEU, colorDown: NEU, opacity: 0.05 }],

    levels: () => [
      { price: OVERBOUGHT, title: 'Band Overbought', color: NEG, lineStyle: 'dotted' },
      { price: MIDDLE, title: 'Band Middle', color: NEU, lineStyle: 'dotted' },
      { price: OVERSOLD, title: 'Band Oversold', color: POS, lineStyle: 'dotted' },
    ],

    range: () => ({ min: 0, max: 100 }),

    calc(bars, settings, store, ctx) {
      const n = bars.length

      const method = pick(settings.scanMethod, METHODS, 'Continuous Break')
      const rsiLen = int(settings.rsiLength, 14, 1)
      const rsiMaLen = int(settings.rsiMaLength, 14, 1)
      const fibValue = num(settings.fibValue, 0.5)
      const showBull = settings.showBull !== false
      const showBear = settings.showBear !== false
      const showHiddenBull = settings.showHiddenBull !== false
      const showHiddenBear = settings.showHiddenBear !== false
      const pRight = int(settings.pivotRight, 5, 1)
      const pLeft = int(settings.pivotLeft, 5, 1)
      const rangeMax = int(settings.rangeMax, 60, 1)
      const rangeMin = int(settings.rangeMin, 5, 0)

      const pchgFilter = settings.pchgFilter === true
      const pchgAboveBelow = Math.max(0, num(settings.pchgAboveBelow, 2))
      const volFilter = settings.volFilter === true
      const volAbove = Math.max(0, num(settings.volAbove, 500000))
      const volPchgFilter = settings.volPchgFilter === true
      const volPchgAbove = Math.max(0, num(settings.volPchgAbove, 0))
      const atrFilter = settings.atrFilter === true
      const atrLength = int(settings.atrLength, 14, 1)
      const atrMulti = Math.max(1, num(settings.atrMulti, 1))
      const bodyFilter = settings.bodyFilter === true
      // Pine divides the 0..100 input by 100 at declaration.
      const bodyPercent = Math.min(1, Math.max(0, num(settings.bodyPercent, 70) / 100))
      const bodySizeFilter = settings.bodySizeFilter === true
      const bodySizeMulti = int(settings.bodySizeMulti, 2, 0)
      const volumeSmaFilter = settings.volumeSmaFilter === true
      const volSmaLength = int(settings.volSmaLength, 20, 1)
      const relVolFilter = settings.relVolFilter === true
      const relVolLength = int(settings.relVolLength, 90, 2)
      const relVolMulti = Math.max(0, num(settings.relVolMulti, 5))
      const timeFilter = settings.timeFilter === true
      const hourFrom = int(settings.hourFrom, 9, 0)
      const minuteFrom = int(settings.minuteFrom, 15, 0)
      const hourTo = int(settings.hourTo, 10, 0)
      const minuteTo = int(settings.minuteTo, 15, 0)
      const dateFilter = settings.dateFilter === true
      const dayOf = int(settings.day, 25, 1, 31)
      const monthOf = int(settings.month, 10, 1, 12)
      const yearOf = int(settings.year, 2024, 0)

      const srcKey = pick(settings.rsiSource, SOURCES, 'close')
      const zone =
        ctx && typeof ctx.timezone === 'string' && isValidTimezone(ctx.timezone)
          ? ctx.timezone
          : DEFAULT_TIMEZONE

      const col = () => new Array(n).fill(NaN)

      const rsiCol = col()
      const rsiMaCol = col()
      const bandUpper = new Array(n).fill(BREAKOUT)
      const bandLower = new Array(n).fill(BREAKDOWN)
      const level = col()
      const levelSide = col()
      const s1Short = col()
      const s1Long = col()
      const s2Short = col()
      const s2Long = col()
      const s3Short = col()
      const s3Long = col()
      const divBull = col()
      const divBear = col()
      const divHBull = col()
      const divHBear = col()
      const cumPchgCol = col()
      const cumVolCol = col()
      const prevVolCol = col()
      const cumVolPchgCol = col()

      const out = () => ({
        rsi: nulls(rsiCol),
        rsiMa: nulls(rsiMaCol),
        bandUpper: bandUpper.slice(),
        bandLower: bandLower.slice(),
        level: nulls(level),
        levelSide: nulls(levelSide),
        s1Short: nulls(s1Short),
        s1Long: nulls(s1Long),
        s2Short: nulls(s2Short),
        s2Long: nulls(s2Long),
        s3Short: nulls(s3Short),
        s3Long: nulls(s3Long),
        divBull: nulls(divBull),
        divBear: nulls(divBear),
        divHBull: nulls(divHBull),
        divHBear: nulls(divHBear),
        cumPchg: nulls(cumPchgCol),
        cumVol: nulls(cumVolCol),
        prevVol: nulls(prevVolCol),
        cumVolPchg: nulls(cumVolPchgCol),
      })

      if (n === 0) return out()

      const src = sourceValues(bars, srcKey)
      const high = bars.map((b) => b.high)
      const low = bars.map((b) => b.low)
      const close = bars.map((b) => b.close)
      const open = bars.map((b) => b.open)
      // Volume is genuinely optional: an index series carries none, and Pine
      // sees na there too, so keep it non-finite rather than inventing a zero.
      const volume = bars.map((b) => (Number.isFinite(b.volume) ? b.volume : NaN))

      const rsiSeries = rsi(src, rsiLen)
      const rsiMaSeries = sma(rsiSeries, rsiMaLen)
      for (let i = 0; i < n; i++) {
        rsiCol[i] = rsiSeries[i]
        rsiMaCol[i] = rsiMaSeries[i]
      }

      /* ---- performance: cumulative change and volume, reset each day ---- */

      // ta.change(time('D')) is na on the first bar, and na != 0 is false, so
      // bar 0 is deliberately not a new day.
      const isNewDay = new Array(n).fill(false)
      for (let i = 1; i < n; i++) {
        isNewDay[i] = isNewZonedDay(bars[i - 1].time, bars[i].time, zone) === true
      }

      let cum = NaN
      let currVol = NaN
      let prevVol = NaN
      for (let i = 0; i < n; i++) {
        const prevClose = i > 0 ? close[i - 1] : NaN
        const dayPchg =
          !Number.isFinite(prevClose) || prevClose === 0 ? 0 : ((close[i] - prevClose) / prevClose) * 100
        cum = isNewDay[i] ? dayPchg : !Number.isFinite(cum) ? dayPchg : cum + dayPchg
        cumPchgCol[i] = cum

        if (isNewDay[i]) {
          prevVol = currVol
          currVol = volume[i]
        } else {
          currVol = !Number.isFinite(currVol) ? volume[i] : currVol + volume[i]
        }
        // nz(prev_cum_vol, curr_cum_vol)
        const base = Number.isFinite(prevVol) ? prevVol : currVol
        cumVolCol[i] = currVol
        prevVolCol[i] = base
        cumVolPchgCol[i] =
          Number.isFinite(currVol) && Number.isFinite(base) && base !== 0
            ? ((currVol - base) / base) * 100
            : NaN
      }

      /* ---- additional filters ---- */

      const atrSeries = atr(high, low, close, atrLength)
      const volSma = sma(volume, volSmaLength)

      // `var bool rel_vol_filter = true`, only ever assigned when the filter is
      // on, so it stays true for the whole series when it is off.
      const relVolOk = new Array(n).fill(true)
      if (relVolFilter) {
        const avgVol = sma(volume, relVolLength)
        const relVol = new Array(n).fill(NaN)
        for (let i = 0; i < n; i++) {
          const prevAvg = i > 0 ? avgVol[i - 1] : NaN
          const base = Number.isFinite(prevAvg) ? prevAvg : volume[i]
          relVol[i] =
            Number.isFinite(volume[i]) && Number.isFinite(base) && base !== 0 ? volume[i] / base : NaN
        }
        const relVolSma = sma(relVol, relVolLength)
        for (let i = 0; i < n; i++) {
          const threshold = Number.isFinite(relVolSma[i]) ? relVolSma[i] * relVolMulti : NaN
          relVolOk[i] = Number.isFinite(relVol[i]) && Number.isFinite(threshold) && relVol[i] > threshold
        }
      }

      const filterOk = new Array(n).fill(false)
      for (let i = 0; i < n; i++) {
        const candleRange = high[i] - low[i]
        const bodySize = Math.abs(close[i] - open[i])

        // The source ANDs both halves of the % change filter together, so with
        // it on the change would have to be above +N and below -N at once.
        // Ported as written rather than repaired.
        const pchgAboveOk =
          !pchgFilter || (Number.isFinite(cumPchgCol[i]) && cumPchgCol[i] > pchgAboveBelow)
        const pchgBelowOk =
          !pchgFilter || (Number.isFinite(cumPchgCol[i]) && cumPchgCol[i] < -pchgAboveBelow)
        const volOk = !volFilter || (Number.isFinite(cumVolCol[i]) && cumVolCol[i] >= volAbove)
        const volPchgOk =
          !volPchgFilter || (Number.isFinite(cumVolPchgCol[i]) && cumVolPchgCol[i] >= volPchgAbove)
        const atrOk =
          !atrFilter ||
          (Number.isFinite(atrSeries[i]) &&
            Number.isFinite(candleRange) &&
            candleRange > atrSeries[i] * atrMulti)
        const bodyOk = !bodyFilter || (candleRange > 0 && bodySize / candleRange >= bodyPercent)
        const prevRange = i > 0 ? high[i - 1] - low[i - 1] : NaN
        const bodySizeOk =
          !bodySizeFilter ||
          (candleRange > 0 &&
            bodySize / candleRange >= bodyPercent &&
            Number.isFinite(prevRange) &&
            candleRange >= prevRange * bodySizeMulti)
        const volumeOk =
          !volumeSmaFilter ||
          (Number.isFinite(volume[i]) && Number.isFinite(volSma[i]) && volume[i] > volSma[i])

        let timeOk = true
        let dateOk = true
        if (timeFilter || dateFilter) {
          const parts = utcSecondsToZonedParts(bars[i].time, zone)
          if (timeFilter) {
            timeOk =
              (parts.hour > hourFrom || (parts.hour === hourFrom && parts.minute >= minuteFrom)) &&
              (parts.hour < hourTo || (parts.hour === hourTo && parts.minute < minuteTo))
          }
          if (dateFilter) {
            dateOk = parts.year === yearOf && parts.month === monthOf && parts.day === dayOf
          }
        }

        filterOk[i] =
          pchgAboveOk &&
          pchgBelowOk &&
          volOk &&
          volPchgOk &&
          atrOk &&
          bodyOk &&
          bodySizeOk &&
          volumeOk &&
          relVolOk[i] &&
          timeOk &&
          dateOk
      }

      /* ---- barstate.isconfirmed ---- */

      const barState = ctx && ctx.barState ? ctx.barState : null
      const lastIndex = barState && Number.isFinite(barState.lastIndex) ? barState.lastIndex : n - 1
      const liveBarOpen = barState
        ? barState.isRealtime === true && barState.isConfirmed === false
        : false
      const isConfirmed = (i) => !(liveBarOpen && i === lastIndex)

      /* ---- the state machine and the retracement ---- */

      const choiceContLine = method === 'Continuous Break'
      const choiceContRetLine = method === 'Continuous Retracement'
      const choiceCont = method === 'Continuous Break' || method === 'Continuous Retracement'
      const choiceContRet = method === 'Continuous Retracement'
      const choiceFlip = method === 'Flip Break'
      const choiceFlipRet = method === 'Flip Retracement'

      const short1Arr = new Array(n).fill(false)
      const long1Arr = new Array(n).fill(false)
      const shortContBreak = new Array(n).fill(false)
      const longContBreak = new Array(n).fill(false)
      const shortContRet = new Array(n).fill(false)
      const longContRet = new Array(n).fill(false)

      const paint = (from, to, price, side) => {
        if (!Number.isFinite(from) || !Number.isFinite(to) || !Number.isFinite(price)) return
        const a = Math.max(0, Math.min(from, to))
        const b = Math.min(n - 1, Math.max(from, to))
        for (let j = a; j <= b; j++) {
          level[j] = price
          levelSide[j] = side
        }
      }

      let state = 0
      let short1Low = NaN
      let short1Bar = NaN
      let long1High = NaN
      let long1Bar = NaN
      let shortSignalHigh = NaN
      let shortSignalLow = NaN
      let shortSignalBar = NaN
      let longSignalHigh = NaN
      let longSignalLow = NaN
      let longSignalBar = NaN
      let shortActive = false
      let longActive = false
      let shortRetDone = false
      let longRetDone = false
      let shortRetBar = NaN
      let shortRetHigh = NaN
      let longRetBar = NaN
      let longRetLow = NaN
      let prevShortFib = NaN
      let prevLongFib = NaN

      for (let i = 0; i < n; i++) {
        // state := nz(state[1]) == 3 or nz(state[1]) == 6 ? 0 : nz(state[1])
        if (state === 3 || state === 6) state = 0

        const r = rsiSeries[i]
        const rPrev = i > 0 ? rsiSeries[i - 1] : NaN
        const rm = rsiMaSeries[i]
        const finite = Number.isFinite(r) && Number.isFinite(rm)

        const crossUnderBreakdown =
          Number.isFinite(r) && Number.isFinite(rPrev) && r < BREAKDOWN && rPrev >= BREAKDOWN
        const crossOverBreakout =
          Number.isFinite(r) && Number.isFinite(rPrev) && r > BREAKOUT && rPrev <= BREAKOUT

        const short1 =
          crossUnderBreakdown && finite && r < rm && (state === 0 || (state >= 4 && state <= 5))
        if (short1) {
          short1Low = low[i]
          short1Bar = i
        }
        const short2 = Number.isFinite(r) && r > BREAKDOWN
        const short3 =
          Number.isFinite(short1Low) &&
          finite &&
          r < BREAKDOWN &&
          r < rm &&
          close[i] < short1Low &&
          filterOk[i] &&
          isConfirmed(i)

        const long1 = crossOverBreakout && finite && r > rm && (state === 0 || (state >= 1 && state <= 2))
        if (long1) {
          long1High = high[i]
          long1Bar = i
        }
        const long2 = Number.isFinite(r) && r < BREAKOUT
        const long3 =
          Number.isFinite(long1High) &&
          finite &&
          r > BREAKOUT &&
          r > rm &&
          close[i] > long1High &&
          filterOk[i] &&
          isConfirmed(i)

        if (short1) state = 1
        else if (short2 && state === 1) state = 2
        else if (short3 && state === 2) state = 3
        else if (long1) state = 4
        else if (long2 && state === 4) state = 5
        else if (long3 && state === 5) state = 6

        const sBreak = state === 3
        const lBreak = state === 6
        short1Arr[i] = short1
        long1Arr[i] = long1
        shortContBreak[i] = sBreak
        longContBreak[i] = lBreak

        if (sBreak) {
          shortSignalHigh = high[i]
          shortSignalLow = low[i]
          shortSignalBar = i
        }
        if (lBreak) {
          longSignalHigh = high[i]
          longSignalLow = low[i]
          longSignalBar = i
        }

        const shortFib =
          Number.isFinite(shortSignalHigh) && Number.isFinite(shortSignalLow)
            ? shortSignalHigh - (shortSignalHigh - shortSignalLow) * fibValue
            : NaN
        const longFib =
          Number.isFinite(longSignalHigh) && Number.isFinite(longSignalLow)
            ? longSignalLow + (longSignalHigh - longSignalLow) * fibValue
            : NaN

        if (sBreak) {
          shortActive = true
          longActive = false
          shortRetDone = false
          longRetDone = false
        }
        if (lBreak) {
          longActive = true
          shortActive = false
          longRetDone = false
          shortRetDone = false
        }

        const prevHigh = i > 0 ? high[i - 1] : NaN
        const prevLow = i > 0 ? low[i - 1] : NaN

        // ta.crossover(high, short_fib_val) and high[1] < short_fib_val
        const sCrossOver =
          Number.isFinite(shortFib) &&
          Number.isFinite(prevShortFib) &&
          Number.isFinite(prevHigh) &&
          high[i] > shortFib &&
          prevHigh <= prevShortFib
        const sRet =
          shortActive && !shortRetDone && Number.isFinite(shortFib) && sCrossOver && prevHigh < shortFib

        // ta.crossunder(low, long_fib_val) and low[1] > long_fib_val
        const lCrossUnder =
          Number.isFinite(longFib) &&
          Number.isFinite(prevLongFib) &&
          Number.isFinite(prevLow) &&
          low[i] < longFib &&
          prevLow >= prevLongFib
        const lRet =
          longActive && !longRetDone && Number.isFinite(longFib) && lCrossUnder && prevLow > longFib

        if (sRet) {
          shortRetDone = true
          shortRetBar = i
          shortRetHigh = high[i]
        }
        if (lRet) {
          longRetDone = true
          longRetBar = i
          longRetLow = low[i]
        }
        shortContRet[i] = sRet
        longContRet[i] = lRet

        // The four line.new calls, each drawn on the bar its trigger fires.
        if (
          sBreak &&
          choiceContLine &&
          Number.isFinite(short1Low) &&
          Number.isFinite(shortSignalLow) &&
          Number.isFinite(short1Bar) &&
          Number.isFinite(shortSignalBar)
        ) {
          paint(short1Bar, shortSignalBar, short1Low, -1)
        }
        if (
          sRet &&
          choiceContRetLine &&
          Number.isFinite(shortFib) &&
          Number.isFinite(shortRetHigh) &&
          Number.isFinite(shortSignalBar) &&
          Number.isFinite(shortRetBar)
        ) {
          paint(shortSignalBar, shortRetBar, shortFib, -1)
        }
        if (
          lBreak &&
          choiceContLine &&
          Number.isFinite(long1High) &&
          Number.isFinite(longSignalHigh) &&
          Number.isFinite(long1Bar) &&
          Number.isFinite(longSignalBar)
        ) {
          paint(long1Bar, longSignalBar, long1High, 1)
        }
        if (
          lRet &&
          choiceContRetLine &&
          Number.isFinite(longFib) &&
          Number.isFinite(longRetLow) &&
          Number.isFinite(longSignalBar) &&
          Number.isFinite(longRetBar)
        ) {
          paint(longSignalBar, longRetBar, longFib, 1)
        }

        prevShortFib = shortFib
        prevLongFib = longFib
      }

      /* ---- flip signals (exrem) ---- */

      // signal starts as na, because `signal[1]` on bar 0 is na whatever the
      // var initialiser says, and `entry = signal != signal[1]` is false while
      // either side is na. That is what suppresses the very first flip.
      const exrem = (cond1, cond2) => {
        const up = new Array(n).fill(false)
        const down = new Array(n).fill(false)
        let signal = NaN
        for (let i = 0; i < n; i++) {
          const prev = signal
          const cur = cond1[i] ? 1 : cond2[i] ? -1 : prev
          const entry = Number.isFinite(cur) && Number.isFinite(prev) && cur !== prev
          up[i] = entry && cur === 1
          down[i] = entry && cur === -1
          signal = cur
        }
        return [up, down]
      }

      const flipBreak = exrem(longContBreak, shortContBreak)
      const longFlipBreak = flipBreak[0]
      const shortFlipBreak = flipBreak[1]
      const flipRet = exrem(longContRet, shortContRet)
      const longFlipRet = flipRet[0]
      const shortFlipRet = flipRet[1]

      /* ---- divergences ---- */

      const plRaw = pivotLow(rsiSeries, pLeft, pRight)
      const phRaw = pivotHigh(rsiSeries, pLeft, pRight)
      const plFound = plRaw.map((v) => Number.isFinite(v))
      const phFound = phRaw.map((v) => Number.isFinite(v))

      const rsiLBR = new Array(n).fill(NaN)
      const lowLBR = new Array(n).fill(NaN)
      const highLBR = new Array(n).fill(NaN)
      const pivotBar = new Array(n).fill(NaN)
      for (let i = 0; i < n; i++) {
        const j = i - pRight
        if (j < 0) continue
        rsiLBR[i] = rsiSeries[j]
        lowLBR[i] = low[j]
        highLBR[i] = high[j]
        pivotBar[i] = j
      }

      // _inRange(cond) works on plFound[1] / phFound[1], the flags shifted one
      // bar, so barssince runs on the shifted series.
      const plShift = new Array(n).fill(false)
      const phShift = new Array(n).fill(false)
      for (let i = 1; i < n; i++) {
        plShift[i] = plFound[i - 1]
        phShift[i] = phFound[i - 1]
      }
      const plSince = barsSince(plShift)
      const phSince = barsSince(phShift)

      const prevPlRsi = valueWhen(plFound, rsiLBR, 1)
      const prevPlLow = valueWhen(plFound, lowLBR, 1)
      const prevPlBar = valueWhen(plFound, pivotBar, 1)
      const prevPhRsi = valueWhen(phFound, rsiLBR, 1)
      const prevPhHigh = valueWhen(phFound, highLBR, 1)
      const prevPhBar = valueWhen(phFound, pivotBar, 1)

      const isDivergence = method === 'Divergence'
      const isHidden = method === 'Hidden Divergence'

      for (let i = 0; i < n; i++) {
        const rl = rsiLBR[i]
        const inRangePl = Number.isFinite(plSince[i]) && rangeMin <= plSince[i] && plSince[i] <= rangeMax
        const inRangePh = Number.isFinite(phSince[i]) && rangeMin <= phSince[i] && phSince[i] <= rangeMax

        const rsiHL = Number.isFinite(rl) && Number.isFinite(prevPlRsi[i]) && rl > prevPlRsi[i] && inRangePl
        const priceLL =
          Number.isFinite(lowLBR[i]) && Number.isFinite(prevPlLow[i]) && lowLBR[i] < prevPlLow[i]
        const bull = isDivergence && showBull && priceLL && rsiHL && plFound[i]

        const rsiLH = Number.isFinite(rl) && Number.isFinite(prevPhRsi[i]) && rl < prevPhRsi[i] && inRangePh
        const priceHH =
          Number.isFinite(highLBR[i]) && Number.isFinite(prevPhHigh[i]) && highLBR[i] > prevPhHigh[i]
        const bear = isDivergence && showBear && priceHH && rsiLH && phFound[i]

        const rsiLL = Number.isFinite(rl) && Number.isFinite(prevPlRsi[i]) && rl < prevPlRsi[i] && inRangePl
        const priceHL =
          Number.isFinite(lowLBR[i]) && Number.isFinite(prevPlLow[i]) && lowLBR[i] > prevPlLow[i]
        const hiddenBull = isHidden && showHiddenBull && priceHL && rsiLL && plFound[i]

        const rsiHH = Number.isFinite(rl) && Number.isFinite(prevPhRsi[i]) && rl > prevPhRsi[i] && inRangePh
        const priceLH =
          Number.isFinite(highLBR[i]) && Number.isFinite(prevPhHigh[i]) && highLBR[i] < prevPhHigh[i]
        const hiddenBear = isHidden && showHiddenBear && priceLH && rsiHH && phFound[i]

        // The value is the previous pivot's bar index: draws() needs both ends
        // of the connector and a column can only carry numbers.
        if (bull && Number.isFinite(prevPlBar[i])) divBull[i] = prevPlBar[i]
        if (bear && Number.isFinite(prevPhBar[i])) divBear[i] = prevPhBar[i]
        if (hiddenBull && Number.isFinite(prevPlBar[i])) divHBull[i] = prevPlBar[i]
        if (hiddenBear && Number.isFinite(prevPhBar[i])) divHBear[i] = prevPhBar[i]
      }

      /* ---- signal columns, already gated by the scanning method ---- */

      for (let i = 0; i < n; i++) {
        if (choiceCont && short1Arr[i]) s1Short[i] = 1
        if (choiceCont && long1Arr[i]) s1Long[i] = 1
        if ((choiceCont && shortContBreak[i]) || (choiceFlip && shortFlipBreak[i])) s2Short[i] = 1
        if ((choiceCont && longContBreak[i]) || (choiceFlip && longFlipBreak[i])) s2Long[i] = 1
        if ((choiceContRet && shortContRet[i]) || (choiceFlipRet && shortFlipRet[i])) s3Short[i] = 1
        if ((choiceContRet && longContRet[i]) || (choiceFlipRet && longFlipRet[i])) s3Long[i] = 1
      }

      return out()
    },

    markers({ bars, values, settings }) {
      const showLong = settings.showLong !== false
      const showShort = settings.showShort !== false
      if (!showLong && !showShort) return []
      const out = []
      for (let i = 0; i < bars.length; i++) {
        const time = bars[i].time
        if (showShort) {
          if (values.s1Short[i]) {
            out.push({ time, position: 'aboveBar', shape: 'circle', color: NEG_LIGHT, size: 'small' })
          }
          if (values.s2Short[i]) {
            out.push({
              time,
              position: 'aboveBar',
              shape: 'triangleDown',
              color: NEG_LIGHT,
              text: '2',
              size: 'small',
            })
          }
          if (values.s3Short[i]) {
            out.push({
              time,
              position: 'aboveBar',
              shape: 'triangleDown',
              color: NEG_LIGHT,
              text: '3',
              size: 'small',
            })
          }
        }
        if (showLong) {
          if (values.s1Long[i]) {
            out.push({ time, position: 'belowBar', shape: 'circle', color: POS_LIGHT, size: 'small' })
          }
          if (values.s2Long[i]) {
            out.push({
              time,
              position: 'belowBar',
              shape: 'triangleUp',
              color: POS_LIGHT,
              text: '2',
              size: 'small',
            })
          }
          if (values.s3Long[i]) {
            out.push({
              time,
              position: 'belowBar',
              shape: 'triangleUp',
              color: POS_LIGHT,
              text: '3',
              size: 'small',
            })
          }
        }
      }
      return out
    },

    draws({ bars, values, settings }) {
      const method = pick(settings.scanMethod, METHODS, 'Continuous Break')
      if (method !== 'Divergence' && method !== 'Hidden Divergence') return []
      const pRight = int(settings.pivotRight, 5, 1)
      const rsiCol = values.rsi
      const specs = [
        { key: 'divBull', color: POS, lineWidth: 2 },
        { key: 'divBear', color: NEG, lineWidth: 2 },
        { key: 'divHBull', color: POS, lineWidth: 1 },
        { key: 'divHBear', color: NEG, lineWidth: 1 },
      ]
      const out = []
      for (let i = 0; i < bars.length; i++) {
        const to = i - pRight
        if (to < 0) continue
        for (const spec of specs) {
          const from = values[spec.key][i]
          if (!Number.isFinite(from) || from < 0 || from >= bars.length) continue
          const y1 = rsiCol[from]
          const y2 = rsiCol[to]
          if (!Number.isFinite(y1) || !Number.isFinite(y2)) continue
          out.push({
            kind: 'line',
            from: { time: bars[from].time, price: y1 },
            to: { time: bars[to].time, price: y2 },
            color: spec.color,
            lineWidth: spec.lineWidth,
          })
        }
      }
      return out
    },

    background({ bars, values, settings }) {
      const showLong = settings.showLong !== false
      const showShort = settings.showShort !== false
      // color.new(c, 90) is ten percent opaque.
      const negBg = NEG_LIGHT + '1A'
      const posBg = POS_LIGHT + '1A'
      const out = new Array(bars.length).fill(null)
      for (let i = 0; i < bars.length; i++) {
        // bgcolor is called for the 2nd and then the 3rd signal, and the later
        // call wins on a bar where both fire.
        let c = null
        if (showShort && values.s2Short[i]) c = negBg
        else if (showLong && values.s2Long[i]) c = posBg
        if (showShort && values.s3Short[i]) c = negBg
        else if (showLong && values.s3Long[i]) c = posBg
        out[i] = c
      }
      return out
    },

    barColors({ bars, values, settings }) {
      const showLong = settings.showLong !== false
      const showShort = settings.showShort !== false
      const out = new Array(bars.length).fill(null)
      for (let i = 0; i < bars.length; i++) {
        // Five barcolor calls in source order, 1st then 2nd then 3rd, and the
        // last non-na one wins.
        let c = null
        if (showShort && values.s1Short[i]) c = NEG_LIGHT
        else if (showLong && values.s1Long[i]) c = POS_LIGHT
        if (showShort && values.s2Short[i]) c = NEG_LIGHT
        else if (showLong && values.s2Long[i]) c = POS_LIGHT
        if (showShort && values.s3Short[i]) c = NEG_LIGHT
        else if (showLong && values.s3Long[i]) c = POS_LIGHT
        out[i] = c
      }
      return out
    },

    table({ bars, values, settings }) {
      if (settings.showPerfTable === false) return null
      const i = bars.length - 1
      if (i < 0) return null

      const pchg = values.cumPchg[i]
      const volPchg = values.cumVolPchg[i]
      const currVol = values.cumVol[i]
      const prevVol = values.prevVol[i]

      const pchgColor = Number.isFinite(pchg) && pchg > 0 ? POS : NEG
      const volPchgColor = Number.isFinite(volPchg) && volPchg > 0 ? POS : NEG
      const prevVolColor =
        Number.isFinite(prevVol) && Number.isFinite(currVol) && prevVol < currVol ? NEG : POS

      const head = (text) => ({ text, bgColor: NEU_DARK, textColor: NEU, align: 'left' })
      const cell = (text, textColor) => ({ text, bgColor: NEU_DARK, textColor, align: 'right' })
      const lakhs = (v) => (Number.isFinite(v) ? fmt2(v / 100000) + ' L' : 'n/a')

      return {
        rows: [
          [head('%Chg'), cell(fmt2(pchg) + ' %', pchgColor)],
          [head('Vol %Chg'), cell(fmt2(volPchg) + ' %', volPchgColor)],
          [head('Vol'), cell(lakhs(currVol), volPchgColor)],
          [head('PD Vol'), cell(lakhs(prevVol), prevVolColor)],
        ],
        options: { position: pick(settings.perfTablePosition, TABLE_POSITIONS, 'bottom-right') },
      }
    },
  })
}
