/**
 * ICT Liquidity Void Fill Scanner - ported to openalgo-charts from Pine Script v6.
 *
 * Source: https://github.com/ArunKBhaskar/PineScript/blob/c6821225c466494b01eee08f9dd88bf84d2b24ba/ICT Liquidity Void Fill/[Scanner] ICT Liquidity Void Fill Scanner.txt
 * Repo:   ArunKBhaskar/PineScript
 * License: MPL-2.0 (c) Arun_K_Bhaskar
 * SPDX-FileCopyrightText: (c) Arun_K_Bhaskar
 * SPDX-FileCopyrightText: (c) 2026 marketcalls (port to openalgo-charts)
 * SPDX-License-Identifier: MPL-2.0
 *
 * Marks a displacement candle (a wide, high-body-percentage bar that leaves a
 * liquidity void behind it) and then signals when price retraces back into that
 * candle to the chosen Fibonacci level of its range.
 *
 * The Pine original is a 40-symbol screener built on request.security over
 * other tickers. That part cannot exist on a single chart, so everything that
 * runs on the current symbol is ported here and the cross-symbol scan is
 * recorded as a gap. The horizontal line the source draws with line.new from
 * the displacement bar to the signal bar is carried by the two fib plot
 * columns, which are filled across exactly the same span.
 */

export default function ({
  registerIndicator,
  atr,
  nulls,
  zonedDayIndex,
  utcSecondsToZonedParts,
  isValidTimezone,
  DEFAULT_TIMEZONE,
}) {
  // Pine palette, kept as constants. The chart generates colour controls for
  // plots; markers and bar colours have no generated control, so these are the
  // source defaults rather than inputs.
  const POS_COLOR = '#089981'
  const POS_LIGHT_COLOR = '#ACE5DC'
  const NEG_LIGHT_COLOR = '#FCCBCD'
  const NEG_COLOR = '#F23645'

  // A cleared number field arrives as '', and Number('') is 0, which would turn
  // a percentage threshold into "accept everything" rather than into its default.
  const num = (value, fallback) => {
    if (value === '' || value === null || value === undefined) return fallback
    const n = Number(value)
    return Number.isFinite(n) ? n : fallback
  }

  // Pine's str.tostring(x, '#.##'): at most two decimals, trailing zeros dropped.
  const fmt2 = (value) => {
    if (!Number.isFinite(value)) return 'na'
    return value.toFixed(2).replace(/\.?0+$/, '')
  }

  registerIndicator({
    id: 'oa-ict-liquidity-void-fill-scanner-scanner',
    name: 'ICT Liquidity Void Fill Scanner',
    category: 'ICT',
    placement: 'onchart',

    inputs: [
      {
        key: 'showLong',
        type: 'boolean',
        label: 'Long Signals',
        default: true,
        group: 'Signals',
      },
      {
        key: 'showShort',
        type: 'boolean',
        label: 'Short Signals',
        default: true,
        group: 'Signals',
      },

      {
        key: 'fibVal',
        type: 'number',
        label: 'Fib Value',
        default: 0.5,
        min: 0,
        max: 1,
        step: 0.1,
        group: 'Liquidity Void',
        tooltip:
          '0 is the bottom of a bullish candle and the top of a bearish one. 1 is the opposite end. 0.5 is the midpoint. Other Fibonacci or OTE values such as 0.62, 0.705 and 0.79 are usable. Range 0 to 1.',
      },

      {
        key: 'atrFilter',
        type: 'boolean',
        label: 'Apply ATR Filter',
        default: true,
        group: 'Additional Filters',
        tooltip:
          'Applies to the displacement candle only. Keeps only candles whose range exceeds the ATR multiple, so a higher multiplier demands a longer candle.',
      },
      {
        key: 'atrLength',
        type: 'number',
        label: 'ATR Length',
        default: 14,
        min: 1,
        max: 5000,
        step: 1,
        group: 'Additional Filters',
      },
      {
        key: 'atrMulti',
        type: 'number',
        label: 'ATR Multiplier',
        default: 1,
        min: 1,
        max: 100,
        step: 0.1,
        group: 'Additional Filters',
      },
      {
        key: 'bodyFilter',
        type: 'boolean',
        label: 'Apply Body % Filter',
        default: true,
        group: 'Additional Filters',
        tooltip:
          'Applies to the displacement candle only. At 80 the candle body must cover more than 80 percent of its total length.',
      },
      {
        key: 'bodyPercent',
        type: 'number',
        label: 'Body % Above',
        default: 80,
        min: 0,
        max: 100,
        step: 1,
        group: 'Additional Filters',
      },
      {
        key: 'bodySizeFilter',
        type: 'boolean',
        label: 'Apply Body Size Filter',
        default: false,
        group: 'Additional Filters',
        tooltip:
          'Applies to the displacement candle only. At 2 the candle range must be at least twice the previous candle range.',
      },
      {
        key: 'bodySizeMultiplier',
        type: 'number',
        label: 'Body Size Multiplier (x)',
        default: 2,
        min: 0,
        max: 100,
        step: 1,
        group: 'Additional Filters',
      },
      {
        key: 'timeFilter',
        type: 'boolean',
        label: 'Apply Time Filter',
        default: false,
        group: 'Additional Filters',
        tooltip:
          'Applies to the retracement candle only. Keeps signals inside the given exchange-clock window.',
      },
      {
        key: 'hourFrom',
        type: 'number',
        label: 'Time From (hour)',
        default: 9,
        min: 0,
        max: 23,
        step: 1,
        group: 'Additional Filters',
      },
      {
        key: 'minuteFrom',
        type: 'number',
        label: 'Time From (minute)',
        default: 15,
        min: 0,
        max: 59,
        step: 1,
        group: 'Additional Filters',
      },
      {
        key: 'hourTo',
        type: 'number',
        label: 'Time To (hour)',
        default: 10,
        min: 0,
        max: 23,
        step: 1,
        group: 'Additional Filters',
      },
      {
        key: 'minuteTo',
        type: 'number',
        label: 'Time To (minute)',
        default: 15,
        min: 0,
        max: 59,
        step: 1,
        group: 'Additional Filters',
      },
      {
        key: 'dateFilter',
        type: 'boolean',
        label: 'Apply Date Filter',
        default: false,
        group: 'Additional Filters',
        tooltip:
          'Applies to the retracement candle only. Keeps signals on the given date only. Enter yesterday to review yesterday.',
      },
      {
        key: 'day',
        type: 'number',
        label: 'Day',
        default: 13,
        min: 1,
        max: 31,
        step: 1,
        group: 'Additional Filters',
      },
      {
        key: 'month',
        type: 'number',
        label: 'Month',
        default: 3,
        min: 1,
        max: 12,
        step: 1,
        group: 'Additional Filters',
      },
      {
        key: 'year',
        type: 'number',
        label: 'Year',
        default: 2025,
        min: 0,
        max: 9999,
        step: 1,
        group: 'Additional Filters',
      },

      {
        key: 'showDataTable',
        type: 'boolean',
        label: 'Display Table',
        default: true,
        group: 'Data Table',
      },
    ],

    plots: [
      {
        key: 'bearFibLine',
        type: 'line',
        title: 'Short Fill Level',
        style: { color: NEG_COLOR, lineWidth: 2 },
      },
      {
        key: 'bullFibLine',
        type: 'line',
        title: 'Long Fill Level',
        style: { color: POS_COLOR, lineWidth: 2 },
      },
    ],

    calc(bars, settings, store, ctx) {
      const n = bars.length

      const bearFibLine = new Array(n).fill(NaN)
      const bullFibLine = new Array(n).fill(NaN)
      const shortSignal = new Array(n).fill(0)
      const longSignal = new Array(n).fill(0)
      const shortCandle = new Array(n).fill(0)
      const longCandle = new Array(n).fill(0)
      const cumPchg = new Array(n).fill(NaN)
      const cumVolPchg = new Array(n).fill(NaN)
      const dayVolume = new Array(n).fill(NaN)
      const prevDayVolume = new Array(n).fill(NaN)

      const empty = {
        bearFibLine: nulls(bearFibLine),
        bullFibLine: nulls(bullFibLine),
        shortSignal,
        longSignal,
        shortCandle,
        longCandle,
        cumPchg: nulls(cumPchg),
        cumVolPchg: nulls(cumVolPchg),
        dayVolume: nulls(dayVolume),
        prevDayVolume: nulls(prevDayVolume),
      }
      if (n === 0) return empty

      const showLong = settings.showLong !== false
      const showShort = settings.showShort !== false
      const fibVal = Math.min(1, Math.max(0, num(settings.fibVal, 0.5)))

      const useAtrFilter = settings.atrFilter !== false
      const atrLength = Math.max(1, Math.floor(num(settings.atrLength, 14)))
      const atrMulti = Math.max(1, num(settings.atrMulti, 1))
      const useBodyFilter = settings.bodyFilter !== false
      const bodyPercent = Math.min(100, Math.max(0, num(settings.bodyPercent, 80))) / 100
      const useBodySizeFilter = settings.bodySizeFilter === true
      const bodySizeMultiplier = Math.max(0, num(settings.bodySizeMultiplier, 2))

      const useTimeFilter = settings.timeFilter === true
      const hourFrom = Math.max(0, Math.floor(num(settings.hourFrom, 9)))
      const minuteFrom = Math.max(0, Math.floor(num(settings.minuteFrom, 15)))
      const hourTo = Math.max(0, Math.floor(num(settings.hourTo, 10)))
      const minuteTo = Math.max(0, Math.floor(num(settings.minuteTo, 15)))

      const useDateFilter = settings.dateFilter === true
      const wantDay = Math.max(1, Math.floor(num(settings.day, 13)))
      const wantMonth = Math.max(1, Math.floor(num(settings.month, 3)))
      const wantYear = Math.max(0, Math.floor(num(settings.year, 2025)))

      const zoneRaw = ctx?.timezone
      const zone =
        typeof zoneRaw === 'string' && zoneRaw !== '' && isValidTimezone(zoneRaw)
          ? zoneRaw
          : DEFAULT_TIMEZONE

      // barstate.isconfirmed: every historical bar is closed, and only the last
      // one can still be forming.
      const lastUnconfirmed = ctx?.barState?.isConfirmed === false

      const high = new Array(n)
      const low = new Array(n)
      const close = new Array(n)
      for (let i = 0; i < n; i++) {
        high[i] = bars[i].high
        low[i] = bars[i].low
        close[i] = bars[i].close
      }
      const atrValues = atr(high, low, close, atrLength)

      // ta.change(time('D')) != 0. Pine's change is na on the first bar, and
      // na != 0 is false there, so bar 0 never counts as a new day.
      const dayIndex = new Array(n)
      for (let i = 0; i < n; i++) dayIndex[i] = zonedDayIndex(bars[i].time, zone)

      // Daily cumulative percentage change and daily cumulative volume, both
      // var-carried in Pine. curr_cum_vol starts as na and only becomes a real
      // number at the first day change, which is what the source does.
      let cum = NaN
      let currCumVol = NaN
      let prevCumVol = NaN

      // Displacement candle state, carried by var in Pine.
      let shortHigh = NaN
      let shortLow = NaN
      let shortBar = -1
      let longHigh = NaN
      let longLow = NaN
      let longBar = -1

      let shortState = 0
      let longState = 0

      let prevBearFib = NaN
      let prevBullFib = NaN

      for (let i = 0; i < n; i++) {
        const bar = bars[i]
        const isNewDay = i > 0 && dayIndex[i] !== dayIndex[i - 1]

        // Cumulative percentage change of close, reset each day.
        const prevClose = i > 0 ? close[i - 1] : NaN
        const dailyPct =
          Number.isFinite(prevClose) && prevClose !== 0
            ? ((close[i] - prevClose) / prevClose) * 100
            : 0
        cum = isNewDay ? dailyPct : Number.isFinite(cum) ? cum + dailyPct : dailyPct
        cumPchg[i] = cum

        // Cumulative volume, reset each day, previous day kept for comparison.
        const vol = Number.isFinite(bar.volume) ? bar.volume : 0
        if (isNewDay) {
          prevCumVol = currCumVol
          currCumVol = vol
        } else {
          currCumVol = currCumVol + vol
        }
        dayVolume[i] = currCumVol
        prevDayVolume[i] = prevCumVol
        const base = Number.isFinite(prevCumVol) ? prevCumVol : currCumVol
        cumVolPchg[i] =
          Number.isFinite(base) && base !== 0 ? ((currCumVol - base) / base) * 100 : NaN

        // Additional filters on the displacement candle.
        const range = high[i] - low[i]
        const body = Math.abs(close[i] - bar.open)

        let atrOk = true
        if (useAtrFilter) {
          const a = atrValues[i]
          atrOk = Number.isFinite(a) && range > a * atrMulti
        }

        // A zero-range candle makes the body ratio na in Pine, and every
        // comparison with na is false, so it fails the filter rather than
        // dividing by zero here.
        let bodyOk = true
        if (useBodyFilter) bodyOk = range > 0 && body / range >= bodyPercent

        let bodySizeOk = true
        if (useBodySizeFilter) {
          const prevRange = i > 0 ? high[i - 1] - low[i - 1] : NaN
          bodySizeOk =
            range > 0 &&
            body / range >= bodyPercent &&
            Number.isFinite(prevRange) &&
            range >= prevRange * bodySizeMultiplier
        }

        const filtersOk = atrOk && bodyOk && bodySizeOk
        const shortCont1 = bar.open > close[i] && filtersOk
        const longCont1 = bar.open < close[i] && filtersOk
        shortCandle[i] = shortCont1 ? 1 : 0
        longCandle[i] = longCont1 ? 1 : 0

        if (shortCont1) {
          shortHigh = high[i]
          shortLow = low[i]
          shortBar = i
        }
        if (longCont1) {
          longHigh = high[i]
          longLow = low[i]
          longBar = i
        }

        // fibonacci(false, ...) measures down from the high, fibonacci(true, ...)
        // measures up from the low.
        const bearFib = Number.isFinite(shortHigh) ? shortHigh - (shortHigh - shortLow) * fibVal : NaN
        const bullFib = Number.isFinite(longLow) ? longLow + (longHigh - longLow) * fibVal : NaN

        // Filters on the retracement candle.
        let timeOk = true
        let dateOk = true
        if (useTimeFilter || useDateFilter) {
          const parts = utcSecondsToZonedParts(bar.time, zone)
          if (useTimeFilter) {
            const h = parts.hour
            const m = parts.minute
            timeOk =
              (h > hourFrom || (h === hourFrom && m >= minuteFrom)) &&
              (h < hourTo || (h === hourTo && m < minuteTo))
          }
          if (useDateFilter) {
            dateOk = parts.year === wantYear && parts.month === wantMonth && parts.day === wantDay
          }
        }

        const confirmed = !(lastUnconfirmed && i === n - 1)

        // ta.crossover / ta.crossunder. Both sides of both bars must be real
        // numbers, or the warmup gap fires a signal straight through.
        const crossedOverBear =
          Number.isFinite(bearFib) &&
          Number.isFinite(prevBearFib) &&
          i > 0 &&
          Number.isFinite(high[i]) &&
          Number.isFinite(high[i - 1]) &&
          high[i] > bearFib &&
          high[i - 1] <= prevBearFib
        const crossedUnderBull =
          Number.isFinite(bullFib) &&
          Number.isFinite(prevBullFib) &&
          i > 0 &&
          Number.isFinite(low[i]) &&
          Number.isFinite(low[i - 1]) &&
          low[i] < bullFib &&
          low[i - 1] >= prevBullFib

        const shortCont2 = crossedOverBear && timeOk && dateOk && confirmed
        const longCont2 = crossedUnderBull && timeOk && dateOk && confirmed

        // Two-step state machine: arm on the displacement candle, fire on the
        // retracement, then clear on the bar after the signal.
        shortState = shortState === 2 ? 0 : shortState
        if (shortCont1 && shortState === 0) shortState = 1
        if (!shortCont1 && shortCont2 && shortState === 1) shortState = 2

        longState = longState === 2 ? 0 : longState
        if (longCont1 && longState === 0) longState = 1
        if (!longCont1 && longCont2 && longState === 1) longState = 2

        const shortRet = shortState === 2
        const longRet = longState === 2
        shortSignal[i] = shortRet ? 1 : 0
        longSignal[i] = longRet ? 1 : 0

        // line.new from the displacement bar to the signal bar, at the fill
        // level, carried as a filled span of the plot column.
        if (showShort && shortRet && shortBar >= 0 && Number.isFinite(bearFib)) {
          for (let j = shortBar; j <= i; j++) bearFibLine[j] = bearFib
        }
        if (showLong && longRet && longBar >= 0 && Number.isFinite(bullFib)) {
          for (let j = longBar; j <= i; j++) bullFibLine[j] = bullFib
        }

        prevBearFib = bearFib
        prevBullFib = bullFib
      }

      return {
        bearFibLine: nulls(bearFibLine),
        bullFibLine: nulls(bullFibLine),
        shortSignal,
        longSignal,
        shortCandle,
        longCandle,
        cumPchg: nulls(cumPchg),
        cumVolPchg: nulls(cumVolPchg),
        dayVolume: nulls(dayVolume),
        prevDayVolume: nulls(prevDayVolume),
      }
    },

    // plotshape at location.abovebar / location.belowbar. aboveBar and belowBar
    // would anchor to this indicator's own line, so the offset is computed here
    // and scaled to the instrument.
    markers({ bars, values, settings }) {
      const n = bars.length
      if (n === 0) return []
      const showLong = settings.showLong !== false
      const showShort = settings.showShort !== false
      if (!showLong && !showShort) return []

      let rangeSum = 0
      let rangeCount = 0
      for (let i = 0; i < n; i++) {
        const r = bars[i].high - bars[i].low
        if (Number.isFinite(r) && r > 0) {
          rangeSum += r
          rangeCount++
        }
      }
      const meanRange = rangeCount > 0 ? rangeSum / rangeCount : 0
      const lastClose = Number.isFinite(bars[n - 1].close) ? bars[n - 1].close : 0
      const pad = Math.max(meanRange * 0.5, Math.abs(lastClose) * 0.0005, 0)

      const shortSignal = values.shortSignal
      const longSignal = values.longSignal
      const out = []
      for (let i = 0; i < n; i++) {
        if (showShort && shortSignal[i] === 1 && Number.isFinite(bars[i].high)) {
          out.push({
            time: bars[i].time,
            position: 'atPrice',
            price: bars[i].high + pad,
            shape: 'triangleDown',
            size: 'tiny',
            color: NEG_LIGHT_COLOR,
          })
        }
        if (showLong && longSignal[i] === 1 && Number.isFinite(bars[i].low)) {
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

    // barcolor(): the displacement candle itself, short tested first as in Pine.
    barColors({ bars, values, settings }) {
      const showLong = settings.showLong !== false
      const showShort = settings.showShort !== false
      const shortCandle = values.shortCandle
      const longCandle = values.longCandle
      return bars.map((bar, i) => {
        if (showShort && shortCandle[i] === 1) return NEG_LIGHT_COLOR
        if (showLong && longCandle[i] === 1) return POS_LIGHT_COLOR
        return null
      })
    },

    // The source's own data table: day change, volume change and the two
    // cumulative volumes, read from the last bar.
    table({ bars, values, settings }) {
      if (settings.showDataTable === false) return null
      const n = bars.length
      if (n === 0) return null
      const i = n - 1
      const pchg = values.cumPchg[i]
      const volPchg = values.cumVolPchg[i]
      const vol = values.dayVolume[i]
      const prevVol = values.prevDayVolume[i]
      const lakhs = (v) => (Number.isFinite(v) ? `${fmt2(v / 100000)} L` : 'na')
      return {
        rows: [
          ['%Chg', `${fmt2(pchg)} %`],
          ['Vol %Chg', `${fmt2(volPchg)} %`],
          ['Vol', lakhs(vol)],
          ['PD Vol', lakhs(prevVol)],
        ],
      }
    },
  })
}
