/**
 * ICT Liquidity Void Fill - ported to openalgo-charts from Pine Script v6.
 *
 * Source: https://github.com/ArunKBhaskar/PineScript/blob/c6821225c466494b01eee08f9dd88bf84d2b24ba/ICT Liquidity Void Fill/[Indicator] ICT Liquidity Void Fill.txt
 * Repo:   ArunKBhaskar/PineScript
 * License: MPL-2.0 (c) Arun_K_Bhaskar
 * SPDX-FileCopyrightText: (c) Arun_K_Bhaskar
 * SPDX-FileCopyrightText: (c) 2026 marketcalls (port to openalgo-charts)
 * SPDX-License-Identifier: MPL-2.0
 *
 * Marks a displacement candle (a wide, mostly-body bar) and then signals when
 * price retraces back into the void that candle left behind, measured at a
 * chosen Fibonacci depth of the candle's own range.
 */

export default function ({
  registerIndicator,
  atr,
  nulls,
  utcSecondsToZonedParts,
  isValidTimezone,
  DEFAULT_TIMEZONE,
}) {
  // Pine's chart-setting colours, kept as constants: the chart generates colour
  // controls for plots, and markers, bar colours and drawings carry their own.
  const POS_COLOR = '#089981'
  const POS_LIGHT_COLOR = '#ACE5DC'
  const NEG_LIGHT_COLOR = '#FCCBCD'
  const NEG_COLOR = '#F23645'

  // Pine's max_lines_count = 500.
  const MAX_LINES = 500

  // A cleared field arrives as '', and Number('') is 0, which would silently
  // replace a legitimate zero (hour 0, a 0 per cent body floor). Keep 0 and
  // reject only the empty and the broken.
  const num = (value, fallback) => {
    const n = Number(value)
    return value === '' || value == null || !Number.isFinite(n) ? fallback : n
  }
  const int = (value, fallback) => Math.floor(num(value, fallback))

  registerIndicator({
    id: 'oa-ict-liquidity-void-fill',
    name: 'ICT Liquidity Void Fill',
    category: 'ICT',
    placement: 'onchart',

    inputs: [
      { key: 'showLong', type: 'boolean', label: 'Long Signals', default: true, group: 'Liquidity Void' },
      { key: 'showShort', type: 'boolean', label: 'Short Signals', default: true, group: 'Liquidity Void' },
      {
        key: 'fibValue',
        type: 'number',
        label: 'Fib Value',
        default: 0.5,
        min: 0,
        max: 1,
        step: 0.1,
        group: 'Liquidity Void',
        tooltip:
          '0 is the bottom of a bullish candle and the top of a bearish one, 1 is the opposite edge, 0.5 is the midpoint. Other Fibonacci or OTE values such as 0.62, 0.705 and 0.79 are usable.',
      },
      {
        key: 'lineStyle',
        type: 'select',
        label: 'Line Style',
        default: 'solid',
        group: 'Liquidity Void',
        options: [
          { label: 'Solid', value: 'solid' },
          { label: 'Dashed', value: 'dashed' },
          { label: 'Dotted', value: 'dotted' },
        ],
      },

      {
        key: 'atrFilter',
        type: 'boolean',
        label: 'Apply ATR Filter',
        default: true,
        group: 'Additional Filters',
        tooltip:
          'Applies only to the displacement candle. A higher multiplier demands a longer, more volatile candle.',
      },
      { key: 'atrLength', type: 'number', label: 'ATR Length', default: 14, min: 1, max: 5000, step: 1, group: 'Additional Filters' },
      { key: 'atrMulti', type: 'number', label: 'ATR Multiplier', default: 1, min: 1, max: 100, step: 0.1, group: 'Additional Filters' },

      {
        key: 'bodyFilter',
        type: 'boolean',
        label: 'Apply Body % Filter',
        default: true,
        group: 'Additional Filters',
        tooltip: 'Applies only to the displacement candle. At 80, the body covers over 80 per cent of the candle total length.',
      },
      { key: 'bodyPercent', type: 'number', label: 'Body % Above', default: 80, min: 0, max: 100, step: 1, group: 'Additional Filters' },

      {
        key: 'bodySizeFilter',
        type: 'boolean',
        label: 'Apply Body Size Filter',
        default: false,
        group: 'Additional Filters',
        tooltip: 'Applies only to the displacement candle. At 2, the candle is twice the size of the previous candle.',
      },
      { key: 'bodySizeMultiplier', type: 'number', label: 'Body Size Multiplier (x)', default: 2, min: 0, max: 100, step: 1, group: 'Additional Filters' },

      {
        key: 'timeFilter',
        type: 'boolean',
        label: 'Apply Time Filter',
        default: false,
        group: 'Additional Filters',
        tooltip: 'Applies only to the retracement candle. Keeps signals inside the window below.',
      },
      { key: 'hourFrom', type: 'number', label: 'Time From (hour)', default: 9, min: 0, max: 23, step: 1, group: 'Additional Filters' },
      { key: 'minuteFrom', type: 'number', label: 'Time From (minute)', default: 15, min: 0, max: 59, step: 1, group: 'Additional Filters' },
      { key: 'hourTo', type: 'number', label: 'Time To (hour)', default: 10, min: 0, max: 23, step: 1, group: 'Additional Filters' },
      { key: 'minuteTo', type: 'number', label: 'Time To (minute)', default: 15, min: 0, max: 59, step: 1, group: 'Additional Filters' },

      {
        key: 'dateFilter',
        type: 'boolean',
        label: 'Apply Date Filter',
        default: false,
        group: 'Additional Filters',
        tooltip: 'Applies only to the retracement candle. Keeps signals on the single date below.',
      },
      { key: 'day', type: 'number', label: 'Day', default: 13, min: 1, max: 31, step: 1, group: 'Additional Filters' },
      { key: 'month', type: 'number', label: 'Month', default: 3, min: 1, max: 12, step: 1, group: 'Additional Filters' },
      { key: 'year', type: 'number', label: 'Year', default: 2025, min: 0, max: 9999, step: 1, group: 'Additional Filters' },
    ],

    // The source plots nothing: it draws shapes, bar colours and lines. These two
    // columns are the bear_fib_val and bull_fib_val series it computes on every
    // bar, declared as hidden plots so they are available without changing the
    // picture. Turn either on from the plot style controls to see the level.
    plots: [
      { key: 'bearFib', type: 'line', title: 'Bearish Void Level', style: { color: NEG_COLOR, lineWidth: 1, visible: false } },
      { key: 'bullFib', type: 'line', title: 'Bullish Void Level', style: { color: POS_COLOR, lineWidth: 1, visible: false } },
    ],

    calc(bars, settings, store, ctx) {
      const n = bars.length
      const blank = () => new Array(n).fill(NaN)
      if (n === 0) {
        return {
          bearFib: nulls(blank()),
          bullFib: nulls(blank()),
          shortSignal: nulls(blank()),
          longSignal: nulls(blank()),
          shortCont1: nulls(blank()),
          longCont1: nulls(blank()),
          shortAnchorTime: nulls(blank()),
          longAnchorTime: nulls(blank()),
        }
      }

      const fibValue = Math.min(1, Math.max(0, num(settings.fibValue, 0.5)))
      const useAtr = settings.atrFilter !== false
      const atrLength = Math.max(1, int(settings.atrLength, 14))
      const atrMulti = Math.max(1, num(settings.atrMulti, 1))
      const useBody = settings.bodyFilter !== false
      // Pine divides the 0 to 100 input by 100 the moment it reads it.
      const bodyPercent = Math.min(100, Math.max(0, num(settings.bodyPercent, 80))) / 100
      const useBodySize = settings.bodySizeFilter === true
      const bodySizeMultiplier = Math.max(0, num(settings.bodySizeMultiplier, 2))
      const useTime = settings.timeFilter === true
      const hourFrom = Math.max(0, int(settings.hourFrom, 9))
      const minuteFrom = Math.max(0, int(settings.minuteFrom, 15))
      const hourTo = Math.max(0, int(settings.hourTo, 10))
      const minuteTo = Math.max(0, int(settings.minuteTo, 15))
      const useDate = settings.dateFilter === true
      const wantDay = Math.max(1, int(settings.day, 13))
      const wantMonth = Math.max(1, int(settings.month, 3))
      const wantYear = Math.max(0, int(settings.year, 2025))

      // Pine's hour, minute, year, month and dayofmonth are exchange wall clock,
      // never the viewer's machine clock.
      const candidate = settings.timezone ?? ctx?.timezone ?? DEFAULT_TIMEZONE
      const zone = isValidTimezone(candidate) ? candidate : DEFAULT_TIMEZONE

      const high = bars.map((b) => b.high)
      const low = bars.map((b) => b.low)
      const close = bars.map((b) => b.close)
      const atrSeries = useAtr ? atr(high, low, close, atrLength) : null

      // barstate.isconfirmed: every historical bar is confirmed, and the last one
      // is only unconfirmed while a live bar is still forming.
      const liveUnconfirmed = ctx?.barState?.isRealtime === true && ctx?.barState?.isConfirmed !== true

      const bearFib = blank()
      const bullFib = blank()
      const shortSignal = blank()
      const longSignal = blank()
      const shortCont1Col = blank()
      const longCont1Col = blank()
      const shortAnchorTime = blank()
      const longAnchorTime = blank()

      // var-carried anchors: the most recent displacement candle of each side.
      let shortHigh = NaN
      let shortLow = NaN
      let shortAnchor = -1
      let longHigh = NaN
      let longLow = NaN
      let longAnchor = -1

      let shortState = 0
      let longState = 0

      let prevBearFib = NaN
      let prevBullFib = NaN

      for (let i = 0; i < n; i++) {
        const bar = bars[i]
        const o = bar.open
        const h = bar.high
        const l = bar.low
        const c = bar.close
        const range = h - l
        const ok = Number.isFinite(o) && Number.isFinite(h) && Number.isFinite(l) && Number.isFinite(c)

        // Additional filters. Each defaults to true and only narrows when on.
        let atrPass = true
        if (useAtr) {
          const a = atrSeries[i]
          // ta.atr is na through its warmup, and every comparison with na is
          // false in Pine, so the filter blocks rather than passes there.
          atrPass = ok && Number.isFinite(a) && range > a * atrMulti
        }

        let bodyPass = true
        if (useBody) {
          // A zero-range bar makes this 0/0, which is na in Pine and so false.
          bodyPass = ok && range > 0 && Math.abs(c - o) / range >= bodyPercent
        }

        let bodySizePass = true
        if (useBodySize) {
          const prevRange = i > 0 ? bars[i - 1].high - bars[i - 1].low : NaN
          bodySizePass =
            ok &&
            range > 0 &&
            Math.abs(c - o) / range >= bodyPercent &&
            Number.isFinite(prevRange) &&
            range >= prevRange * bodySizeMultiplier
        }

        let timePass = true
        if (useTime) {
          const parts = utcSecondsToZonedParts(bar.time, zone)
          const hour = parts.hour
          const minute = parts.minute
          // Pine binds `and` tighter than `or`.
          timePass =
            (hour > hourFrom || (hour === hourFrom && minute >= minuteFrom)) &&
            (hour < hourTo || (hour === hourTo && minute < minuteTo))
        }

        let datePass = true
        if (useDate) {
          const parts = utcSecondsToZonedParts(bar.time, zone)
          datePass = parts.year === wantYear && parts.month === wantMonth && parts.day === wantDay
        }

        const confirmed = i < n - 1 || !liveUnconfirmed
        const filtersPass = atrPass && bodyPass && bodySizePass

        // Displacement candles.
        const shortCont1 = ok && o > c && filtersPass
        const longCont1 = ok && o < c && filtersPass

        if (shortCont1) {
          shortHigh = h
          shortLow = l
          shortAnchor = i
        }
        if (longCont1) {
          longHigh = h
          longLow = l
          longAnchor = i
        }

        // fibonacci(false, ...) measures down from the high of a bearish candle,
        // fibonacci(true, ...) measures up from the low of a bullish one.
        const bear =
          Number.isFinite(shortHigh) && Number.isFinite(shortLow)
            ? shortHigh - (shortHigh - shortLow) * fibValue
            : NaN
        const bull =
          Number.isFinite(longHigh) && Number.isFinite(longLow)
            ? longLow + (longHigh - longLow) * fibValue
            : NaN

        // Retracement. ta.crossover and ta.crossunder need both bars finite, or
        // the signal fires straight through the warmup gap.
        const prevHigh = i > 0 ? bars[i - 1].high : NaN
        const prevLow = i > 0 ? bars[i - 1].low : NaN
        const crossOver =
          Number.isFinite(h) &&
          Number.isFinite(bear) &&
          Number.isFinite(prevHigh) &&
          Number.isFinite(prevBearFib) &&
          h > bear &&
          prevHigh <= prevBearFib
        const crossUnder =
          Number.isFinite(l) &&
          Number.isFinite(bull) &&
          Number.isFinite(prevLow) &&
          Number.isFinite(prevBullFib) &&
          l < bull &&
          prevLow >= prevBullFib

        const shortCont2 = crossOver && timePass && datePass && confirmed
        const longCont2 = crossUnder && timePass && datePass && confirmed

        // Two-step state machine: arm on the displacement candle, fire on the
        // retracement, then reset on the bar after the signal.
        shortState = shortState === 2 ? 0 : shortState
        if (shortCont1 && shortState === 0) shortState = 1
        if (!shortCont1 && shortCont2 && shortState === 1) shortState = 2

        longState = longState === 2 ? 0 : longState
        if (longCont1 && longState === 0) longState = 1
        if (!longCont1 && longCont2 && longState === 1) longState = 2

        if (Number.isFinite(bear)) bearFib[i] = bear
        if (Number.isFinite(bull)) bullFib[i] = bull
        if (shortCont1) shortCont1Col[i] = 1
        if (longCont1) longCont1Col[i] = 1
        if (shortState === 2) {
          shortSignal[i] = 1
          if (shortAnchor >= 0) shortAnchorTime[i] = bars[shortAnchor].time
        }
        if (longState === 2) {
          longSignal[i] = 1
          if (longAnchor >= 0) longAnchorTime[i] = bars[longAnchor].time
        }

        prevBearFib = bear
        prevBullFib = bull
      }

      return {
        bearFib: nulls(bearFib),
        bullFib: nulls(bullFib),
        shortSignal: nulls(shortSignal),
        longSignal: nulls(longSignal),
        shortCont1: nulls(shortCont1Col),
        longCont1: nulls(longCont1Col),
        shortAnchorTime: nulls(shortAnchorTime),
        longAnchorTime: nulls(longAnchorTime),
      }
    },

    // plotshape(location.abovebar / location.belowbar). aboveBar and belowBar
    // would anchor to this indicator's own hidden line, so the triangles sit at
    // an explicit price with padding scaled to the instrument instead.
    markers({ bars, values, settings }) {
      if (bars.length === 0) return []
      const showShort = settings.showShort !== false
      const showLong = settings.showLong !== false
      if (!showShort && !showLong) return []

      let rangeSum = 0
      let rangeCount = 0
      for (let i = Math.max(0, bars.length - 200); i < bars.length; i++) {
        const r = bars[i].high - bars[i].low
        if (Number.isFinite(r)) {
          rangeSum += r
          rangeCount += 1
        }
      }
      const meanRange = rangeCount > 0 ? rangeSum / rangeCount : 0
      const lastClose = Number(bars[bars.length - 1].close)
      const pad = Math.max(meanRange * 0.5, Math.abs(Number.isFinite(lastClose) ? lastClose : 0) * 0.0005)

      const out = []
      for (let i = 0; i < bars.length; i++) {
        const bar = bars[i]
        if (showShort && values.shortSignal[i] != null && Number.isFinite(bar.high)) {
          out.push({
            time: bar.time,
            position: 'atPrice',
            price: bar.high + pad,
            shape: 'triangleDown',
            size: 'tiny',
            color: NEG_LIGHT_COLOR,
          })
        }
        if (showLong && values.longSignal[i] != null && Number.isFinite(bar.low)) {
          out.push({
            time: bar.time,
            position: 'atPrice',
            price: bar.low - pad,
            shape: 'triangleUp',
            size: 'tiny',
            color: POS_LIGHT_COLOR,
          })
        }
      }
      return out
    },

    // barcolor(): the displacement candle itself is repainted.
    barColors({ bars, values, settings }) {
      const showShort = settings.showShort !== false
      const showLong = settings.showLong !== false
      return bars.map((_, i) => {
        if (showShort && values.shortCont1[i] != null) return NEG_LIGHT_COLOR
        if (showLong && values.longCont1[i] != null) return POS_LIGHT_COLOR
        return null
      })
    },

    // line.new(x1 = displacement bar, y1 = fib level, x2 = signal bar, y2 = same).
    // Anchored to bar times so the level stays welded to its candle when history
    // is paged in.
    draws({ bars, values, settings }) {
      if (bars.length === 0) return []
      const showShort = settings.showShort !== false
      const showLong = settings.showLong !== false
      const styles = ['solid', 'dashed', 'dotted']
      const lineStyle = styles.includes(settings.lineStyle) ? settings.lineStyle : 'solid'

      const out = []
      for (let i = bars.length - 1; i >= 0 && out.length < MAX_LINES; i--) {
        if (showShort && values.shortSignal[i] != null) {
          const price = values.bearFib[i]
          const from = values.shortAnchorTime[i]
          if (price != null && from != null) {
            out.push({
              kind: 'line',
              from: { time: from, price },
              to: { time: bars[i].time, price },
              color: NEG_COLOR,
              lineWidth: 1,
              lineStyle,
            })
          }
        }
        if (out.length >= MAX_LINES) break
        if (showLong && values.longSignal[i] != null) {
          const price = values.bullFib[i]
          const from = values.longAnchorTime[i]
          if (price != null && from != null) {
            out.push({
              kind: 'line',
              from: { time: from, price },
              to: { time: bars[i].time, price },
              color: POS_COLOR,
              lineWidth: 1,
              lineStyle,
            })
          }
        }
      }
      return out
    },
  })
}
