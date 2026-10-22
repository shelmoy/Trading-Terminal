/**
 * ICT External Range Liquidity Static Multi-timeframe (Swing High and Low)
 * - ported to openalgo-charts from Pine Script v5.
 *
 * Source: https://github.com/ArunKBhaskar/PineScript/blob/c6821225c466494b01eee08f9dd88bf84d2b24ba/ICT External Range Liquidity/ICT External Range Liquidity Static Multi-timeframe (Swing High and Low).txt
 * Repo:   ArunKBhaskar/PineScript
 * License: MPL-2.0 (c) Arun_K_Bhaskar
 * SPDX-FileCopyrightText: (c) Arun_K_Bhaskar
 * SPDX-FileCopyrightText: (c) 2026 marketcalls (port to openalgo-charts)
 * SPDX-License-Identifier: MPL-2.0
 *
 * This source code is subject to the terms of the Mozilla Public License 2.0 at
 * https://mozilla.org/MPL/2.0/
 *
 * External range liquidity is the resting stop order pool above a swing high
 * and below a swing low. Three independent higher timeframes each contribute
 * their own swing pivots, drawn back to the bar that actually made the high or
 * the low and carried forward until price trades through the level, which is
 * the moment that liquidity is taken. A fourth pass looks for two consecutive
 * swings of the same kind within a percentage of each other and boxes them as
 * equal highs or equal lows, the cleanest liquidity of all.
 *
 * Gaps against the source, all in how the drawing layer is configured rather
 * than in what is computed:
 *  - The colour pickers are dropped because the chart generates no style
 *    controls for drawings and a colour input that only feeds a drawing is a
 *    second source of truth. The Pine defaults are kept as the constants below.
 *  - plotshape's xcross is not in the marker shape set, so an equal high or
 *    equal low is marked with a diamond at the same bar and the same price.
 *  - The Pine indicator() call sets no max_boxes_count, so the platform default
 *    of 50 applies to the equal high and equal low boxes. That ceiling is
 *    applied here from the newest backwards.
 *
 * Higher timeframe data is folded up from the chart's own bars rather than
 * requested, and each fold is read one completed higher timeframe bar behind,
 * which is what request.security with lookahead_off returns. The bars-per-
 * higher-timeframe-bar count that sizes the lookback search is measured from
 * the fold rather than divided out of the two timeframes in minutes, so a
 * session-bounded instrument is counted correctly.
 */

// Pine defaults, kept verbatim so the port looks like the original out of the box.
const H_COLOR = '#F7525F' // i_phl_N_h_ln_color and i_phl_eq_h_ln_color
const L_COLOR = '#22AB94' // i_phl_N_l_ln_color and i_phl_eq_l_ln_color

// i_max_bars_back in the source, the ceiling on the lookback search.
const MAX_BARS_BACK = 4999

// Pine's max_boxes_count default, which the source never raises.
const MAX_EQUAL_BOXES = 50

export default function ({
  registerIndicator,
  pivotHigh,
  pivotLow,
  nulls,
  withAlpha,
  clamp,
  precisionForStep,
  zonedDayIndex,
  zonedWeekIndex,
  utcSecondsToZonedParts,
  isValidTimezone,
  DEFAULT_TIMEZONE,
}) {
  /* ---------------------------------------------------------------- inputs */

  // A cleared number field arrives as '', and Number('') is 0, so a plain
  // `Number(x) || fallback` would also swallow a deliberate zero. Only a blank
  // or unparseable field falls back to the default.
  const intInput = (value, fallback, min, max) => {
    if (value === '' || value === null || value === undefined) return fallback
    const num = Number(value)
    if (!Number.isFinite(num)) return fallback
    return clamp(Math.floor(num), min, max)
  }

  const floatInput = (value, fallback, min, max) => {
    if (value === '' || value === null || value === undefined) return fallback
    const num = Number(value)
    if (!Number.isFinite(num)) return fallback
    return clamp(num, min, max)
  }

  const textInput = (value, fallback) => {
    if (value === null || value === undefined) return fallback
    const raw = String(value).trim()
    return raw === '' ? fallback : raw
  }

  // input.timeframe offers 'Chart' as one of its choices, and Pine spells that
  // choice as the empty string, so an empty box is a real selection here rather
  // than a cleared field: it means the chart's own timeframe, which is what
  // request.security(tickerid, '', series) returns. Only a key the settings
  // dialog never wrote at all falls back to the group default.
  const timeframeInput = (value, fallback) => {
    if (value === null || value === undefined) return fallback
    return String(value).trim()
  }

  const resolveZone = (ctx) => {
    const zone = ctx && typeof ctx.timezone === 'string' ? ctx.timezone : null
    if (zone && isValidTimezone(zone)) return zone
    return DEFAULT_TIMEZONE
  }

  /* ------------------------------------------------------------ timeframes */

  // Pine timeframe strings: '' is the chart, a bare number is minutes, 'S' is
  // seconds, 'D' days, 'W' weeks and an upper case 'M' months. A lower case
  // 'm' is minutes, which is why the case matters here.
  const parseTimeframe = (spec) => {
    const raw = textInput(spec, '')
    if (raw === '') return null
    const match = /^([0-9]*)\s*([A-Za-z]*)$/.exec(raw)
    if (!match) return null
    const count = match[1] === '' ? 1 : Math.max(1, Math.floor(Number(match[1])))
    if (!Number.isFinite(count)) return null
    const unit = match[2] === '' ? 'm' : match[2][0]
    switch (unit) {
      case 'S':
      case 's':
        return { unit: 'second', count }
      case 'm':
        return { unit: 'minute', count }
      case 'h':
      case 'H':
        return { unit: 'minute', count: count * 60 }
      case 'D':
      case 'd':
        return { unit: 'day', count }
      case 'W':
      case 'w':
        return { unit: 'week', count }
      case 'M':
        return { unit: 'month', count }
      default:
        return null
    }
  }

  /**
   * Fold the chart's own bars up to the requested timeframe.
   *
   * There is no request.security here. Folding is the safer half of that
   * trade: the pivot series below is read one completed higher timeframe bar
   * behind, so nothing reads a value the bar had not produced yet.
   *
   * Intraday buckets restart at each trading day's first bar rather than on the
   * epoch, so a 60 minute bucket on a 09:15 open starts at 09:15.
   */
  const foldHigherTimeframe = (bars, tf, zone) => {
    const out = []
    if (!Array.isArray(bars) || bars.length === 0) return out
    const calendar = tf && (tf.unit === 'day' || tf.unit === 'week' || tf.unit === 'month')
    let previousKey = null
    let ordinal = -1
    let dayKey = null
    let dayStart = 0

    for (let i = 0; i < bars.length; i++) {
      const bar = bars[i]
      const t = bar.time
      let key
      if (!tf) {
        key = i
      } else if (tf.unit === 'second' || tf.unit === 'minute') {
        const day = zonedDayIndex(t, zone)
        if (day !== dayKey) {
          dayKey = day
          dayStart = t
        }
        const size = tf.unit === 'second' ? tf.count : tf.count * 60
        key = `${day}:${Math.floor((t - dayStart) / Math.max(1, size))}`
      } else if (tf.unit === 'day') {
        key = zonedDayIndex(t, zone)
      } else if (tf.unit === 'week') {
        key = zonedWeekIndex(t, zone)
      } else {
        const parts = utcSecondsToZonedParts(t, zone)
        key = parts.year * 12 + (parts.month - 1)
      }
      if (key !== previousKey) {
        previousKey = key
        ordinal += 1
      }
      const group = calendar ? Math.floor(ordinal / tf.count) : ordinal
      const last = out[out.length - 1]
      if (!last || last.group !== group) {
        out.push({
          group,
          from: i,
          to: i,
          open: bar.open,
          high: bar.high,
          low: bar.low,
          close: bar.close,
        })
      } else {
        last.to = i
        if (Number.isFinite(bar.high)) last.high = Number.isFinite(last.high) ? Math.max(last.high, bar.high) : bar.high
        if (Number.isFinite(bar.low)) last.low = Number.isFinite(last.low) ? Math.min(last.low, bar.low) : bar.low
        last.close = bar.close
      }
    }
    return out
  }

  /* -------------------------------------------------------------- settings */

  const readGroup = (settings, prefix, defaults) => ({
    show: settings[`${prefix}Show`] !== false,
    tf: timeframeInput(settings[`${prefix}Tf`], defaults.tf),
    left: intInput(settings[`${prefix}Left`], defaults.left, 1, 500),
    right: intInput(settings[`${prefix}Right`], defaults.right, 1, 500),
    showLast: intInput(settings[`${prefix}ShowLast`], defaults.showLast, 0, 500),
    extend: settings[`${prefix}Extend`] === true,
    lineStyle: settings[`${prefix}LineStyle`] === 'dashed' || settings[`${prefix}LineStyle`] === 'dotted'
      ? settings[`${prefix}LineStyle`]
      : 'solid',
    lineWidth: intInput(settings[`${prefix}LineWidth`], defaults.lineWidth, 1, 10),
    labelShow: settings[`${prefix}LabelShow`] === true,
  })

  const GROUP_DEFAULTS = [
    { prefix: 'phl1', tf: '15', left: 2, right: 2, showLast: 2, lineWidth: 2 },
    { prefix: 'phl2', tf: '60', left: 2, right: 2, showLast: 2, lineWidth: 2 },
    { prefix: 'phl3', tf: '240', left: 2, right: 2, showLast: 2, lineWidth: 2 },
  ]

  const groupInputs = (defaults, label) => [
    {
      key: `${defaults.prefix}Tf`,
      type: 'text',
      label: 'Timeframe',
      default: defaults.tf,
      group: label,
      tooltip: "Pine timeframe code: a number for minutes, or D, W or M. Blank uses the chart timeframe.",
    },
    { key: `${defaults.prefix}Left`, type: 'number', label: 'Left', default: defaults.left, min: 1, max: 500, step: 1, group: label },
    { key: `${defaults.prefix}Right`, type: 'number', label: 'Right', default: defaults.right, min: 1, max: 500, step: 1, group: label },
    {
      key: `${defaults.prefix}ShowLast`,
      type: 'number',
      label: 'Show Last',
      default: defaults.showLast,
      min: 0,
      max: 500,
      step: 1,
      group: label,
      tooltip: 'Levels kept for this timeframe, counting highs and lows together as the source does.',
    },
    { key: `${defaults.prefix}Extend`, type: 'boolean', label: 'Line Extend', default: false, group: label,
      tooltip: 'Carry every level to the last bar instead of stopping it where price traded through.' },
    {
      key: `${defaults.prefix}LineStyle`,
      type: 'select',
      label: 'Line Style',
      default: 'solid',
      group: label,
      options: [
        { label: 'Solid', value: 'solid' },
        { label: 'Dashed', value: 'dashed' },
        { label: 'Dotted', value: 'dotted' },
      ],
    },
    { key: `${defaults.prefix}LineWidth`, type: 'number', label: 'Line Width', default: defaults.lineWidth, min: 1, max: 10, step: 1, group: label,
      tooltip: 'The chart generates no thickness control for drawings, so the level lines take their width from here.' },
    { key: `${defaults.prefix}LabelShow`, type: 'boolean', label: 'Label', default: false, group: label },
  ]

  const QUICK = 'Quick On/Off'
  const COMMON = 'Common Settings'
  const G1 = 'Pivot High Low 1'
  const G2 = 'Pivot High Low 2'
  const G3 = 'Pivot High Low 3'
  const GEQ = 'Equal High Low'

  registerIndicator({
    id: 'oa-ict-external-range-liquidity-static-multi-timeframe-swing-hi',
    name: 'ICT External Range Liquidity Static Multi-timeframe (Swing High and Low)',
    category: 'ICT',
    placement: 'onchart',

    inputs: [
      { key: 'phl1Show', type: 'boolean', label: 'Pivot High Low 1', default: true, group: QUICK },
      { key: 'phl2Show', type: 'boolean', label: 'Pivot High Low 2', default: true, group: QUICK },
      { key: 'phl3Show', type: 'boolean', label: 'Pivot High Low 3', default: true, group: QUICK },
      { key: 'phlEqShow', type: 'boolean', label: 'Equal Pivot High Low', default: true, group: QUICK },

      {
        key: 'source',
        type: 'select',
        label: 'Source',
        default: 'High/Low',
        group: COMMON,
        options: [
          { label: 'High/Low', value: 'High/Low' },
          { label: 'Open/Close', value: 'Open/Close' },
        ],
        tooltip: 'Open/Close reads the candle body instead of the wick, so a long shadow does not set the swing.',
      },

      ...groupInputs(GROUP_DEFAULTS[0], G1),
      ...groupInputs(GROUP_DEFAULTS[1], G2),
      ...groupInputs(GROUP_DEFAULTS[2], G3),

      { key: 'eqLeft', type: 'number', label: 'Left', default: 60, min: 1, max: 1000, step: 1, group: GEQ },
      { key: 'eqRight', type: 'number', label: 'Right', default: 30, min: 1, max: 1000, step: 1, group: GEQ },
      {
        key: 'eqPercent',
        type: 'number',
        label: 'Equal HL %',
        default: 0.05,
        min: 0,
        max: 100,
        step: 0.01,
        group: GEQ,
        tooltip: 'Lower values mean highs and lows are closer.',
      },
      {
        key: 'eqTransp',
        type: 'number',
        label: 'Transparency',
        default: 25,
        min: 0,
        max: 100,
        step: 1,
        group: GEQ,
        tooltip: 'Pine transparency, 0 opaque to 100 invisible. The chart generates no opacity control for drawings.',
      },
    ],

    // Nothing in the source is a value per bar, so both plots are the chart
    // timeframe swing pivots the Equal High Low pass is built from, carried as
    // columns and left invisible. Everything drawn is geometry between two
    // points, which is what draws() and markers() are for.
    plots: [
      { key: 'swingHigh', type: 'line', title: 'Swing High', style: { color: H_COLOR, visible: false } },
      { key: 'swingLow', type: 'line', title: 'Swing Low', style: { color: L_COLOR, visible: false } },
    ],

    calc(bars, settings, store, ctx) {
      const n = bars.length
      const blank = () => new Array(n).fill(NaN)

      const columns = {
        swingHigh: blank(),
        swingLow: blank(),
        labelPrecision: blank(),
        eqHighLeft: blank(),
        eqHighRight: blank(),
        eqHighTop: blank(),
        eqHighBottom: blank(),
        eqLowLeft: blank(),
        eqLowRight: blank(),
        eqLowTop: blank(),
        eqLowBottom: blank(),
      }
      for (const defaults of GROUP_DEFAULTS) {
        columns[`${defaults.prefix}HighLevel`] = blank()
        columns[`${defaults.prefix}HighX1`] = blank()
        columns[`${defaults.prefix}HighX2`] = blank()
        columns[`${defaults.prefix}LowLevel`] = blank()
        columns[`${defaults.prefix}LowX1`] = blank()
        columns[`${defaults.prefix}LowX2`] = blank()
      }

      const finish = () => {
        const result = {}
        for (const key of Object.keys(columns)) result[key] = nulls(columns[key])
        return result
      }

      if (n === 0) return finish()

      const zone = resolveZone(ctx)

      // The label text is the level itself, so it is formatted to the
      // instrument's own tick rather than to a fixed number of decimals. The
      // draws hook never sees ctx, which is why the precision travels as a
      // column. A host that has not set minMove leaves it unavailable and the
      // hook falls back to the magnitude of the number.
      const tick = Number(ctx && ctx.tickSize) || 0
      if (tick > 0) {
        const decimals = precisionForStep(tick)
        if (Number.isFinite(decimals)) columns.labelPrecision.fill(decimals)
      }

      // float _high = source == 'Open/Close' ? math.max(open, close) : high
      const useBody = String(settings.source ?? 'High/Low') === 'Open/Close'
      const srcHigh = new Array(n)
      const srcLow = new Array(n)
      for (let i = 0; i < n; i++) {
        const bar = bars[i]
        srcHigh[i] = useBody ? Math.max(bar.open, bar.close) : bar.high
        srcLow[i] = useBody ? Math.min(bar.open, bar.close) : bar.low
      }

      /**
       * f_offsetToP: walk back over the chart's own source series for the bar
       * whose value sits closest to the higher timeframe pivot price, which is
       * the bar that actually made the swing. The comparison is strict, so the
       * nearest bar wins a tie, and the search starts one bar back exactly as
       * the source does.
       */
      const offsetToP = (series, price, maxBack, at) => {
        if (!Number.isFinite(price)) return NaN
        let delta = 10e10
        let offset = NaN
        for (let j = 1; j <= maxBack; j++) {
          const index = at - j
          if (index < 0) break
          const thisDelta = Math.abs(series[index] - price)
          if (Number.isFinite(thisDelta) && thisDelta < delta) {
            delta = thisDelta
            offset = j
          }
        }
        return offset
      }

      /**
       * f_extendArray: a level is carried one bar at a time for as long as the
       * new bar does not trade through it. The first bar whose raw high is
       * above the level and whose raw low is below it takes that liquidity, and
       * the line stops there for good. 'Line Extend' overrides the whole test
       * and runs every level to the last bar.
       */
      const extendTo = (at, level, always) => {
        if (always) return n - 1
        let x2 = at
        for (let k = at + 1; k < n; k++) {
          const bar = bars[k]
          if (bar.high > level && bar.low < level) break
          x2 = k
        }
        return x2
      }

      /* ------------------------------------- pivot high low 1, 2 and 3 */

      for (const defaults of GROUP_DEFAULTS) {
        const cfg = readGroup(settings, defaults.prefix, defaults)
        if (!cfg.show || cfg.showLast === 0) continue

        const htf = foldHigherTimeframe(bars, parseTimeframe(cfg.tf), zone)
        if (htf.length === 0) continue

        const htfHigh = new Array(htf.length)
        const htfLow = new Array(htf.length)
        for (let k = 0; k < htf.length; k++) {
          const hb = htf[k]
          htfHigh[k] = useBody ? Math.max(hb.open, hb.close) : hb.high
          htfLow[k] = useBody ? Math.min(hb.open, hb.close) : hb.low
        }

        const pivotH = pivotHigh(htfHigh, cfg.left, cfg.right)
        const pivotL = pivotLow(htfLow, cfg.left, cfg.right)

        const bucket = new Array(n).fill(-1)
        for (let k = 0; k < htf.length; k++) {
          for (let i = htf[k].from; i <= htf[k].to; i++) bucket[i] = k
        }

        // request.security with lookahead_off hands over the last COMPLETED
        // higher timeframe bar, so a fold coarser than the chart is read one
        // bucket behind. A requested timeframe at or below the chart's own
        // folds one chart bar per bucket and is read without that lag, which is
        // what request.security returns when the two timeframes match.
        const lag = htf.length === n ? 0 : 1

        // int(f_tfResInMinutes(tf) / res_in_minutes): the number of chart bars
        // in one higher timeframe bar, measured off the fold so a session
        // bounded instrument is not counted as if it traded around the clock.
        const barsHtf = Math.max(1, Math.round(n / htf.length))
        const barsOffset = Math.floor(cfg.left * barsHtf)
        if (barsOffset > MAX_BARS_BACK) continue
        const maxBack = Math.min(MAX_BARS_BACK, Math.max(30, barsOffset + barsHtf + 1))

        // na(series[1]) and not na(series): the level is drawn once, on the
        // chart bar where the higher timeframe pivot first becomes available.
        // Two higher timeframe bars pivoting back to back therefore draw one
        // level, not two, which is the source's behaviour.
        const events = []
        let previousHigh = NaN
        let previousLow = NaN
        for (let i = 0; i < n; i++) {
          const k = bucket[i] - lag
          const currentHigh = k >= 0 ? pivotH[k] : NaN
          const currentLow = k >= 0 ? pivotL[k] : NaN
          if (!Number.isFinite(previousHigh) && Number.isFinite(currentHigh)) {
            events.push({ at: i, side: 'High', price: currentHigh })
          }
          if (!Number.isFinite(previousLow) && Number.isFinite(currentLow)) {
            events.push({ at: i, side: 'Low', price: currentLow })
          }
          previousHigh = currentHigh
          previousLow = currentLow
        }

        // One array holds both the highs and the lows in the source, and the
        // oldest line is deleted once it is full, so the cap counts them
        // together rather than per side.
        const kept = events.length > cfg.showLast ? events.slice(events.length - cfg.showLast) : events

        for (const event of kept) {
          const series = event.side === 'High' ? srcHigh : srcLow
          const offset = offsetToP(series, event.price, maxBack, event.at)
          if (!Number.isFinite(offset)) continue
          const x1 = event.at - offset
          if (x1 < 0) continue
          columns[`${defaults.prefix}${event.side}Level`][event.at] = event.price
          columns[`${defaults.prefix}${event.side}X1`][event.at] = x1
          columns[`${defaults.prefix}${event.side}X2`][event.at] = extendTo(event.at, event.price, cfg.extend)
        }
      }

      /* ---------------------------------------------- equal high and low */

      const eqLeft = intInput(settings.eqLeft, 60, 1, 1000)
      const eqRight = intInput(settings.eqRight, 30, 1, 1000)
      const eqPercent = floatInput(settings.eqPercent, 0.05, 0, 100)
      const eqShow = settings.phlEqShow !== false

      // The source requests these on timeframe '', which is the chart itself,
      // so there is nothing to fold here.
      const eqPivotHigh = pivotHigh(srcHigh, eqLeft, eqRight)
      const eqPivotLow = pivotLow(srcLow, eqLeft, eqRight)
      columns.swingHigh = eqPivotHigh.slice()
      columns.swingLow = eqPivotLow.slice()

      let highPrice0 = NaN
      let highPrice1 = NaN
      let highBar0 = NaN
      let highBar1 = NaN
      let lowPrice0 = NaN
      let lowPrice1 = NaN
      let lowBar0 = NaN
      let lowBar1 = NaN

      // pchg: the gap between the last two swings of the same kind, as a
      // percentage of the older one.
      const percentChange = (a, b) => {
        if (!Number.isFinite(a) || !Number.isFinite(b) || b === 0) return NaN
        return Math.abs(((a - b) / b) * 100)
      }

      for (let i = 0; i < n; i++) {
        const hasHigh = Number.isFinite(eqPivotHigh[i])
        const hasLow = Number.isFinite(eqPivotLow[i])

        if (hasHigh) {
          highBar1 = highBar0
          highBar0 = i
          highPrice1 = highPrice0
          highPrice0 = eqPivotHigh[i]
        }
        if (hasLow) {
          lowBar1 = lowBar0
          lowBar0 = i
          lowPrice1 = lowPrice0
          lowPrice0 = eqPivotLow[i]
        }

        if (!eqShow) continue

        if (hasHigh) {
          const pchg = percentChange(highPrice0, highPrice1)
          // Pine treats every comparison against an unavailable value as
          // false, so the very first swing, which has nothing to compare
          // against, must not box itself.
          if (Number.isFinite(pchg) && pchg < eqPercent) {
            const left = highBar1 - eqRight
            const right = highBar0 - eqRight
            if (Number.isFinite(left) && left >= 0 && right >= 0 && right < n) {
              columns.eqHighLeft[i] = left
              columns.eqHighRight[i] = right
              columns.eqHighTop[i] = highPrice1
              columns.eqHighBottom[i] = highPrice0
            }
          }
        }

        if (hasLow) {
          const pchg = percentChange(lowPrice0, lowPrice1)
          if (Number.isFinite(pchg) && pchg < eqPercent) {
            const left = lowBar1 - eqRight
            const right = lowBar0 - eqRight
            if (Number.isFinite(left) && left >= 0 && right >= 0 && right < n) {
              columns.eqLowLeft[i] = left
              columns.eqLowRight[i] = right
              columns.eqLowTop[i] = lowPrice1
              columns.eqLowBottom[i] = lowPrice0
            }
          }
        }
      }

      return finish()
    },

    markers({ bars, values, settings }) {
      const n = bars.length
      if (n === 0) return []
      if (settings.phlEqShow === false) return []

      const transparency = intInput(settings.eqTransp, 25, 0, 100)
      const opacity = (100 - transparency) / 100
      const highColor = withAlpha(H_COLOR, opacity)
      const lowColor = withAlpha(L_COLOR, opacity)

      const out = []
      for (let i = 0; i < n; i++) {
        // plotshape(..., location.absolute, offset=-right) puts the mark on the
        // swing bar itself, at that bar's raw high or low. xcross is not in the
        // marker shape set, so a diamond stands in for it.
        const highBar = values.eqHighRight[i]
        if (Number.isFinite(highBar) && highBar >= 0 && highBar < n) {
          out.push({
            time: bars[highBar].time,
            position: 'atPrice',
            price: bars[highBar].high,
            shape: 'diamond',
            size: 'small',
            color: highColor,
          })
        }
        const lowBar = values.eqLowRight[i]
        if (Number.isFinite(lowBar) && lowBar >= 0 && lowBar < n) {
          out.push({
            time: bars[lowBar].time,
            position: 'atPrice',
            price: bars[lowBar].low,
            shape: 'diamond',
            size: 'small',
            color: lowColor,
          })
        }
      }
      return out
    },

    draws({ bars, values, settings }) {
      const n = bars.length
      if (n === 0) return []

      // bar_index anchors become bar times: paging older history in shifts
      // every index, and a level welded to an index would slide off its swing.
      const timeAt = (index) => {
        if (!Number.isFinite(index)) return NaN
        const k = Math.round(index)
        if (k < 0 || k >= n) return NaN
        return bars[k].time
      }

      // str.tostring(price) for the level labels. The instrument's own tick
      // decides the decimals when the host has published one; otherwise the
      // magnitude of the number does.
      const precision = values.labelPrecision[0]
      const formatPrice = (value) => {
        if (!Number.isFinite(value)) return ''
        let decimals
        if (Number.isFinite(precision)) {
          decimals = Math.min(10, Math.max(0, Math.round(precision)))
        } else {
          const magnitude = Math.abs(value)
          decimals = magnitude >= 1000 ? 2 : magnitude >= 1 ? 4 : 6
        }
        return String(Number(value.toFixed(decimals)))
      }

      const out = []

      for (const defaults of GROUP_DEFAULTS) {
        const cfg = readGroup(settings, defaults.prefix, defaults)
        if (!cfg.show || cfg.showLast === 0) continue

        for (const side of ['High', 'Low']) {
          const levels = values[`${defaults.prefix}${side}Level`]
          const starts = values[`${defaults.prefix}${side}X1`]
          const ends = values[`${defaults.prefix}${side}X2`]
          const color = side === 'High' ? H_COLOR : L_COLOR

          for (let i = 0; i < n; i++) {
            const level = levels[i]
            if (!Number.isFinite(level)) continue
            const from = timeAt(starts[i])
            const to = timeAt(ends[i])
            if (!Number.isFinite(from) || !Number.isFinite(to)) continue

            out.push({
              kind: 'line',
              from: { time: from, price: level },
              to: { time: to, price: level },
              color,
              lineWidth: cfg.lineWidth,
              lineStyle: cfg.lineStyle,
            })

            if (cfg.labelShow) {
              // The label is created at the left end and moved to the right end
              // on every bar the line extends, so it sits at the right end of
              // any level that ever extended and at the left end of one that
              // never did. Pine pads the text with spaces to push it clear of
              // the anchor; align does that here.
              const extended = Math.round(ends[i]) > i
              const anchor = extended ? to : from
              out.push({
                kind: 'label',
                at: { time: anchor, price: level },
                text: formatPrice(level),
                color: withAlpha('#000000', 0),
                textColor: color,
                align: 'left',
              })
            }
          }
        }
      }

      if (settings.phlEqShow !== false) {
        const transparency = intInput(settings.eqTransp, 25, 0, 100)
        const opacity = (100 - transparency) / 100
        // The source never trims its box array, so the platform ceiling of 50
        // decides which survive. Newest first, so the ones a trader is looking
        // at are the ones that are kept.
        const boxes = []
        for (let i = n - 1; i >= 0 && boxes.length < MAX_EQUAL_BOXES; i--) {
          const highLeft = timeAt(values.eqHighLeft[i])
          const highRight = timeAt(values.eqHighRight[i])
          if (Number.isFinite(highLeft) && Number.isFinite(highRight)) {
            boxes.push({
              kind: 'box',
              from: { time: highLeft, price: values.eqHighTop[i] },
              to: { time: highRight, price: values.eqHighBottom[i] },
              color: withAlpha(H_COLOR, opacity),
              fillColor: H_COLOR,
              opacity,
            })
          }
          if (boxes.length >= MAX_EQUAL_BOXES) break
          const lowLeft = timeAt(values.eqLowLeft[i])
          const lowRight = timeAt(values.eqLowRight[i])
          if (Number.isFinite(lowLeft) && Number.isFinite(lowRight)) {
            boxes.push({
              kind: 'box',
              from: { time: lowLeft, price: values.eqLowTop[i] },
              to: { time: lowRight, price: values.eqLowBottom[i] },
              color: withAlpha(L_COLOR, opacity),
              fillColor: L_COLOR,
              opacity,
            })
          }
        }
        for (const box of boxes) out.push(box)
      }

      return out
    },
  })
}
