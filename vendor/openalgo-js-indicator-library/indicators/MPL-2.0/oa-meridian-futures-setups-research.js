/**
 * Meridian - Futures Setups Research - ported to openalgo-charts from Pine Script v6.
 *
 * Source: https://github.com/sukesan7/meridian-indicators/blob/82bfd140decb5439c2db0be840f9deaf5cde24b0/src/futures/meridian-futures-setups-research.pine
 * Repo:   sukesan7/meridian-indicators
 * License: MPL-2.0
 * SPDX-FileCopyrightText: (c) sukesan7
 * SPDX-FileCopyrightText: (c) 2026 marketcalls (port to openalgo-charts)
 * SPDX-License-Identifier: MPL-2.0
 *
 * A multi-timeframe setup engine for NQ/ES futures. It harvests Fair Value Gaps
 * and Order Blocks from the 5m, 15m, 30m, 1H and 4H views of the chart symbol,
 * flips them into Inversion FVGs and Breaker Blocks when price closes through
 * them, scores every live zone on structure, liquidity, market context and
 * multi-timeframe overlap, and turns the best qualifying touch into a drawn
 * trade with a stop and 1R / 1.5R / 2R objectives.
 *
 * Porting notes, all of them recorded rather than hidden:
 *
 * 1. `request.security` does not exist here. The five higher timeframes are
 *    folded up from the chart's own bars inside `calc`, anchored to the futures
 *    session open, and a higher-timeframe event is released at the first chart
 *    bar of the following bucket. The source used `lookahead_on` but read only
 *    `[1]` and older offsets, so the released data is the same completed bar
 *    in both, with no lookahead in either. Previous day and previous week highs
 *    and lows are folded the same way, off the same trading-day index.
 *
 * 2. SMT divergence is NOT ported. It compares the chart's pivots against a
 *    second instrument (NQ against ES), and a chart study is handed one symbol.
 *    Its inputs are therefore absent and `smtAligned` is permanently false,
 *    which costs the intermarket category at most 3 of its 5 points. Nothing
 *    else in the score changes.
 *
 * 3. `alert()` with a per-fire JSON payload has no equivalent: the alert slot
 *    carries a fixed title and message. The four `alertcondition` calls are
 *    ported as declarative alerts; the JSON variant is dropped.
 *
 * 4. Colour, label-size and zone-tooltip inputs are dropped. The chart owns
 *    colour, a drawing carries no label size and a drawn label has no hover
 *    tooltip. The source's default palette is kept as constants so the chart
 *    looks the same, and the transparency and line-width inputs survive
 *    because drawings really do read them. The regime panel's title spans
 *    three cells rather than one merged cell, for the same reason. Two
 *    dingbats in the source's own output read as plain words here: the outcome
 *    labels are WIN +2R and STOP -1R.
 *
 * 5. The engine runs on every bar it is given, so a symbol the host has not
 *    named is treated as allowed rather than refused: refusing to compute
 *    because the chart did not say what the instrument is would be a porting
 *    artefact, not the source's intent. A named symbol is still checked.
 *
 * 6. The source's researchBucketSignals / Wins / Stops arrays are written and
 *    never read back, on any path, so nothing observable depends on them and
 *    they are not carried over. Every counter the regime panel shows is.
 */

export default function ({
  registerIndicator,
  sma,
  stdev,
  rsi,
  atr,
  highest,
  lowest,
  smaSeededEma,
  pivotHigh,
  pivotLow,
  nulls,
  withAlpha,
  parseSessionSpec,
  zoneOffsetSeconds,
  zonedWallClockToUtcSeconds,
  isValidTimezone,
  intervalToSeconds,
  DEFAULT_TIMEZONE,
}) {
  /* ------------------------------------------------------------------ *
   * Constants carried over from the source
   * ------------------------------------------------------------------ */

  const DIR_BULL = 1
  const DIR_BEAR = -1
  const DIR_NONE = 0

  const Z_ACTIVE = 0
  const Z_TRIGGERED = 1
  const Z_INVALID = 2
  const Z_EXPIRED = 3

  const T_ACTIVE = 0
  const T_COMPLETED = 1
  const T_STOPPED = 2
  const T_EXPIRED = 3

  const MAX_ZONES = 140
  const MAX_TRADES = 20
  const MAX_RVOL_SESSIONS = 60
  const MAX_SESSION_SLOTS = 1500
  const MAX_LIQUIDITY_POOLS = 24
  const POOL_SUPPORT = 1
  const POOL_RESISTANCE = -1

  const MAX_CANDIDATE_LABELS = 80
  const MAX_POOL_LINES = 8

  // The source's input.color defaults, kept as constants: the chart generates
  // colour controls for plots, and drawings take theirs from here.
  const C_BULL_SIGNAL = '#21ff99'
  const C_BEAR_SIGNAL = '#ff3a63'
  const C_BULL_ZONE = '#55cdb0'
  const C_BEAR_ZONE = '#e06782'
  const C_RISK = '#ff385b'
  const C_REWARD = '#2def8f'
  const C_STOP = '#ff3760'
  const C_TARGET = '#40ff9b'
  const C_ACCENT = '#9b5de5'
  const C_NEUTRAL = '#878b97'
  const C_PANEL_BG = '#0d111f'

  const HTF_LIST = [5, 15, 30, 60, 240]

  const DEFAULT_ZONE = 'America/New_York'
  const DEFAULT_FUTURES = '1800-1700:1234567'
  const DEFAULT_OVERNIGHT = '1800-0930:1234567'
  const DEFAULT_RTH = '0930-1600:23456'
  const DEFAULT_SIGNAL = '0800-1600:23456'

  /* ------------------------------------------------------------------ *
   * Small helpers
   * ------------------------------------------------------------------ */

  // A cleared number or text field arrives as '', and Number('') is 0, so the
  // empty case is tested before the numeric one or every lookback collapses.
  const numOf = (v, d) => {
    if (v === '' || v === null || v === undefined) return d
    const x = Number(v)
    return Number.isFinite(x) ? x : d
  }
  const intOf = (v, d, lo, hi) => Math.min(hi, Math.max(lo, Math.floor(numOf(v, d))))
  const fltOf = (v, d, lo, hi) => Math.min(hi, Math.max(lo, numOf(v, d)))
  const boolOf = (v, d) => (typeof v === 'boolean' ? v : d)
  const strOf = (v, d) => {
    const s = typeof v === 'string' ? v.trim() : ''
    return s === '' ? d : s
  }
  const fin = (x) => Number.isFinite(x)
  const nz = (x, d = 0) => (Number.isFinite(x) ? x : d)
  const clampN = (v, lo, hi) => Math.max(lo, Math.min(hi, v))

  /** The user's session spec, parsed by the library, or the source's default. */
  const sessionSpec = (value, fallback) => parseSessionSpec(value) ?? parseSessionSpec(fallback)

  /**
   * Membership in a parsed session.
   *
   * `parseSessionSpec` remains the parser; this is only the test over what it
   * hands back, because `sessionFlags` costs one time-zone conversion per bar
   * per session and this study asks four of them. Day digits run 1 = Sunday,
   * and a session that wraps midnight belongs to the day it opened on.
   *
   * Checked against `sessionFlags` itself over eight specs and 400 days, both
   * 2024 US daylight-saving transitions included: 659,200 samples, no
   * disagreement. `sessionFlags` stays the reference if the two ever diverge.
   */
  const inSession = (parts, spec) => {
    if (spec === null || spec === undefined) return true
    const { start, end, days } = spec
    const minute = parts.hour * 60 + parts.minute
    const dayOk = (w) => !days || days.indexOf(w + 1) >= 0
    if (start < end) return minute >= start && minute < end && dayOk(parts.weekday)
    // An end at or before the start wraps midnight, and an end EQUAL to the
    // start is the 24-hour window both the library and the source read it as,
    // so the two clauses below have to cover every minute rather than bail out.
    if (minute >= start) return dayOk(parts.weekday)
    if (minute < end) return dayOk((parts.weekday + 6) % 7)
    return false
  }

  /**
   * Bar spacing in seconds.
   *
   * `ctx.interval` is undefined whenever the host hands the engine bare bars,
   * and `intervalToSeconds` throws on a token it does not know, so the bar
   * times are the reliable source and the interval only a shortcut.
   */
  function deriveChartSeconds(bars, interval) {
    if (typeof interval === 'string' && interval !== '') {
      try {
        const s = intervalToSeconds(interval)
        if (Number.isFinite(s) && s > 0) return s
      } catch {
        /* fall through to the bar spacing */
      }
    }
    const gaps = []
    for (let i = 1; i < bars.length && gaps.length < 240; i++) {
      const d = bars[i].time - bars[i - 1].time
      if (d > 0) gaps.push(d)
    }
    if (gaps.length === 0) return 60
    gaps.sort((a, b) => a - b)
    return gaps[Math.floor(gaps.length / 2)] || 60
  }

  /**
   * The instrument tick.
   *
   * `ctx.tickSize` is the price scale's own minMove and is what the axis
   * formats to, so it wins whenever the host set one. A host that never set it
   * genuinely does not know, and every tick-denominated gate in this study
   * would divide by zero, so the magnitude of the price is used to pick a
   * plausible decimal step instead.
   */
  function fallbackTick(bars) {
    let sum = 0
    let seen = 0
    for (let i = bars.length - 1; i >= 0 && seen < 50; i--) {
      const c = Math.abs(bars[i].close)
      if (Number.isFinite(c) && c > 0) {
        sum += c
        seen++
      }
    }
    const ref = seen > 0 ? sum / seen : 0
    if (!(ref > 0)) return 0.01
    const step = Math.pow(10, Math.floor(Math.log10(ref)) - 4)
    return clampN(step, 1e-8, ref * 1e-3)
  }

  /** `syminfo.root`: the leading letters of a ticker, so NQ1! reads as NQ. */
  function symbolRoot(symbol) {
    if (typeof symbol !== 'string') return ''
    const m = /^[A-Za-z]+/.exec(symbol.trim())
    return m ? m[0].toUpperCase() : ''
  }

  /* ------------------------------------------------------------------ *
   * The engine
   *
   * One pure function of (bars, settings, env). Everything the source kept in
   * `var` state lives in a local here, so two instances of the indicator cannot
   * reach each other.
   * ------------------------------------------------------------------ */

  function runEngine(bars, settings, env) {
    const n = bars.length

    const cols = {
      regime: new Array(n).fill(NaN),
      localRegime: new Array(n).fill(NaN),
      r5: new Array(n).fill(NaN),
      r15: new Array(n).fill(NaN),
      r30: new Array(n).fill(NaN),
      r60: new Array(n).fill(NaN),
      r240: new Array(n).fill(NaN),
      buy: new Array(n).fill(NaN),
      sell: new Array(n).fill(NaN),
      target: new Array(n).fill(NaN),
      stop: new Array(n).fill(NaN),
      candScore: new Array(n).fill(NaN),
    }
    const result = { cols, drawings: [], panel: null }
    if (n === 0) return result

    /* ---- settings -------------------------------------------------- */

    const indicatorEnabled = boolOf(settings.indicatorEnabled, true)
    const allowUnsupportedSymbols = boolOf(settings.allowUnsupportedSymbols, false)
    const allowNonOneMinuteCharts = boolOf(settings.allowNonOneMinuteCharts, false)
    const maximumActiveTrades = intOf(settings.maximumActiveTrades, 3, 1, 3)
    const showPastTrades = boolOf(settings.showPastTrades, false)
    const pastTradeRetentionHours = intOf(settings.pastTradeRetentionHours, 22, 1, 72)
    const completedRetentionMinutes = intOf(settings.completedRetentionMinutes, 5, 0, 120)

    const useChartZones = boolOf(settings.useChartZones, true)
    const useTf = {
      5: boolOf(settings.use5m, true),
      15: boolOf(settings.use15m, true),
      30: boolOf(settings.use30m, true),
      60: boolOf(settings.use1h, true),
      240: boolOf(settings.use4h, true),
    }
    const chartZoneLifeMinutes = intOf(settings.chartZoneLifeMinutes, 10, 2, 60)
    const zoneLife5m = intOf(settings.zoneLife5m, 30, 5, 240)
    const zoneLife15m = intOf(settings.zoneLife15m, 60, 15, 720)
    const zoneLife30m = intOf(settings.zoneLife30m, 90, 30, 1440)
    const zoneLife1h = intOf(settings.zoneLife1h, 120, 60, 2880)
    const fourHourZonesUntilSessionEnd = boolOf(settings.fourHourZonesUntilSessionEnd, true)
    const zoneLife4h = intOf(settings.zoneLife4h, 1380, 120, 2880)
    const zoneLifetimeMode = strOf(settings.zoneLifetimeMode, 'Fixed by timeframe')
    const transformedZoneLifetimePercent = intOf(settings.transformedZoneLifetimePercent, 50, 10, 100)
    const strongZoneScore = intOf(settings.strongZoneScore, 80, 50, 100)
    const moderateZoneScore = intOf(settings.moderateZoneScore, 65, 30, 95)

    const enableFvg = boolOf(settings.enableFvg, true)
    const enableIfvg = boolOf(settings.enableIfvg, true)
    const enableOb = boolOf(settings.enableOb, true)
    const enableBb = boolOf(settings.enableBb, true)
    const minimumZoneTicks = intOf(settings.minimumZoneTicks, 5, 1, 100)
    const minimumZoneAtr = fltOf(settings.minimumZoneAtr, 0.03, 0, 2)
    const maximumZoneAtr = fltOf(settings.maximumZoneAtr, 1.5, 0.1, 10)
    const htfDisplacementAtr = fltOf(settings.htfDisplacementAtr, 0.75, 0.2, 3)
    const htfDisplacementBodyFraction = fltOf(settings.htfDisplacementBodyFraction, 0.55, 0.2, 1)
    const htfBosLookback = intOf(settings.htfBosLookback, 5, 2, 20)

    const pivotLeft = intOf(settings.pivotLeft, 2, 1, 10)
    const pivotRight = intOf(settings.pivotRight, 2, 1, 10)
    const structureValidityBars = intOf(settings.structureValidityBars, 5, 1, 20)
    const structureValidityMinutes = intOf(settings.structureValidityMinutes, 30, 5, 180)
    const displacementValidityMinutes = intOf(settings.displacementValidityMinutes, 20, 3, 120)
    const executionDisplacementAtr = fltOf(settings.executionDisplacementAtr, 0.65, 0.1, 3)
    const executionBodyFraction = fltOf(settings.executionBodyFraction, 0.52, 0.1, 1)
    const useLiquidityPools = boolOf(settings.useLiquidityPools, true)
    const liquidityPoolToleranceTicks = intOf(settings.liquidityPoolToleranceTicks, 10, 2, 100)
    const liquidityPoolMinimumTouches = intOf(settings.liquidityPoolMinimumTouches, 3, 2, 8)
    const liquidityPoolLookbackBars = intOf(settings.liquidityPoolLookbackBars, 360, 30, 2000)
    const liquidityPoolBreakTicks = intOf(settings.liquidityPoolBreakTicks, 3, 1, 50)
    const usePoolsAsObjectives = boolOf(settings.usePoolsAsObjectives, true)
    const liquiditySweepValidityBars = intOf(settings.liquiditySweepValidityBars, 12, 1, 60)
    const openingRangeMinutes = intOf(settings.openingRangeMinutes, 15, 5, 30)

    const useVwap = boolOf(settings.useVwap, true)
    const useRsi = boolOf(settings.useRsi, true)
    const rsiLength = intOf(settings.rsiLength, 14, 2, 50)
    const useZScore = boolOf(settings.useZScore, true)
    const zScoreLength = intOf(settings.zScoreLength, 50, 10, 300)
    const zScoreExtreme = fltOf(settings.zScoreExtreme, 1.5, 0.5, 4)
    const usePowerOfThree = boolOf(settings.usePowerOfThree, true)
    const useOpeningRange = boolOf(settings.useOpeningRange, true)
    const useRvol = boolOf(settings.useRvol, true)
    const rvolBaselineSessions = intOf(settings.rvolBaselineSessions, 30, 5, MAX_RVOL_SESSIONS)
    const rvolMinimumSamples = intOf(settings.rvolMinimumSamples, 5, 2, 30)
    const elevatedRvol = fltOf(settings.elevatedRvol, 1.25, 0.5, 5)

    const minimumScore = intOf(settings.minimumScore, 80, 50, 100)
    const minimumCategories = intOf(settings.minimumCategories, 4, 2, 6)
    const requireStructure = boolOf(settings.requireStructure, true)
    const requireDisplacement = boolOf(settings.requireDisplacement, true)
    const maximumEntryTouches = intOf(settings.maximumEntryTouches, 2, 1, 6)
    const oneTradePerStructuralLeg = boolOf(settings.oneTradePerStructuralLeg, true)
    const sameDirectionCooldownBars = intOf(settings.sameDirectionCooldownBars, 5, 0, 60)
    const minimumObjectiveR = fltOf(settings.minimumObjectiveR, 0.8, 0, 3)

    const entryMode = strOf(settings.entryMode, 'Rejection close')
    const atrLength = intOf(settings.atrLength, 14, 5, 100)
    const stopBufferTicks = intOf(settings.stopBufferTicks, 2, 0, 100)
    const stopLimitMode = strOf(settings.stopLimitMode, 'Automatic')
    const customMaxStopTicks = intOf(settings.customMaxStopTicks, 40, 2, 400)
    const maximumStopAtr = fltOf(settings.maximumStopAtr, 0.8, 0.1, 5)
    const tradeDurationMinutes = intOf(settings.tradeDurationMinutes, 30, 5, 240)
    const maximumRetainedTrades = intOf(settings.maximumRetainedTrades, 20, 3, MAX_TRADES)

    const setupZoneTransparency = intOf(settings.setupZoneTransparency, 90, 70, 98)
    const riskTransparency = intOf(settings.riskTransparency, 90, 70, 98)
    const reward1Transparency = intOf(settings.reward1Transparency, 87, 70, 98)
    const reward15Transparency = intOf(settings.reward15Transparency, 92, 70, 99)
    const reward2Transparency = intOf(settings.reward2Transparency, 95, 70, 99)
    const historicalTransparency = intOf(settings.historicalTransparency, 96, 85, 99)
    const drawLineWidth = intOf(settings.lineWidth, 2, 1, 4)
    const showRegimePanel = boolOf(settings.showRegimePanel, true)
    const showZoneScores = boolOf(settings.showZoneScores, false)
    const zoneLabelPlacement = strOf(settings.zoneLabelPlacement, 'Inside right')
    const liquidityLabelOffsetTicks = intOf(settings.liquidityLabelOffsetTicks, 2, 0, 20)

    const showAllResearchZones = boolOf(settings.showAllResearchZones, true)
    const researchZoneFilter = strOf(settings.researchZoneFilter, 'Relevant only')
    const showLiquidityPoolLines = boolOf(settings.showLiquidityPoolLines, true)
    const liquidityPoolForwardMinutes = intOf(settings.liquidityPoolForwardMinutes, 10, 1, 120)
    const showInvalidatedZoneHistory = boolOf(settings.showInvalidatedZoneHistory, true)
    const invalidatedZoneRetentionMinutes = intOf(settings.invalidatedZoneRetentionMinutes, 120, 5, 1440)
    const maximumResearchZones = intOf(settings.maximumResearchZones, 20, 5, 60)
    const researchCandidateMinimum = intOf(settings.researchCandidateMinimum, 35, 0, 100)
    const showRejectedCandidates = boolOf(settings.showRejectedCandidates, false)

    // enableAlerts / alertSignals / alertTargets / alertStops are read by the
    // alert predicates, which see the raw settings, so the engine ignores them.

    const maxEngineBars = intOf(settings.maxEngineBars, 5000, 500, 20000)

    /* ---- timezone and sessions ------------------------------------- */

    let zone = strOf(settings.sessionTimezone, DEFAULT_ZONE)
    if (!isValidTimezone(zone)) zone = DEFAULT_ZONE
    if (!isValidTimezone(zone)) zone = DEFAULT_TIMEZONE

    /**
     * Zoned wall clock without a time-zone conversion per bar.
     *
     * `zoneOffsetSeconds` is the library's daylight-saving-correct offset, and
     * an offset can only change on a UTC hour boundary, so one lookup per hour
     * is exact and the rest is arithmetic. Checked against
     * `utcSecondsToZonedParts` over 400 days spanning both 2024 US transitions:
     * identical on every sample.
     */
    const offsetCache = new Map()
    const offsetAt = (t) => {
      const hourBucket = Math.floor(t / 3600)
      let off = offsetCache.get(hourBucket)
      if (off === undefined) {
        off = zoneOffsetSeconds(t, zone)
        offsetCache.set(hourBucket, off)
      }
      return off
    }
    const partsOf = (t) => {
      const d = new Date((t + offsetAt(t)) * 1000)
      return {
        year: d.getUTCFullYear(),
        month: d.getUTCMonth() + 1,
        day: d.getUTCDate(),
        hour: d.getUTCHours(),
        minute: d.getUTCMinutes(),
        weekday: d.getUTCDay(),
      }
    }

    const futuresSpec = sessionSpec(strOf(settings.futuresSession, DEFAULT_FUTURES), DEFAULT_FUTURES)
    const overnightSpec = sessionSpec(strOf(settings.overnightSession, DEFAULT_OVERNIGHT), DEFAULT_OVERNIGHT)
    const rthSpec = sessionSpec(strOf(settings.rthSession, DEFAULT_RTH), DEFAULT_RTH)
    const signalSpec = sessionSpec(strOf(settings.signalSession, DEFAULT_SIGNAL), DEFAULT_SIGNAL)

    /* ---- per-bar primitives ---------------------------------------- */

    const times = new Array(n)
    const opens = new Array(n)
    const highs = new Array(n)
    const lows = new Array(n)
    const closes = new Array(n)
    const vols = new Array(n)
    for (let i = 0; i < n; i++) {
      const b = bars[i]
      times[i] = b.time
      opens[i] = b.open
      highs[i] = b.high
      lows[i] = b.low
      closes[i] = b.close
      vols[i] = Number.isFinite(b.volume) ? b.volume : 0
    }

    const chartSeconds = env.chartSeconds
    const chartIsIntraday = chartSeconds < 86400
    const chartMinutes = chartIsIntraday ? Math.round(chartSeconds / 60) : 0
    const chartTf = String(chartMinutes)
    const tick = env.tick > 0 ? env.tick : fallbackTick(bars)

    const closeTimes = new Array(n)
    for (let i = 0; i < n; i++) closeTimes[i] = times[i] + chartSeconds

    // Trading-day bucketing. A wrapping futures session rolls the day at its
    // own open (18:00 for CME), which is what `time_tradingday` reports; a
    // session that does not wrap rolls at midnight in the session zone.
    const sessionWraps = futuresSpec ? futuresSpec.end <= futuresSpec.start : false
    const anchorMinute = sessionWraps ? futuresSpec.start : 0

    const minuteOfDay = new Array(n)
    const dateKey = new Array(n)
    const tradingDay = new Array(n)
    const weekIndex = new Array(n)
    const minsSinceAnchor = new Array(n)
    const zparts = new Array(n)
    const inFuturesArr = new Array(n)
    const inOvernightArr = new Array(n)
    const inRthArr = new Array(n)
    const inSignalArr = new Array(n)
    for (let i = 0; i < n; i++) {
      const p = partsOf(times[i])
      zparts[i] = p
      minuteOfDay[i] = p.hour * 60 + p.minute
      dateKey[i] = p.year * 10000 + p.month * 100 + p.day
      const dayIndex = Math.floor(Date.UTC(p.year, p.month - 1, p.day) / 86400000)
      tradingDay[i] = dayIndex + (sessionWraps && minuteOfDay[i] >= anchorMinute ? 1 : 0)
      minsSinceAnchor[i] = (((minuteOfDay[i] - anchorMinute) % 1440) + 1440) % 1440
      weekIndex[i] = Math.floor((tradingDay[i] + 3) / 7)
      inFuturesArr[i] = inSession(p, futuresSpec)
      inOvernightArr[i] = inSession(p, overnightSpec)
      inRthArr[i] = inSession(p, rthSpec)
      inSignalArr[i] = inSession(p, signalSpec)
    }

    const atrArr = atr(highs, lows, closes, atrLength)
    const rsiArr = rsi(closes, rsiLength)
    const zMeanArr = sma(closes, zScoreLength)
    const zStdArr = stdev(closes, zScoreLength)
    const zScoreArr = new Array(n).fill(NaN)
    for (let i = 0; i < n; i++) {
      const sd = zStdArr[i]
      if (fin(sd) && sd > 0 && fin(zMeanArr[i])) zScoreArr[i] = (closes[i] - zMeanArr[i]) / sd
    }
    const ema20Arr = smaSeededEma(closes, 20)
    const ema50Arr = smaSeededEma(closes, 50)
    const pivotHighArr = pivotHigh(highs, pivotLeft, pivotRight)
    const pivotLowArr = pivotLow(lows, pivotLeft, pivotRight)
    // ta.highest(high[1], N) at bar i is the rolling extreme ending at i - 1.
    const bosHighArr = highest(highs, htfBosLookback)
    const bosLowArr = lowest(lows, htfBosLookback)

    /* ---- higher timeframes, folded from the chart's own bars -------- */

    /**
     * Fold the chart bars into `tfMinutes` buckets, then build the source's
     * `f_htf_payload` for every bucket. The payload of bucket k reads only
     * offsets [1] and older, so it is fully determined once bucket k-1 has
     * closed, which is the moment the first chart bar of bucket k prints.
     */
    function buildHtf(tfMinutes) {
      const bucketOf = new Array(n).fill(-1)
      const ht = []
      const ho = []
      const hh = []
      const hl = []
      const hc = []
      const hv = []
      const hday = []
      let key = null
      let cur = -1
      for (let i = 0; i < n; i++) {
        const k = tradingDay[i] * 1440 + Math.floor(minsSinceAnchor[i] / tfMinutes) * tfMinutes
        if (k !== key) {
          key = k
          cur++
          ht.push(times[i])
          ho.push(opens[i])
          hh.push(highs[i])
          hl.push(lows[i])
          hc.push(closes[i])
          hv.push(vols[i])
          hday.push(tradingDay[i])
        } else {
          if (highs[i] > hh[cur]) hh[cur] = highs[i]
          if (lows[i] < hl[cur]) hl[cur] = lows[i]
          hc[cur] = closes[i]
          hv[cur] += vols[i]
        }
        bucketOf[i] = cur
      }

      const m = ht.length
      const hAtr = atr(hh, hl, hc, atrLength)
      const hEma20 = smaSeededEma(hc, 20)
      const hEma50 = smaSeededEma(hc, 50)
      const hRsi = rsi(hc, rsiLength)
      const hVolAvg = sma(hv, 20)
      // ta.vwap resets with the trading day, exactly like the chart-side one.
      const hVwap = new Array(m).fill(NaN)
      let pv = 0
      let vv = 0
      let lastDay = null
      for (let k = 0; k < m; k++) {
        if (hday[k] !== lastDay) {
          lastDay = hday[k]
          pv = 0
          vv = 0
        }
        const typical = (hh[k] + hl[k] + hc[k]) / 3
        pv += typical * hv[k]
        vv += hv[k]
        hVwap[k] = vv > 0 ? pv / vv : NaN
      }

      const back = (arr, k, off) => {
        const j = k - off
        return j >= 0 ? arr[j] : NaN
      }

      const payload = new Array(m).fill(null)
      for (let k = 1; k < m; k++) {
        const c1 = back(hc, k, 1)
        const o1 = back(ho, k, 1)
        const h1 = back(hh, k, 1)
        const l1 = back(hl, k, 1)
        const a1 = back(hAtr, k, 1)
        const range = h1 - l1
        const body = Math.abs(c1 - o1)
        const frac = range > 0 ? body / range : 0
        const bullDisp = c1 > o1 && body >= a1 * htfDisplacementAtr && frac >= htfDisplacementBodyFraction
        const bearDisp = c1 < o1 && body >= a1 * htfDisplacementAtr && frac >= htfDisplacementBodyFraction

        // ta.highest(high[2], N) / ta.lowest(low[2], N): the window ends at k-2.
        let priorHigh = NaN
        let priorLow = NaN
        const wEnd = k - 2
        const wStart = k - 2 - (htfBosLookback - 1)
        if (wStart >= 0) {
          priorHigh = -Infinity
          priorLow = Infinity
          for (let j = wStart; j <= wEnd; j++) {
            if (hh[j] > priorHigh) priorHigh = hh[j]
            if (hl[j] < priorLow) priorLow = hl[j]
          }
        }

        const h3 = back(hh, k, 3)
        const l3 = back(hl, k, 3)
        const t3 = back(ht, k, 3)
        const h2 = back(hh, k, 2)
        const l2 = back(hl, k, 2)
        const t2 = back(ht, k, 2)
        const c2 = back(hc, k, 2)
        const o2 = back(ho, k, 2)

        const e201 = back(hEma20, k, 1)
        const e204 = back(hEma20, k, 4)
        const e501 = back(hEma50, k, 1)
        const vw1 = back(hVwap, k, 1)
        const rs1 = back(hRsi, k, 1)
        const c4 = back(hc, k, 4)
        const va1 = back(hVolAvg, k, 1)
        const vol1 = back(hv, k, 1)

        let score = 0
        score += c1 > e201 && e201 > e501 ? 28 : c1 < e201 && e201 < e501 ? -28 : 0
        score += e201 > e204 ? 14 : e201 < e204 ? -14 : 0
        score += c1 > vw1 ? 16 : c1 < vw1 ? -16 : 0
        score += rs1 >= 60 ? 16 : rs1 >= 53 ? 8 : rs1 <= 40 ? -16 : rs1 <= 47 ? -8 : 0
        const momentum = a1 > 0 ? (c1 - c4) / a1 : 0
        score += momentum >= 1 ? 16 : momentum >= 0.35 ? 8 : momentum <= -1 ? -16 : momentum <= -0.35 ? -8 : 0
        const volRatio = va1 > 0 ? vol1 / va1 : 1
        if (volRatio >= 1.2) score += score > 0 ? 10 : score < 0 ? -10 : 0
        score = Math.round(clampN(score, -100, 100))

        payload[k] = {
          bullFvg: l1 > h3,
          bullFvgTop: l1,
          bullFvgBottom: h3,
          bullFvgTime: t3,
          bearFvg: h1 < l3,
          bearFvgTop: l3,
          bearFvgBottom: h1,
          bearFvgTime: t3,
          bullOb: bullDisp && c1 > priorHigh && c2 < o2,
          bearOb: bearDisp && c1 < priorLow && c2 > o2,
          obTop: h2,
          obBottom: l2,
          obTime: t2,
          sourceAtr: a1,
          regime: score,
        }
      }
      return { bucketOf, payload }
    }

    const htf = {}
    for (const tf of HTF_LIST) htf[tf] = buildHtf(tf)

    /* ---- symbol and timeframe support ------------------------------ */

    const root = env.root
    const symbolKnown = root !== ''
    const chartIsNq = root === 'NQ' || root === 'MNQ'
    const chartIsEs = root === 'ES' || root === 'MES'
    const supportedSymbol = chartIsNq || chartIsEs
    // A host that never named the instrument cannot have named an unsupported
    // one, so an unknown symbol is allowed through rather than refused.
    const symbolGate = supportedSymbol || allowUnsupportedSymbols || !symbolKnown
    const supportedTimeframe =
      chartIsIntraday &&
      (chartMinutes === 1 || (allowNonOneMinuteCharts && chartMinutes >= 1 && chartMinutes <= 5))
    const engineSupported = symbolGate && supportedTimeframe
    const autoMaxStopTicks = chartIsNq ? 32 : chartIsEs ? 12 : 32

    /* ---- carried state --------------------------------------------- */

    const zones = []
    const zoneIds = new Set()
    const activeZones = []
    const trades = []
    const pools = []
    const candidateLabels = []

    let futuresPv = 0
    let futuresVolume = 0
    let rthPv = 0
    let rthVolume = 0
    const rvolSlots = new Map()

    let overnightHigh = NaN
    let overnightLow = NaN
    let openingRangeHigh = NaN
    let openingRangeLow = NaN
    let openingRangeComplete = false

    let dayHigh = NaN
    let dayLow = NaN
    let pdh = NaN
    let pdl = NaN
    let weekHigh = NaN
    let weekLow = NaN
    let pwh = NaN
    let pwl = NaN

    let latestSwingHigh = NaN
    let previousSwingHigh = NaN
    let latestSwingLow = NaN
    let previousSwingLow = NaN
    let pivotCount = 0

    let lastBullStructureBar = NaN
    let lastBearStructureBar = NaN
    let lastBullStructureTime = NaN
    let lastBearStructureTime = NaN
    let lastBullStructureType = ''
    let lastBearStructureType = ''
    let structuralLegId = 0
    let trendDirection = DIR_NONE

    let lastBullDisplacementTime = NaN
    let lastBearDisplacementTime = NaN

    let lastBullPoolSweepPrice = NaN
    let lastBearPoolSweepPrice = NaN
    let lastBullPoolSweepTouches = 0
    let lastBearPoolSweepTouches = 0
    let lastBullLiquidityBar = NaN
    let lastBearLiquidityBar = NaN

    let lastBullTradeBar = NaN
    let lastBearTradeBar = NaN
    let lastBullTradeLeg = NaN
    let lastBearTradeLeg = NaN

    let latestCandidateScore = NaN
    let latestCandidateCategories = NaN
    let latestCandidateBreakdown = ''
    let latestCandidateReason = ''
    let latestCandidateZone = ''

    let liveSignalCount = 0
    let winnerCount = 0
    let stoppedCount = 0
    let detectedCandidateCount = 0

    let localRegimeScore = 0
    let weightedRegimeScore = 0
    let activeVwap = NaN
    let rvol = NaN
    let poolTolerance = liquidityPoolToleranceTicks * tick
    const orStartByDate = new Map()

    /* ---- helpers that read the carried state ----------------------- */

    const timeframeRank = (tf) =>
      tf === '240' ? 6 : tf === '60' ? 5 : tf === '30' ? 4 : tf === '15' ? 3 : tf === '5' ? 2 : 1

    const timeframeLabel = (tf) =>
      tf === '240'
        ? '4H'
        : tf === '60'
          ? '1H'
          : tf === '30'
            ? '30M'
            : tf === '15'
              ? '15M'
              : tf === '5'
                ? '5M'
                : tf === '1' || chartTf === '1'
                  ? '1M'
                  : tf

    const zoneMaxLifeMinutes = (tf) =>
      tf === '240'
        ? zoneLife4h
        : tf === '60'
          ? zoneLife1h
          : tf === '30'
            ? zoneLife30m
            : tf === '15'
              ? zoneLife15m
              : tf === '5'
                ? zoneLife5m
                : chartZoneLifeMinutes

    const zoneLifeMinutes = (tf, score) => {
      const maximumLife = zoneMaxLifeMinutes(tf)
      const multiplier =
        zoneLifetimeMode === 'Fixed by timeframe'
          ? 1
          : score >= strongZoneScore
            ? 1
            : score >= moderateZoneScore
              ? 0.75
              : 0.5
      return Math.max(2, Math.round(maximumLife * multiplier))
    }

    /** `timestamp(tz, y, m, d, 17, 0)` rolled forward when the day is spent. */
    function futuresSessionCloseAfter(t) {
      const p = partsOf(t)
      const closeToday = zonedWallClockToUtcSeconds(p.year, p.month, p.day, 17, 0, 0, zone)
      if (t < closeToday) return closeToday
      return zonedWallClockToUtcSeconds(p.year, p.month, p.day + 1, 17, 0, 0, zone)
    }

    function zoneExpiryTime(detectedTime, tf, score, lifetimeFactor, sessionClose) {
      const safeFactor = clampN(lifetimeFactor, 0.1, 1)
      if (tf === '240' && fourHourZonesUntilSessionEnd && fin(sessionClose)) {
        const remaining = Math.max(120, sessionClose - detectedTime)
        return detectedTime + Math.round(remaining * safeFactor)
      }
      const baseMinutes = zoneLifeMinutes(tf, score)
      return detectedTime + Math.max(2, Math.round(baseMinutes * safeFactor)) * 60
    }

    function zoneAuthorityRaw(tf, zoneType, top, bottom, sourceAtr) {
      const tfPoints = tf === '240' ? 22 : tf === '60' ? 18 : tf === '30' ? 15 : tf === '15' ? 12 : tf === '5' ? 8 : 5
      const typePoints = zoneType === 'BB' ? 4 : zoneType === 'IFVG' ? 3 : zoneType === 'OB' ? 2 : 0
      const sizeAtr = sourceAtr > 0 ? Math.abs(top - bottom) / sourceAtr : 0
      const widthPoints = Math.round(clampN(sizeAtr / 0.6, 0, 1) * 4)
      return Math.min(tfPoints + typePoints + widthPoints, 30)
    }

    const dropActive = (z) => {
      const at = activeZones.indexOf(z)
      if (at >= 0) activeZones.splice(at, 1)
    }

    function registerZone(zoneType, direction, tf, top, bottom, sourceTime, sourceAtr, lifetimeFactor, i) {
      const normalizedTop = Math.max(top, bottom)
      const normalizedBottom = Math.min(top, bottom)
      const sourceAtrSafe = !fin(sourceAtr) || sourceAtr <= 0 ? atrArr[i] : sourceAtr
      const zoneWidth = normalizedTop - normalizedBottom
      const sizeAtr = fin(sourceAtrSafe) && sourceAtrSafe > 0 ? zoneWidth / sourceAtrSafe : NaN
      const sizeTicks = zoneWidth / tick
      const id = `${zoneType}|${direction}|${tf}|${sourceTime}`
      const typeEnabled =
        zoneType === 'FVG' ? enableFvg : zoneType === 'IFVG' ? enableIfvg : zoneType === 'OB' ? enableOb : enableBb

      if (
        indicatorEnabled &&
        typeEnabled &&
        !zoneIds.has(id) &&
        fin(sizeAtr) &&
        sizeTicks >= minimumZoneTicks &&
        sizeAtr >= minimumZoneAtr &&
        sizeAtr <= maximumZoneAtr
      ) {
        const initialAuthority = zoneAuthorityRaw(tf, zoneType, normalizedTop, normalizedBottom, sourceAtrSafe)
        const detectedTime = closeTimes[i]
        const sessionClose =
          tf === '240' && fourHourZonesUntilSessionEnd ? futuresSessionCloseAfter(detectedTime) : NaN
        const zoneValue = {
          id,
          zoneType,
          sourceTf: tf,
          sourceRank: timeframeRank(tf),
          direction,
          top: normalizedTop,
          bottom: normalizedBottom,
          midpoint: (normalizedTop + normalizedBottom) * 0.5,
          sourceAtr: sourceAtrSafe,
          originTime: sourceTime,
          detectedTime,
          detectedBar: i,
          sessionClose,
          expiryTime: zoneExpiryTime(
            detectedTime,
            tf,
            Math.max(initialAuthority, moderateZoneScore),
            lifetimeFactor,
            sessionClose
          ),
          lifetimeFactor,
          state: Z_ACTIVE,
          terminalTime: NaN,
          touchCount: 0,
          wasIntersecting: false,
          fillPercent: 0,
          score: 0,
          categoryCount: 0,
          candidateCounted: false,
          scoreBreakdown: '',
          rejectionReason: '',
          structuralLegId: 0,
        }
        zones.push(zoneValue)
        zoneIds.add(id)
        activeZones.push(zoneValue)
      }

      while (zones.length > MAX_ZONES) {
        const old = zones.shift()
        zoneIds.delete(old.id)
        if (old.state === Z_ACTIVE) dropActive(old)
      }
    }

    function activeTradeCount() {
      let count = 0
      for (const t of trades) if (t.state === T_ACTIVE) count++
      return count
    }

    function overlapPoints(target) {
      let points = 0
      for (const other of activeZones) {
        if (other.id === target.id || other.direction !== target.direction) continue
        const overlaps = Math.max(target.bottom, other.bottom) < Math.min(target.top, other.top)
        if (!overlaps) continue
        const tf = other.sourceTf
        const rankPoints = tf === '240' ? 15 : tf === '60' ? 12 : tf === '30' ? 9 : tf === '15' ? 7 : tf === '5' ? 4 : 2
        const nested = target.bottom >= other.bottom && target.top <= other.top
        points += rankPoints + (nested ? 3 : 0)
      }
      return Math.min(points, 25)
    }

    const nearPrice = (a, b, tolerance) => fin(a) && fin(b) && Math.abs(a - b) <= tolerance

    function registerLiquidityPool(side, pivotPrice, originBar, originTime, i) {
      const tolerance = poolTolerance
      let matched = null
      let nearestDistance = Infinity
      for (const poolValue of pools) {
        const distance = Math.abs(poolValue.price - pivotPrice)
        const eligible =
          poolValue.active &&
          poolValue.side === side &&
          originBar - poolValue.lastTouchBar <= liquidityPoolLookbackBars &&
          distance <= tolerance
        if (eligible && distance < nearestDistance) {
          matched = poolValue
          nearestDistance = distance
        }
      }
      if (matched === null) {
        pools.push({
          id: `LP|${side}|${originTime}`,
          side,
          price: pivotPrice,
          touches: 1,
          firstBar: originBar,
          lastTouchBar: originBar,
          firstTime: originTime,
          lastTouchTime: originTime,
          qualifiedTime: NaN,
          active: true,
          terminalTime: NaN,
        })
      } else {
        const newBoundaryExtreme =
          side === POOL_SUPPORT ? pivotPrice < matched.price : pivotPrice > matched.price
        if (newBoundaryExtreme) {
          matched.price = pivotPrice
          matched.firstBar = originBar
          matched.firstTime = originTime
        }
        matched.touches += 1
        matched.lastTouchBar = originBar
        matched.lastTouchTime = originTime
        if (!fin(matched.qualifiedTime) && matched.touches >= liquidityPoolMinimumTouches) {
          matched.qualifiedTime = closeTimes[i]
        }
      }
      while (pools.length > MAX_LIQUIDITY_POOLS) pools.shift()
    }

    function poolNearZone(zoneValue) {
      const requiredSide = zoneValue.direction === DIR_BULL ? POOL_SUPPORT : POOL_RESISTANCE
      let bestTouches = 0
      let bestPrice = NaN
      for (const poolValue of pools) {
        const inRange =
          poolValue.price >= zoneValue.bottom - poolTolerance && poolValue.price <= zoneValue.top + poolTolerance
        if (
          poolValue.active &&
          poolValue.side === requiredSide &&
          poolValue.touches >= liquidityPoolMinimumTouches &&
          inRange &&
          poolValue.touches > bestTouches
        ) {
          bestTouches = poolValue.touches
          bestPrice = poolValue.price
        }
      }
      return [bestPrice, bestTouches]
    }

    function nearestPoolObjective(direction, entryPrice) {
      const requiredSide = direction === DIR_BULL ? POOL_RESISTANCE : POOL_SUPPORT
      let bestPrice = NaN
      let bestDistance = Infinity
      for (const poolValue of pools) {
        const validDirection = direction === DIR_BULL ? poolValue.price > entryPrice : poolValue.price < entryPrice
        if (
          poolValue.active &&
          poolValue.side === requiredSide &&
          poolValue.touches >= liquidityPoolMinimumTouches &&
          validDirection
        ) {
          const distance = Math.abs(poolValue.price - entryPrice)
          if (distance < bestDistance) {
            bestDistance = distance
            bestPrice = poolValue.price
          }
        }
      }
      return bestPrice
    }

    function objectiveDistanceOf(direction, entryPrice, references) {
      let result = NaN
      for (const level of references) {
        if (!fin(level)) continue
        const valid = direction === DIR_BULL ? level > entryPrice : level < entryPrice
        const distance = Math.abs(level - entryPrice)
        if (valid && (!fin(result) || distance < result)) result = distance
      }
      return result
    }

    function stopValid(direction, entryPrice, stopPrice, atrValue) {
      const risk = Math.abs(entryPrice - stopPrice)
      const riskTicks = risk / tick
      const riskAtr = fin(atrValue) && atrValue > 0 ? risk / atrValue : NaN
      const maxTicks = stopLimitMode === 'Automatic' ? autoMaxStopTicks : customMaxStopTicks
      const sideValid = direction === DIR_BULL ? stopPrice < entryPrice : stopPrice > entryPrice
      const limitsValid =
        stopLimitMode === 'Off' ||
        (riskTicks >= 2 && riskTicks <= maxTicks && (!fin(riskAtr) || riskAtr <= maximumStopAtr))
      return sideValid && risk > tick && limitsValid
    }

    function entryTrigger(zoneValue, i) {
      const intersects = lows[i] <= zoneValue.top && highs[i] >= zoneValue.bottom
      if (entryMode === 'First touch') return intersects
      if (entryMode === 'Midpoint reclaim') {
        return zoneValue.direction === DIR_BULL
          ? intersects && lows[i] <= zoneValue.midpoint && closes[i] > zoneValue.midpoint
          : intersects && highs[i] >= zoneValue.midpoint && closes[i] < zoneValue.midpoint
      }
      return zoneValue.direction === DIR_BULL
        ? intersects && closes[i] > zoneValue.midpoint && closes[i] > opens[i]
        : intersects && closes[i] < zoneValue.midpoint && closes[i] < opens[i]
    }

    /* ---- per-bar context, rebuilt each bar ------------------------- */

    let bullVwapReject = false
    let bearVwapReject = false
    let bullZReversal = false
    let bearZReversal = false
    let bullRsiContext = false
    let bearRsiContext = false
    let bullPo3 = false
    let bearPo3 = false
    let bullOrb = false
    let bearOrb = false

    function scoreZone(zoneValue, i) {
      const atrValue = atrArr[i]
      const zonePoints = zoneAuthorityRaw(
        zoneValue.sourceTf,
        zoneValue.zoneType,
        zoneValue.top,
        zoneValue.bottom,
        zoneValue.sourceAtr
      )
      const overlap = overlapPoints(zoneValue)

      const structureTimeValue = zoneValue.direction === DIR_BULL ? lastBullStructureTime : lastBearStructureTime
      const structureBarValue = zoneValue.direction === DIR_BULL ? lastBullStructureBar : lastBearStructureBar
      const structureTypeValue = zoneValue.direction === DIR_BULL ? lastBullStructureType : lastBearStructureType
      const immediateStructure = fin(structureBarValue) && i - structureBarValue <= structureValidityBars
      const timedStructure =
        fin(structureTimeValue) && closeTimes[i] - structureTimeValue <= structureValidityMinutes * 60
      const sameLegStructure =
        zoneValue.structuralLegId > 0 &&
        zoneValue.structuralLegId === structuralLegId &&
        trendDirection === zoneValue.direction
      const structureRecent = immediateStructure || timedStructure || sameLegStructure
      const mssRecent = structureRecent && structureTypeValue === 'MSS'

      const displacementTimeValue =
        zoneValue.direction === DIR_BULL ? lastBullDisplacementTime : lastBearDisplacementTime
      const displacementRecent =
        fin(displacementTimeValue) && closeTimes[i] - displacementTimeValue <= displacementValidityMinutes * 60
      let structurePoints =
        (mssRecent ? 14 : structureRecent ? 10 : trendDirection === zoneValue.direction ? 6 : 0) +
        (displacementRecent ? 6 : 0)
      structurePoints = Math.min(structurePoints, 20)

      const liquidityBar = zoneValue.direction === DIR_BULL ? lastBullLiquidityBar : lastBearLiquidityBar
      const liquidityRecent = fin(liquidityBar) && i - liquidityBar <= liquiditySweepValidityBars
      const [poolPriceNear, poolTouchesNear] = poolNearZone(zoneValue)
      const poolNear = useLiquidityPools && poolTouchesNear >= liquidityPoolMinimumTouches && fin(poolPriceNear)
      const sweptPoolPrice = zoneValue.direction === DIR_BULL ? lastBullPoolSweepPrice : lastBearPoolSweepPrice
      const sweptPoolTouches = zoneValue.direction === DIR_BULL ? lastBullPoolSweepTouches : lastBearPoolSweepTouches
      const sweptPoolNearZone =
        liquidityRecent &&
        sweptPoolTouches >= liquidityPoolMinimumTouches &&
        fin(sweptPoolPrice) &&
        sweptPoolPrice >= zoneValue.bottom - poolTolerance &&
        sweptPoolPrice <= zoneValue.top + poolTolerance
      const wide = atrValue * 0.2
      const tight = atrValue * 0.15
      const staticNearZone =
        nearPrice(zoneValue.midpoint, pdh, wide) ||
        nearPrice(zoneValue.midpoint, pdl, wide) ||
        nearPrice(zoneValue.midpoint, pwh, wide) ||
        nearPrice(zoneValue.midpoint, pwl, wide) ||
        nearPrice(zoneValue.midpoint, overnightHigh, wide) ||
        nearPrice(zoneValue.midpoint, overnightLow, wide) ||
        nearPrice(zoneValue.midpoint, openingRangeHigh, wide) ||
        nearPrice(zoneValue.midpoint, openingRangeLow, wide) ||
        nearPrice(zoneValue.midpoint, latestSwingHigh, tight) ||
        nearPrice(zoneValue.midpoint, latestSwingLow, tight)
      const poolStrengthPoints = poolNear
        ? Math.min(7, 4 + Math.max(0, poolTouchesNear - liquidityPoolMinimumTouches))
        : 0
      let liquidityPoints =
        (liquidityRecent ? 6 : 0) +
        (sweptPoolNearZone ? 3 : 0) +
        poolStrengthPoints +
        (staticNearZone ? 3 : 0) +
        (zoneValue.touchCount <= 1 ? 1 : 0)
      liquidityPoints = Math.min(liquidityPoints, 15)

      const vwapAligned =
        zoneValue.direction === DIR_BULL
          ? bullVwapReject || (nearPrice(zoneValue.midpoint, activeVwap, tight) && closes[i] >= activeVwap)
          : bearVwapReject || (nearPrice(zoneValue.midpoint, activeVwap, tight) && closes[i] <= activeVwap)
      const zAligned = zoneValue.direction === DIR_BULL ? bullZReversal : bearZReversal
      const rsiAligned = zoneValue.direction === DIR_BULL ? bullRsiContext : bearRsiContext
      const directionalRegime = zoneValue.direction === DIR_BULL ? weightedRegimeScore : -weightedRegimeScore
      const regimePoints = directionalRegime >= 55 ? 5 : directionalRegime >= 25 ? 3 : directionalRegime <= -25 ? -2 : 0
      let contextPoints =
        (vwapAligned ? 4 : 0) +
        regimePoints +
        (zAligned ? 1 : 0) +
        (rsiAligned ? 1 : 0) +
        (useRvol && nz(rvol) >= elevatedRvol ? 1 : 0)
      contextPoints = Math.trunc(clampN(contextPoints, 0, 10))

      // SMT divergence is not portable: it needs a second instrument. Its three
      // points are permanently absent, which is recorded rather than faked.
      const smtAligned = false
      const po3Aligned = zoneValue.direction === DIR_BULL ? bullPo3 : bearPo3
      const orbAligned = zoneValue.direction === DIR_BULL ? bullOrb : bearOrb
      let intermarketPoints = (smtAligned ? 3 : 0) + (po3Aligned ? 2 : 0) + (orbAligned ? 2 : 0)
      intermarketPoints = Math.min(intermarketPoints, 5)

      const totalScore = Math.min(
        zonePoints + overlap + structurePoints + liquidityPoints + contextPoints + intermarketPoints,
        100
      )
      const categories =
        1 +
        (overlap > 0 ? 1 : 0) +
        (structurePoints >= 10 ? 1 : 0) +
        (liquidityPoints > 0 ? 1 : 0) +
        (contextPoints > 0 ? 1 : 0) +
        (intermarketPoints > 0 ? 1 : 0)
      const breakdown =
        `Z ${zonePoints} / MTF ${overlap} / S ${structurePoints} / ` +
        `L ${liquidityPoints} / C ${contextPoints} / X ${intermarketPoints}`
      return { totalScore, categories, breakdown, structureRecent, displacementRecent }
    }

    /* ---- the bar loop ---------------------------------------------- */

    // Context series, the session state and the regime score are built over
    // every bar, exactly as the source does. Only the zone and trade engine,
    // whose cost grows with the square of the live-zone count, is bounded.
    const engineStart = Math.max(0, n - maxEngineBars)

    for (let i = 0; i < n; i++) {
      const barTime = times[i]
      const barClose = closeTimes[i]
      const prev = i > 0 ? i - 1 : -1

      const inFutures = inFuturesArr[i] === true
      const inOvernight = inOvernightArr[i] === true
      const inRth = inRthArr[i] === true
      const inSignalWindow = inSignalArr[i] === true
      const wasFutures = prev >= 0 ? inFuturesArr[prev] === true : false
      const wasOvernight = prev >= 0 ? inOvernightArr[prev] === true : false
      const wasRth = prev >= 0 ? inRthArr[prev] === true : false

      const newTradingDay = prev < 0 || tradingDay[i] !== tradingDay[prev]
      const newWeek = prev < 0 || weekIndex[i] !== weekIndex[prev]
      const newFuturesSession = inFutures && (!wasFutures || newTradingDay)
      const newOvernight = inOvernight && (!wasOvernight || newTradingDay)
      const newRth = inRth && (!wasRth || prev < 0 || dateKey[i] !== dateKey[prev])

      const atrValue = atrArr[i]
      const rsiValue = rsiArr[i]
      const zScore = zScoreArr[i]
      const zScorePrev = i > 0 ? zScoreArr[i - 1] : NaN
      const rsiPrev = i > 0 ? rsiArr[i - 1] : NaN

      /* session VWAPs */
      if (newFuturesSession) {
        futuresPv = ((highs[i] + lows[i] + closes[i]) / 3) * vols[i]
        futuresVolume = vols[i]
      } else if (inFutures) {
        futuresPv += ((highs[i] + lows[i] + closes[i]) / 3) * vols[i]
        futuresVolume += vols[i]
      }
      if (newRth) {
        rthPv = ((highs[i] + lows[i] + closes[i]) / 3) * vols[i]
        rthVolume = vols[i]
      } else if (inRth) {
        rthPv += ((highs[i] + lows[i] + closes[i]) / 3) * vols[i]
        rthVolume += vols[i]
      }
      const futuresVwap = futuresVolume > 0 ? futuresPv / futuresVolume : NaN
      const rthVwap = rthVolume > 0 ? rthPv / rthVolume : NaN
      activeVwap = inRth && fin(rthVwap) ? rthVwap : futuresVwap

      /* same-time relative volume */
      const minutesSinceFuturesOpen =
        minuteOfDay[i] >= 18 * 60 ? minuteOfDay[i] - 18 * 60 : minuteOfDay[i] + 6 * 60
      const sessionSlot = chartMinutes > 0 ? Math.floor(minutesSinceFuturesOpen / chartMinutes) : -1
      const validSessionSlot = inFutures && sessionSlot >= 0 && sessionSlot < MAX_SESSION_SLOTS
      let slot = null
      if (validSessionSlot) {
        slot = rvolSlots.get(sessionSlot)
        if (slot === undefined) {
          slot = { hist: new Array(MAX_RVOL_SESSIONS).fill(NaN), sum: 0, count: 0, write: 0 }
          rvolSlots.set(sessionSlot, slot)
        }
      }
      const rvolAverage = slot !== null && slot.count >= rvolMinimumSamples ? slot.sum / slot.count : NaN
      rvol = validSessionSlot && fin(rvolAverage) && rvolAverage > 0 ? vols[i] / rvolAverage : NaN
      if (slot !== null) {
        const oldVolume = slot.hist[slot.write]
        slot.sum = slot.sum - nz(oldVolume) + vols[i]
        const newCount = slot.count + (fin(oldVolume) ? 0 : 1)
        slot.hist[slot.write] = vols[i]
        slot.count = Math.min(newCount, rvolBaselineSessions)
        slot.write = (slot.write + 1) % rvolBaselineSessions
      }

      /* overnight range and opening range */
      if (newOvernight) {
        overnightHigh = highs[i]
        overnightLow = lows[i]
      } else if (inOvernight) {
        overnightHigh = fin(overnightHigh) ? Math.max(overnightHigh, highs[i]) : highs[i]
        overnightLow = fin(overnightLow) ? Math.min(overnightLow, lows[i]) : lows[i]
      }

      // f_window_active(9, 30, n): the same wall-clock instant for a whole
      // calendar day, so it is resolved once per day rather than once per bar.
      let orStart = orStartByDate.get(dateKey[i])
      if (orStart === undefined) {
        orStart = zonedWallClockToUtcSeconds(zparts[i].year, zparts[i].month, zparts[i].day, 9, 30, 0, zone)
        orStartByDate.set(dateKey[i], orStart)
      }
      const orEnd = orStart + openingRangeMinutes * 60
      const inOpeningRange = inRth && chartIsIntraday && barTime < orEnd && barClose > orStart
      if (newRth) {
        openingRangeHigh = highs[i]
        openingRangeLow = lows[i]
        openingRangeComplete = false
      } else if (inOpeningRange) {
        openingRangeHigh = Math.max(nz(openingRangeHigh, highs[i]), highs[i])
        openingRangeLow = Math.min(nz(openingRangeLow, lows[i]), lows[i])
      } else if (inRth && !openingRangeComplete && fin(openingRangeHigh)) {
        openingRangeComplete = true
      }

      /* previous day and previous week extremes, folded from chart bars */
      if (newTradingDay) {
        pdh = dayHigh
        pdl = dayLow
        dayHigh = highs[i]
        dayLow = lows[i]
      } else {
        dayHigh = fin(dayHigh) ? Math.max(dayHigh, highs[i]) : highs[i]
        dayLow = fin(dayLow) ? Math.min(dayLow, lows[i]) : lows[i]
      }
      if (newWeek) {
        pwh = weekHigh
        pwl = weekLow
        weekHigh = highs[i]
        weekLow = lows[i]
      } else {
        weekHigh = fin(weekHigh) ? Math.max(weekHigh, highs[i]) : highs[i]
        weekLow = fin(weekLow) ? Math.min(weekLow, lows[i]) : lows[i]
      }

      /* higher-timeframe regimes and zone registration */
      const regimes = {}
      for (const tf of HTF_LIST) {
        const h = htf[tf]
        const bucket = h.bucketOf[i]
        const payload = bucket >= 0 ? h.payload[bucket] : null
        regimes[tf] = payload ? payload.regime : NaN
        const bucketOpened = payload !== null && (prev < 0 || h.bucketOf[prev] !== bucket)
        if (engineSupported && useTf[tf] && bucketOpened && i >= engineStart) {
          const tfKey = String(tf)
          if (payload.bullFvg) {
            registerZone('FVG', DIR_BULL, tfKey, payload.bullFvgTop, payload.bullFvgBottom, payload.bullFvgTime, payload.sourceAtr, 1, i)
          }
          if (payload.bearFvg) {
            registerZone('FVG', DIR_BEAR, tfKey, payload.bearFvgTop, payload.bearFvgBottom, payload.bearFvgTime, payload.sourceAtr, 1, i)
          }
          if (payload.bullOb) {
            registerZone('OB', DIR_BULL, tfKey, payload.obTop, payload.obBottom, payload.obTime, payload.sourceAtr, 1, i)
          }
          if (payload.bearOb) {
            registerZone('OB', DIR_BEAR, tfKey, payload.obTop, payload.obBottom, payload.obTime, payload.sourceAtr, 1, i)
          }
        }
      }

      /* chart-timeframe zones */
      const chartRange = highs[i] - lows[i]
      const chartBody = Math.abs(closes[i] - opens[i])
      const chartBodyFraction = chartRange > 0 ? chartBody / chartRange : 0
      const chartBullDisp =
        closes[i] > opens[i] && chartBody >= atrValue * htfDisplacementAtr && chartBodyFraction >= htfDisplacementBodyFraction
      const chartBearDisp =
        closes[i] < opens[i] && chartBody >= atrValue * htfDisplacementAtr && chartBodyFraction >= htfDisplacementBodyFraction
      const priorBosHigh = i >= 1 ? bosHighArr[i - 1] : NaN
      const priorBosLow = i >= 1 ? bosLowArr[i - 1] : NaN
      const chartBullFvg = i >= 2 && lows[i] > highs[i - 2]
      const chartBearFvg = i >= 2 && highs[i] < lows[i - 2]
      const chartBullOb = i >= 1 && chartBullDisp && closes[i] > priorBosHigh && closes[i - 1] < opens[i - 1]
      const chartBearOb = i >= 1 && chartBearDisp && closes[i] < priorBosLow && closes[i - 1] > opens[i - 1]
      if (engineSupported && useChartZones && i >= engineStart) {
        if (chartBullFvg) registerZone('FVG', DIR_BULL, chartTf, lows[i], highs[i - 2], times[i - 2], atrValue, 1, i)
        if (chartBearFvg) registerZone('FVG', DIR_BEAR, chartTf, lows[i - 2], highs[i], times[i - 2], atrValue, 1, i)
        if (chartBullOb) registerZone('OB', DIR_BULL, chartTf, highs[i - 1], lows[i - 1], times[i - 1], atrValue, 1, i)
        if (chartBearOb) registerZone('OB', DIR_BEAR, chartTf, highs[i - 1], lows[i - 1], times[i - 1], atrValue, 1, i)
      }

      /* pivots, swing structure and liquidity pools */
      const ph = pivotHighArr[i]
      const pl = pivotLowArr[i]
      if (fin(ph)) {
        previousSwingHigh = latestSwingHigh
        latestSwingHigh = ph
        pivotCount++
        if (useLiquidityPools) registerLiquidityPool(POOL_RESISTANCE, ph, i - pivotRight, times[Math.max(0, i - pivotRight)], i)
      }
      if (fin(pl)) {
        previousSwingLow = latestSwingLow
        latestSwingLow = pl
        pivotCount++
        if (useLiquidityPools) registerLiquidityPool(POOL_SUPPORT, pl, i - pivotRight, times[Math.max(0, i - pivotRight)], i)
      }

      const prevClose = i >= 1 ? closes[i - 1] : NaN
      const bullStructureEvent = fin(latestSwingHigh) && closes[i] > latestSwingHigh && prevClose <= latestSwingHigh
      const bearStructureEvent = fin(latestSwingLow) && closes[i] < latestSwingLow && prevClose >= latestSwingLow
      if (bullStructureEvent) {
        lastBullStructureType = trendDirection === DIR_BEAR ? 'MSS' : 'BOS'
        lastBullStructureBar = i
        lastBullStructureTime = barClose
        trendDirection = DIR_BULL
        structuralLegId += 1
      }
      if (bearStructureEvent) {
        lastBearStructureType = trendDirection === DIR_BULL ? 'MSS' : 'BOS'
        lastBearStructureBar = i
        lastBearStructureTime = barClose
        trendDirection = DIR_BEAR
        structuralLegId += 1
      }

      /* execution-timeframe displacement */
      const executionBodyFrac = chartRange > 0 ? chartBody / chartRange : 0
      const bullDisplacement =
        closes[i] > opens[i] && chartBody >= atrValue * executionDisplacementAtr && executionBodyFrac >= executionBodyFraction
      const bearDisplacement =
        closes[i] < opens[i] && chartBody >= atrValue * executionDisplacementAtr && executionBodyFrac >= executionBodyFraction
      if (bullDisplacement) lastBullDisplacementTime = barClose
      if (bearDisplacement) lastBearDisplacementTime = barClose

      /* pool sweeps and breaks */
      poolTolerance = liquidityPoolToleranceTicks * tick
      let bullPoolSweep = false
      let bearPoolSweep = false
      if (useLiquidityPools && pools.length > 0) {
        const breakDistance = liquidityPoolBreakTicks * tick
        for (let p = pools.length - 1; p >= 0; p--) {
          const poolValue = pools[p]
          if (!poolValue.active) continue
          const tooOld = i - poolValue.lastTouchBar > liquidityPoolLookbackBars
          const supportSweep =
            poolValue.side === POOL_SUPPORT &&
            poolValue.touches >= liquidityPoolMinimumTouches &&
            lows[i] < poolValue.price - tick &&
            closes[i] > poolValue.price
          const resistanceSweep =
            poolValue.side === POOL_RESISTANCE &&
            poolValue.touches >= liquidityPoolMinimumTouches &&
            highs[i] > poolValue.price + tick &&
            closes[i] < poolValue.price
          const supportBroken = poolValue.side === POOL_SUPPORT && closes[i] < poolValue.price - breakDistance
          const resistanceBroken = poolValue.side === POOL_RESISTANCE && closes[i] > poolValue.price + breakDistance
          if (supportSweep) {
            bullPoolSweep = true
            lastBullPoolSweepPrice = poolValue.price
            lastBullPoolSweepTouches = poolValue.touches
            poolValue.active = false
            poolValue.terminalTime = barClose
          } else if (resistanceSweep) {
            bearPoolSweep = true
            lastBearPoolSweepPrice = poolValue.price
            lastBearPoolSweepTouches = poolValue.touches
            poolValue.active = false
            poolValue.terminalTime = barClose
          } else if (supportBroken || resistanceBroken || tooOld) {
            poolValue.active = false
            poolValue.terminalTime = barClose
          }
        }
      }

      /* static liquidity sweeps */
      const bullStaticSweep =
        (fin(overnightLow) && lows[i] < overnightLow && closes[i] > overnightLow) ||
        (fin(pdl) && lows[i] < pdl && closes[i] > pdl) ||
        (fin(pwl) && lows[i] < pwl && closes[i] > pwl) ||
        (openingRangeComplete && lows[i] < openingRangeLow && closes[i] > openingRangeLow)
      const bearStaticSweep =
        (fin(overnightHigh) && highs[i] > overnightHigh && closes[i] < overnightHigh) ||
        (fin(pdh) && highs[i] > pdh && closes[i] < pdh) ||
        (fin(pwh) && highs[i] > pwh && closes[i] < pwh) ||
        (openingRangeComplete && highs[i] > openingRangeHigh && closes[i] < openingRangeHigh)
      if (bullPoolSweep || bullStaticSweep) lastBullLiquidityBar = i
      if (bearPoolSweep || bearStaticSweep) lastBearLiquidityBar = i

      /* market context */
      bullVwapReject = useVwap && fin(activeVwap) && lows[i] <= activeVwap && closes[i] > activeVwap && closes[i] > opens[i]
      bearVwapReject = useVwap && fin(activeVwap) && highs[i] >= activeVwap && closes[i] < activeVwap && closes[i] < opens[i]
      bullZReversal = useZScore && fin(zScore) && zScorePrev <= -zScoreExtreme && zScore > zScorePrev
      bearZReversal = useZScore && fin(zScore) && zScorePrev >= zScoreExtreme && zScore < zScorePrev
      bullRsiContext =
        useRsi && ((rsiPrev < 35 && rsiValue > rsiPrev) || (rsiValue > 50 && rsiValue > rsiPrev))
      bearRsiContext =
        useRsi && ((rsiPrev > 65 && rsiValue < rsiPrev) || (rsiValue < 50 && rsiValue < rsiPrev))
      bullPo3 = usePowerOfThree && bullStaticSweep && closes[i] > futuresVwap
      bearPo3 = usePowerOfThree && bearStaticSweep && closes[i] < futuresVwap
      bullOrb = useOpeningRange && openingRangeComplete && closes[i] > openingRangeHigh && lows[i] <= openingRangeHigh
      bearOrb = useOpeningRange && openingRangeComplete && closes[i] < openingRangeLow && highs[i] >= openingRangeLow

      /* regime scores */
      const localEma20 = ema20Arr[i]
      const localEma20Back = i >= 3 ? ema20Arr[i - 3] : NaN
      const localEma50 = ema50Arr[i]
      const closeBack3 = i >= 3 ? closes[i - 3] : NaN
      let local = 0
      local += closes[i] > localEma20 && localEma20 > localEma50 ? 28 : closes[i] < localEma20 && localEma20 < localEma50 ? -28 : 0
      local += localEma20 > localEma20Back ? 14 : localEma20 < localEma20Back ? -14 : 0
      local += closes[i] > activeVwap ? 16 : closes[i] < activeVwap ? -16 : 0
      local += rsiValue >= 60 ? 16 : rsiValue >= 53 ? 8 : rsiValue <= 40 ? -16 : rsiValue <= 47 ? -8 : 0
      const localMomentum = atrValue > 0 ? (closes[i] - closeBack3) / atrValue : 0
      local += localMomentum >= 1 ? 16 : localMomentum >= 0.35 ? 8 : localMomentum <= -1 ? -16 : localMomentum <= -0.35 ? -8 : 0
      if (nz(rvol, 1) >= elevatedRvol) local += local > 0 ? 10 : local < 0 ? -10 : 0
      localRegimeScore = Math.round(clampN(local, -100, 100))
      weightedRegimeScore = Math.round(
        (nz(regimes[240]) * 25 +
          nz(regimes[60]) * 20 +
          nz(regimes[30]) * 15 +
          nz(regimes[15]) * 15 +
          nz(regimes[5]) * 15 +
          localRegimeScore * 10) /
          100
      )

      cols.localRegime[i] = localRegimeScore
      cols.regime[i] = weightedRegimeScore
      cols.r5[i] = regimes[5]
      cols.r15[i] = regimes[15]
      cols.r30[i] = regimes[30]
      cols.r60[i] = regimes[60]
      cols.r240[i] = regimes[240]

      // Everything below is the zone and trade engine, the one part whose cost
      // grows faster than linearly, so the history bound applies from here on.
      if (i < engineStart) continue

      /* zone lifecycle and qualification */
      let bestZone = null
      let bestScore = -1
      let researchBestScore = -1
      let bestCategories = 0
      let bestBreakdown = ''
      let bestStop = NaN
      let bestRisk = NaN
      let researchCandidateEvent = false

      for (let zi = zones.length - 1; zi >= 0; zi--) {
        const zoneValue = zones[zi]
        // A zone registered during this pass can shift the array, exactly as it
        // does in the source; the guard keeps that from reading past the end.
        if (zoneValue === undefined || zoneValue.state !== Z_ACTIVE) continue

        const closeInvalid =
          zoneValue.direction === DIR_BULL ? closes[i] < zoneValue.bottom : closes[i] > zoneValue.top
        if (closeInvalid) {
          const transformedType =
            zoneValue.zoneType === 'FVG' && enableIfvg ? 'IFVG' : zoneValue.zoneType === 'OB' && enableBb ? 'BB' : ''
          const originalDirection = zoneValue.direction
          const originalTop = zoneValue.top
          const originalBottom = zoneValue.bottom
          const originalSourceTf = zoneValue.sourceTf
          const originalAtr = zoneValue.sourceAtr

          zoneValue.state = Z_INVALID
          zoneValue.terminalTime = barClose
          zoneValue.rejectionReason = transformedType !== '' ? `Inverted to ${transformedType}` : 'Closed through invalidation'
          dropActive(zoneValue)

          if (transformedType !== '') {
            registerZone(
              transformedType,
              -originalDirection,
              originalSourceTf,
              originalTop,
              originalBottom,
              barTime,
              originalAtr,
              transformedZoneLifetimePercent * 0.01,
              i
            )
          }
          continue
        }

        const intersects = lows[i] <= zoneValue.top && highs[i] >= zoneValue.bottom
        const penetration =
          zoneValue.direction === DIR_BULL
            ? Math.max(0, zoneValue.top - lows[i])
            : Math.max(0, highs[i] - zoneValue.bottom)
        zoneValue.fillPercent = clampN(penetration / Math.max(zoneValue.top - zoneValue.bottom, tick), 0, 1)
        const firstInteractionNow = intersects && !zoneValue.wasIntersecting && i > zoneValue.detectedBar
        if (firstInteractionNow) zoneValue.touchCount += 1
        zoneValue.wasIntersecting = intersects

        const scored = scoreZone(zoneValue, i)
        zoneValue.score = scored.totalScore
        zoneValue.categoryCount = scored.categories
        zoneValue.scoreBreakdown = scored.breakdown
        if (zoneValue.structuralLegId === 0 && scored.structureRecent && trendDirection === zoneValue.direction) {
          zoneValue.structuralLegId = structuralLegId
        }
        zoneValue.expiryTime = zoneExpiryTime(
          zoneValue.detectedTime,
          zoneValue.sourceTf,
          scored.totalScore,
          zoneValue.lifetimeFactor,
          zoneValue.sessionClose
        )

        if (barClose > zoneValue.expiryTime) {
          zoneValue.state = Z_EXPIRED
          zoneValue.terminalTime = zoneValue.expiryTime
          zoneValue.rejectionReason = 'Zone expired'
          dropActive(zoneValue)
          continue
        }

        const trigger = i > zoneValue.detectedBar && entryTrigger(zoneValue, i)
        const touchGate = zoneValue.touchCount > 0 && zoneValue.touchCount <= maximumEntryTouches
        const structureGate = !requireStructure || scored.structureRecent
        const displacementGate = !requireDisplacement || scored.displacementRecent
        const cooldownGate =
          zoneValue.direction === DIR_BULL
            ? !fin(lastBullTradeBar) || i - lastBullTradeBar > sameDirectionCooldownBars
            : !fin(lastBearTradeBar) || i - lastBearTradeBar > sameDirectionCooldownBars
        const legGate =
          !oneTradePerStructuralLeg ||
          (zoneValue.direction === DIR_BULL
            ? !fin(lastBullTradeLeg) || lastBullTradeLeg !== structuralLegId
            : !fin(lastBearTradeLeg) || lastBearTradeLeg !== structuralLegId)
        const stopPrice =
          zoneValue.direction === DIR_BULL
            ? zoneValue.bottom - stopBufferTicks * tick
            : zoneValue.top + stopBufferTicks * tick
        const stopGate = stopValid(zoneValue.direction, closes[i], stopPrice, atrValue)
        const riskValue = Math.abs(closes[i] - stopPrice)
        const poolObjective = usePoolsAsObjectives ? nearestPoolObjective(zoneValue.direction, closes[i]) : NaN
        const objectiveSupportPool = zoneValue.direction === DIR_BEAR ? poolObjective : NaN
        const objectiveResistancePool = zoneValue.direction === DIR_BULL ? poolObjective : NaN
        const objectiveDistance = objectiveDistanceOf(zoneValue.direction, closes[i], [
          pdh,
          pdl,
          pwh,
          pwl,
          overnightHigh,
          overnightLow,
          openingRangeHigh,
          openingRangeLow,
          zoneValue.direction === DIR_BULL ? objectiveResistancePool : objectiveSupportPool,
        ])
        const objectiveGate =
          minimumObjectiveR <= 0 ||
          !fin(objectiveDistance) ||
          riskValue <= 0 ||
          objectiveDistance / riskValue >= minimumObjectiveR
        const scoreGate = scored.totalScore >= minimumScore && scored.categories >= minimumCategories
        const liveQualified =
          engineSupported &&
          inSignalWindow &&
          trigger &&
          touchGate &&
          structureGate &&
          displacementGate &&
          cooldownGate &&
          legGate &&
          stopGate &&
          objectiveGate &&
          scoreGate &&
          activeTradeCount() < maximumActiveTrades

        if (intersects && scored.totalScore > researchBestScore) {
          researchBestScore = scored.totalScore
          latestCandidateScore = scored.totalScore
          latestCandidateCategories = scored.categories
          latestCandidateBreakdown = scored.breakdown
          latestCandidateZone = `${timeframeLabel(zoneValue.sourceTf)} ${zoneValue.zoneType}`
          latestCandidateReason = liveQualified
            ? 'LIVE QUALIFIED'
            : !scoreGate
              ? 'Score/categories'
              : !structureGate
                ? 'No structure'
                : !displacementGate
                  ? 'No displacement'
                  : !touchGate
                    ? 'Touch limit'
                    : !stopGate
                      ? 'Stop invalid'
                      : !objectiveGate
                        ? 'Objective too close'
                        : !inSignalWindow
                          ? 'Outside signal window'
                          : 'Lifecycle gate'
        }

        const researchCandidate = intersects && scored.totalScore >= researchCandidateMinimum
        if (researchCandidate && !zoneValue.candidateCounted) {
          researchCandidateEvent = true
          detectedCandidateCount += 1
          zoneValue.candidateCounted = true
        }

        if (liveQualified && scored.totalScore > bestScore) {
          bestZone = zoneValue
          bestScore = scored.totalScore
          bestCategories = scored.categories
          bestBreakdown = scored.breakdown
          bestStop = stopPrice
          bestRisk = riskValue
        }
      }

      cols.candScore[i] = latestCandidateScore

      /* trade creation */
      if (bestZone !== null && activeTradeCount() < maximumActiveTrades) {
        const entryTime = barClose
        const plannedEnd = entryTime + tradeDurationMinutes * 60
        const entryPrice = closes[i]
        const direction = bestZone.direction
        const target1 = direction === DIR_BULL ? entryPrice + bestRisk : entryPrice - bestRisk
        const target15 = direction === DIR_BULL ? entryPrice + bestRisk * 1.5 : entryPrice - bestRisk * 1.5
        const target2 = direction === DIR_BULL ? entryPrice + bestRisk * 2 : entryPrice - bestRisk * 2

        trades.push({
          id: `MFS|${barTime}|${i}`,
          zoneId: bestZone.id,
          zoneType: bestZone.zoneType,
          sourceTf: bestZone.sourceTf,
          zoneTop: bestZone.top,
          zoneBottom: bestZone.bottom,
          direction,
          state: T_ACTIVE,
          score: bestScore,
          categoryCount: bestCategories,
          evidence: `${timeframeLabel(bestZone.sourceTf)} ${bestZone.zoneType} / ${bestBreakdown}`,
          entryTime,
          entryBar: i,
          plannedEndTime: plannedEnd,
          terminalTime: NaN,
          entryPrice,
          stopPrice: bestStop,
          target1,
          target15,
          target2,
          target1Hit: false,
          target15Hit: false,
          outcomeText: '',
          outcomePrice: NaN,
          outcomeTime: NaN,
        })

        bestZone.state = Z_TRIGGERED
        bestZone.terminalTime = entryTime
        bestZone.structuralLegId = structuralLegId
        dropActive(bestZone)
        if (direction === DIR_BULL) {
          lastBullTradeBar = i
          lastBullTradeLeg = structuralLegId
          cols.buy[i] = 1
        } else {
          lastBearTradeBar = i
          lastBearTradeLeg = structuralLegId
          cols.sell[i] = 1
        }
        liveSignalCount += 1
      }

      /* trade management */
      for (let ti = trades.length - 1; ti >= 0; ti--) {
        const tradeValue = trades[ti]
        if (tradeValue.state === T_ACTIVE && i > tradeValue.entryBar) {
          const stopHit =
            tradeValue.direction === DIR_BULL ? lows[i] <= tradeValue.stopPrice : highs[i] >= tradeValue.stopPrice
          const target2Hit =
            tradeValue.direction === DIR_BULL ? highs[i] >= tradeValue.target2 : lows[i] <= tradeValue.target2
          const target15Hit =
            tradeValue.direction === DIR_BULL ? highs[i] >= tradeValue.target15 : lows[i] <= tradeValue.target15
          const target1Hit =
            tradeValue.direction === DIR_BULL ? highs[i] >= tradeValue.target1 : lows[i] <= tradeValue.target1

          if (stopHit) {
            tradeValue.state = T_STOPPED
            tradeValue.terminalTime = barClose
            tradeValue.outcomeText = 'STOP -1R'
            tradeValue.outcomePrice = tradeValue.stopPrice
            tradeValue.outcomeTime = barClose
            stoppedCount += 1
            cols.stop[i] = 1
          } else if (target2Hit) {
            tradeValue.target1Hit = true
            tradeValue.target15Hit = true
            tradeValue.state = T_COMPLETED
            tradeValue.terminalTime = barClose
            tradeValue.outcomeText = 'WIN +2R'
            tradeValue.outcomePrice = tradeValue.target2
            tradeValue.outcomeTime = barClose
            winnerCount += 1
            cols.target[i] = 1
          } else {
            if (target15Hit) {
              tradeValue.target15Hit = true
              tradeValue.target1Hit = true
            } else if (target1Hit) {
              tradeValue.target1Hit = true
            }
            if (barClose >= tradeValue.plannedEndTime) {
              tradeValue.state = T_EXPIRED
              tradeValue.terminalTime = tradeValue.plannedEndTime
              tradeValue.outcomeText = tradeValue.target15Hit ? 'TIME +1.5R' : tradeValue.target1Hit ? 'TIME +1R' : 'TIME'
              tradeValue.outcomePrice = tradeValue.target15Hit
                ? tradeValue.target15
                : tradeValue.target1Hit
                  ? tradeValue.target1
                  : tradeValue.entryPrice
              tradeValue.outcomeTime = tradeValue.plannedEndTime
            }
          }
        }

        if (tradeValue.state !== T_ACTIVE) {
          const retention = (showPastTrades ? pastTradeRetentionHours * 60 : completedRetentionMinutes) * 60
          if (fin(tradeValue.terminalTime) && barTime > tradeValue.terminalTime + retention) {
            trades.splice(ti, 1)
          }
        }
      }
      while (trades.length > maximumRetainedTrades) trades.shift()

      /* rejected-candidate label */
      if (
        showRejectedCandidates &&
        researchCandidateEvent &&
        fin(latestCandidateScore) &&
        latestCandidateScore >= researchCandidateMinimum &&
        latestCandidateReason !== 'LIVE QUALIFIED'
      ) {
        candidateLabels.push({
          time: barClose,
          price: closes[i],
          text: `CANDIDATE ${latestCandidateScore}\n${latestCandidateReason}`,
        })
        while (candidateLabels.length > MAX_CANDIDATE_LABELS) candidateLabels.shift()
      }
    }

    /* ---- drawings, built from the final state ---------------------- */

    const last = n - 1
    const lastClose = closeTimes[last]
    const alpha = (t) => (100 - t) / 100
    const drawings = []

    // Research zones: newest first, honouring the visibility budget.
    if (showAllResearchZones) {
      let shownZones = 0
      for (let zi = zones.length - 1; zi >= 0 && shownZones < maximumResearchZones; zi--) {
        const zoneValue = zones[zi]
        const zoneDistance =
          closes[last] > zoneValue.top
            ? closes[last] - zoneValue.top
            : closes[last] < zoneValue.bottom
              ? zoneValue.bottom - closes[last]
              : 0
        const relevantZone =
          researchZoneFilter === 'All active' ||
          zoneValue.score >= researchCandidateMinimum ||
          zoneDistance <= atrArr[last] * 4
        const activeVisible = zoneValue.state === Z_ACTIVE
        const invalidHistoryVisible =
          showInvalidatedZoneHistory &&
          zoneValue.state === Z_INVALID &&
          fin(zoneValue.terminalTime) &&
          lastClose <= zoneValue.terminalTime + invalidatedZoneRetentionMinutes * 60
        if (!(relevantZone && (activeVisible || invalidHistoryVisible))) continue

        const rightTime = activeVisible ? zoneValue.expiryTime : zoneValue.terminalTime
        if (!fin(rightTime) || !fin(zoneValue.originTime)) continue
        const zoneColor = zoneValue.direction === DIR_BULL ? C_BULL_ZONE : C_BEAR_ZONE
        drawings.push({
          kind: 'box',
          from: { time: zoneValue.originTime, price: zoneValue.top },
          to: { time: rightTime, price: zoneValue.bottom },
          color: withAlpha(zoneColor, activeVisible ? 0.28 : 0.16),
          fillColor: zoneColor,
          opacity: activeVisible ? 0.06 : 0.03,
        })

        const terminalSuffix = activeVisible ? '' : ' invalid'
        const scoreSuffix = showZoneScores ? ` ${zoneValue.score}` : ''
        const durationSec = Math.max(rightTime - zoneValue.originTime, 60)
        const labelInset = Math.min(30, Math.max(10, Math.round(durationSec * 0.05)))
        const inside = zoneLabelPlacement === 'Inside right'
        const labelX = inside ? rightTime - Math.round(labelInset * 0.55) : rightTime
        const labelY = inside
          ? zoneValue.midpoint
          : zoneValue.top + Math.max(tick * 4, (zoneValue.top - zoneValue.bottom) * 0.1)
        if (fin(labelX) && fin(labelY)) {
          drawings.push({
            kind: 'label',
            at: { time: labelX, price: labelY },
            text: `${timeframeLabel(zoneValue.sourceTf)} ${zoneValue.zoneType}${terminalSuffix}${scoreSuffix}`,
            color: activeVisible ? zoneColor : withAlpha(zoneColor, 0.65),
            align: inside ? 'center' : 'right',
          })
        }
        shownZones += 1
      }
    }

    // Liquidity pool lines.
    if (showLiquidityPoolLines) {
      let shownPools = 0
      for (let p = pools.length - 1; p >= 0 && shownPools < MAX_POOL_LINES; p--) {
        const poolValue = pools[p]
        if (!poolValue.active || poolValue.touches < liquidityPoolMinimumTouches) continue
        if (!fin(poolValue.price) || !fin(poolValue.firstTime)) continue
        const poolRight = lastClose + liquidityPoolForwardMinutes * 60
        const poolColor = poolValue.side === POOL_SUPPORT ? C_BULL_ZONE : C_BEAR_ZONE
        drawings.push({
          kind: 'line',
          from: { time: poolValue.firstTime, price: poolValue.price },
          to: { time: poolRight, price: poolValue.price },
          color: withAlpha(poolColor, 0.68),
          lineWidth: 1,
          lineStyle: 'dashed',
        })
        const offset = liquidityLabelOffsetTicks * tick
        drawings.push({
          kind: 'label',
          at: {
            time: poolRight,
            price: poolValue.side === POOL_SUPPORT ? poolValue.price - offset : poolValue.price + offset,
          },
          text: poolValue.side === POOL_SUPPORT ? 'SUPPORT ZONE' : 'RESISTANCE ZONE',
          color: withAlpha(poolColor, 0.26),
          align: 'left',
        })
        shownPools += 1
      }
    }

    // Trades: the setup box, the risk and reward bands, the levels and labels.
    for (const tradeValue of trades) {
      const terminal = tradeValue.state !== T_ACTIVE
      const rightTime = terminal && fin(tradeValue.terminalTime) ? tradeValue.terminalTime : tradeValue.plannedEndTime
      if (!fin(rightTime) || !fin(tradeValue.entryTime)) continue
      const bull = tradeValue.direction === DIR_BULL
      const signalColor = bull ? C_BULL_SIGNAL : C_BEAR_SIGNAL
      const setupColor = terminal ? C_NEUTRAL : bull ? C_BULL_ZONE : C_BEAR_ZONE
      const band = (top, bottom, colour, transparency) => {
        if (!fin(top) || !fin(bottom)) return
        drawings.push({
          kind: 'box',
          from: { time: tradeValue.entryTime, price: Math.max(top, bottom) },
          to: { time: rightTime, price: Math.min(top, bottom) },
          color: withAlpha(colour, 0),
          fillColor: colour,
          opacity: alpha(terminal ? historicalTransparency : transparency),
        })
      }
      band(tradeValue.zoneTop, tradeValue.zoneBottom, setupColor, setupZoneTransparency)
      band(tradeValue.entryPrice, tradeValue.stopPrice, C_RISK, riskTransparency)
      band(tradeValue.entryPrice, tradeValue.target1, C_REWARD, reward1Transparency)
      band(tradeValue.target1, tradeValue.target15, C_REWARD, reward15Transparency)
      band(tradeValue.target15, tradeValue.target2, C_REWARD, reward2Transparency)

      const level = (price, colour, fadeAlpha, text) => {
        if (!fin(price)) return
        drawings.push({
          kind: 'line',
          from: { time: tradeValue.entryTime, price },
          to: { time: rightTime, price },
          color: terminal ? withAlpha(colour, fadeAlpha) : colour,
          lineWidth: drawLineWidth,
        })
        drawings.push({
          kind: 'label',
          at: { time: rightTime, price },
          text,
          color: colour,
          align: 'left',
        })
      }
      level(tradeValue.stopPrice, C_STOP, 0.4, 'STOP')
      level(tradeValue.target1, C_TARGET, 0.4, '1R')
      level(tradeValue.target15, C_TARGET, 0.32, '1.5R')
      level(tradeValue.target2, C_TARGET, 0.26, '2R')

      if (fin(tradeValue.entryPrice)) {
        drawings.push({
          kind: 'label',
          at: { time: tradeValue.entryTime, price: tradeValue.entryPrice },
          text: `${bull ? 'BUY' : 'SELL'} ${tradeValue.score}`,
          color: terminal ? withAlpha(signalColor, 0.28) : signalColor,
          align: 'center',
        })
      }
      if (tradeValue.outcomeText !== '' && fin(tradeValue.outcomePrice) && fin(tradeValue.outcomeTime)) {
        drawings.push({
          kind: 'label',
          at: { time: tradeValue.outcomeTime, price: tradeValue.outcomePrice },
          text: tradeValue.outcomeText,
          color:
            tradeValue.state === T_STOPPED ? C_STOP : tradeValue.state === T_COMPLETED ? C_TARGET : C_NEUTRAL,
          align: 'left',
        })
      }
    }

    for (const candidate of candidateLabels) {
      if (!fin(candidate.time) || !fin(candidate.price)) continue
      drawings.push({
        kind: 'label',
        at: { time: candidate.time, price: candidate.price },
        text: candidate.text,
        color: withAlpha(C_NEUTRAL, 0.28),
        align: 'left',
      })
    }

    result.drawings = drawings
    result.panel = {
      showRegimePanel,
      engineSupported,
      supportedSymbol: supportedSymbol || !symbolKnown,
      minimumScore,
      minimumCategories,
      latestCandidateScore,
      latestCandidateZone,
      executionTfLabel: chartMinutes === 1 ? '1M' : `${chartMinutes}M`,
      r240: cols.r240[last],
      r60: cols.r60[last],
      r30: cols.r30[last],
      r15: cols.r15[last],
      r5: cols.r5[last],
      local: cols.localRegime[last],
      liveSignalCount,
      winnerCount,
      stoppedCount,
      detectedCandidateCount,
    }
    return result
  }

  /* ------------------------------------------------------------------ *
   * A pure memo, not per-instance state.
   *
   * The engine is a function of (bars, settings), and the chart runs `calc`
   * before every hook of the same recompute, handing all of them the identical
   * bars array. One entry keyed by that array's identity and a signature of the
   * declared inputs is therefore enough for `draws` and `table` to see what
   * `calc` just produced. A miss simply recomputes, so nothing is carried
   * between instances or between calls: this is a cache, not state.
   * ------------------------------------------------------------------ */

  let INPUT_KEYS = []
  const MEMO_SIZE = 4
  const memo = []

  const signatureOf = (settings) => {
    let s = ''
    for (const k of INPUT_KEYS) s += `${k}=${settings[k]};`
    return s
  }

  const envKey = (env) => `${env.tick}|${env.root}|${env.chartSeconds}`
  const DEFAULT_ENV = { tick: 0, root: '', chartSeconds: 60 }

  /**
   * `env` is the context `calc` was handed; a hook passes null because no hook
   * receives a calc context. A hook therefore reuses the env of any cached run
   * over the same bars, which is the same chart and so the same tick, symbol
   * and interval.
   */
  function engineFor(bars, settings, env) {
    const signature = signatureOf(settings)
    const wanted = env === null ? null : envKey(env)
    for (let i = 0; i < memo.length; i++) {
      const entry = memo[i]
      if (entry.bars !== bars || entry.signature !== signature) continue
      if (wanted !== null && entry.envKey !== wanted) continue
      memo.splice(i, 1)
      memo.unshift(entry)
      return entry.result
    }
    let useEnv = env
    if (useEnv === null) {
      const sibling = memo.find((entry) => entry.bars === bars)
      useEnv = sibling ? sibling.env : DEFAULT_ENV
    }
    const entry = { bars, signature, env: useEnv, envKey: envKey(useEnv), result: runEngine(bars, settings, useEnv) }
    memo.unshift(entry)
    while (memo.length > MEMO_SIZE) memo.pop()
    return entry.result
  }

  /* ------------------------------------------------------------------ *
   * The descriptor
   * ------------------------------------------------------------------ */

  const G_GENERAL = '01 Quick Start'
  const G_TIMEFRAMES = '02 Zone Timeframes and Lifetimes'
  const G_CONCEPTS = '03 Zone Concepts and Size Filters'
  const G_STRUCTURE = '04 Structure and Liquidity'
  const G_CONTEXT = '05 Market Context'
  const G_SCORING = '06 Signal Qualification'
  const G_EXECUTION = '07 Trade Execution and Risk'
  const G_VISUAL = '08 Chart and Regime Table'
  const G_RESEARCH = '09 Research Diagnostics'
  const G_ALERTS = '10 Alerts'

  const inputs = [
    { key: 'indicatorEnabled', type: 'boolean', label: 'Enable indicator', default: true, group: G_GENERAL },
    {
      key: 'allowUnsupportedSymbols',
      type: 'boolean',
      label: 'Allow symbols other than NQ/ES',
      default: false,
      tooltip: 'The engine is tuned for NQ and ES futures. A symbol the chart never names is allowed through either way.',
      group: G_GENERAL,
    },
    {
      key: 'allowNonOneMinuteCharts',
      type: 'boolean',
      label: 'Allow chart timeframes above 1 minute',
      default: false,
      tooltip: 'The execution engine is optimized for the 1-minute chart. Higher chart timeframes are diagnostic only unless this option is enabled.',
      group: G_GENERAL,
    },
    { key: 'sessionTimezone', type: 'text', label: 'Session timezone', default: 'America/New_York', group: G_GENERAL },
    { key: 'futuresSession', type: 'text', label: 'Futures session', default: '1800-1700:1234567', group: G_GENERAL },
    { key: 'overnightSession', type: 'text', label: 'Overnight session', default: '1800-0930:1234567', group: G_GENERAL },
    { key: 'rthSession', type: 'text', label: 'Regular trading hours', default: '0930-1600:23456', group: G_GENERAL },
    {
      key: 'signalSession',
      type: 'text',
      label: 'Signal window',
      default: '0800-1600:23456',
      tooltip: 'Default covers the primary New York intraday window. Expand it when you intentionally want overnight or evening signals.',
      group: G_GENERAL,
    },
    { key: 'maximumActiveTrades', type: 'number', label: 'Maximum active trades', default: 3, min: 1, max: 3, step: 1, group: G_GENERAL },
    { key: 'showPastTrades', type: 'boolean', label: 'Show past trades', default: false, group: G_GENERAL },
    { key: 'pastTradeRetentionHours', type: 'number', label: 'Past-trade retention hours', default: 22, min: 1, max: 72, step: 1, group: G_GENERAL },
    { key: 'completedRetentionMinutes', type: 'number', label: 'Default completed-trade retention', default: 5, min: 0, max: 120, step: 1, group: G_GENERAL },
    {
      key: 'maxEngineBars',
      type: 'number',
      label: 'Engine history bars',
      default: 5000,
      min: 500,
      max: 20000,
      step: 500,
      tooltip: 'The source declared max_bars_back = 5000. This is the same bound: how many recent bars the zone and trade engine walks. Context series and the regime score are computed over every bar either way.',
      group: G_GENERAL,
    },

    { key: 'useChartZones', type: 'boolean', label: 'Chart-timeframe zones', default: true, group: G_TIMEFRAMES },
    { key: 'use5m', type: 'boolean', label: '5-minute', default: true, group: G_TIMEFRAMES },
    { key: 'use15m', type: 'boolean', label: '15-minute', default: true, group: G_TIMEFRAMES },
    { key: 'use30m', type: 'boolean', label: '30-minute', default: true, group: G_TIMEFRAMES },
    { key: 'use1h', type: 'boolean', label: '1-hour', default: true, group: G_TIMEFRAMES },
    { key: 'use4h', type: 'boolean', label: '4-hour', default: true, group: G_TIMEFRAMES },
    { key: 'chartZoneLifeMinutes', type: 'number', label: '1m/chart zone maximum life', default: 10, min: 2, max: 60, step: 1, group: G_TIMEFRAMES },
    { key: 'zoneLife5m', type: 'number', label: '5m zone maximum life', default: 30, min: 5, max: 240, step: 1, group: G_TIMEFRAMES },
    { key: 'zoneLife15m', type: 'number', label: '15m zone maximum life', default: 60, min: 15, max: 720, step: 1, group: G_TIMEFRAMES },
    { key: 'zoneLife30m', type: 'number', label: '30m zone maximum life', default: 90, min: 30, max: 1440, step: 1, group: G_TIMEFRAMES },
    { key: 'zoneLife1h', type: 'number', label: '1H zone maximum life', default: 120, min: 60, max: 2880, step: 1, group: G_TIMEFRAMES },
    { key: 'fourHourZonesUntilSessionEnd', type: 'boolean', label: '4H zones last until futures-session close', default: true, group: G_TIMEFRAMES },
    { key: 'zoneLife4h', type: 'number', label: '4H fallback maximum life', default: 1380, min: 120, max: 2880, step: 1, group: G_TIMEFRAMES },
    {
      key: 'zoneLifetimeMode',
      type: 'select',
      label: 'Zone lifetime mode',
      default: 'Fixed by timeframe',
      options: [
        { label: 'Fixed by timeframe', value: 'Fixed by timeframe' },
        { label: 'Shorten weaker zones', value: 'Shorten weaker zones' },
      ],
      tooltip: 'Fixed mode uses the complete timeframe-specific lifetime. Score-adjusted mode shortens moderate and weak zones but never extends them beyond the configured maximum.',
      group: G_TIMEFRAMES,
    },
    {
      key: 'transformedZoneLifetimePercent',
      type: 'number',
      label: 'IFVG / BB lifetime (% of source zone)',
      default: 50,
      min: 10,
      max: 100,
      step: 1,
      tooltip: 'When an FVG flips into an IFVG, or an Order Block flips into a Breaker Block, the transformed zone receives a new timer from the transformation candle.',
      group: G_TIMEFRAMES,
    },
    { key: 'strongZoneScore', type: 'number', label: 'Full-life score', default: 80, min: 50, max: 100, step: 1, group: G_TIMEFRAMES },
    { key: 'moderateZoneScore', type: 'number', label: 'Three-quarter-life score', default: 65, min: 30, max: 95, step: 1, group: G_TIMEFRAMES },

    { key: 'enableFvg', type: 'boolean', label: 'Fair Value Gaps', default: true, group: G_CONCEPTS },
    { key: 'enableIfvg', type: 'boolean', label: 'Inversion FVGs', default: true, group: G_CONCEPTS },
    { key: 'enableOb', type: 'boolean', label: 'Order Blocks', default: true, group: G_CONCEPTS },
    { key: 'enableBb', type: 'boolean', label: 'Breaker Blocks', default: true, group: G_CONCEPTS },
    {
      key: 'minimumZoneTicks',
      type: 'number',
      label: 'Minimum zone width (ticks)',
      default: 5,
      min: 1,
      max: 100,
      step: 1,
      tooltip: 'A zone must be at least this many minimum price ticks wide. The tick comes from the price scale, not from an input.',
      group: G_CONCEPTS,
    },
    { key: 'minimumZoneAtr', type: 'number', label: 'Minimum zone size / source ATR', default: 0.03, min: 0, max: 2, step: 0.01, group: G_CONCEPTS },
    { key: 'maximumZoneAtr', type: 'number', label: 'Maximum zone size / source ATR', default: 1.5, min: 0.1, max: 10, step: 0.05, group: G_CONCEPTS },
    { key: 'htfDisplacementAtr', type: 'number', label: 'HTF displacement body / ATR', default: 0.75, min: 0.2, max: 3, step: 0.05, group: G_CONCEPTS },
    { key: 'htfDisplacementBodyFraction', type: 'number', label: 'HTF displacement body fraction', default: 0.55, min: 0.2, max: 1, step: 0.05, group: G_CONCEPTS },
    { key: 'htfBosLookback', type: 'number', label: 'HTF structure lookback', default: 5, min: 2, max: 20, step: 1, group: G_CONCEPTS },

    { key: 'pivotLeft', type: 'number', label: 'Pivot left', default: 2, min: 1, max: 10, step: 1, group: G_STRUCTURE },
    { key: 'pivotRight', type: 'number', label: 'Pivot right', default: 2, min: 1, max: 10, step: 1, group: G_STRUCTURE },
    { key: 'structureValidityBars', type: 'number', label: 'Immediate structure-event bars', default: 5, min: 1, max: 20, step: 1, group: G_STRUCTURE },
    { key: 'structureValidityMinutes', type: 'number', label: 'Same-leg structure validity minutes', default: 30, min: 5, max: 180, step: 1, group: G_STRUCTURE },
    { key: 'displacementValidityMinutes', type: 'number', label: 'Displacement validity minutes', default: 20, min: 3, max: 120, step: 1, group: G_STRUCTURE },
    { key: 'executionDisplacementAtr', type: 'number', label: 'Execution displacement body / ATR', default: 0.65, min: 0.1, max: 3, step: 0.05, group: G_STRUCTURE },
    { key: 'executionBodyFraction', type: 'number', label: 'Execution body fraction', default: 0.52, min: 0.1, max: 1, step: 0.05, group: G_STRUCTURE },
    { key: 'useLiquidityPools', type: 'boolean', label: 'Repeated-wick liquidity pools', default: true, group: G_STRUCTURE },
    { key: 'liquidityPoolToleranceTicks', type: 'number', label: 'Pool tolerance in ticks', default: 10, min: 2, max: 100, step: 1, group: G_STRUCTURE },
    { key: 'liquidityPoolMinimumTouches', type: 'number', label: 'Minimum pool touches', default: 3, min: 2, max: 8, step: 1, group: G_STRUCTURE },
    { key: 'liquidityPoolLookbackBars', type: 'number', label: 'Pool lookback bars', default: 360, min: 30, max: 2000, step: 1, group: G_STRUCTURE },
    { key: 'liquidityPoolBreakTicks', type: 'number', label: 'Pool break confirmation ticks', default: 3, min: 1, max: 50, step: 1, group: G_STRUCTURE },
    { key: 'usePoolsAsObjectives', type: 'boolean', label: 'Use liquidity pools as trade objectives', default: true, group: G_STRUCTURE },
    { key: 'liquiditySweepValidityBars', type: 'number', label: 'Liquidity-event validity bars', default: 12, min: 1, max: 60, step: 1, group: G_STRUCTURE },
    {
      key: 'openingRangeMinutes',
      type: 'select',
      label: 'Opening Range minutes',
      default: '15',
      options: [
        { label: '5', value: '5' },
        { label: '15', value: '15' },
        { label: '30', value: '30' },
      ],
      group: G_STRUCTURE,
    },

    { key: 'useVwap', type: 'boolean', label: 'Session and RTH VWAP', default: true, group: G_CONTEXT },
    { key: 'useRsi', type: 'boolean', label: 'RSI', default: true, group: G_CONTEXT },
    { key: 'rsiLength', type: 'number', label: 'RSI length', default: 14, min: 2, max: 50, step: 1, group: G_CONTEXT },
    { key: 'useZScore', type: 'boolean', label: 'Rolling z-score', default: true, group: G_CONTEXT },
    { key: 'zScoreLength', type: 'number', label: 'Z-score length', default: 50, min: 10, max: 300, step: 1, group: G_CONTEXT },
    { key: 'zScoreExtreme', type: 'number', label: 'Z-score extreme', default: 1.5, min: 0.5, max: 4, step: 0.1, group: G_CONTEXT },
    { key: 'usePowerOfThree', type: 'boolean', label: 'Power-of-three session proxy', default: true, group: G_CONTEXT },
    { key: 'useOpeningRange', type: 'boolean', label: 'Opening Range breakout/retest', default: true, group: G_CONTEXT },
    { key: 'useRvol', type: 'boolean', label: 'Same-time relative volume', default: true, group: G_CONTEXT },
    { key: 'rvolBaselineSessions', type: 'number', label: 'RVOL baseline sessions', default: 30, min: 5, max: 60, step: 1, group: G_CONTEXT },
    { key: 'rvolMinimumSamples', type: 'number', label: 'RVOL minimum samples', default: 5, min: 2, max: 30, step: 1, group: G_CONTEXT },
    { key: 'elevatedRvol', type: 'number', label: 'Elevated RVOL', default: 1.25, min: 0.5, max: 5, step: 0.05, group: G_CONTEXT },

    { key: 'minimumScore', type: 'number', label: 'Live signal minimum score', default: 80, min: 50, max: 100, step: 1, group: G_SCORING },
    {
      key: 'minimumCategories',
      type: 'number',
      label: 'Minimum independent categories',
      default: 4,
      min: 2,
      max: 6,
      step: 1,
      tooltip: 'SMT divergence is not available in a single-symbol chart study, so the intermarket category can reach 4 of its 5 points rather than 5.',
      group: G_SCORING,
    },
    { key: 'requireStructure', type: 'boolean', label: 'Require recent BOS/MSS', default: true, group: G_SCORING },
    { key: 'requireDisplacement', type: 'boolean', label: 'Require recent displacement', default: true, group: G_SCORING },
    { key: 'maximumEntryTouches', type: 'number', label: 'Maximum zone touches before entry', default: 2, min: 1, max: 6, step: 1, group: G_SCORING },
    { key: 'oneTradePerStructuralLeg', type: 'boolean', label: 'One trade per structural leg', default: true, group: G_SCORING },
    { key: 'sameDirectionCooldownBars', type: 'number', label: 'Same-direction cooldown bars', default: 5, min: 0, max: 60, step: 1, group: G_SCORING },
    { key: 'minimumObjectiveR', type: 'number', label: 'Minimum space to objective in R', default: 0.8, min: 0, max: 3, step: 0.1, group: G_SCORING },

    {
      key: 'entryMode',
      type: 'select',
      label: 'Entry mode',
      default: 'Rejection close',
      options: [
        { label: 'First touch', value: 'First touch' },
        { label: 'Midpoint reclaim', value: 'Midpoint reclaim' },
        { label: 'Rejection close', value: 'Rejection close' },
      ],
      group: G_EXECUTION,
    },
    { key: 'atrLength', type: 'number', label: 'ATR length', default: 14, min: 5, max: 100, step: 1, group: G_EXECUTION },
    { key: 'stopBufferTicks', type: 'number', label: 'Invalidation buffer ticks', default: 2, min: 0, max: 100, step: 1, group: G_EXECUTION },
    {
      key: 'stopLimitMode',
      type: 'select',
      label: 'Stop-size limits',
      default: 'Automatic',
      options: [
        { label: 'Automatic', value: 'Automatic' },
        { label: 'Custom', value: 'Custom' },
        { label: 'Off', value: 'Off' },
      ],
      group: G_EXECUTION,
    },
    { key: 'customMaxStopTicks', type: 'number', label: 'Custom maximum stop ticks', default: 40, min: 2, max: 400, step: 1, group: G_EXECUTION },
    { key: 'maximumStopAtr', type: 'number', label: 'Maximum stop / ATR', default: 0.8, min: 0.1, max: 5, step: 0.05, group: G_EXECUTION },
    { key: 'tradeDurationMinutes', type: 'number', label: 'Trade drawing duration', default: 30, min: 5, max: 240, step: 1, group: G_EXECUTION },
    { key: 'maximumRetainedTrades', type: 'number', label: 'Maximum retained trades', default: 20, min: 3, max: 20, step: 1, group: G_EXECUTION },

    { key: 'setupZoneTransparency', type: 'number', label: 'Setup-zone transparency', default: 90, min: 70, max: 98, step: 1, group: G_VISUAL },
    { key: 'riskTransparency', type: 'number', label: 'Risk transparency', default: 90, min: 70, max: 98, step: 1, group: G_VISUAL },
    { key: 'reward1Transparency', type: 'number', label: 'Entry-to-1R transparency', default: 87, min: 70, max: 98, step: 1, group: G_VISUAL },
    { key: 'reward15Transparency', type: 'number', label: '1R-to-1.5R transparency', default: 92, min: 70, max: 99, step: 1, group: G_VISUAL },
    { key: 'reward2Transparency', type: 'number', label: '1.5R-to-2R transparency', default: 95, min: 70, max: 99, step: 1, group: G_VISUAL },
    { key: 'historicalTransparency', type: 'number', label: 'Historical-trade transparency', default: 96, min: 85, max: 99, step: 1, group: G_VISUAL },
    { key: 'lineWidth', type: 'number', label: 'Stop/target line width', default: 2, min: 1, max: 4, step: 1, group: G_VISUAL },
    { key: 'showRegimePanel', type: 'boolean', label: 'Show multi-timeframe regime panel', default: true, group: G_VISUAL },
    {
      key: 'panelPosition',
      type: 'select',
      label: 'Regime table position',
      default: 'bottom-right',
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
      group: G_VISUAL,
    },
    {
      key: 'panelTextSize',
      type: 'select',
      label: 'Regime table text size',
      default: 'Tiny',
      options: [
        { label: 'Tiny', value: 'Tiny' },
        { label: 'Small', value: 'Small' },
        { label: 'Normal', value: 'Normal' },
        { label: 'Large', value: 'Large' },
      ],
      group: G_VISUAL,
    },
    {
      key: 'showZoneScores',
      type: 'boolean',
      label: 'Show scores in zone labels',
      default: false,
      tooltip: 'When disabled, zone labels use only the timeframe and concept name. Score details remain in the research table.',
      group: G_VISUAL,
    },
    {
      key: 'zoneLabelPlacement',
      type: 'select',
      label: 'Zone label placement',
      default: 'Inside right',
      options: [
        { label: 'Inside right', value: 'Inside right' },
        { label: 'Above right', value: 'Above right' },
      ],
      group: G_VISUAL,
    },
    {
      key: 'liquidityLabelOffsetTicks',
      type: 'number',
      label: 'Liquidity label offset (ticks)',
      default: 2,
      min: 0,
      max: 20,
      step: 1,
      tooltip: 'Support labels are placed below the pool line. Resistance labels are placed above it.',
      group: G_VISUAL,
    },

    { key: 'showAllResearchZones', type: 'boolean', label: 'Show active research zones', default: true, group: G_RESEARCH },
    {
      key: 'researchZoneFilter',
      type: 'select',
      label: 'Research zone filter',
      default: 'Relevant only',
      options: [
        { label: 'Relevant only', value: 'Relevant only' },
        { label: 'All active', value: 'All active' },
      ],
      group: G_RESEARCH,
    },
    { key: 'showLiquidityPoolLines', type: 'boolean', label: 'Show active liquidity-pool lines', default: true, group: G_RESEARCH },
    { key: 'liquidityPoolForwardMinutes', type: 'number', label: 'Liquidity-line forward projection', default: 10, min: 1, max: 120, step: 1, group: G_RESEARCH },
    {
      key: 'showInvalidatedZoneHistory',
      type: 'boolean',
      label: 'Show recently invalidated zones',
      default: true,
      tooltip: 'Keeps the original FVG or Order Block visible up to its invalidation candle, so an FVG-to-IFVG or OB-to-BB transition stays auditable.',
      group: G_RESEARCH,
    },
    { key: 'invalidatedZoneRetentionMinutes', type: 'number', label: 'Invalidated-zone history retention', default: 120, min: 5, max: 1440, step: 1, group: G_RESEARCH },
    { key: 'maximumResearchZones', type: 'number', label: 'Maximum visible research zones', default: 20, min: 5, max: 60, step: 1, group: G_RESEARCH },
    { key: 'researchCandidateMinimum', type: 'number', label: 'Research candidate minimum', default: 35, min: 0, max: 100, step: 1, group: G_RESEARCH },
    { key: 'showRejectedCandidates', type: 'boolean', label: 'Show rejected touched candidates', default: false, group: G_RESEARCH },

    { key: 'enableAlerts', type: 'boolean', label: 'Enable alerts', default: true, group: G_ALERTS },
    { key: 'alertSignals', type: 'boolean', label: 'BUY / SELL signal', default: true, group: G_ALERTS },
    { key: 'alertTargets', type: 'boolean', label: 'Target reached', default: true, group: G_ALERTS },
    { key: 'alertStops', type: 'boolean', label: 'Stop reached', default: true, group: G_ALERTS },
  ]

  INPUT_KEYS = inputs.map((x) => x.key)

  const regimeText = (score) =>
    !Number.isFinite(score)
      ? 'WAITING'
      : score >= 60
        ? 'STRONG BULL'
        : score >= 25
          ? 'BULLISH'
          : score <= -60
            ? 'STRONG BEAR'
            : score <= -25
              ? 'BEARISH'
              : 'BALANCED'

  const regimeColor = (score) =>
    !Number.isFinite(score) ? C_NEUTRAL : score >= 25 ? C_BULL_SIGNAL : score <= -25 ? C_BEAR_SIGNAL : C_NEUTRAL

  const regimeScoreText = (score) => (Number.isFinite(score) ? String(Math.abs(score)) : '-')

  const panelFontSize = (size) => (size === 'Tiny' ? 9 : size === 'Small' ? 10 : size === 'Large' ? 14 : 12)

  registerIndicator({
    id: 'oa-meridian-futures-setups-research',
    name: 'Meridian - Futures Setups Research',
    category: 'Meridian',
    placement: 'onchart',

    inputs,

    // Nothing is plotted as a line: the study speaks through drawings, a table
    // and alerts, exactly as the source does. A descriptor still needs one plot,
    // so the weighted regime score rides along as a hidden column.
    plots: [
      { key: 'regime', type: 'line', title: 'Weighted Regime Score', style: { visible: false, color: C_ACCENT } },
    ],

    calc(bars, settings, store, ctx) {
      const env = {
        tick: Number(ctx?.tickSize) || 0,
        root: symbolRoot(ctx?.symbol),
        chartSeconds: deriveChartSeconds(bars, ctx?.interval),
      }
      const cols = engineFor(bars, settings, env).cols
      return {
        regime: nulls(cols.regime),
        localRegime: nulls(cols.localRegime),
        r5: nulls(cols.r5),
        r15: nulls(cols.r15),
        r30: nulls(cols.r30),
        r60: nulls(cols.r60),
        r240: nulls(cols.r240),
        buy: nulls(cols.buy),
        sell: nulls(cols.sell),
        target: nulls(cols.target),
        stop: nulls(cols.stop),
        candScore: nulls(cols.candScore),
      }
    },

    draws({ bars, settings }) {
      if (bars.length === 0) return []
      return engineFor(bars, settings, null).drawings
    },

    table({ bars, settings }) {
      if (bars.length === 0) return null
      const panel = engineFor(bars, settings, null).panel
      if (panel === null || !panel.showRegimePanel) return null

      const size = panelFontSize(strOf(settings.panelTextSize, 'Tiny'))
      const cell = (text, colour) => ({
        text,
        bgColor: withAlpha(colour, 0.18),
        textColor: '#ffffff',
        align: 'center',
      })
      const regimeCell = (label, score) =>
        cell(`${label} ${regimeText(score)} ${regimeScoreText(score)}`, regimeColor(score))

      const engineText = panel.engineSupported ? 'READY' : panel.supportedSymbol ? 'USE 1M' : 'CHECK SYMBOL'
      const head = {
        text: 'MERIDIAN REGIME DETECTION',
        bgColor: withAlpha(C_ACCENT, 0.88),
        textColor: '#ffffff',
        bold: true,
        align: 'center',
      }
      const blank = { text: '', bgColor: withAlpha(C_ACCENT, 0.88), textColor: '#ffffff' }

      return {
        rows: [
          [head, blank, blank],
          [regimeCell('4H', panel.r240), regimeCell('1H', panel.r60), regimeCell('30M', panel.r30)],
          [regimeCell('15M', panel.r15), regimeCell('5M', panel.r5), regimeCell(panel.executionTfLabel, panel.local)],
          [
            cell(`ENGINE ${engineText}`, panel.engineSupported ? C_BULL_SIGNAL : C_BEAR_SIGNAL),
            cell(`THRESHOLD ${panel.minimumScore} / ${panel.minimumCategories} categories`, C_NEUTRAL),
            cell(
              `LATEST ${
                Number.isFinite(panel.latestCandidateScore)
                  ? `${panel.latestCandidateScore} ${panel.latestCandidateZone}`
                  : '-'
              }`,
              C_NEUTRAL
            ),
          ],
        ],
        options: {
          position: String(settings.panelPosition ?? 'bottom-right') || 'bottom-right',
          fontSize: size,
          // The source's table bgcolor, transparency 5, behind the whole grid.
          background: withAlpha(C_PANEL_BG, 0.95),
          borderColor: withAlpha(C_NEUTRAL, 0.22),
          borderWidth: 1,
          cellWidth: [150, 150, 150],
          cellHeight: 26,
        },
      }
    },

    alerts: [
      {
        id: 'meridian-buy',
        title: 'Meridian BUY',
        message: 'Meridian Futures Setups produced a confirmed BUY signal.',
        when: ({ values, settings, index }) =>
          settings.enableAlerts !== false && settings.alertSignals !== false && values.buy?.[index] === 1,
      },
      {
        id: 'meridian-sell',
        title: 'Meridian SELL',
        message: 'Meridian Futures Setups produced a confirmed SELL signal.',
        when: ({ values, settings, index }) =>
          settings.enableAlerts !== false && settings.alertSignals !== false && values.sell?.[index] === 1,
      },
      {
        id: 'meridian-target',
        title: 'Meridian target',
        message: 'A Meridian Futures Setups trade reached 2R.',
        when: ({ values, settings, index }) =>
          settings.enableAlerts !== false && settings.alertTargets !== false && values.target?.[index] === 1,
      },
      {
        id: 'meridian-stop',
        title: 'Meridian stop',
        message: 'A Meridian Futures Setups trade reached its stop.',
        when: ({ values, settings, index }) =>
          settings.enableAlerts !== false && settings.alertStops !== false && values.stop?.[index] === 1,
      },
    ],
  })
}
