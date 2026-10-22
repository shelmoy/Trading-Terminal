/**
 * I2.0 SM Radar - ported to openalgo-charts from Pine Script v6.
 *
 * Source: https://github.com/CedInvest/sm-radar-pine/blob/65f84dc339c909c6244dde7fc3deac7ec9fa51ac/indicator.pine
 * Repo:   CedInvest/sm-radar-pine
 * License: MPL-2.0
 * SPDX-FileCopyrightText: (c) CedInvest
 * SPDX-FileCopyrightText: (c) 2026 marketcalls (port to openalgo-charts)
 * SPDX-License-Identifier: MPL-2.0
 *
 * A complete Smart Money Concepts framework in one study: order blocks
 * validated by an impulsive break of structure, fair value gaps that fade with
 * age, equal-high and equal-low liquidity pools with sweep detection, previous
 * day / week / month high and low, the Asia, London and New York session
 * ranges, and BOS / CHoCH structure labels from a long structural pivot.
 */

export default function ({
  registerIndicator,
  pivotHigh,
  pivotLow,
  nulls,
  clamp,
  withAlpha,
  parseSessionSpec,
  inSessionAt,
  isIntradayInterval,
  isValidTimezone,
  zonedDayIndex,
  zonedWeekIndex,
  utcSecondsToZonedParts,
  DEFAULT_TIMEZONE,
}) {
  // Pine transparency levels, carried across as opacity.
  // Pine's colour inputs bake a transparency into the default (for example
  // color.new(#00C853, 75)). A colour input here is a plain hex string, so the
  // transparency travels separately and reaches the drawing layer as opacity.
  const OB_BASE_T = 75
  const FVG_BASE_T = 65
  const LIQ_BASE_T = 50
  const SES_BASE_T = 88

  // The Pine source hardcodes the three session windows in UTC.
  const SESSION_ZONE = 'UTC'
  const ASIA_SPEC = '0000-0800:1234567'
  const LONDON_SPEC = '0700-1600:1234567'
  const NY_SPEC = '1200-2100:1234567'

  // Pine's own object caps: max_boxes_count / max_lines_count / max_labels_count.
  const MAX_BOXES = 500
  const MAX_LINES = 500
  const MAX_LABELS = 500
  const MAX_SES_BOXES = 10
  const MAX_SES_LINES = 5
  const PIVOT_BUFFER = 30

  // A cleared number field arrives as '', and Number('') is 0, so a plain
  // `Number(x) || fallback` would also swallow a deliberate 0.
  const num = (v, fallback) => {
    if (v === '' || v === null || v === undefined) return fallback
    const n = Number(v)
    return Number.isFinite(n) ? n : fallback
  }
  const int = (v, fallback, lo, hi) => clamp(Math.floor(num(v, fallback)), lo, hi)
  const col = (v, fallback) => (typeof v === 'string' && v.trim() !== '' ? v : fallback)

  // Pine's fadeColor(base, extra) pushes the transparency toward 99, clamped.
  // Expressed here as the resulting fill opacity.
  const fadeOpacity = (baseT, extraFade) => {
    const t = Math.min(99, Math.floor(baseT + extraFade * (99 - baseT)))
    return Math.max(0.01, (100 - t) / 100)
  }
  const alphaFor = (transparency) => (100 - transparency) / 100

  const readSettings = (settings) => ({
    showOB: settings.showOB !== false,
    obPivotLen: int(settings.obPivotLen, 5, 2, 30),
    obMaxAge: int(settings.obMaxAge, 80, 10, 500),
    obKeepMitigated: settings.obKeepMitigated === true,
    obBullColor: col(settings.obBullColor, '#00C853'),
    obBearColor: col(settings.obBearColor, '#D50000'),
    obBorderWidth: int(settings.obBorderWidth, 1, 0, 4),

    showFVG: settings.showFVG !== false,
    fvgMinSizePct: Math.max(0, num(settings.fvgMinSizePct, 0)),
    fvgMaxAge: int(settings.fvgMaxAge, 60, 5, 300),
    fvgFadeWithAge: settings.fvgFadeWithAge !== false,
    fvgBullColor: col(settings.fvgBullColor, '#00B0FF'),
    fvgBearColor: col(settings.fvgBearColor, '#FF6F00'),

    showEq: settings.showEq !== false,
    eqTolPct: clamp(num(settings.eqTolPct, 0.07), 0.01, 10),
    eqLookback: int(settings.eqLookback, 60, 10, 300),
    showPDHL: settings.showPDHL !== false,
    showPWHL: settings.showPWHL !== false,
    showPMHL: settings.showPMHL !== false,
    liqLineColor: col(settings.liqLineColor, '#FFC107'),

    showSes: settings.showSes !== false,
    showAsia: settings.showAsia !== false,
    showLondon: settings.showLondon !== false,
    showNY: settings.showNY !== false,
    sesAsiaCol: col(settings.sesAsiaCol, '#9E9E9E'),
    sesLondonCol: col(settings.sesLondonCol, '#7B1FA2'),
    sesNYCol: col(settings.sesNYCol, '#1E88E5'),
    sesShowLines: settings.sesShowLines !== false,

    showStruct: settings.showStruct !== false,
    msPivotLen: int(settings.msPivotLen, 7, 3, 30),
    bosColor: col(settings.bosColor, '#26A69A'),
    chochColor: col(settings.chochColor, '#EF5350'),

    showBrand: settings.showBrand !== false,
  })

  // Shared pure builders. calc needs the signal columns, draws needs the
  // geometry, and both come from the same pass so the two cannot disagree.

  const pivots = (bars, len) => {
    const highs = bars.map((b) => b.high)
    const lows = bars.map((b) => b.low)
    return { ph: pivotHigh(highs, len, len), pl: pivotLow(lows, len, len) }
  }

  /**
   * Order blocks. A bullish BOS (close crossing above the last confirmed swing
   * high) walks back up to 50 bars for the last bearish candle and marks its
   * range; a bearish BOS does the mirror. Mitigation is any later bar whose
   * range overlaps the zone. Pine ages a block from its ORIGIN bar, not from
   * the bar that created it.
   */
  const buildOrderBlocks = (bars, cfg) => {
    const n = bars.length
    const bosBull = new Array(n).fill(0)
    const bosBear = new Array(n).fill(0)
    const live = []
    if (n === 0) return { blocks: live, bosBull, bosBear }

    const { ph, pl } = pivots(bars, cfg.obPivotLen)
    let swingHigh = null
    let swingHighIdx = null
    let swingLow = null
    let swingLowIdx = null

    for (let i = 0; i < n; i++) {
      if (Number.isFinite(ph[i])) {
        swingHigh = ph[i]
        swingHighIdx = i - cfg.obPivotLen
      }
      if (Number.isFinite(pl[i])) {
        swingLow = pl[i]
        swingLowIdx = i - cfg.obPivotLen
      }

      const close = bars[i].close
      const prevClose = i > 0 ? bars[i - 1].close : null
      // Pine treats every comparison with na as false; in JavaScript
      // `5 > null` is true, so both ends are guarded before comparing.
      const bull =
        swingHigh != null && Number.isFinite(close) && Number.isFinite(prevClose) &&
        close > swingHigh && prevClose <= swingHigh
      const bear =
        swingLow != null && Number.isFinite(close) && Number.isFinite(prevClose) &&
        close < swingLow && prevClose >= swingLow
      bosBull[i] = bull ? 1 : 0
      bosBear[i] = bear ? 1 : 0

      if (cfg.showOB && bull && swingHighIdx != null) {
        const lookback = Math.min(50, i - swingHighIdx)
        for (let k = 1; k <= lookback; k++) {
          const j = i - k
          if (j < 0) break
          if (bars[j].close < bars[j].open) {
            live.push({ idx: j, top: bars[j].high, bot: bars[j].low, isBull: true, mitigated: false, endIdx: null })
            break
          }
        }
      }
      if (cfg.showOB && bear && swingLowIdx != null) {
        const lookback = Math.min(50, i - swingLowIdx)
        for (let k = 1; k <= lookback; k++) {
          const j = i - k
          if (j < 0) break
          if (bars[j].close > bars[j].open) {
            live.push({ idx: j, top: bars[j].high, bot: bars[j].low, isBull: false, mitigated: false, endIdx: null })
            break
          }
        }
      }

      // Descending walk so a removal cannot skip the next entry.
      for (let k = live.length - 1; k >= 0; k--) {
        const ob = live[k]
        if (i - ob.idx > cfg.obMaxAge) {
          live.splice(k, 1)
          continue
        }
        if (!ob.mitigated && i > ob.idx + 1) {
          // Both Pine branches reduce to the same test: the bar's range
          // overlaps the zone.
          const touched = bars[i].low <= ob.top && bars[i].high >= ob.bot
          if (touched) {
            ob.mitigated = true
            if (!cfg.obKeepMitigated) {
              live.splice(k, 1)
              continue
            }
            ob.endIdx = i
          }
        }
      }
    }
    return { blocks: live, bosBull, bosBear }
  }

  /**
   * Fair value gaps. Bullish when low[1] > high[3], bearish when high[1] < low[3],
   * anchored on the middle bar. A gap dies when price crosses it completely and
   * stops extending once price has touched into it.
   */
  const buildFvgs = (bars, cfg) => {
    const n = bars.length
    const live = []
    if (n === 0 || !cfg.showFVG) return live

    for (let i = 0; i < n; i++) {
      if (i > 3) {
        const close = bars[i].close
        // Pine's sizePct divides by close; a zero or non-finite close makes the
        // filter meaningless rather than merely large.
        if (Number.isFinite(close) && close !== 0) {
          if (bars[i - 1].low > bars[i - 3].high) {
            const top = bars[i - 1].low
            const bot = bars[i - 3].high
            if (((top - bot) / close) * 100 >= cfg.fvgMinSizePct) {
              live.push({ idx: i - 2, top, bot, isBull: true, endIdx: null, touched: false })
            }
          }
          if (bars[i - 1].high < bars[i - 3].low) {
            const top = bars[i - 3].low
            const bot = bars[i - 1].high
            if (((top - bot) / close) * 100 >= cfg.fvgMinSizePct) {
              live.push({ idx: i - 2, top, bot, isBull: false, endIdx: null, touched: false })
            }
          }
        }
      }

      for (let k = live.length - 1; k >= 0; k--) {
        const f = live[k]
        if (i - f.idx > cfg.fvgMaxAge) {
          live.splice(k, 1)
          continue
        }
        if (i > f.idx + 1) {
          const fullCross = f.isBull ? bars[i].low <= f.bot : bars[i].high >= f.top
          if (fullCross) {
            live.splice(k, 1)
            continue
          }
          const partTouch = f.isBull
            ? bars[i].low <= f.top && bars[i].low >= f.bot
            : bars[i].high >= f.bot && bars[i].high <= f.top
          if (partTouch) {
            f.touched = true
            f.endIdx = i
          }
        }
      }
    }
    return live
  }

  /**
   * Equal highs and equal lows. Every confirmed OB pivot is checked against the
   * five pivots before it; a match within the tolerance becomes a liquidity
   * level that lives until price sweeps it, then five bars more.
   */
  const buildEqLevels = (bars, cfg) => {
    const n = bars.length
    const live = []
    if (n === 0) return live

    const { ph, pl } = pivots(bars, cfg.obPivotLen)
    const pastHVal = []
    const pastHIdx = []
    const pastLVal = []
    const pastLIdx = []

    for (let i = 0; i < n; i++) {
      if (Number.isFinite(ph[i])) {
        pastHVal.push(ph[i])
        pastHIdx.push(i - cfg.obPivotLen)
        if (pastHVal.length > PIVOT_BUFFER) {
          pastHVal.shift()
          pastHIdx.shift()
        }
      }
      if (Number.isFinite(pl[i])) {
        pastLVal.push(pl[i])
        pastLIdx.push(i - cfg.obPivotLen)
        if (pastLVal.length > PIVOT_BUFFER) {
          pastLVal.shift()
          pastLIdx.shift()
        }
      }

      if (cfg.showEq && Number.isFinite(ph[i]) && pastHVal.length >= 2) {
        const level = ph[i]
        const curIdx = i - cfg.obPivotLen
        const stop = Math.max(0, pastHVal.length - 6)
        for (let j = pastHVal.length - 2; j >= stop; j--) {
          if (curIdx - pastHIdx[j] > cfg.eqLookback) continue
          if (level === 0) continue
          const diffPct = (Math.abs(level - pastHVal[j]) / Math.abs(level)) * 100
          if (diffPct <= cfg.eqTolPct) {
            live.push({ fromIdx: pastHIdx[j], lineEnd: curIdx, lastIdx: curIdx, level, isHigh: true, swept: false })
            break
          }
        }
      }
      if (cfg.showEq && Number.isFinite(pl[i]) && pastLVal.length >= 2) {
        const level = pl[i]
        const curIdx = i - cfg.obPivotLen
        const stop = Math.max(0, pastLVal.length - 6)
        for (let j = pastLVal.length - 2; j >= stop; j--) {
          if (curIdx - pastLIdx[j] > cfg.eqLookback) continue
          if (level === 0) continue
          const diffPct = (Math.abs(level - pastLVal[j]) / Math.abs(level)) * 100
          if (diffPct <= cfg.eqTolPct) {
            live.push({ fromIdx: pastLIdx[j], lineEnd: curIdx, lastIdx: curIdx, level, isHigh: false, swept: false })
            break
          }
        }
      }

      for (let k = live.length - 1; k >= 0; k--) {
        const eq = live[k]
        const tolAbs = (eq.level * cfg.eqTolPct) / 100
        if (!eq.swept) {
          const swept = eq.isHigh ? bars[i].high > eq.level + tolAbs : bars[i].low < eq.level - tolAbs
          if (swept) {
            eq.swept = true
            eq.lastIdx = i
          }
        } else if (i - eq.lastIdx > 5) {
          live.splice(k, 1)
        }
      }
      // Pine sheds the oldest line once max_lines_count is reached.
      if (live.length > MAX_LINES) live.splice(0, live.length - MAX_LINES)
    }
    return live
  }

  /**
   * Market structure. A close through the last confirmed structural pivot is a
   * BOS while the trend agrees and a CHoCH when it reverses it. The trend flag
   * only moves inside the drawing branch, exactly as Pine does it.
   */
  const buildStructure = (bars, cfg) => {
    const n = bars.length
    const msBull = new Array(n).fill(0)
    const msBear = new Array(n).fill(0)
    const items = []
    if (n === 0) return { items, msBull, msBear }

    const { ph, pl } = pivots(bars, cfg.msPivotLen)
    let lastPH = null
    let lastPHIdx = null
    let lastPL = null
    let lastPLIdx = null
    let trend = 0

    for (let i = 0; i < n; i++) {
      if (Number.isFinite(ph[i])) {
        lastPH = ph[i]
        lastPHIdx = i - cfg.msPivotLen
      }
      if (Number.isFinite(pl[i])) {
        lastPL = pl[i]
        lastPLIdx = i - cfg.msPivotLen
      }
      const close = bars[i].close
      const prevClose = i > 0 ? bars[i - 1].close : null
      const bull =
        lastPH != null && Number.isFinite(close) && Number.isFinite(prevClose) &&
        close > lastPH && prevClose <= lastPH
      const bear =
        lastPL != null && Number.isFinite(close) && Number.isFinite(prevClose) &&
        close < lastPL && prevClose >= lastPL
      msBull[i] = bull ? 1 : 0
      msBear[i] = bear ? 1 : 0

      if (cfg.showStruct && bull && lastPHIdx != null) {
        items.push({ fromIdx: lastPHIdx, toIdx: i, price: lastPH, isChoch: trend === -1 })
        trend = 1
      }
      if (cfg.showStruct && bear && lastPLIdx != null) {
        items.push({ fromIdx: lastPLIdx, toIdx: i, price: lastPL, isChoch: trend === 1 })
        trend = -1
      }
    }
    if (items.length > MAX_LINES) items.splice(0, items.length - MAX_LINES)
    return { items, msBull, msBear }
  }

  /** Session ranges, driven by the membership flags calc produced. */
  const buildSession = (bars, flags, showLines) => {
    const n = bars.length
    const boxes = []
    const lineH = []
    const lineL = []
    if (n === 0 || !Array.isArray(flags)) return { boxes, lineH, lineL }

    let active = false
    let hi = NaN
    let lo = NaN
    let startIdx = -1
    let endIdx = -1

    for (let i = 0; i < n; i++) {
      const inWindow = flags[i] === 1
      if (inWindow && !active) {
        active = true
        hi = bars[i].high
        lo = bars[i].low
        startIdx = i
        endIdx = i
      } else if (inWindow && active) {
        if (bars[i].high > hi) hi = bars[i].high
        if (bars[i].low < lo) lo = bars[i].low
        endIdx = i
      } else if (!inWindow && active) {
        active = false
        boxes.push({ fromIdx: startIdx, toIdx: i, top: hi, bot: lo })
        if (boxes.length > MAX_SES_BOXES) boxes.shift()
        if (showLines) {
          lineH.push({ idx: i, price: hi })
          lineL.push({ idx: i, price: lo })
          if (lineH.length > MAX_SES_LINES) lineH.shift()
          if (lineL.length > MAX_SES_LINES) lineL.shift()
        }
      }
    }
    // A session still open on the last bar keeps its box open, as Pine does.
    if (active) boxes.push({ fromIdx: startIdx, toIdx: endIdx, top: hi, bot: lo })
    return { boxes, lineH, lineL }
  }

  /**
   * Previous completed period high and low, folded up from the chart's own
   * bars. Pine reaches for request.security here; folding avoids reading an
   * unclosed higher-timeframe bar, which is lookahead.
   */
  const prevPeriodExtremes = (bars, keyOf) => {
    const n = bars.length
    const hi = new Array(n).fill(NaN)
    const lo = new Array(n).fill(NaN)
    let curKey = null
    let curHi = NaN
    let curLo = NaN
    let prevHi = NaN
    let prevLo = NaN

    for (let i = 0; i < n; i++) {
      const h = Number.isFinite(bars[i].high) ? bars[i].high : NaN
      const l = Number.isFinite(bars[i].low) ? bars[i].low : NaN
      let key = curKey
      try {
        key = keyOf(bars[i].time)
      } catch (e) {
        key = curKey
      }
      if (curKey === null) {
        curKey = key
        curHi = h
        curLo = l
      } else if (key !== curKey) {
        prevHi = curHi
        prevLo = curLo
        curKey = key
        curHi = h
        curLo = l
      } else {
        if (!Number.isFinite(curHi) || h > curHi) curHi = h
        if (!Number.isFinite(curLo) || l < curLo) curLo = l
      }
      hi[i] = prevHi
      lo[i] = prevLo
    }
    return { hi, lo }
  }

  const resolveZone = (ctx) => {
    const zone = ctx?.timezone
    return typeof zone === 'string' && isValidTimezone(zone) ? zone : DEFAULT_TIMEZONE
  }

  // Pine gates the sessions on timeframe.in_seconds() < 86400. The chart may
  // not know its interval, so fall back to the spacing of the bars themselves.
  const intradayChart = (bars, ctx) => {
    if (ctx?.interval) {
      try {
        return isIntradayInterval(ctx.interval)
      } catch (e) {
        // An interval code the library does not know: fall through.
      }
    }
    if (bars.length < 2) return true
    const step = bars[bars.length - 1].time - bars[bars.length - 2].time
    return Number.isFinite(step) && step > 0 && step < 86400
  }

  registerIndicator({
    id: 'oa-indicator',
    name: 'I2.0 SM Radar',
    category: 'Custom',
    placement: 'onchart',

    inputs: [
      // Order Blocks
      { key: 'showOB', type: 'boolean', label: 'Order Blocks', default: true, group: 'Order Blocks' },
      { key: 'obPivotLen', type: 'number', label: 'Pivot Length (BOS validation)', default: 5, min: 2, max: 30, step: 1,
        group: 'Order Blocks',
        tooltip: 'Bars on each side of the pivot. Higher means rarer but sturdier order blocks.' },
      { key: 'obMaxAge', type: 'number', label: 'Max Age (bars)', default: 80, min: 10, max: 500, step: 1, group: 'Order Blocks' },
      { key: 'obKeepMitigated', type: 'boolean', label: 'Keep Mitigated Blocks (faded)', default: false, group: 'Order Blocks' },
      // These colour and width inputs drive the drawing layer, for which the
      // chart generates no style controls. Plot styling is left to the chart.
      { key: 'obBullColor', type: 'color', label: 'Bullish OB', default: '#00C853', group: 'Order Blocks' },
      { key: 'obBearColor', type: 'color', label: 'Bearish OB', default: '#D50000', group: 'Order Blocks' },
      { key: 'obBorderWidth', type: 'number', label: 'Border Width', default: 1, min: 0, max: 4, step: 1, group: 'Order Blocks' },

      // Fair Value Gaps
      { key: 'showFVG', type: 'boolean', label: 'Fair Value Gaps', default: true, group: 'Fair Value Gaps' },
      { key: 'fvgMinSizePct', type: 'number', label: 'Min Size (% of price)', default: 0, min: 0, max: 100, step: 0.05,
        group: 'Fair Value Gaps',
        tooltip: 'Filters out insignificant micro gaps. 0 keeps every gap detected.' },
      { key: 'fvgMaxAge', type: 'number', label: 'Max Age (bars)', default: 60, min: 5, max: 300, step: 1, group: 'Fair Value Gaps' },
      { key: 'fvgFadeWithAge', type: 'boolean', label: 'Fade With Age', default: true, group: 'Fair Value Gaps' },
      { key: 'fvgBullColor', type: 'color', label: 'Bullish FVG', default: '#00B0FF', group: 'Fair Value Gaps' },
      { key: 'fvgBearColor', type: 'color', label: 'Bearish FVG', default: '#FF6F00', group: 'Fair Value Gaps' },

      // Liquidity
      { key: 'showEq', type: 'boolean', label: 'Equal Highs / Equal Lows', default: true, group: 'Liquidity' },
      { key: 'eqTolPct', type: 'number', label: 'Equal Level Tolerance (% of price)', default: 0.07, min: 0.01, max: 10, step: 0.01, group: 'Liquidity' },
      { key: 'eqLookback', type: 'number', label: 'Lookback (bars)', default: 60, min: 10, max: 300, step: 1, group: 'Liquidity' },
      { key: 'showPDHL', type: 'boolean', label: 'Previous Day H/L', default: true, group: 'Liquidity' },
      { key: 'showPWHL', type: 'boolean', label: 'Previous Week H/L', default: true, group: 'Liquidity' },
      { key: 'showPMHL', type: 'boolean', label: 'Previous Month H/L', default: true, group: 'Liquidity' },
      { key: 'liqLineColor', type: 'color', label: 'Equal Level Colour', default: '#FFC107', group: 'Liquidity',
        tooltip: 'Colour of the equal-high and equal-low lines. The day, week and month levels are ordinary plots and are styled from the chart.' },

      // Sessions
      { key: 'showSes', type: 'boolean', label: 'Sessions', default: true, group: 'Sessions' },
      { key: 'showAsia', type: 'boolean', label: 'Asia (00:00-08:00 UTC)', default: true, group: 'Sessions' },
      { key: 'showLondon', type: 'boolean', label: 'London (07:00-16:00 UTC)', default: true, group: 'Sessions' },
      { key: 'showNY', type: 'boolean', label: 'New York (12:00-21:00 UTC)', default: true, group: 'Sessions' },
      { key: 'sesAsiaCol', type: 'color', label: 'Asia', default: '#9E9E9E', group: 'Sessions' },
      { key: 'sesLondonCol', type: 'color', label: 'London', default: '#7B1FA2', group: 'Sessions' },
      { key: 'sesNYCol', type: 'color', label: 'New York', default: '#1E88E5', group: 'Sessions' },
      { key: 'sesShowLines', type: 'boolean', label: 'Keep H/L Lines After Session', default: true, group: 'Sessions' },

      // Market structure
      { key: 'showStruct', type: 'boolean', label: 'BOS / CHoCH', default: true, group: 'Market Structure' },
      { key: 'msPivotLen', type: 'number', label: 'Structure Pivot Length', default: 7, min: 3, max: 30, step: 1, group: 'Market Structure' },
      { key: 'bosColor', type: 'color', label: 'BOS', default: '#26A69A', group: 'Market Structure' },
      { key: 'chochColor', type: 'color', label: 'CHoCH', default: '#EF5350', group: 'Market Structure' },

      // Branding
      { key: 'showBrand', type: 'boolean', label: 'Watermark', default: true, group: 'Branding' },
      { key: 'brandPos', type: 'select', label: 'Watermark Position', default: 'bottom-right', group: 'Branding',
        options: [
          { label: 'Top Left', value: 'top-left' },
          { label: 'Top Right', value: 'top-right' },
          { label: 'Bottom Left', value: 'bottom-left' },
          { label: 'Bottom Right', value: 'bottom-right' },
        ] },
      { key: 'brandTextSize', type: 'select', label: 'Watermark Text Size', default: 'small', group: 'Branding',
        options: [
          { label: 'Tiny', value: 'tiny' },
          { label: 'Small', value: 'small' },
          { label: 'Normal', value: 'normal' },
          { label: 'Large', value: 'large' },
        ] },
    ],

    plots: [
      { key: 'pdh', type: 'line', title: 'PDH', style: { color: '#FFC107', lineWidth: 1 } },
      { key: 'pdl', type: 'line', title: 'PDL', style: { color: '#FFC107', lineWidth: 1 } },
      { key: 'pwh', type: 'line', title: 'PWH', style: { color: '#FFA000', lineWidth: 2 } },
      { key: 'pwl', type: 'line', title: 'PWL', style: { color: '#FFA000', lineWidth: 2 } },
      { key: 'pmh', type: 'line', title: 'PMH', style: { color: '#FF6F00', lineWidth: 2 } },
      { key: 'pml', type: 'line', title: 'PML', style: { color: '#FF6F00', lineWidth: 2 } },
    ],

    calc(bars, settings, store, ctx) {
      const n = bars.length
      const cfg = readSettings(settings)
      const blank = () => new Array(n).fill(null)

      const out = {
        pdh: blank(), pdl: blank(), pwh: blank(), pwl: blank(), pmh: blank(), pml: blank(),
        asiaIn: blank(), londonIn: blank(), nyIn: blank(),
        obBull: new Array(n).fill(0), obBear: new Array(n).fill(0),
        msBull: new Array(n).fill(0), msBear: new Array(n).fill(0),
      }
      if (n === 0) return out

      const zone = resolveZone(ctx)

      // Previous day / week / month high and low.
      if (cfg.showPDHL) {
        const d = prevPeriodExtremes(bars, (t) => zonedDayIndex(t, zone))
        out.pdh = nulls(d.hi)
        out.pdl = nulls(d.lo)
      }
      if (cfg.showPWHL) {
        const w = prevPeriodExtremes(bars, (t) => zonedWeekIndex(t, zone))
        out.pwh = nulls(w.hi)
        out.pwl = nulls(w.lo)
      }
      if (cfg.showPMHL) {
        const m = prevPeriodExtremes(bars, (t) => {
          const p = utcSecondsToZonedParts(t, zone)
          return p.year * 12 + p.month
        })
        out.pmh = nulls(m.hi)
        out.pml = nulls(m.lo)
      }

      // Session membership. The zone work has to happen here: draws never sees ctx.
      if (cfg.showSes && intradayChart(bars, ctx)) {
        const windows = [
          ['asiaIn', ASIA_SPEC, cfg.showAsia],
          ['londonIn', LONDON_SPEC, cfg.showLondon],
          ['nyIn', NY_SPEC, cfg.showNY],
        ]
        for (const [key, spec, enabled] of windows) {
          if (!enabled) continue
          const parsed = parseSessionSpec(spec)
          if (!parsed) continue
          const flags = new Array(n).fill(null)
          for (let i = 0; i < n; i++) flags[i] = inSessionAt(bars[i].time, parsed, SESSION_ZONE) ? 1 : 0
          out[key] = flags
        }
      }

      // Signal columns. The alerts read these; no plot draws them.
      const ob = buildOrderBlocks(bars, cfg)
      out.obBull = ob.bosBull
      out.obBear = ob.bosBear
      const ms = buildStructure(bars, cfg)
      out.msBull = ms.msBull
      out.msBear = ms.msBear

      return out
    },

    draws({ bars, values, settings }) {
      const n = bars.length
      if (n === 0) return []
      const cfg = readSettings(settings)
      const lastTime = bars[n - 1].time
      const at = (i) => bars[clamp(i, 0, n - 1)].time
      const boxes = []
      const lines = []
      const labels = []

      // A ray needs two distinct anchor times, or the renderer reads the zero
      // run as a vertical. Pine draws to bar_index + 50 and extends from there.
      const rayTo = (i) => {
        const j = Math.min(i + 50, n - 1)
        if (j > i) return bars[j].time
        const step = i > 0 ? bars[i].time - bars[i - 1].time : 0
        return step > 0 ? bars[i].time + step : null
      }

      // Order blocks.
      if (cfg.showOB) {
        const { blocks } = buildOrderBlocks(bars, cfg)
        for (const ob of blocks) {
          if (!Number.isFinite(ob.top) || !Number.isFinite(ob.bot)) continue
          const base = ob.isBull ? cfg.obBullColor : cfg.obBearColor
          const mitigated = ob.mitigated && ob.endIdx != null
          boxes.push({
            kind: 'box',
            from: { time: at(ob.idx), price: ob.top },
            to: { time: mitigated ? at(ob.endIdx) : lastTime, price: ob.bot },
            // Pine's border_width 0 means no border; the renderer floors the
            // stroke at one pixel, so a transparent stroke is the equivalent.
            color: cfg.obBorderWidth > 0 ? withAlpha(base, alphaFor(30)) : withAlpha(base, 0),
            fillColor: base,
            opacity: mitigated ? fadeOpacity(OB_BASE_T, 0.55) : alphaFor(OB_BASE_T),
            lineWidth: Math.max(1, cfg.obBorderWidth),
          })
        }
      }

      // Fair value gaps.
      if (cfg.showFVG) {
        for (const f of buildFvgs(bars, cfg)) {
          if (!Number.isFinite(f.top) || !Number.isFinite(f.bot)) continue
          const base = f.isBull ? cfg.fvgBullColor : cfg.fvgBearColor
          const age = n - 1 - f.idx
          const ratio = cfg.fvgMaxAge > 0 ? Math.min(1, age / cfg.fvgMaxAge) : 1
          boxes.push({
            kind: 'box',
            from: { time: at(f.idx), price: f.top },
            to: { time: f.touched && f.endIdx != null ? at(f.endIdx) : lastTime, price: f.bot },
            color: withAlpha(base, alphaFor(50)),
            fillColor: base,
            opacity: cfg.fvgFadeWithAge ? fadeOpacity(FVG_BASE_T, ratio * 0.6) : alphaFor(FVG_BASE_T),
            lineWidth: 1,
          })
        }
      }

      // Equal highs and equal lows.
      if (cfg.showEq) {
        for (const eq of buildEqLevels(bars, cfg)) {
          if (!Number.isFinite(eq.level)) continue
          const fromT = at(eq.fromIdx)
          const toT = at(eq.lineEnd)
          lines.push({
            kind: 'line',
            from: { time: fromT, price: eq.level },
            to: { time: toT > fromT ? toT : lastTime, price: eq.level },
            color: withAlpha(cfg.liqLineColor, alphaFor(eq.swept ? 80 : LIQ_BASE_T)),
            lineWidth: 1,
            lineStyle: 'dashed',
            extendRight: toT > fromT,
          })
          labels.push({
            kind: 'label',
            at: { time: toT, price: eq.level },
            // Pine marks a swept level with a dingbat; plain text here.
            text: eq.isHigh ? (eq.swept ? 'EQH swept' : 'EQH') : (eq.swept ? 'EQL swept' : 'EQL'),
            color: withAlpha(cfg.liqLineColor, 0),
            textColor: withAlpha(cfg.liqLineColor, alphaFor(LIQ_BASE_T)),
            align: 'left',
          })
        }
      }

      // Sessions.
      const sessions = [
        ['asiaIn', cfg.sesAsiaCol, 'Asia'],
        ['londonIn', cfg.sesLondonCol, 'London'],
        ['nyIn', cfg.sesNYCol, 'NY'],
      ]
      for (const [key, colour, text] of sessions) {
        const flags = values[key]
        if (!Array.isArray(flags)) continue
        const built = buildSession(bars, flags, cfg.sesShowLines)
        for (const b of built.boxes) {
          if (!Number.isFinite(b.top) || !Number.isFinite(b.bot)) continue
          boxes.push({
            kind: 'box',
            from: { time: at(b.fromIdx), price: b.top },
            to: { time: at(b.toIdx), price: b.bot },
            color: withAlpha(colour, alphaFor(50)),
            fillColor: colour,
            opacity: alphaFor(SES_BASE_T),
            lineWidth: 1,
            text,
          })
        }
        for (const l of [...built.lineH, ...built.lineL]) {
          if (!Number.isFinite(l.price)) continue
          const toT = rayTo(l.idx)
          if (toT == null) continue
          lines.push({
            kind: 'line',
            from: { time: at(l.idx), price: l.price },
            to: { time: toT, price: l.price },
            color: withAlpha(colour, alphaFor(30)),
            lineWidth: 1,
            lineStyle: 'dotted',
            extendRight: true,
          })
        }
      }

      // Market structure.
      if (cfg.showStruct) {
        const { items } = buildStructure(bars, cfg)
        for (const it of items) {
          if (!Number.isFinite(it.price)) continue
          const colour = it.isChoch ? cfg.chochColor : cfg.bosColor
          lines.push({
            kind: 'line',
            from: { time: at(it.fromIdx), price: it.price },
            to: { time: at(it.toIdx), price: it.price },
            color: colour,
            lineWidth: 1,
            lineStyle: 'dashed',
          })
          labels.push({
            kind: 'label',
            at: { time: at(it.toIdx), price: it.price },
            text: it.isChoch ? 'CHoCH' : 'BOS',
            color: withAlpha(colour, alphaFor(80)),
            textColor: colour,
            align: 'center',
          })
        }
      }

      // Pine sheds the oldest object once its per-type cap is reached.
      return [
        ...boxes.slice(-MAX_BOXES),
        ...lines.slice(-MAX_LINES),
        ...labels.slice(-MAX_LABELS),
      ]
    },

    table({ settings }) {
      if (settings.showBrand === false) return null
      const sizes = { tiny: 9, small: 11, normal: 13, large: 16 }
      const allowed = new Set(['top-left', 'top-right', 'bottom-left', 'bottom-right'])
      const pos = allowed.has(settings.brandPos) ? settings.brandPos : 'bottom-right'
      return {
        rows: [[{ text: 'Investisseur 2.0  -  SM Radar', align: 'center' }]],
        options: {
          position: pos,
          fontSize: sizes[settings.brandTextSize] ?? 11,
          cellWidth: [200],
          cellHeight: 22,
        },
      }
    },

    alerts: [
      {
        id: 'ob-bullish',
        title: 'Bullish order block formed',
        message: 'A bullish order block has just been confirmed.',
        when: ({ values, index }) => values.obBull[index] === 1,
      },
      {
        id: 'ob-bearish',
        title: 'Bearish order block formed',
        message: 'A bearish order block has just been confirmed.',
        when: ({ values, index }) => values.obBear[index] === 1,
      },
      {
        id: 'ms-bullish',
        title: 'Bullish market structure break',
        message: 'Bullish break of structure (BOS or CHoCH).',
        when: ({ values, index }) => values.msBull[index] === 1,
      },
      {
        id: 'ms-bearish',
        title: 'Bearish market structure break',
        message: 'Bearish break of structure (BOS or CHoCH).',
        when: ({ values, index }) => values.msBear[index] === 1,
      },
    ],
  })
}
