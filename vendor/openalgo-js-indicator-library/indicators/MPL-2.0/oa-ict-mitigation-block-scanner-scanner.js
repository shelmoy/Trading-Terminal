/**
 * ICT Mitigation Block Scanner - ported to openalgo-charts from Pine Script.
 *
 * Source: https://github.com/ArunKBhaskar/PineScript/blob/c6821225c466494b01eee08f9dd88bf84d2b24ba/ICT Mitigation Block Scanner/[Scanner] ICT Mitigation Block Scanner.txt
 * Repo:   ArunKBhaskar/PineScript
 * License: MPL-2.0, (c) Arun_K_Bhaskar
 * SPDX-FileCopyrightText: (c) Arun_K_Bhaskar
 * SPDX-FileCopyrightText: (c) 2026 marketcalls (port to openalgo-charts)
 * SPDX-License-Identifier: MPL-2.0
 *
 * A zig zag of N-bar swing extremes is read nine pivots back. When those pivots
 * trace the ICT mitigation block shape and price closes back through the
 * second-newest pivot, the bar is marked as a shift: a box spans the structure,
 * a dashed line holds the mitigation level and the candle is recoloured. The
 * Retracement method instead arms that level and marks the bar where price
 * returns to it.
 *
 * Not ported, because a chart study cannot express it: the 40-symbol screener.
 * The source runs the whole calculation through request.security over a pasted
 * list of other tickers and fills a scoreboard table with their signals. An
 * indicator here is handed the bars of one symbol and nothing else, so every
 * part that runs on the current symbol is ported and the cross-symbol scan,
 * its symbol list input and its results table are left out.
 */

export default function ({
  registerIndicator,
  highestBars,
  lowestBars,
  atr,
  sma,
  zonedDayIndex,
  utcSecondsToZonedParts,
  isValidTimezone,
  DEFAULT_TIMEZONE,
  withAlpha,
}) {
  /* The source's chart-settings palette, kept so the port looks like the original. */
  const POS = '#26A69A'
  const POS_LIGHT = '#ACE5DC'
  const NEG = '#FF5252'
  const NEG_LIGHT = '#FCCBCD'
  const NEU = '#D1D4DC'
  const NEU_MID = '#2A2E39'
  const NEU_DARK = '#141516'

  /* Pine declares max_lines_count=500 and max_boxes_count=500, so only the most
   * recent 500 of each survive on the original chart. Keep the same budget. */
  const MAX_SHAPES = 500

  /* A cleared number or text field arrives as '', and Number('') is 0, which
   * would silently turn an hour-of-day of 9 into midnight. Fall back to the
   * default only when the field is genuinely empty. */
  const num = (v, dflt) => {
    if (v === '' || v === null || v === undefined) return dflt
    const x = Number(v)
    return Number.isFinite(x) ? x : dflt
  }
  const flt = (v, dflt, lo, hi) => Math.min(hi, Math.max(lo, num(v, dflt)))
  const int = (v, dflt, lo, hi) => Math.min(hi, Math.max(lo, Math.floor(num(v, dflt))))

  const methodOf = (settings) => (settings.method === 'Retracement' ? 'Retracement' : 'Mitigation Block')
  const zoneOf = (settings, ctx) => {
    const z = ctx?.timezone ?? settings?.timezone ?? DEFAULT_TIMEZONE
    return typeof z === 'string' && isValidTimezone(z) ? z : DEFAULT_TIMEZONE
  }

  /**
   * One signal's structure box plus its mitigation level line.
   *
   * Returns how many shapes it added, so the caller can hold the same 500 shape
   * budget the Pine script declares.
   */
  function pushStructure(out, bars, values, i, colour, opacity, method, at) {
    let added = 0
    const left = values.boxLeft[i]
    const right = values.boxRight[i]
    const top = values.boxTop[i]
    const bottom = values.boxBottom[i]
    if (Number.isFinite(left) && Number.isFinite(right) && Number.isFinite(top) && Number.isFinite(bottom)) {
      out.push({
        kind: 'box',
        from: { time: at(Math.min(left, right)), price: Math.max(top, bottom) },
        to: { time: at(Math.max(left, right)), price: Math.min(top, bottom) },
        /* Pine sets border_color and bgcolor to the same color.new(c, transp),
         * so the outline is as translucent as the fill. A box drawing applies
         * its opacity to fillColor only, so the border carries its own alpha. */
        color: withAlpha(colour, opacity),
        fillColor: colour,
        opacity,
      })
      added += 1
    }
    if (method === 'Mitigation Block') {
      const bar = values.mbLineBar[i]
      const level = values.mbLevel[i]
      if (Number.isFinite(bar) && Number.isFinite(level)) {
        out.push({
          kind: 'line',
          from: { time: at(bar), price: level },
          to: { time: bars[i].time, price: level },
          color: colour,
          lineWidth: 1,
          lineStyle: 'dashed',
        })
        added += 1
      }
    }
    return added
  }

  registerIndicator({
    id: 'oa-ict-mitigation-block-scanner-scanner',
    name: 'ICT Mitigation Block Scanner',
    category: 'ICT',
    placement: 'onchart',

    inputs: [
      {
        key: 'method',
        type: 'select',
        label: 'Screening Method',
        default: 'Mitigation Block',
        group: 'Signals',
        options: [
          { label: 'Mitigation Block', value: 'Mitigation Block' },
          { label: 'Retracement', value: 'Retracement' },
        ],
        tooltip: 'Mitigation Block marks the shift bar itself. Retracement waits for price to come back to the level that shift left behind.',
      },
      { key: 'showLong', type: 'boolean', label: 'Long Signals', default: true, group: 'Signals' },
      { key: 'showShort', type: 'boolean', label: 'Short Signals', default: true, group: 'Signals' },

      { key: 'zzDisplay', type: 'boolean', label: 'Display Zig Zag', default: true, group: 'Zig Zag' },
      { key: 'zzPeriod', type: 'number', label: 'Zig Zag Length', default: 3, min: 2, max: 500, step: 1, group: 'Zig Zag' },
      {
        key: 'zzSource',
        type: 'select',
        label: 'Source',
        default: 'High/Low',
        group: 'Zig Zag',
        options: [
          { label: 'High/Low', value: 'High/Low' },
          { label: 'Open/Close', value: 'Open/Close' },
          { label: 'Close', value: 'Close' },
        ],
      },
      {
        key: 'zzBoxTransp',
        type: 'number',
        label: 'Box Transparency',
        default: 85,
        min: 0,
        max: 100,
        step: 1,
        group: 'Zig Zag',
        tooltip: 'Transparency of the structure box, as in the source: 0 is solid and 100 is invisible.',
      },

      {
        key: 'pchgFilter',
        type: 'boolean',
        label: 'Apply % Change Filter',
        default: false,
        group: 'Additional Filters',
        tooltip: 'Source behaviour: the script requires the day change to be both above +N and below -N at once, which nothing satisfies, so switching this on suppresses every signal. Ported as written rather than corrected.',
      },
      { key: 'pchgAboveBelow', type: 'number', label: '% Change Above/Below +/-', default: 2, min: 0, max: 1000, step: 0.1, group: 'Additional Filters' },

      { key: 'volFilter', type: 'boolean', label: 'Apply Volume Filter', default: false, group: 'Additional Filters' },
      { key: 'volAbove', type: 'number', label: 'Volume Above', default: 500000, min: 0, max: 1000000000000, step: 1000, group: 'Additional Filters' },

      { key: 'volPchgFilter', type: 'boolean', label: 'Apply Volume % Change Filter', default: false, group: 'Additional Filters' },
      { key: 'volPchgAbove', type: 'number', label: 'Volume % Change Above', default: 0, min: 0, max: 100000, step: 1, group: 'Additional Filters' },

      { key: 'atrFilter', type: 'boolean', label: 'Apply ATR Filter', default: false, group: 'Additional Filters' },
      { key: 'atrLength', type: 'number', label: 'ATR Length', default: 14, min: 1, max: 1000, step: 1, group: 'Additional Filters' },
      { key: 'atrMulti', type: 'number', label: 'ATR Multiplier', default: 1, min: 1, max: 100, step: 0.1, group: 'Additional Filters' },

      { key: 'bodyFilter', type: 'boolean', label: 'Apply Body % Filter', default: false, group: 'Additional Filters' },
      { key: 'bodyPercent', type: 'number', label: 'Body % Above', default: 60, min: 0, max: 100, step: 1, group: 'Additional Filters' },

      { key: 'bodySizeFilter', type: 'boolean', label: 'Apply Body Size Filter', default: false, group: 'Additional Filters' },
      { key: 'bodySizeMultiplier', type: 'number', label: 'Body Size Multiplier (x)', default: 2, min: 0, max: 100, step: 1, group: 'Additional Filters' },

      { key: 'volumeFilter', type: 'boolean', label: 'Apply Volume SMA Filter', default: false, group: 'Additional Filters' },
      { key: 'volSmaLength', type: 'number', label: 'Volume SMA Length', default: 20, min: 1, max: 1000, step: 1, group: 'Additional Filters' },

      { key: 'relVolFilter', type: 'boolean', label: 'Apply Relative Volume Filter', default: false, group: 'Additional Filters' },
      { key: 'relVolLength', type: 'number', label: 'Relative Volume Length', default: 90, min: 2, max: 2000, step: 1, group: 'Additional Filters' },
      { key: 'relVolMulti', type: 'number', label: 'Rel Vol SMA Multiplier', default: 5, min: 0, max: 100, step: 0.1, group: 'Additional Filters' },

      { key: 'timeFilter', type: 'boolean', label: 'Apply Time Filter', default: false, group: 'Additional Filters' },
      { key: 'hourFrom', type: 'number', label: 'Time From (hour)', default: 9, min: 0, max: 23, step: 1, group: 'Additional Filters' },
      { key: 'minuteFrom', type: 'number', label: 'Time From (minute)', default: 15, min: 0, max: 59, step: 1, group: 'Additional Filters' },
      { key: 'hourTo', type: 'number', label: 'Time To (hour)', default: 10, min: 0, max: 23, step: 1, group: 'Additional Filters' },
      { key: 'minuteTo', type: 'number', label: 'Time To (minute)', default: 15, min: 0, max: 59, step: 1, group: 'Additional Filters' },

      { key: 'dateFilter', type: 'boolean', label: 'Apply Date Filter', default: false, group: 'Additional Filters' },
      { key: 'day', type: 'number', label: 'Day', default: 25, min: 1, max: 31, step: 1, group: 'Additional Filters' },
      { key: 'month', type: 'number', label: 'Month', default: 10, min: 1, max: 12, step: 1, group: 'Additional Filters' },
      { key: 'year', type: 'number', label: 'Year', default: 2024, min: 0, max: 9999, step: 1, group: 'Additional Filters' },

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
      { key: 'tableFontSize', type: 'number', label: 'Size', default: 12, min: 8, max: 20, step: 1, group: 'Data Table' },
    ],

    /* Nothing here is a value per bar: the zig zag, the boxes and the levels are
     * geometry (draws), the signals are markers and bar colours, and the
     * readings are a table. A descriptor still needs one plot, so this carries
     * the hidden placeholder the built-in seasonality study uses for the same
     * reason. Every column below it is read by a hook, never drawn as a line. */
    plots: [{ key: 'none', type: 'line', title: '', style: { visible: false } }],

    calc(bars, settings, store, ctx) {
      const n = bars.length

      const zzPeriod = int(settings.zzPeriod, 3, 2, 500)
      const zzSource =
        settings.zzSource === 'Open/Close' || settings.zzSource === 'Close' ? settings.zzSource : 'High/Low'

      const pchgFilter = settings.pchgFilter === true
      const pchgAboveBelow = flt(settings.pchgAboveBelow, 2, 0, 1000)
      const volFilter = settings.volFilter === true
      const volAbove = flt(settings.volAbove, 500000, 0, 1000000000000)
      const volPchgFilter = settings.volPchgFilter === true
      const volPchgAbove = flt(settings.volPchgAbove, 0, 0, 100000)
      const atrFilter = settings.atrFilter === true
      const atrLength = int(settings.atrLength, 14, 1, 1000)
      const atrMulti = flt(settings.atrMulti, 1, 1, 100)
      const bodyFilter = settings.bodyFilter === true
      /* Pine divides this input by 100 where it is declared. */
      const bodyPercent = flt(settings.bodyPercent, 60, 0, 100) / 100
      const bodySizeFilter = settings.bodySizeFilter === true
      const bodySizeMultiplier = int(settings.bodySizeMultiplier, 2, 0, 100)
      const volumeFilter = settings.volumeFilter === true
      const volSmaLength = int(settings.volSmaLength, 20, 1, 1000)
      const relVolFilter = settings.relVolFilter === true
      const relVolLength = int(settings.relVolLength, 90, 2, 2000)
      const relVolMulti = flt(settings.relVolMulti, 5, 0, 100)
      const timeFilter = settings.timeFilter === true
      const hourFrom = int(settings.hourFrom, 9, 0, 23)
      const minuteFrom = int(settings.minuteFrom, 15, 0, 59)
      const hourTo = int(settings.hourTo, 10, 0, 23)
      const minuteTo = int(settings.minuteTo, 15, 0, 59)
      const dateFilter = settings.dateFilter === true
      const dayOf = int(settings.day, 25, 1, 31)
      const monthOf = int(settings.month, 10, 1, 12)
      const yearOf = int(settings.year, 2024, 0, 9999)

      const zone = zoneOf(settings, ctx)
      const col = () => new Array(n).fill(NaN)

      /* ---- zig zag source -------------------------------------------------
       * The 'Open/Close' branch takes math.max(open, close) for the low as well
       * as for the high. That is what the source does, so it is what this does. */
      const zHigh = col()
      const zLow = col()
      for (let i = 0; i < n; i++) {
        const b = bars[i]
        if (zzSource === 'Open/Close') {
          const m = Math.max(b.open, b.close)
          zHigh[i] = m
          zLow[i] = m
        } else if (zzSource === 'Close') {
          zHigh[i] = b.close
          zLow[i] = b.close
        } else {
          zHigh[i] = b.high
          zLow[i] = b.low
        }
      }
      /* highestBars and lowestBars carry Pine's convention: 0 means this bar is
       * the extreme of the window, and NaN for the first zzPeriod - 1 bars. */
      const hb = highestBars(zHigh, zzPeriod)
      const lb = lowestBars(zLow, zzPeriod)

      /* ---- series the filters read ----------------------------------------- */
      const highs = new Array(n)
      const lows = new Array(n)
      const closes = new Array(n)
      const vols = new Array(n)
      for (let i = 0; i < n; i++) {
        highs[i] = bars[i].high
        lows[i] = bars[i].low
        closes[i] = bars[i].close
        /* An index series carries no volume. Pine would read na there and every
         * volume test would be false; NaN does exactly the same here. */
        vols[i] = Number.isFinite(bars[i].volume) ? bars[i].volume : NaN
      }
      const atrArr = atr(highs, lows, closes, atrLength)
      const volSma = sma(vols, volSmaLength)

      /* relative_volume = volume / average_volume[1], then its own SMA. */
      const avgVol = sma(vols, relVolLength)
      const relVol = col()
      for (let i = 1; i < n; i++) {
        const a = avgVol[i - 1]
        if (!Number.isFinite(a) || a === 0 || !Number.isFinite(vols[i])) continue
        relVol[i] = vols[i] / a
      }
      const relVolSma = sma(relVol, relVolLength)

      /* ---- daily cumulative change and volume -------------------------------
       * ta.change(time('D')) is na on the first bar, so the first bar is never a
       * new day. Bar times are UTC seconds, so the boundary is resolved in the
       * chart's zone and not in the browser's. */
      const newDay = new Array(n).fill(false)
      if (n > 0) {
        let prevDayIdx = zonedDayIndex(bars[0].time, zone)
        for (let i = 1; i < n; i++) {
          const d = zonedDayIndex(bars[i].time, zone)
          newDay[i] = d !== prevDayIdx
          prevDayIdx = d
        }
      }

      const cumPchg = col()
      let cum = NaN
      for (let i = 0; i < n; i++) {
        const prevClose = i > 0 ? closes[i - 1] : NaN
        const daily =
          !Number.isFinite(prevClose) || prevClose === 0 ? 0 : ((closes[i] - prevClose) / prevClose) * 100
        cum = newDay[i] ? daily : !Number.isFinite(cum) ? daily : cum + daily
        cumPchg[i] = cum
      }

      /* The source seeds current_cum_vol with na and adds to it, so it stays na
       * for the whole first day. NaN reproduces that, and the volume filters
       * read false through that stretch just as Pine does. */
      const dayVol = col()
      const prevDayVol = col()
      let curVol = NaN
      let priorVol = NaN
      for (let i = 0; i < n; i++) {
        if (newDay[i]) {
          priorVol = curVol
          curVol = vols[i]
        } else {
          curVol = curVol + vols[i]
        }
        dayVol[i] = curVol
        prevDayVol[i] = priorVol
      }

      const cumVolPchg = col()
      for (let i = 0; i < n; i++) {
        /* nz(prev_cum_vol, current_cum_vol) */
        const base = Number.isFinite(prevDayVol[i]) ? prevDayVol[i] : dayVol[i]
        if (!Number.isFinite(base) || base === 0 || !Number.isFinite(dayVol[i])) continue
        cumVolPchg[i] = ((dayVol[i] - base) / base) * 100
      }

      const parts = timeFilter || dateFilter ? bars.map((b) => utcSecondsToZonedParts(b.time, zone)) : null

      /* ---- output columns --------------------------------------------------- */
      const none = new Array(n).fill(null)
      const shortShift = col()
      const longShift = col()
      const shortRet = col()
      const longRet = col()
      const boxLeft = col()
      const boxRight = col()
      const boxTop = col()
      const boxBottom = col()
      const mbLineBar = col()
      const mbLevel = col()
      const retShortBar = col()
      const retShortLevel = col()
      const retLongBar = col()
      const retLongLevel = col()
      const zzValue = col()
      const zzDir = col()

      /* ---- zig zag state -----------------------------------------------------
       * Pine keeps one float array holding value, bar index, value, bar index,
       * newest first, capped at 18 entries (nine pivots). The full list is kept
       * here so the whole zig zag can still be drawn, and the capped view is
       * emulated for the pivot reads, which index from the END of that array. */
      const pv = []
      let dir = 0

      /* Retracement state, all Pine `var`s. */
      let shortBreakPrice = NaN
      let shortBreakBar = NaN
      let prevShortBreakPrice = NaN
      let longBreakPrice = NaN
      let longBreakBar = NaN
      let prevLongBreakPrice = NaN
      let shortState = 0
      let longState = 0
      let prevZz2 = NaN

      /* barstate.isconfirmed: every historical bar is closed, and the last one
       * is open only when the host says a live feed is driving it. */
      const lastConfirmed = ctx?.barState?.isConfirmed !== false

      for (let i = 0; i < n; i++) {
        /* ---- filters, in the order and the form the source states them ------ */
        let pchgAbovePass = true
        let pchgBelowPass = true
        if (pchgFilter) {
          pchgAbovePass = Number.isFinite(cumPchg[i]) && cumPchg[i] > pchgAboveBelow
          pchgBelowPass = Number.isFinite(cumPchg[i]) && cumPchg[i] < -pchgAboveBelow
        }
        let volPass = true
        if (volFilter) volPass = Number.isFinite(dayVol[i]) && dayVol[i] >= volAbove
        let volPchgPass = true
        if (volPchgFilter) volPchgPass = Number.isFinite(cumVolPchg[i]) && cumVolPchg[i] >= volPchgAbove

        const range = highs[i] - lows[i]
        let atrPass = true
        if (atrFilter) {
          atrPass = Number.isFinite(atrArr[i]) && Number.isFinite(range) && range > atrArr[i] * atrMulti
        }
        /* A doji or a halted bar makes the range zero. Pine's na then fails the
         * comparison, so an unmeasurable body is not let through here either. */
        const bodyRatio =
          Number.isFinite(range) && range > 0 ? Math.abs(closes[i] - bars[i].open) / range : NaN
        let bodyPass = true
        if (bodyFilter) bodyPass = Number.isFinite(bodyRatio) && bodyRatio >= bodyPercent
        let bodySizePass = true
        if (bodySizeFilter) {
          const prevRange = i > 0 ? highs[i - 1] - lows[i - 1] : NaN
          bodySizePass =
            Number.isFinite(bodyRatio) &&
            bodyRatio >= bodyPercent &&
            Number.isFinite(prevRange) &&
            range >= prevRange * bodySizeMultiplier
        }
        let volumeSmaPass = true
        if (volumeFilter) {
          volumeSmaPass = Number.isFinite(vols[i]) && Number.isFinite(volSma[i]) && vols[i] > volSma[i]
        }
        let relVolPass = true
        if (relVolFilter) {
          relVolPass =
            Number.isFinite(relVol[i]) &&
            Number.isFinite(relVolSma[i]) &&
            relVol[i] > relVolSma[i] * relVolMulti
        }
        let timePass = true
        if (timeFilter) {
          const p = parts[i]
          timePass =
            (p.hour > hourFrom || (p.hour === hourFrom && p.minute >= minuteFrom)) &&
            (p.hour < hourTo || (p.hour === hourTo && p.minute < minuteTo))
        }
        let datePass = true
        if (dateFilter) {
          const p = parts[i]
          datePass = p.year === yearOf && p.month === monthOf && p.day === dayOf
        }
        const confirmed = i < n - 1 ? true : lastConfirmed
        const filtersPass =
          pchgAbovePass &&
          pchgBelowPass &&
          volPass &&
          volPchgPass &&
          atrPass &&
          bodyPass &&
          bodySizePass &&
          volumeSmaPass &&
          relVolPass &&
          timePass &&
          datePass &&
          confirmed

        /* ---- zig zag ---------------------------------------------------------- */
        const ph = hb[i] === 0 ? zHigh[i] : NaN
        const pl = lb[i] === 0 ? zLow[i] : NaN
        const dirBefore = dir
        if (Number.isFinite(pl) && !Number.isFinite(ph)) dir = -1
        else if (Number.isFinite(ph) && !Number.isFinite(pl)) dir = 1
        const dirChanged = i > 0 && dir !== dirBefore

        if (Number.isFinite(ph) || Number.isFinite(pl)) {
          const value = dir === 1 ? ph : pl
          if (Number.isFinite(value)) {
            if (dirChanged || pv.length === 0) {
              pv.unshift({ v: value, b: i, d: dir })
            } else if ((dir === 1 && value > pv[0].v) || (dir === -1 && value < pv[0].v)) {
              /* update_zigzag moves the newest pivot rather than adding one. */
              pv[0].v = value
              pv[0].b = i
            }
          }
        }

        /* The capped array is nine pivots, or 18 flat slots: a value at an even
         * slot and its bar index at the odd slot after it. Pine reads back from
         * the OLDEST end, so the numbering shifts while it is still filling. */
        const flatSize = Math.min(pv.length * 2, 18)
        const flat = (j) => {
          if (j < 0 || j >= flatSize) return NaN
          const p = pv[Math.floor(j / 2)]
          if (!p) return NaN
          return j % 2 === 0 ? p.v : p.b
        }
        const bi0 = flatSize > 16 ? flat(flatSize - 17) : NaN
        const zz1 = flatSize > 15 ? flat(flatSize - 16) : NaN
        const zz2 = flatSize > 13 ? flat(flatSize - 14) : NaN
        const bi2 = flatSize > 12 ? flat(flatSize - 13) : NaN
        const zz3 = flatSize > 11 ? flat(flatSize - 12) : NaN
        const zz4 = flatSize > 9 ? flat(flatSize - 10) : NaN
        const zz5 = flatSize > 7 ? flat(flatSize - 8) : NaN
        const zz6 = flatSize > 5 ? flat(flatSize - 6) : NaN
        const zz7 = flatSize > 3 ? flat(flatSize - 4) : NaN
        const zz8 = flatSize > 1 ? flat(flatSize - 2) : NaN
        const bi8 = flatSize > 0 ? flat(flatSize - 1) : NaN

        /* Every comparison below has to be false the moment a pivot is missing.
         * Pine gets that from na; in JavaScript 5 > null is true, so the nine
         * pivots are checked for being finite first. */
        const haveStructure =
          Number.isFinite(zz1) &&
          Number.isFinite(zz2) &&
          Number.isFinite(zz3) &&
          Number.isFinite(zz4) &&
          Number.isFinite(zz5) &&
          Number.isFinite(zz6) &&
          Number.isFinite(zz7) &&
          Number.isFinite(zz8)

        const prevClose = i > 0 ? closes[i - 1] : NaN
        const crossUnderClose =
          Number.isFinite(closes[i]) &&
          Number.isFinite(zz2) &&
          Number.isFinite(prevClose) &&
          Number.isFinite(prevZz2) &&
          closes[i] < zz2 &&
          prevClose >= prevZz2
        const crossOverClose =
          Number.isFinite(closes[i]) &&
          Number.isFinite(zz2) &&
          Number.isFinite(prevClose) &&
          Number.isFinite(prevZz2) &&
          closes[i] > zz2 &&
          prevClose <= prevZz2

        const shortCont1 =
          haveStructure &&
          zz1 > zz2 &&
          zz1 < zz3 &&
          zz2 < zz1 &&
          zz2 < zz3 &&
          zz3 > zz2 &&
          zz3 > zz1 &&
          zz3 > zz4 &&
          zz3 < zz5 &&
          zz4 < zz3 &&
          zz4 > zz2 &&
          zz4 < zz5 &&
          zz5 > zz3 &&
          zz5 > zz4 &&
          zz5 > zz6 &&
          zz5 > zz7 &&
          zz6 < zz5 &&
          zz6 < zz7 &&
          zz7 > zz6 &&
          zz7 < zz5 &&
          zz7 > zz8 &&
          crossUnderClose &&
          filtersPass

        const longCont1 =
          haveStructure &&
          zz1 < zz2 &&
          zz1 > zz3 &&
          zz2 > zz1 &&
          zz2 > zz3 &&
          zz3 < zz2 &&
          zz3 < zz1 &&
          zz3 < zz4 &&
          zz3 > zz5 &&
          zz4 > zz3 &&
          zz4 < zz2 &&
          zz4 > zz5 &&
          zz5 < zz3 &&
          zz5 < zz4 &&
          zz5 < zz6 &&
          zz5 < zz7 &&
          zz6 > zz5 &&
          zz6 > zz7 &&
          zz7 < zz6 &&
          zz7 > zz5 &&
          zz7 < zz8 &&
          crossOverClose &&
          filtersPass

        /* The level a retracement will be measured against is written before
         * condition 2 is tested, exactly as the source orders it. */
        if (shortCont1) {
          shortBreakPrice = zz2
          shortBreakBar = bi2
        }
        if (longCont1) {
          longBreakPrice = zz2
          longBreakBar = bi2
        }

        const prevHigh = i > 0 ? highs[i - 1] : NaN
        const prevLow = i > 0 ? lows[i - 1] : NaN
        const shortCont2 =
          Number.isFinite(shortBreakPrice) &&
          Number.isFinite(prevShortBreakPrice) &&
          Number.isFinite(prevHigh) &&
          highs[i] > shortBreakPrice &&
          prevHigh <= prevShortBreakPrice &&
          prevHigh < shortBreakPrice &&
          filtersPass
        const longCont2 =
          Number.isFinite(longBreakPrice) &&
          Number.isFinite(prevLongBreakPrice) &&
          Number.isFinite(prevLow) &&
          lows[i] < longBreakPrice &&
          prevLow >= prevLongBreakPrice &&
          prevLow > longBreakPrice &&
          filtersPass

        /* A trigger lasts one bar: the state falls back to 0 on the bar after it
         * reaches 2, so the next structure can arm again. */
        const shortPrevState = shortState
        shortState = shortPrevState === 2 ? 0 : shortPrevState
        if (shortCont1 && shortState === 0) shortState = 1
        if (shortCont2 && shortState === 1) shortState = 2
        const longPrevState = longState
        longState = longPrevState === 2 ? 0 : longPrevState
        if (longCont1 && longState === 0) longState = 1
        if (longCont2 && longState === 1) longState = 2

        if (shortCont1) {
          shortShift[i] = 1
          /* box.new(left=bi_8, top=min(zz_8, zz_6, zz_4, zz_2), right=bi_0, bottom=zz_5) */
          if (Number.isFinite(bi8) && Number.isFinite(bi0)) {
            boxLeft[i] = bi8
            boxRight[i] = bi0
            boxTop[i] = Math.min(zz8, zz6, zz4, zz2)
            boxBottom[i] = zz5
          }
          if (Number.isFinite(bi2)) {
            mbLineBar[i] = bi2
            mbLevel[i] = zz2
          }
        }
        if (longCont1) {
          longShift[i] = 1
          if (Number.isFinite(bi8) && Number.isFinite(bi0)) {
            boxLeft[i] = bi8
            boxRight[i] = bi0
            boxTop[i] = Math.max(zz8, zz6, zz4, zz2)
            boxBottom[i] = zz5
          }
          if (Number.isFinite(bi2)) {
            mbLineBar[i] = bi2
            mbLevel[i] = zz2
          }
        }
        if (shortState === 2) {
          shortRet[i] = 1
          if (Number.isFinite(shortBreakBar) && Number.isFinite(shortBreakPrice)) {
            retShortBar[i] = shortBreakBar
            retShortLevel[i] = shortBreakPrice
          }
        }
        if (longState === 2) {
          longRet[i] = 1
          if (Number.isFinite(longBreakBar) && Number.isFinite(longBreakPrice)) {
            retLongBar[i] = longBreakBar
            retLongLevel[i] = longBreakPrice
          }
        }

        prevZz2 = zz2
        prevShortBreakPrice = shortBreakPrice
        prevLongBreakPrice = longBreakPrice
      }

      /* The zig zag is drawn from the pivots' final positions: one point on each
       * bar a pivot ended up anchored to. */
      for (const p of pv) {
        if (p.b >= 0 && p.b < n && Number.isFinite(p.v)) {
          zzValue[p.b] = p.v
          zzDir[p.b] = p.d
        }
      }

      return {
        none,
        shortShift,
        longShift,
        shortRet,
        longRet,
        boxLeft,
        boxRight,
        boxTop,
        boxBottom,
        mbLineBar,
        mbLevel,
        retShortBar,
        retShortLevel,
        retLongBar,
        retLongLevel,
        zzValue,
        zzDir,
        cumPchg,
        cumVolPchg,
        dayVol,
        prevDayVol,
      }
    },

    markers({ bars, values, settings }) {
      const n = bars.length
      if (n === 0) return []
      const method = methodOf(settings)
      const showLong = settings.showLong !== false
      const showShort = settings.showShort !== false

      /* atPrice adds no padding of its own, and a fixed number of points would
       * be right on one instrument and wrong on every other, so scale it. */
      let sum = 0
      let cnt = 0
      for (let i = Math.max(0, n - 100); i < n; i++) {
        const r = bars[i].high - bars[i].low
        if (Number.isFinite(r)) {
          sum += r
          cnt += 1
        }
      }
      const last = bars[n - 1].close
      const pad = Math.max(
        cnt > 0 ? (sum / cnt) * 0.5 : 0,
        Math.abs(Number.isFinite(last) ? last : 0) * 0.0005
      )

      const out = []
      for (let i = 0; i < n; i++) {
        const b = bars[i]
        const above = Number.isFinite(b.high) ? b.high + pad : NaN
        const below = Number.isFinite(b.low) ? b.low - pad : NaN
        if (!Number.isFinite(above) || !Number.isFinite(below)) continue
        if (method === 'Mitigation Block') {
          if (showShort && Number.isFinite(values.shortShift[i])) {
            out.push({ time: b.time, position: 'atPrice', price: above, shape: 'triangleDown', size: 'tiny', color: NEG_LIGHT })
          }
          if (showLong && Number.isFinite(values.longShift[i])) {
            out.push({ time: b.time, position: 'atPrice', price: below, shape: 'triangleUp', size: 'tiny', color: POS_LIGHT })
          }
        } else {
          /* The source draws a curved-arrow character here. There is no glyph
           * slot in the marker set, so the nearest shape carries the meaning. */
          if (showShort && Number.isFinite(values.shortRet[i])) {
            out.push({ time: b.time, position: 'atPrice', price: above, shape: 'arrowDown', size: 'tiny', color: NEG_LIGHT })
          }
          if (showLong && Number.isFinite(values.longRet[i])) {
            out.push({ time: b.time, position: 'atPrice', price: below, shape: 'arrowUp', size: 'tiny', color: POS_LIGHT })
          }
        }
      }
      return out
    },

    draws({ bars, values, settings }) {
      const n = bars.length
      if (n === 0) return []
      const method = methodOf(settings)
      const showLong = settings.showLong !== false
      const showShort = settings.showShort !== false
      const zzDisplay = settings.zzDisplay !== false
      const opacity = Math.min(1, Math.max(0, (100 - flt(settings.zzBoxTransp, 85, 0, 100)) / 100))
      /* Anchors are times, never indices: a bar index from calc is turned into
       * the time of that bar, so paging history in cannot slide a box off it. */
      const at = (idx) => bars[Math.min(n - 1, Math.max(0, Math.round(idx)))].time

      const out = []

      if (zzDisplay) {
        const pts = []
        for (let i = 0; i < n; i++) {
          if (Number.isFinite(values.zzValue[i])) pts.push({ i, v: values.zzValue[i], d: values.zzDir[i] })
        }
        /* The source only starts drawing once the array holds five pivots, and
         * colours each segment by the direction of its newer end. */
        const first = Math.max(4, pts.length - MAX_SHAPES)
        for (let k = first; k < pts.length; k++) {
          const a = pts[k - 1]
          const b = pts[k]
          out.push({
            kind: 'line',
            from: { time: bars[a.i].time, price: a.v },
            to: { time: bars[b.i].time, price: b.v },
            color: b.d === 1 ? POS : NEG,
            lineWidth: 1,
          })
        }
      }

      /* Structure boxes and levels, newest first so the shape budget keeps the
       * ones a trader is actually looking at. */
      let drawn = 0
      for (let i = n - 1; i >= 0 && drawn < MAX_SHAPES; i--) {
        if (showShort && Number.isFinite(values.shortShift[i])) {
          drawn += pushStructure(out, bars, values, i, NEG, opacity, method, at)
        }
        if (showLong && Number.isFinite(values.longShift[i])) {
          drawn += pushStructure(out, bars, values, i, POS, opacity, method, at)
        }
        if (method === 'Retracement') {
          if (showShort && Number.isFinite(values.shortRet[i])) {
            const bar = values.retShortBar[i]
            const level = values.retShortLevel[i]
            if (Number.isFinite(bar) && Number.isFinite(level)) {
              out.push({
                kind: 'line',
                from: { time: at(bar), price: level },
                to: { time: bars[i].time, price: level },
                color: NEG,
                lineWidth: 1,
                lineStyle: 'dotted',
              })
              drawn += 1
            }
          }
          if (showLong && Number.isFinite(values.longRet[i])) {
            const bar = values.retLongBar[i]
            const level = values.retLongLevel[i]
            if (Number.isFinite(bar) && Number.isFinite(level)) {
              out.push({
                kind: 'line',
                from: { time: at(bar), price: level },
                to: { time: bars[i].time, price: level },
                color: POS,
                lineWidth: 1,
                lineStyle: 'dotted',
              })
              drawn += 1
            }
          }
        }
      }
      return out
    },

    barColors({ bars, values, settings }) {
      const n = bars.length
      const out = new Array(n).fill(null)
      const method = methodOf(settings)
      const showLong = settings.showLong !== false
      const showShort = settings.showShort !== false
      for (let i = 0; i < n; i++) {
        if (method === 'Mitigation Block') {
          if (showShort && Number.isFinite(values.shortShift[i])) out[i] = NEG_LIGHT
          else if (showLong && Number.isFinite(values.longShift[i])) out[i] = POS_LIGHT
        } else {
          if (showShort && Number.isFinite(values.shortRet[i])) out[i] = NEG_LIGHT
          else if (showLong && Number.isFinite(values.longRet[i])) out[i] = POS_LIGHT
        }
      }
      return out
    },

    table({ bars, values, settings }) {
      const n = bars.length
      if (n === 0 || settings.showDataTable === false) return null
      const i = n - 1
      const pchg = values.cumPchg[i]
      const volPchg = values.cumVolPchg[i]
      const vol = values.dayVol[i]
      const pvol = values.prevDayVol[i]

      const pct = (v) => (Number.isFinite(v) ? `${v.toFixed(2)} %` : '-')
      /* The source reports volume in lakhs. */
      const lakh = (v) => (Number.isFinite(v) ? `${(v / 100000).toFixed(2)} L` : '-')
      const upDown = (v) => (Number.isFinite(v) && v > 0 ? POS : NEG)
      const prevCol = Number.isFinite(pvol) && Number.isFinite(vol) && pvol < vol ? NEG : POS

      const label = (t, dark) => ({ text: t, textColor: NEU, align: 'left', bgColor: dark ? NEU_DARK : NEU_MID })
      const value = (t, colour, dark) => ({ text: t, textColor: colour, align: 'right', bgColor: dark ? NEU_DARK : NEU_MID })
      const positions = [
        'top-left', 'top-center', 'top-right',
        'middle-left', 'middle-center', 'middle-right',
        'bottom-left', 'bottom-center', 'bottom-right',
      ]

      return {
        rows: [
          [label('%Chg', true), value(pct(pchg), upDown(pchg), true)],
          [label('Vol %Chg', false), value(pct(volPchg), upDown(volPchg), false)],
          [label('Vol', true), value(lakh(vol), upDown(volPchg), true)],
          [label('PD Vol', false), value(lakh(pvol), prevCol, false)],
        ],
        options: {
          position: positions.includes(settings.tablePosition) ? settings.tablePosition : 'bottom-right',
          fontSize: int(settings.tableFontSize, 12, 8, 20),
          borderColor: NEU_MID,
          borderWidth: 1,
          cellWidth: [90, 100],
          cellHeight: 20,
        },
      }
    },
  })
}
