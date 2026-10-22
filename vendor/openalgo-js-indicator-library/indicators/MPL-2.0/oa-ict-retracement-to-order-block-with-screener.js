/**
 * ICT Retracement to Order Block with Screener - ported to openalgo-charts from Pine Script v5.
 *
 * Source: https://github.com/ArunKBhaskar/PineScript/blob/c6821225c466494b01eee08f9dd88bf84d2b24ba/[Screener] ICT Retracement to Order Block with Screener.txt
 * Repo:   ArunKBhaskar/PineScript
 * License: MPL-2.0, (c) Arun_K_Bhaskar
 * SPDX-FileCopyrightText: (c) Arun_K_Bhaskar
 * SPDX-FileCopyrightText: (c) 2026 marketcalls (port to openalgo-charts)
 * SPDX-License-Identifier: MPL-2.0
 *
 * Marks an ICT order block in three steps. Signal 1 is a momentum candle whose
 * range covers at least one ATR and that breaks the lowest low (long) or the
 * highest high (short) of the previous `period` candles. Signal 2 is a later
 * candle closing beyond that candle's high (long) or low (short). Signal 3 is
 * price retracing back to the order block level, which is the entry.
 *
 * Two source features do not survive the port and are not faked here:
 *   1. The 40 symbol screener reads request.security() on other instruments,
 *      which a chart study cannot do, so the table is the same screener
 *      reduced to the symbol on the chart (its Symbol column is dropped).
 *   2. The three colour inputs are gone: the chart generates colour controls
 *      for plots, so the marker, line and table colours keep the Pine defaults.
 *
 * The four plots carry display=display.none in the source, so they ship hidden
 * and can be switched on from the style dialog.
 */

// Pine defaults: i_pos_col, i_neg_col, i_neu_col.
const POS_COLOR = '#22AB94'
const NEG_COLOR = '#F7525F'
const NEU_COLOR = '#B2B5BE'

// Pine size.* keywords mapped to the pixel sizes the table options take.
const TABLE_FONT_PX = { auto: 11, tiny: 8, small: 10, normal: 12, large: 14, huge: 18 }

const TABLE_POSITIONS = [
  'top-left', 'top-center', 'top-right',
  'middle-left', 'middle-center', 'middle-right',
  'bottom-left', 'bottom-center', 'bottom-right',
]

const LINE_STYLES = ['solid', 'dashed', 'dotted']

export default function ({
  registerIndicator,
  atr,
  highest,
  lowest,
  nulls,
  roundToTick,
  withAlpha,
  utcSecondsToZonedParts,
  isValidTimezone,
  DEFAULT_TIMEZONE,
}) {
  const pad2 = (v) => (v < 10 ? '0' + v : String(v))

  // str.tostring() prints the shortest exact form, so strip the binary noise
  // left by the tick rounding rather than padding to a fixed precision.
  const priceText = (v) => (Number.isFinite(v) ? String(Number(v.toFixed(8))) : '')

  // The newest positive gap between two bars, used to place an anchor one bar
  // past the end of the data. 60 seconds is a floor, never a guess at the
  // interval: it only has to be a time later than the last bar's.
  const barStep = (bars) => {
    for (let i = bars.length - 1; i > 0; i--) {
      const step = bars[i].time - bars[i - 1].time
      if (step > 0) return step
    }
    return 60
  }

  // atPrice adds no padding of its own, so scale the gap to the instrument.
  const markerPad = (bars) => {
    const from = Math.max(0, bars.length - 50)
    let sum = 0
    let count = 0
    for (let i = from; i < bars.length; i++) {
      const range = bars[i].high - bars[i].low
      if (Number.isFinite(range)) {
        sum += range
        count++
      }
    }
    const mean = count > 0 ? sum / count : 0
    const last = bars.length > 0 ? Math.abs(bars[bars.length - 1].close) : 0
    return Math.max(mean * 0.5, (Number.isFinite(last) ? last : 0) * 0.0005)
  }

  registerIndicator({
    id: 'oa-ict-retracement-to-order-block-with-screener',
    name: 'ICT Retracement to Order Block with Screener',
    category: 'ICT',
    placement: 'onchart',

    inputs: [
      {
        key: 'period',
        type: 'number',
        label: 'Period',
        default: 30,
        min: 1,
        max: 5000,
        step: 1,
        tooltip:
          'Count of candles used to determine the highest high and lowest low. 30 works on all timeframes but is optimised for 15m and 1h.',
      },
      {
        key: 'verticalOffset',
        type: 'number',
        label: 'Vertical Offset (%)',
        default: 0,
        min: 0,
        max: 100,
        step: 1,
        tooltip:
          'Buffer in case price does not reach the order block exactly. 0 means the third signal needs a precise touch. At 50 a long uses a level half the candle range above the first candle high.',
      },

      {
        key: 'direction',
        type: 'select',
        label: 'Direction',
        default: 'Both',
        group: 'Screener',
        options: [
          { label: 'Both', value: 'Both' },
          { label: 'Bullish', value: 'Bullish' },
          { label: 'Bearish', value: 'Bearish' },
        ],
      },
      { key: 'showBullish', type: 'boolean', label: 'Only Bullish', default: true, group: 'Screener' },
      { key: 'showBearish', type: 'boolean', label: 'Only Bearish', default: true, group: 'Screener' },
      {
        key: 'displayRows',
        type: 'number',
        label: 'Display Rows',
        default: 16,
        min: 0,
        max: 100,
        step: 1,
        group: 'Screener',
        tooltip: 'How many of the most recent third signals the table lists. 0 leaves only the header.',
      },
      {
        key: 'tablePosition',
        type: 'select',
        label: 'Table Position',
        default: 'bottom-left',
        group: 'Screener',
        options: TABLE_POSITIONS.map((v) => ({ label: v.replace('-', ' '), value: v })),
      },
      {
        key: 'tableSize',
        type: 'select',
        label: 'Table Size',
        default: 'small',
        group: 'Screener',
        options: Object.keys(TABLE_FONT_PX).map((v) => ({ label: v, value: v })),
      },

      {
        key: 'lineStyle',
        type: 'select',
        label: 'Style',
        default: 'solid',
        group: 'Line Settings',
        options: LINE_STYLES.map((v) => ({ label: v, value: v })),
      },
      { key: 'lineWidth', type: 'number', label: 'Width', default: 1, min: 1, max: 10, step: 1, group: 'Line Settings' },
    ],

    // Every plot in the source carries display=display.none: they exist for the
    // data window, not for the pane. Titles and colours follow the source.
    plots: [
      {
        key: 'highestHigh',
        type: 'line',
        title: 'Highest High',
        style: { color: NEG_COLOR, lineWidth: 1, visible: false },
      },
      {
        key: 'lowestLow',
        type: 'line',
        title: 'Lowest Low',
        style: { color: POS_COLOR, lineWidth: 1, visible: false },
      },
      {
        key: 'pastLongBreak',
        type: 'step',
        title: 'Past Long Break Line',
        style: { color: POS_COLOR, lineWidth: 1, visible: false },
      },
      {
        key: 'pastShortBreak',
        type: 'step',
        title: 'Past Short Break Line',
        style: { color: NEG_COLOR, lineWidth: 1, visible: false },
      },
    ],

    calc(bars, settings, store, ctx) {
      const n = bars.length
      // A cleared number field arrives as '', and Number('') is 0.
      const period = Math.max(1, Math.floor(Number(settings.period) || 30))
      const rawOffset = Number(settings.verticalOffset)
      const offset = (Number.isFinite(rawOffset) ? rawOffset : 0) / 100
      const showBullish = settings.showBullish !== false
      const showBearish = settings.showBearish !== false
      const direction =
        settings.direction === 'Bullish' || settings.direction === 'Bearish' ? settings.direction : 'Both'
      const bull = direction !== 'Bearish'
      const bear = direction !== 'Bullish'
      const tick = Number(ctx?.tickSize) || 0
      // barstate.isconfirmed: every closed bar, and the last one only once the
      // host says it has closed. A host that says nothing is taken at its word.
      const lastConfirmed = ctx?.barState?.isConfirmed !== false

      const high = new Array(n)
      const low = new Array(n)
      const open = new Array(n)
      const close = new Array(n)
      for (let i = 0; i < n; i++) {
        high[i] = bars[i].high
        low[i] = bars[i].low
        open[i] = bars[i].open
        close[i] = bars[i].close
      }

      const atrValues = atr(high, low, close, 14)
      const highestRaw = highest(high, period)
      const lowestRaw = lowest(low, period)

      const highestHigh = new Array(n).fill(NaN)
      const lowestLow = new Array(n).fill(NaN)
      const pastLongBreak = new Array(n).fill(NaN)
      const pastShortBreak = new Array(n).fill(NaN)
      const longRetrace = new Array(n).fill(NaN)
      const longEntry = new Array(n).fill(NaN)
      const shortRetrace = new Array(n).fill(NaN)
      const shortEntry = new Array(n).fill(NaN)
      const sigDir = new Array(n).fill(NaN)
      const sigPrice = new Array(n).fill(NaN)

      // var state carried across bars, exactly as the source declares it.
      let entryState = 0
      let prevHighAtBreak = NaN
      let prevLowAtBreak = NaN
      let obLongLevel = NaN
      let obShortLevel = NaN
      let secondaryLongState = 0
      let secondaryShortState = 0
      let tertiaryLongState = 0
      let tertiaryShortState = 0

      for (let i = 0; i < n; i++) {
        const confirmed = i < n - 1 || lastConfirmed

        const wick = high[i] - low[i]
        const body = Math.abs(close[i] - open[i])
        // body / wick is na on a zero range candle, and every na comparison in
        // Pine is false, so a doji must not become a momentum candle here.
        const momentum = wick > 0 && body / wick > 0.66
        const atrSupport = Number.isFinite(atrValues[i]) && wick >= atrValues[i]

        // ta.highest(high, period)[1] / ta.lowest(low, period)[1].
        const highestPrev = i > 0 ? highestRaw[i - 1] : NaN
        const lowestPrev = i > 0 ? lowestRaw[i - 1] : NaN
        highestHigh[i] = highestPrev
        lowestLow[i] = lowestPrev

        const primaryLongCondition =
          confirmed &&
          open[i] > close[i] &&
          Number.isFinite(lowestPrev) &&
          low[i] < lowestPrev &&
          momentum &&
          atrSupport
        const primaryShortCondition =
          confirmed &&
          open[i] < close[i] &&
          Number.isFinite(highestPrev) &&
          high[i] > highestPrev &&
          momentum &&
          atrSupport

        // exrem(): the state holds until the other side fires, and only the bar
        // the state changes on is a signal.
        const previousEntry = entryState
        const currentEntry = primaryLongCondition ? 1 : primaryShortCondition ? -1 : previousEntry
        const changed = currentEntry !== previousEntry
        const primaryLongSignal = changed && currentEntry === 1
        const primaryShortSignal = changed && currentEntry === -1
        entryState = currentEntry

        if (primaryLongSignal) pastLongBreak[i] = high[i]
        if (primaryShortSignal) pastShortBreak[i] = low[i]

        // The source updates these before the secondary rules read them, so a
        // secondary signal can never land on its own primary bar.
        if (primaryLongSignal) prevHighAtBreak = high[i]
        if (primaryShortSignal) prevLowAtBreak = low[i]

        const secondaryLongCondition =
          confirmed &&
          open[i] < close[i] &&
          Number.isFinite(prevHighAtBreak) &&
          close[i] > prevHighAtBreak &&
          atrSupport
        const secondaryShortCondition =
          confirmed &&
          open[i] > close[i] &&
          Number.isFinite(prevLowAtBreak) &&
          close[i] < prevLowAtBreak &&
          atrSupport

        // trigger(): 0 waits for the primary, 1 waits for the secondary, 2 is
        // the signal bar and falls back to 0 on the bar after it.
        let sl = secondaryLongState === 2 ? 0 : secondaryLongState
        if (primaryLongSignal && sl === 0) sl = 1
        if (secondaryLongCondition && sl === 1) sl = 2
        secondaryLongState = sl
        const secondaryLongSignal = sl === 2

        let ss = secondaryShortState === 2 ? 0 : secondaryShortState
        if (primaryShortSignal && ss === 0) ss = 1
        if (secondaryShortCondition && ss === 1) ss = 2
        secondaryShortState = ss
        const secondaryShortSignal = ss === 2

        if (secondaryLongSignal) longRetrace[i] = 1
        if (secondaryShortSignal) shortRetrace[i] = 1

        // vertical_offset(): the order block level is the signal candle's high
        // or low pushed out by a share of that candle's range.
        const diff = high[i] - low[i]
        const topPrice = high[i] + diff * offset
        const bottomPrice = low[i] - diff * offset

        // ta.crossunder / ta.crossover read the level as it stood on the
        // previous bar, which is not the level this bar may have just set.
        const obLongPrev = obLongLevel
        const obShortPrev = obShortLevel
        if (primaryLongSignal) obLongLevel = topPrice
        if (primaryShortSignal) obShortLevel = bottomPrice

        const tertiaryLongCondition =
          confirmed &&
          i > 0 &&
          Number.isFinite(obLongLevel) &&
          Number.isFinite(obLongPrev) &&
          low[i] < obLongLevel &&
          low[i - 1] >= obLongPrev
        const tertiaryShortCondition =
          confirmed &&
          i > 0 &&
          Number.isFinite(obShortLevel) &&
          Number.isFinite(obShortPrev) &&
          high[i] > obShortLevel &&
          high[i - 1] <= obShortPrev

        let tl = tertiaryLongState === 2 ? 0 : tertiaryLongState
        if (secondaryLongSignal && tl === 0) tl = 1
        if (tertiaryLongCondition && tl === 1) tl = 2
        tertiaryLongState = tl
        const tertiaryLongSignal = tl === 2

        let ts = tertiaryShortState === 2 ? 0 : tertiaryShortState
        if (secondaryShortSignal && ts === 0) ts = 1
        if (tertiaryShortCondition && ts === 1) ts = 2
        tertiaryShortState = ts
        const tertiaryShortSignal = ts === 2

        if (tertiaryLongSignal) longEntry[i] = 1
        if (tertiaryShortSignal) shortEntry[i] = 1

        // indicator_calculation(): the screener row for this bar. Bearish is
        // tested first, exactly as the source orders it.
        if (confirmed) {
          let dir = NaN
          if (showBearish && tertiaryShortSignal && bear) dir = -1
          else if (showBullish && tertiaryLongSignal && bull) dir = 1
          if (dir === 1 || dir === -1) {
            sigDir[i] = dir
            // math.round_to_mintick(close)
            sigPrice[i] = tick > 0 ? roundToTick(close[i], tick) : close[i]
          }
        }
      }

      return {
        highestHigh: nulls(highestHigh),
        lowestLow: nulls(lowestLow),
        pastLongBreak: nulls(pastLongBreak),
        pastShortBreak: nulls(pastShortBreak),
        longRetrace: nulls(longRetrace),
        longEntry: nulls(longEntry),
        shortRetrace: nulls(shortRetrace),
        shortEntry: nulls(shortEntry),
        sigDir: nulls(sigDir),
        sigPrice: nulls(sigPrice),
      }
    },

    // plotshape(location.belowbar / location.abovebar) with the text 1, 2, 3.
    // aboveBar and belowBar would anchor to this study's own plot line, so the
    // marks are priced off the candle instead.
    markers({ bars, values }) {
      const out = []
      if (bars.length === 0) return out
      const pad = markerPad(bars)

      for (let i = 0; i < bars.length; i++) {
        const longSignals = [
          [values.pastLongBreak[i], '1'],
          [values.longRetrace[i], '2'],
          [values.longEntry[i], '3'],
        ]
        let below = 0
        for (const [flag, text] of longSignals) {
          if (!Number.isFinite(flag)) continue
          below++
          out.push({
            time: bars[i].time,
            position: 'atPrice',
            price: bars[i].low - pad * below,
            shape: 'circle',
            size: 'tiny',
            color: POS_COLOR,
            text,
          })
        }

        const shortSignals = [
          [values.pastShortBreak[i], '1'],
          [values.shortRetrace[i], '2'],
          [values.shortEntry[i], '3'],
        ]
        let above = 0
        for (const [flag, text] of shortSignals) {
          if (!Number.isFinite(flag)) continue
          above++
          out.push({
            time: bars[i].time,
            position: 'atPrice',
            price: bars[i].high + pad * above,
            shape: 'circle',
            size: 'tiny',
            color: NEG_COLOR,
            text,
          })
        }
      }
      return out
    },

    // The source keeps one alert_break_line alive: every new primary signal
    // deletes the previous line and draws its own, extended to the right.
    draws({ bars, values, settings }) {
      if (bars.length === 0) return []
      const width = Math.max(1, Math.floor(Number(settings.lineWidth) || 1))
      const style = LINE_STYLES.includes(settings.lineStyle) ? settings.lineStyle : 'solid'

      let index = -1
      let price = NaN
      let isLong = false
      for (let i = bars.length - 1; i >= 0; i--) {
        if (Number.isFinite(values.pastLongBreak[i])) {
          index = i
          price = values.pastLongBreak[i]
          isLong = true
          break
        }
        if (Number.isFinite(values.pastShortBreak[i])) {
          index = i
          price = values.pastShortBreak[i]
          isLong = false
          break
        }
      }
      if (index < 0 || !Number.isFinite(price)) return []

      // x2 = bar_index + 1 in the source. The second anchor has to sit at a
      // later time than the first: a zero width segment asked to extend right
      // is drawn as a vertical line down the whole pane, and a signal on the
      // newest bar is exactly when that would happen.
      const to =
        index + 1 < bars.length ? bars[index + 1].time : bars[index].time + barStep(bars)
      return [
        {
          kind: 'line',
          from: { time: bars[index].time, price },
          to: { time: to, price },
          color: isLong ? POS_COLOR : NEG_COLOR,
          lineWidth: width,
          lineStyle: style,
          extendRight: true,
        },
      ]
    },

    // The screener table, reduced to the chart's own symbol: the source polls
    // 40 tickers through request.security(), which is not available here.
    table({ bars, values, settings }) {
      if (bars.length === 0) return null

      const rawRows = settings.displayRows
      const parsedRows = rawRows === '' || rawRows === null || rawRows === undefined ? 16 : Number(rawRows)
      const maxRows = Number.isFinite(parsedRows) ? Math.max(0, Math.min(100, Math.floor(parsedRows))) : 16

      const fontSize = TABLE_FONT_PX[settings.tableSize] ?? TABLE_FONT_PX.small
      const position = TABLE_POSITIONS.includes(settings.tablePosition) ? settings.tablePosition : 'bottom-left'

      // str.format_time(x, ..., syminfo.timezone): the chart's own zone, which
      // the runtime merges into settings whenever it is not the default.
      const zone =
        typeof settings.timezone === 'string' && isValidTimezone(settings.timezone)
          ? settings.timezone
          : DEFAULT_TIMEZONE

      // timeframe.isintraday, read off the bar spacing the chart was handed.
      let intraday = false
      for (let i = bars.length - 1; i > 0; i--) {
        const step = bars[i].time - bars[i - 1].time
        if (step > 0) {
          intraday = step < 86400
          break
        }
      }
      const stamp = (time) => {
        const p = utcSecondsToZonedParts(time, zone)
        const date = pad2(p.day) + '-' + pad2(p.month) + '-' + p.year
        return intraday ? pad2(p.hour) + ':' + pad2(p.minute) + '  ' + date : date
      }

      // matrix.add_row(matrix, 0, ...) puts the newest signal on top.
      const picked = []
      for (let i = bars.length - 1; i >= 0 && picked.length < maxRows; i--) {
        const dir = values.sigDir[i]
        if (dir !== 1 && dir !== -1) continue
        picked.push({ time: bars[i].time, dir, price: values.sigPrice[i] })
      }

      const cell = (text, color) => ({
        text,
        align: 'left',
        textColor: color,
        bgColor: withAlpha(color, 0.1),
      })

      const rows = [[cell('Time', NEU_COLOR), cell('Dir', NEU_COLOR), cell('Price', NEU_COLOR)]]
      for (const row of picked) {
        const color = row.dir === 1 ? POS_COLOR : NEG_COLOR
        rows.push([
          cell(stamp(row.time), color),
          cell(row.dir === 1 ? 'Long' : 'Short', color),
          cell(priceText(row.price), color),
        ])
      }

      return {
        rows,
        options: {
          position,
          fontSize,
          cellHeight: fontSize + 10,
          borderColor: withAlpha(NEU_COLOR, 0.35),
          borderWidth: 1,
        },
      }
    },
  })
}
