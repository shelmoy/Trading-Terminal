/**
 * Meridian - Options Context (v0.2.1) - ported to openalgo-charts from Pine Script v6.
 *
 * Source: https://github.com/sukesan7/meridian-indicators/blob/82bfd140decb5439c2db0be840f9deaf5cde24b0/src/options/meridian-options-context.pine
 * Repo:   sukesan7/meridian-indicators
 * License: MPL-2.0
 * SPDX-FileCopyrightText: (c) sukesan7
 * SPDX-FileCopyrightText: (c) 2026 marketcalls (port to openalgo-charts)
 * SPDX-License-Identifier: MPL-2.0
 *
 * An intraday context engine for options traders: trend, session structure,
 * momentum, participation, persistence, volatility and higher-timeframe trend
 * are each scored on a -100..+100 scale, blended into one Context Direction
 * line with a separate Confidence line, and latched into a hysteretic regime
 * that shades the pane and drives the alerts.
 *
 * Porting notes, in full:
 *
 * 1. Higher timeframes. Pine pulls 60/240/1D/1W through `request.security` on
 *    a regular-session ticker. There is no such call here, so the 1H, 4H, 1D
 *    and 1W series are folded from the chart's own bars, intraday buckets
 *    anchored to each session's first bar the way an exchange-session HTF bar
 *    is. The source reads `directionRaw[1]` under `lookahead_on`, which is the
 *    non-repainting idiom for "the last closed HTF bar", so every chart bar
 *    inside HTF bucket k reads the metrics of bucket k - 1. Folding carries
 *    whatever the chart carries: on a feed that includes extended hours those
 *    bars join the HTF bar, where the regular-session ticker would drop them.
 *
 * 2. Relative volume. `tvta.relativeVolume` is a library call behind a
 *    `request.security`, so it is reimplemented here from the chart's bars: a
 *    bar's volume against the mean volume at the same slot of the previous N
 *    sessions, and the cumulative variant against the mean cumulative volume
 *    at that slot. The source's "estimate unclosed real-time bar" option has
 *    no equivalent (the estimate needs wall-clock progress through a forming
 *    bar, and `calc` must stay a pure function of the bars), so the input is
 *    not carried and RVOL reads closed-bar volume only.
 *
 * 3. The source calls `runtime.error()` on a chart at or above 60 minutes.
 *    An indicator here cannot abort the chart, so the dashboard reports the
 *    interval instead of the study refusing to load.
 *
 * 4. The `display.data_window` research plots are not expressible: a plot here
 *    is drawn or it is nothing. Their readings live in the dashboard instead.
 *
 * 5. Colour inputs are omitted deliberately. The chart generates colour,
 *    opacity, thickness and line style per plot, so the source's palette
 *    arrives as plot defaults rather than as a second set of controls.
 */

const NEON_PURPLE = '#D946EF'
const LIGHT_PURPLE = '#C4B5FD'
const BULLISH = '#22D3EE'
const BEARISH = '#FB7185'
const STRONG_BULL_COLOR = '#39FF88'
const STRONG_BEAR_COLOR = '#FF4D6D'
const NEUTRAL = '#A1A1AA'
const PANEL = '#111118'
const PANEL_ALT = '#18121F'
const HTF_COLOR = '#FBBF24'
const LEGACY_COLOR = '#FDE68A'

const REGIME_STRONG_BEAR = -3
const REGIME_BEAR = -2
const REGIME_BEAR_LEAN = -1
const REGIME_BALANCED = 0
const REGIME_BULL_LEAN = 1
const REGIME_BULL = 2
const REGIME_STRONG_BULL = 3

const VALID_SOURCES = ['open', 'high', 'low', 'close', 'hl2', 'hlc3', 'ohlc4', 'volume']

export default function ({
  registerIndicator,
  sourceValues,
  sma,
  stdev,
  smaSeededEma,
  rsi,
  atr,
  change,
  nulls,
  withAlpha,
  parseSessionSpec,
  sessionFlags,
  zonedDayIndex,
  zonedWeekIndex,
  isValidTimezone,
  intervalToSeconds,
}) {
  /* ── the source's small scalar helpers ─────────────────────────────────── */

  /** f_sat: a soft saturation onto (-1, 1). */
  const sat = (v) => v / (1 + Math.abs(v))

  /** f_bound: the same, scaled to (-100, 100). NaN stays NaN, as `na` does. */
  const bound = (v) => 100 * sat(v)

  /**
   * f_sign. Pine treats `na` as false in a conditional, so `f_sign(na)` is 0,
   * and so is this: both comparisons against NaN are false.
   */
  const sign = (v) => (v > 0 ? 1 : v < 0 ? -1 : 0)

  /** f_clamp. NaN propagates through Math.min/Math.max, matching `na` here. */
  const clampTo = (v, lo, hi) => Math.max(lo, Math.min(hi, v))

  /**
   * f_weighted2 / f_weighted3 / f_weighted4: a weighted mean over the members
   * that exist, `na` when none of them do.
   */
  function weighted(pairs) {
    let numerator = 0
    let denominator = 0
    for (let i = 0; i < pairs.length; i++) {
      const v = pairs[i][0]
      if (!Number.isFinite(v)) continue
      numerator += v * pairs[i][1]
      denominator += pairs[i][1]
    }
    return denominator > 0 ? numerator / denominator : NaN
  }

  /* ── input coercion ────────────────────────────────────────────────────── */

  // A cleared number field arrives as '', and Number('') is 0, so every read
  // falls back to the declared default and is then held inside the source's
  // own minval / maxval.
  const int = (raw, def, lo, hi) => Math.max(lo, Math.min(hi, Math.floor(Number(raw) || def)))
  const num = (raw, def, lo, hi) => Math.max(lo, Math.min(hi, Number(raw) || def))
  const srcOf = (raw, def) => (typeof raw === 'string' && VALID_SOURCES.includes(raw) ? raw : def)

  /** The zone the session is read in. Bar times are UTC seconds. */
  function zoneOf(settings) {
    const raw = typeof settings.timezone === 'string' ? settings.timezone.trim() : ''
    return raw && isValidTimezone(raw) ? raw : 'America/New_York'
  }

  /**
   * The RTH spec, with the source's day mask appended.
   *
   * Pine's ":23456" is Monday to Friday (1 is Sunday), which is exactly what
   * `parseSessionSpec` reads, so the mask travels verbatim. A cleared field
   * falls back to the declared default rather than to no session at all.
   */
  function sessionOf(settings) {
    const raw = typeof settings.session === 'string' ? settings.session.trim() : ''
    const days = settings.weekdaysOnly === false ? ':1234567' : ':23456'
    const parsed = parseSessionSpec(`${raw}${days}`)
    return parsed ?? parseSessionSpec(`0930-1600${days}`)
  }

  /**
   * `timeframe.in_seconds()`. The host may not have told us the interval, so
   * fall back to the median gap between bars, which is what the chart is
   * actually drawing.
   */
  function barSecondsOf(bars, ctx) {
    const raw = ctx?.interval
    if (typeof raw === 'string' && raw.trim() !== '') {
      try {
        const s = intervalToSeconds(raw)
        if (Number.isFinite(s) && s > 0) return s
      } catch {
        // An interval token the library does not know. Fall through.
      }
    }
    const gaps = []
    for (let i = 1; i < bars.length && gaps.length < 400; i++) {
      const d = bars[i].time - bars[i - 1].time
      if (d > 0) gaps.push(d)
    }
    if (gaps.length === 0) return 0
    gaps.sort((a, b) => a - b)
    return gaps[Math.floor(gaps.length / 2)]
  }

  /**
   * `syminfo.mintick`, as the chart knows it. It is only ever a divide guard
   * here, so a host that never set one gets a floor small enough to leave the
   * arithmetic alone.
   */
  function tickOf(ctx) {
    const t = Number(ctx?.tickSize)
    return Number.isFinite(t) && t > 0 ? t : 1e-8
  }

  /* ── the regime latch ──────────────────────────────────────────────────── */

  const rawRegime = (score) =>
    score >= 75 ? REGIME_STRONG_BULL
      : score >= 45 ? REGIME_BULL
        : score >= 20 ? REGIME_BULL_LEAN
          : score <= -75 ? REGIME_STRONG_BEAR
            : score <= -45 ? REGIME_BEAR
              : score <= -20 ? REGIME_BEAR_LEAN
                : REGIME_BALANCED

  /**
   * f_updateRegime: the hysteresis. A state is held on a weaker score than the
   * one that entered it, so the regime does not strobe around a threshold.
   */
  function updateRegime(previous, score) {
    const raw = rawRegime(score)
    if (previous === REGIME_STRONG_BULL) return score >= 68 ? REGIME_STRONG_BULL : raw
    if (previous === REGIME_BULL) return score >= 75 ? REGIME_STRONG_BULL : score >= 38 ? REGIME_BULL : raw
    if (previous === REGIME_BULL_LEAN) return score >= 45 ? raw : score >= 14 ? REGIME_BULL_LEAN : raw
    if (previous === REGIME_STRONG_BEAR) return score <= -68 ? REGIME_STRONG_BEAR : raw
    if (previous === REGIME_BEAR) return score <= -75 ? REGIME_STRONG_BEAR : score <= -38 ? REGIME_BEAR : raw
    if (previous === REGIME_BEAR_LEAN) return score <= -45 ? raw : score <= -14 ? REGIME_BEAR_LEAN : raw
    return raw
  }

  const regimeText = (state) =>
    state === REGIME_STRONG_BULL ? 'STRONG BULL'
      : state === REGIME_BULL ? 'BULL'
        : state === REGIME_BULL_LEAN ? 'BULL LEAN'
          : state === REGIME_STRONG_BEAR ? 'STRONG BEAR'
            : state === REGIME_BEAR ? 'BEAR'
              : state === REGIME_BEAR_LEAN ? 'BEAR LEAN'
                : 'BALANCED'

  const regimeColor = (state) =>
    state === REGIME_STRONG_BULL ? STRONG_BULL_COLOR
      : state === REGIME_BULL || state === REGIME_BULL_LEAN ? BULLISH
        : state === REGIME_STRONG_BEAR ? STRONG_BEAR_COLOR
          : state === REGIME_BEAR || state === REGIME_BEAR_LEAN ? BEARISH
            : NEUTRAL

  const scoreColor = (score) =>
    !Number.isFinite(score) ? NEUTRAL
      : score >= 75 ? STRONG_BULL_COLOR
        : score >= 20 ? BULLISH
          : score <= -75 ? STRONG_BEAR_COLOR
            : score <= -20 ? BEARISH
              : NEUTRAL

  /* ── dashboard text, straight from the source's formatters ─────────────── */

  const scoreText = (v) =>
    !Number.isFinite(v) ? 'n/a' : v > 0 ? `+${Math.round(v)}` : String(Math.round(v))
  const ratioText = (v) => (!Number.isFinite(v) ? 'n/a' : `${v.toFixed(2)}x`)
  const confidenceText = (v) =>
    !Number.isFinite(v) ? 'n/a' : v > 65 ? 'HIGH' : v >= 35 ? 'MOD' : 'LOW'
  const volatilityText = (v) =>
    !Number.isFinite(v) ? 'n/a'
      : v >= 80 ? 'EXTREME'
        : v >= 60 ? 'EXPANDED'
          : v >= 40 ? 'NORMAL'
            : v >= 20 ? 'QUIET'
              : 'CONTRACTED'
  const componentText = (v) =>
    !Number.isFinite(v) ? 'n/a'
      : v >= 75 ? 'STRONG BULL'
        : v >= 45 ? 'BULL'
          : v >= 20 ? 'BULL LEAN'
            : v <= -75 ? 'STRONG BEAR'
              : v <= -45 ? 'BEAR'
                : v <= -20 ? 'BEAR LEAN'
                  : 'BALANCED'
  const rvolState = (v, high, extreme) =>
    !Number.isFinite(v) ? 'n/a' : v >= extreme ? 'EXTREME' : v >= high ? 'HIGH' : v >= 1 ? 'NORMAL' : 'LOW'
  const levelsBiasText = (direction, confidence) =>
    !Number.isFinite(direction) || !Number.isFinite(confidence) ? 'n/a'
      : confidence < 35 ? 'LOW CONVICTION'
        : direction >= 45 ? 'PREFER SUPPORT'
          : direction <= -45 ? 'PREFER RESISTANCE'
            : direction >= 20 ? 'SUPPORT LEAN'
              : direction <= -20 ? 'RESISTANCE LEAN'
                : 'TWO-SIDED'
  const zonePreference = (direction, confidence) =>
    !Number.isFinite(direction) || !Number.isFinite(confidence) || confidence < 35 || Math.abs(direction) < 20
      ? 0
      : direction > 0 ? 1 : -1

  function breadthText(scores, threshold) {
    let bull = 0
    let bear = 0
    let available = 0
    for (const s of scores) {
      if (!Number.isFinite(s)) continue
      available++
      if (s >= threshold) bull++
      else if (s <= -threshold) bear++
    }
    if (bull > bear) return `${bull}/${available} BULL`
    if (bear > bull) return `${bear}/${available} BEAR`
    return available > 0 ? 'MIXED' : 'n/a'
  }

  /* ── higher timeframes, folded from the chart's own bars ───────────────── */

  /**
   * A bucket key per bar. Days and weeks come from the calendar in the session
   * zone; an intraday bucket is anchored to the first bar of its day, which is
   * how an exchange-session HTF bar lines up with the open.
   */
  function bucketKeys(bars, kind, zone, dayIndex) {
    const n = bars.length
    const keys = new Array(n).fill(0)
    if (kind === 'D') {
      for (let i = 0; i < n; i++) keys[i] = dayIndex[i]
      return keys
    }
    if (kind === 'W') {
      for (let i = 0; i < n; i++) keys[i] = zonedWeekIndex(bars[i].time, zone)
      return keys
    }
    let anchor = 0
    let day = null
    for (let i = 0; i < n; i++) {
      if (dayIndex[i] !== day) {
        day = dayIndex[i]
        anchor = bars[i].time
      }
      keys[i] = day * 100000 + Math.floor((bars[i].time - anchor) / kind)
    }
    return keys
  }

  /** Fold bars onto their bucket keys, and remember which bucket each bar is in. */
  function foldBars(bars, keys) {
    const htf = []
    const index = new Array(bars.length).fill(-1)
    let current = null
    let key = null
    for (let i = 0; i < bars.length; i++) {
      const b = bars[i]
      if (current === null || keys[i] !== key) {
        key = keys[i]
        current = { high: b.high, low: b.low, close: b.close }
        htf.push(current)
      }
      if (b.high > current.high) current.high = b.high
      if (b.low < current.low) current.low = b.low
      current.close = b.close
      index[i] = htf.length - 1
    }
    return { htf, index }
  }

  /**
   * f_htfMetricsConfirmed, evaluated over a folded series.
   *
   * Returns the source's `[directionRaw[1], qualityRaw[1]]`, so entry j already
   * holds the reading of the previous, fully closed HTF bar. A chart bar inside
   * bucket k therefore reads entry k and never sees an unfinished bar.
   */
  function htfMetrics(htf, p, tick) {
    const m = htf.length
    const direction = new Array(m).fill(NaN)
    const quality = new Array(m).fill(NaN)
    const outDirection = new Array(m).fill(NaN)
    const outQuality = new Array(m).fill(NaN)
    if (m === 0) return { direction: outDirection, quality: outQuality }

    const high = htf.map((b) => b.high)
    const low = htf.map((b) => b.low)
    const close = htf.map((b) => b.close)

    const range = atr(high, low, close, p.atrLength)
    const fast = smaSeededEma(close, p.fastLength)
    const slow = smaSeededEma(close, p.slowLength)
    const strength = rsi(close, p.rsiLength)

    const absChange = change(close, 1).map((v) => Math.abs(v))
    const pathAverage = sma(absChange, p.pathLookback)

    const aboveFast = new Array(m)
    for (let j = 0; j < m; j++) aboveFast[j] = sign(close[j] - fast[j])
    const persistenceAverage = sma(aboveFast, p.persistenceLength)

    for (let j = 0; j < m; j++) {
      const atrSafe = Math.max(Number.isFinite(range[j]) ? range[j] : tick, tick)
      const spreadScore = bound(((fast[j] - slow[j]) / atrSafe) / p.spreadScale)

      const back = j - p.slopeLookback
      const slowSlope = back >= 0 ? ((slow[j] - slow[back]) / Math.max(p.slopeLookback, 1)) / atrSafe : NaN
      const fastSlope = back >= 0 ? ((fast[j] - fast[back]) / Math.max(p.slopeLookback, 1)) / atrSafe : NaN
      const slopeScore = weighted([
        [bound(slowSlope / p.slopeScale), 0.65],
        [bound(fastSlope / p.slopeScale), 0.35],
      ])

      const from = j - p.pathLookback
      const pathMove = from >= 0 ? close[j] - close[from] : NaN
      const returnScore = bound((pathMove / (atrSafe * Math.sqrt(p.pathLookback))) / p.returnScale)

      const pathLength = pathAverage[j] * p.pathLookback
      const efficiencyScore =
        Number.isFinite(pathLength) && pathLength > tick
          ? clampTo((100 * pathMove) / pathLength, -100, 100)
          : NaN

      const persistenceScore = 100 * persistenceAverage[j]
      const rsiScore = bound((strength[j] - 50) / 20)

      const dir =
        0.28 * spreadScore +
        0.22 * slopeScore +
        0.22 * returnScore +
        0.13 * efficiencyScore +
        0.1 * persistenceScore +
        0.05 * rsiScore
      const magnitude =
        0.28 * Math.abs(spreadScore) +
        0.22 * Math.abs(slopeScore) +
        0.22 * Math.abs(returnScore) +
        0.13 * Math.abs(efficiencyScore) +
        0.1 * Math.abs(persistenceScore) +
        0.05 * Math.abs(rsiScore)
      // `magnitude > 0` is false for NaN, exactly as it is for `na` in Pine,
      // so the quality of an unfinished component stays NaN rather than 0.
      const coherence = magnitude > 0 ? clampTo(Math.abs(dir) / magnitude, 0, 1) : 0

      direction[j] = dir
      quality[j] = clampTo(magnitude * (0.6 + 0.4 * coherence), 0, 100)
    }

    for (let j = 1; j < m; j++) {
      outDirection[j] = clampTo(direction[j - 1], -100, 100)
      outQuality[j] = quality[j - 1]
    }
    return { direction: outDirection, quality: outQuality }
  }

  /** One higher timeframe, mapped back onto the chart's bars. */
  function higherTimeframe(bars, kind, zone, dayIndex, p, tick) {
    const n = bars.length
    const score = new Array(n).fill(NaN)
    const quality = new Array(n).fill(NaN)
    if (n === 0) return { score, quality }
    const { htf, index } = foldBars(bars, bucketKeys(bars, kind, zone, dayIndex))
    const metrics = htfMetrics(htf, p, tick)
    for (let i = 0; i < n; i++) {
      const k = index[i]
      if (k < 0) continue
      score[i] = metrics.direction[k]
      quality[i] = metrics.quality[k]
    }
    return { score, quality }
  }

  /* ── relative volume, rebuilt from the chart's own sessions ────────────── */

  /**
   * `tvta.relativeVolume(days, "D", isCumulative)`, computed here.
   *
   * A session's bars are slotted by their position within the RTH session, and
   * each slot is compared with the mean of the same slot over the previous
   * `days` sessions. The cumulative variant compares volume so far today with
   * the mean volume so far at that slot. A session too short to reach the slot
   * simply does not contribute.
   */
  function relativeVolume(bars, inRth, dayIndex, lookbackDays) {
    const n = bars.length
    const barRvol = new Array(n).fill(NaN)
    const cumulativeRvol = new Array(n).fill(NaN)
    const sessions = []
    let current = null
    let day = null

    for (let i = 0; i < n; i++) {
      if (!inRth[i]) continue
      if (current === null || dayIndex[i] !== day) {
        day = dayIndex[i]
        current = { volume: [], cumulative: [] }
        sessions.push(current)
      }
      const raw = bars[i].volume
      const v = Number.isFinite(raw) && raw > 0 ? raw : 0
      const slot = current.volume.length
      current.volume.push(v)
      current.cumulative.push((slot > 0 ? current.cumulative[slot - 1] : 0) + v)

      let sumBar = 0
      let sumCumulative = 0
      let count = 0
      const first = Math.max(0, sessions.length - 1 - lookbackDays)
      for (let d = sessions.length - 2; d >= first; d--) {
        const past = sessions[d]
        if (past.volume.length <= slot) continue
        sumBar += past.volume[slot]
        sumCumulative += past.cumulative[slot]
        count++
      }
      if (count === 0) continue
      const meanBar = sumBar / count
      const meanCumulative = sumCumulative / count
      if (meanBar > 0) barRvol[i] = v / meanBar
      if (meanCumulative > 0) cumulativeRvol[i] = current.cumulative[slot] / meanCumulative
    }
    return { barRvol, cumulativeRvol }
  }

  /* ── the whole study, in one pass ──────────────────────────────────────── */

  function compute(bars, settings, ctx) {
    const n = bars.length
    const tick = tickOf(ctx)
    const zone = zoneOf(settings)
    const spec = sessionOf(settings)

    const openingRangeMinutes = int(settings.openingRangeMinutes, 15, 1, 120)
    const atrLength = int(settings.atrLength, 14, 5, 100)

    const fastEmaLength = int(settings.fastEmaLength, 9, 1, 100)
    const slowEmaLength = int(settings.slowEmaLength, 21, 2, 200)
    const trendSlopeLookback = int(settings.trendSlopeLookback, 5, 1, 30)
    const trendSpreadScale = num(settings.trendSpreadScale, 0.25, 0.05, 2)
    const trendSlopeScale = num(settings.trendSlopeScale, 0.2, 0.05, 2)

    const vwapDistanceScale = num(settings.vwapDistanceScale, 0.35, 0.05, 2)
    const openingRangeBreakScale = num(settings.openingRangeBreakScale, 0.25, 0.05, 2)
    const sessionOpenScale = num(settings.sessionOpenScale, 0.5, 0.05, 3)

    const rsiLength = int(settings.rsiLength, 14, 2, 100)
    const momentumLookback = int(settings.momentumLookback, 5, 1, 30)
    const momentumScale = num(settings.momentumScale, 1, 0.1, 5)
    const momentumDeltaLookback = int(settings.momentumDeltaLookback, 3, 1, 20)
    const momentumDeltaScale = num(settings.momentumDeltaScale, 0.5, 0.1, 2)

    const rvolLookbackDays = int(settings.rvolLookbackDays, 20, 2, 100)
    const participationReturnScale = num(settings.participationReturnScale, 0.5, 0.1, 3)
    const rvolLogScale = num(settings.rvolLogScale, 0.7, 0.1, 3)
    const highRvolThreshold = num(settings.highRvolThreshold, 1.5, 1, 10)
    const rvolDisplayCap = num(settings.rvolDisplayCap, 3, 1, 20)

    const persistenceLength = int(settings.persistenceLength, 12, 3, 60)

    const volatilityShortLength = int(settings.volatilityShortLength, 14, 5, 50)
    const volatilityLongLength = int(settings.volatilityLongLength, 50, 20, 200)
    const volatilityZLookback = int(settings.volatilityZLookback, 100, 30, 500)
    const volatilityZScale = num(settings.volatilityZScale, 1.5, 0.25, 5)

    const includeHigherTimeframes = settings.includeHigherTimeframes !== false
    const htfParams = {
      fastLength: int(settings.htfFastEmaLength, 20, 2, 100),
      slowLength: int(settings.htfSlowEmaLength, 50, 5, 300),
      atrLength: int(settings.htfAtrLength, 14, 5, 100),
      rsiLength,
      slopeLookback: int(settings.htfSlopeLookback, 3, 1, 20),
      pathLookback: int(settings.htfPathLookback, 5, 2, 20),
      persistenceLength: int(settings.htfPersistenceLength, 6, 3, 20),
      spreadScale: num(settings.htfSpreadScale, 0.3, 0.05, 3),
      slopeScale: num(settings.htfSlopeScale, 0.12, 0.02, 1),
      returnScale: num(settings.htfReturnScale, 0.85, 0.1, 3),
    }

    const empty = () => new Array(n).fill(NaN)
    const out = {
      rvol: empty(),
      zero: new Array(n).fill(0),
      context: empty(),
      confidence: empty(),
      rsiMomentum: empty(),
      htfComposite: empty(),
      legacy: empty(),
      regime: new Array(n).fill(REGIME_BALANCED),
      direction: empty(),
      conf: empty(),
      trend: empty(),
      structure: empty(),
      momentum: empty(),
      participation: empty(),
      persistence: empty(),
      volatility: empty(),
      htfScore: empty(),
      htfConviction: empty(),
      htf1h: empty(),
      htf4h: empty(),
      htf1d: empty(),
      htf1w: empty(),
      htfTactical: empty(),
      htfMacro: empty(),
      barRvolOut: empty(),
      cumRvolOut: empty(),
      rth: new Array(n).fill(0),
      orState: new Array(n).fill(0),
    }
    if (n === 0) return out

    const open = bars.map((b) => b.open)
    const high = bars.map((b) => b.high)
    const low = bars.map((b) => b.low)
    const close = bars.map((b) => b.close)
    const times = bars.map((b) => b.time)

    /* session --------------------------------------------------------------- */
    const inRth = spec ? sessionFlags(times, spec, zone) : new Array(n).fill(false)
    const dayIndex = times.map((t) => zonedDayIndex(t, zone))
    const rthStart = new Array(n).fill(false)
    for (let i = 0; i < n; i++) {
      // Pine's first-bar-of-day test is true on bar 0, where the previous day
      // key is `na`, so the first in-session bar of the series anchors too.
      rthStart[i] = inRth[i] && (i === 0 || !inRth[i - 1] || dayIndex[i] !== dayIndex[i - 1])
    }

    const barSeconds = barSecondsOf(bars, ctx)
    const openingRangeTimeframeWarning = barSeconds > openingRangeMinutes * 60

    /* normalization --------------------------------------------------------- */
    const trueRangeAverage = atr(high, low, close, atrLength)
    const atrSafe = new Array(n)
    const atrPct = new Array(n)
    for (let i = 0; i < n; i++) {
      const a = Number.isFinite(trueRangeAverage[i]) ? trueRangeAverage[i] : 0
      atrSafe[i] = Math.max(a, tick)
      atrPct[i] = atrSafe[i] / Math.max(close[i], tick)
    }

    /* session VWAP, session open and the opening range ---------------------- */
    const vwapSource = sourceValues(bars, srcOf(settings.vwapSource, 'hlc3'))
    const sessionVwap = new Array(n).fill(NaN)
    const sessionOpen = new Array(n).fill(NaN)
    const openingRangeHigh = new Array(n).fill(NaN)
    const openingRangeLow = new Array(n).fill(NaN)
    const openingRangeFinal = new Array(n).fill(false)
    const inOpeningRange = new Array(n).fill(false)

    let currentOpen = NaN
    let sumPriceVolume = 0
    let sumVolume = 0
    let rangeEnd = NaN
    let rangeHigh = NaN
    let rangeLow = NaN
    let finalized = false

    for (let i = 0; i < n; i++) {
      if (rthStart[i]) {
        currentOpen = open[i]
        // ta.vwap's anchor resets the running sums on the anchor bar itself.
        sumPriceVolume = 0
        sumVolume = 0
        // Pine's `time` is milliseconds; a bar time here is seconds.
        rangeEnd = times[i] + openingRangeMinutes * 60
        rangeHigh = high[i]
        rangeLow = low[i]
        finalized = false
      }
      // Volume is genuinely optional: an index series carries none, and a
      // weight of 1 turns the VWAP into a plain average instead of a blank.
      const rawVolume = bars[i].volume
      const volume = Number.isFinite(rawVolume) && rawVolume > 0 ? rawVolume : 1
      if (Number.isFinite(vwapSource[i])) {
        sumPriceVolume += vwapSource[i] * volume
        sumVolume += volume
      }
      sessionVwap[i] = sumVolume > 0 ? sumPriceVolume / sumVolume : NaN
      sessionOpen[i] = currentOpen

      const inRange = inRth[i] && Number.isFinite(rangeEnd) && times[i] < rangeEnd
      if (inRange && !rthStart[i]) {
        rangeHigh = Math.max(rangeHigh, high[i])
        rangeLow = Math.min(rangeLow, low[i])
      }
      if (inRth[i] && !inRange && !finalized && Number.isFinite(rangeEnd)) finalized = true

      inOpeningRange[i] = inRange
      openingRangeFinal[i] = finalized
      openingRangeHigh[i] = rangeHigh
      openingRangeLow[i] = rangeLow
    }

    /* trend ----------------------------------------------------------------- */
    // Pine's ta.ema seeds from the SMA of the first `length` values, which is
    // what smaSeededEma does; the plain `ema` here seeds from values[0].
    const fastEma = smaSeededEma(close, fastEmaLength)
    const slowEma = smaSeededEma(close, slowEmaLength)
    const trendScore = new Array(n).fill(NaN)
    for (let i = 0; i < n; i++) {
      const back = i - trendSlopeLookback
      const spreadNorm = (fastEma[i] - slowEma[i]) / atrSafe[i]
      const slowSlopeNorm = back >= 0 ? (slowEma[i] - slowEma[back]) / atrSafe[i] : NaN
      const fastSlopeNorm = back >= 0 ? (fastEma[i] - fastEma[back]) / atrSafe[i] : NaN
      trendScore[i] = clampTo(
        0.55 * bound(spreadNorm / trendSpreadScale) +
          0.3 * bound(slowSlopeNorm / trendSlopeScale) +
          0.15 * bound(fastSlopeNorm / trendSlopeScale),
        -100,
        100
      )
    }

    /* structure ------------------------------------------------------------- */
    const structureScore = new Array(n).fill(NaN)
    for (let i = 0; i < n; i++) {
      const vwapScore =
        inRth[i] && Number.isFinite(sessionVwap[i])
          ? bound(((close[i] - sessionVwap[i]) / atrSafe[i]) / vwapDistanceScale)
          : NaN

      let openingRangeScore = NaN
      if (
        inRth[i] &&
        openingRangeFinal[i] &&
        !openingRangeTimeframeWarning &&
        Number.isFinite(openingRangeHigh[i]) &&
        Number.isFinite(openingRangeLow[i])
      ) {
        const width = Math.max(openingRangeHigh[i] - openingRangeLow[i], tick)
        if (close[i] > openingRangeHigh[i]) {
          openingRangeScore =
            30 + 70 * sat(((close[i] - openingRangeHigh[i]) / atrSafe[i]) / openingRangeBreakScale)
        } else if (close[i] < openingRangeLow[i]) {
          openingRangeScore =
            -30 - 70 * sat(((openingRangeLow[i] - close[i]) / atrSafe[i]) / openingRangeBreakScale)
        } else {
          const position = (2 * (close[i] - openingRangeLow[i])) / width - 1
          openingRangeScore = 30 * clampTo(position, -1, 1)
        }
      }

      const openScore =
        inRth[i] && Number.isFinite(sessionOpen[i])
          ? bound(((close[i] - sessionOpen[i]) / atrSafe[i]) / sessionOpenScale)
          : NaN

      structureScore[i] = weighted([
        [vwapScore, 0.6],
        [openingRangeScore, 0.3],
        [openScore, 0.1],
      ])
    }

    /* momentum -------------------------------------------------------------- */
    const rsiValues = rsi(sourceValues(bars, srcOf(settings.rsiSource, 'close')), rsiLength)
    const rsiMomentumScore = new Array(n).fill(NaN)
    const returnMomentumScore = new Array(n).fill(NaN)
    const momentumScoreColumn = new Array(n).fill(NaN)
    for (let i = 0; i < n; i++) {
      rsiMomentumScore[i] = Number.isFinite(rsiValues[i]) ? bound((rsiValues[i] - 50) / 20) : NaN
      const back = i - momentumLookback
      const previous = back >= 0 ? close[back] : NaN
      const momentumReturn = previous > 0 ? Math.log(close[i] / previous) : NaN
      const expectedMove = atrPct[i] * Math.sqrt(momentumLookback)
      const normalized =
        Number.isFinite(momentumReturn) && expectedMove > 0 ? momentumReturn / expectedMove : NaN
      returnMomentumScore[i] = Number.isFinite(normalized) ? bound(normalized / momentumScale) : NaN
    }
    for (let i = 0; i < n; i++) {
      const back = i - momentumDeltaLookback
      const deltaRaw =
        back >= 0 && Number.isFinite(returnMomentumScore[i]) && Number.isFinite(returnMomentumScore[back])
          ? (returnMomentumScore[i] - returnMomentumScore[back]) / 100
          : NaN
      const deltaScore = Number.isFinite(deltaRaw) ? bound(deltaRaw / momentumDeltaScale) : NaN
      momentumScoreColumn[i] = weighted([
        [returnMomentumScore[i], 0.55],
        [rsiMomentumScore[i], 0.35],
        [deltaScore, 0.1],
      ])
    }

    /* participation --------------------------------------------------------- */
    const { barRvol, cumulativeRvol } = relativeVolume(bars, inRth, dayIndex, rvolLookbackDays)
    const participationScore = new Array(n).fill(NaN)
    const participationQuality = new Array(n).fill(NaN)
    for (let i = 0; i < n; i++) {
      const barRange = Math.max(high[i] - low[i], Math.max(atrSafe[i] * 0.02, tick))
      const closeLocation = clampTo((2 * close[i] - high[i] - low[i]) / barRange, -1, 1)
      const previous = i > 0 ? close[i - 1] : NaN
      const oneBarReturnNorm = previous > 0 && atrPct[i] > 0 ? Math.log(close[i] / previous) / atrPct[i] : NaN
      const returnDirection = Number.isFinite(oneBarReturnNorm)
        ? sat(oneBarReturnNorm / participationReturnScale)
        : 0
      const directionalProxy = clampTo(0.65 * closeLocation + 0.35 * returnDirection, -1, 1)

      const barIntensity =
        Number.isFinite(barRvol[i]) && barRvol[i] > 0
          ? sat(Math.max(Math.log(barRvol[i]), 0) / rvolLogScale)
          : NaN
      const cumulativeIntensity =
        Number.isFinite(cumulativeRvol[i]) && cumulativeRvol[i] > 0
          ? sat(Math.max(Math.log(cumulativeRvol[i]), 0) / rvolLogScale)
          : NaN
      const intensity = weighted([
        [barIntensity, 0.65],
        [cumulativeIntensity, 0.35],
      ])
      if (!Number.isFinite(intensity)) continue
      participationScore[i] = 100 * directionalProxy * intensity
      participationQuality[i] = 100 * intensity
    }

    /* persistence ----------------------------------------------------------- */
    const vwapPersistenceInput = new Array(n).fill(0)
    const emaPersistenceInput = new Array(n).fill(0)
    const returnPersistenceInput = new Array(n).fill(0)
    const rthBarCount = new Array(n).fill(0)
    let counted = 0
    for (let i = 0; i < n; i++) {
      if (rthStart[i]) counted = 1
      else if (inRth[i]) counted += 1
      else counted = 0
      rthBarCount[i] = counted

      vwapPersistenceInput[i] =
        inRth[i] && Number.isFinite(sessionVwap[i]) ? sign(close[i] - sessionVwap[i]) : 0
      emaPersistenceInput[i] = inRth[i] ? sign(fastEma[i] - slowEma[i]) : 0
      const previous = i > 0 ? close[i - 1] : NaN
      returnPersistenceInput[i] = inRth[i] && previous > 0 ? sign(Math.log(close[i] / previous)) : 0
    }
    const vwapPersistenceAverage = sma(vwapPersistenceInput, persistenceLength)
    const emaPersistenceAverage = sma(emaPersistenceInput, persistenceLength)
    const returnPersistenceAverage = sma(returnPersistenceInput, persistenceLength)
    const persistenceScore = new Array(n).fill(NaN)
    for (let i = 0; i < n; i++) {
      if (!inRth[i]) continue
      // Early in a session fewer bars than the window have happened, so the
      // mean is rescaled by how many of them are real.
      const divisor = Math.max(Math.min(persistenceLength, rthBarCount[i]), 1)
      const scale = persistenceLength / divisor
      const blended = weighted([
        [vwapPersistenceAverage[i] * scale, 0.4],
        [emaPersistenceAverage[i] * scale, 0.35],
        [returnPersistenceAverage[i] * scale, 0.25],
      ])
      persistenceScore[i] = Number.isFinite(blended) ? clampTo(100 * blended, -100, 100) : NaN
    }

    /* volatility ------------------------------------------------------------ */
    const shortAtr = atr(high, low, close, volatilityShortLength)
    const longAtr = atr(high, low, close, volatilityLongLength)
    const volatilityRatio = new Array(n).fill(NaN)
    for (let i = 0; i < n; i++) {
      if (Number.isFinite(longAtr[i]) && longAtr[i] > 0) volatilityRatio[i] = shortAtr[i] / longAtr[i]
    }
    // sma and stdev here carry a window containing a gap through as a gap, the
    // way ta.sma and ta.stdev do, so the warmup length matches the source.
    const volatilityMean = sma(volatilityRatio, volatilityZLookback)
    const volatilityDeviation = stdev(volatilityRatio, volatilityZLookback)
    const volatilityScore = new Array(n).fill(NaN)
    const volatilityRelevance = new Array(n).fill(NaN)
    for (let i = 0; i < n; i++) {
      if (!Number.isFinite(volatilityDeviation[i]) || volatilityDeviation[i] <= 0) continue
      const z = (volatilityRatio[i] - volatilityMean[i]) / volatilityDeviation[i]
      if (!Number.isFinite(z)) continue
      volatilityScore[i] = clampTo(50 + 50 * sat(z / volatilityZScale), 0, 100)
      volatilityRelevance[i] = clampTo(100 - 1.5 * Math.abs(volatilityScore[i] - 65), 0, 100)
    }

    /* higher timeframes ------------------------------------------------------ */
    const hour = higherTimeframe(bars, 3600, zone, dayIndex, htfParams, tick)
    const fourHour = higherTimeframe(bars, 14400, zone, dayIndex, htfParams, tick)
    const daily = higherTimeframe(bars, 'D', zone, dayIndex, htfParams, tick)
    const weekly = higherTimeframe(bars, 'W', zone, dayIndex, htfParams, tick)

    const htfScore = new Array(n).fill(NaN)
    const htfConviction = new Array(n).fill(NaN)
    const htfTactical = new Array(n).fill(NaN)
    const htfMacro = new Array(n).fill(NaN)
    const htfWeights = [0.35, 0.3, 0.22, 0.13]
    for (let i = 0; i < n; i++) {
      const scores = [hour.score[i], fourHour.score[i], daily.score[i], weekly.score[i]]
      const qualities = [hour.quality[i], fourHour.quality[i], daily.quality[i], weekly.quality[i]]
      let numerator = 0
      let denominator = 0
      let magnitude = 0
      let qualityNumerator = 0
      let qualityDenominator = 0
      for (let k = 0; k < 4; k++) {
        const w = htfWeights[k]
        if (Number.isFinite(scores[k])) {
          numerator += w * scores[k]
          denominator += w
          magnitude += w * Math.abs(scores[k])
        }
        if (Number.isFinite(qualities[k])) {
          qualityNumerator += w * qualities[k]
          qualityDenominator += w
        }
      }
      if (denominator > 0) htfScore[i] = numerator / denominator
      const coherence = magnitude > 0 ? clampTo(Math.abs(numerator) / magnitude, 0, 1) : NaN
      const averageMagnitude = denominator > 0 ? magnitude / denominator : NaN
      const averageQuality = qualityDenominator > 0 ? qualityNumerator / qualityDenominator : NaN
      const convictionBase = weighted([
        [averageMagnitude, 0.45],
        [averageQuality, 0.55],
      ])
      if (Number.isFinite(convictionBase) && Number.isFinite(coherence)) {
        htfConviction[i] = clampTo(convictionBase * coherence, 0, 100)
      }
      htfTactical[i] = weighted([
        [scores[0], 0.55],
        [scores[1], 0.45],
      ])
      htfMacro[i] = weighted([
        [scores[2], 0.65],
        [scores[3], 0.35],
      ])
    }

    /* the context blend ------------------------------------------------------ */
    const localWeightScale = includeHigherTimeframes ? 0.85 : 1
    const trendWeight = 0.26 * localWeightScale
    const structureWeight = 0.24 * localWeightScale
    const momentumWeight = 0.21 * localWeightScale
    const participationWeight = 0.16 * localWeightScale
    const persistenceWeight = 0.13 * localWeightScale
    const htfWeight = includeHigherTimeframes ? 0.15 : 0

    const contextDirection = new Array(n).fill(NaN)
    const contextConfidence = new Array(n).fill(NaN)
    for (let i = 0; i < n; i++) {
      let numerator = 0
      let denominator = 0
      let magnitude = 0
      const members = [
        [trendScore[i], trendWeight],
        [structureScore[i], structureWeight],
        [momentumScoreColumn[i], momentumWeight],
        [participationScore[i], participationWeight],
        [persistenceScore[i], persistenceWeight],
      ]
      if (htfWeight > 0) members.push([htfScore[i], htfWeight])
      for (const [value, weight] of members) {
        if (!Number.isFinite(value)) continue
        numerator += weight * value
        denominator += weight
        magnitude += weight * Math.abs(value)
      }
      if (denominator > 0) contextDirection[i] = clampTo(numerator / denominator, -100, 100)
      const coherence = magnitude > 0 ? clampTo(Math.abs(numerator) / magnitude, 0, 1) : 0
      const averageMagnitude = denominator > 0 ? magnitude / denominator : 0
      const agreement = clampTo(averageMagnitude * coherence, 0, 100)
      const blended = weighted([
        [agreement, 0.45],
        [participationQuality[i], 0.3],
        [volatilityRelevance[i], 0.15],
        [Number.isFinite(persistenceScore[i]) ? Math.abs(persistenceScore[i]) : NaN, 0.1],
      ])
      contextConfidence[i] = Number.isFinite(blended) ? clampTo(blended, 0, 100) : NaN
    }

    /* the regime latch ------------------------------------------------------- */
    // Pine advances the latch on confirmed bars, which is every historical bar.
    // Advancing it on each bar here reproduces the historical series exactly and
    // keeps calc a pure function of the bars.
    const regime = new Array(n).fill(REGIME_BALANCED)
    let state = REGIME_BALANCED
    for (let i = 0; i < n; i++) {
      if (Number.isFinite(contextDirection[i])) state = updateRegime(state, contextDirection[i])
      regime[i] = state
    }

    /* the v0.1 binary comparison -------------------------------------------- */
    const legacyScore = new Array(n).fill(0)
    for (let i = 0; i < n; i++) {
      const vwapVote =
        !inRth[i] || !Number.isFinite(sessionVwap[i])
          ? 0
          : close[i] > sessionVwap[i] ? 1 : close[i] < sessionVwap[i] ? -1 : 0
      const rsiVote = !Number.isFinite(rsiValues[i])
        ? 0
        : rsiValues[i] >= 55 ? 1 : rsiValues[i] <= 45 ? -1 : 0
      const emaVote = fastEma[i] > slowEma[i] ? 1 : fastEma[i] < slowEma[i] ? -1 : 0
      const orVote =
        !openingRangeFinal[i] || openingRangeTimeframeWarning
          ? 0
          : close[i] > openingRangeHigh[i] ? 1 : close[i] < openingRangeLow[i] ? -1 : 0
      const participationVote =
        !Number.isFinite(barRvol[i]) || barRvol[i] < highRvolThreshold
          ? 0
          : close[i] > open[i] ? 1 : close[i] < open[i] ? -1 : 0
      legacyScore[i] = vwapVote + rsiVote + emaVote + orVote + participationVote
    }

    /* the drawn columns ------------------------------------------------------ */
    const showContextLine = settings.showContextLine !== false
    const showConfidenceLine = settings.showConfidenceLine !== false
    const showRvol = settings.showRvol !== false
    const showRsiMomentum = settings.showRsiMomentum === true
    const showHtfComposite = settings.showHtfComposite === true
    const showLegacyComparison = settings.showLegacyComparison === true

    for (let i = 0; i < n; i++) {
      if (showRvol && Number.isFinite(barRvol[i])) {
        out.rvol[i] = Math.min(barRvol[i] / rvolDisplayCap, 1) * 100
      }
      if (showContextLine) out.context[i] = contextDirection[i]
      if (showConfidenceLine) out.confidence[i] = contextConfidence[i]
      if (showRsiMomentum) out.rsiMomentum[i] = rsiMomentumScore[i]
      if (showHtfComposite) out.htfComposite[i] = htfScore[i]
      if (showLegacyComparison) out.legacy[i] = legacyScore[i] * 20

      out.regime[i] = regime[i]
      out.direction[i] = contextDirection[i]
      out.conf[i] = contextConfidence[i]
      out.trend[i] = trendScore[i]
      out.structure[i] = structureScore[i]
      out.momentum[i] = momentumScoreColumn[i]
      out.participation[i] = participationScore[i]
      out.persistence[i] = persistenceScore[i]
      out.volatility[i] = volatilityScore[i]
      out.htfScore[i] = htfScore[i]
      out.htfConviction[i] = htfConviction[i]
      out.htf1h[i] = hour.score[i]
      out.htf4h[i] = fourHour.score[i]
      out.htf1d[i] = daily.score[i]
      out.htf1w[i] = weekly.score[i]
      out.htfTactical[i] = htfTactical[i]
      out.htfMacro[i] = htfMacro[i]
      out.barRvolOut[i] = barRvol[i]
      out.cumRvolOut[i] = cumulativeRvol[i]
      out.rth[i] = inRth[i] ? 1 : 0
      out.orState[i] = openingRangeTimeframeWarning
        ? 3
        : openingRangeFinal[i] ? 2 : inOpeningRange[i] ? 1 : 0
    }

    return out
  }

  registerIndicator({
    id: 'oa-meridian-options-context',
    name: 'Meridian - Options Context',
    category: 'Meridian',
    placement: 'pane',

    inputs: [
      { key: 'timezone', type: 'text', label: 'Session timezone', default: 'America/New_York', group: '01. Session', tooltip: 'IANA zone the session is read in, for example America/New_York or Asia/Kolkata.' },
      { key: 'session', type: 'text', label: 'Regular session', default: '0930-1600', group: '01. Session', tooltip: 'Exchange wall clock, HHMM-HHMM. Indian equities are 0915-1530.' },
      { key: 'weekdaysOnly', type: 'boolean', label: 'Monday-Friday only', default: true, group: '01. Session' },
      { key: 'openingRangeMinutes', type: 'number', label: 'Opening-range minutes', default: 15, min: 1, max: 120, step: 1, group: '01. Session' },

      { key: 'atrLength', type: 'number', label: 'ATR length', default: 14, min: 5, max: 100, step: 1, group: '02. Normalization' },

      { key: 'fastEmaLength', type: 'number', label: 'Fast EMA', default: 9, min: 1, max: 100, step: 1, group: '03. Trend' },
      { key: 'slowEmaLength', type: 'number', label: 'Slow EMA', default: 21, min: 2, max: 200, step: 1, group: '03. Trend' },
      { key: 'trendSlopeLookback', type: 'number', label: 'Slope lookback', default: 5, min: 1, max: 30, step: 1, group: '03. Trend' },
      { key: 'trendSpreadScale', type: 'number', label: 'EMA spread scale (ATR)', default: 0.25, min: 0.05, max: 2, step: 0.05, group: '03. Trend' },
      { key: 'trendSlopeScale', type: 'number', label: 'EMA slope scale (ATR)', default: 0.2, min: 0.05, max: 2, step: 0.05, group: '03. Trend' },

      { key: 'vwapSource', type: 'source', label: 'RTH VWAP source', default: 'hlc3', group: '04. Structure' },
      { key: 'vwapDistanceScale', type: 'number', label: 'VWAP displacement scale (ATR)', default: 0.35, min: 0.05, max: 2, step: 0.05, group: '04. Structure' },
      { key: 'openingRangeBreakScale', type: 'number', label: 'Opening-range break scale (ATR)', default: 0.25, min: 0.05, max: 2, step: 0.05, group: '04. Structure' },
      { key: 'sessionOpenScale', type: 'number', label: 'RTH-open displacement scale (ATR)', default: 0.5, min: 0.05, max: 3, step: 0.05, group: '04. Structure' },

      { key: 'rsiSource', type: 'source', label: 'RSI source', default: 'close', group: '05. Momentum' },
      { key: 'rsiLength', type: 'number', label: 'RSI length', default: 14, min: 2, max: 100, step: 1, group: '05. Momentum' },
      { key: 'momentumLookback', type: 'number', label: 'Normalized-return lookback', default: 5, min: 1, max: 30, step: 1, group: '05. Momentum' },
      { key: 'momentumScale', type: 'number', label: 'Normalized-return scale', default: 1, min: 0.1, max: 5, step: 0.1, group: '05. Momentum' },
      { key: 'momentumDeltaLookback', type: 'number', label: 'Momentum-change lookback', default: 3, min: 1, max: 20, step: 1, group: '05. Momentum' },
      { key: 'momentumDeltaScale', type: 'number', label: 'Momentum-change scale', default: 0.5, min: 0.1, max: 2, step: 0.05, group: '05. Momentum' },

      { key: 'rvolLookbackDays', type: 'number', label: 'RVOL historical days', default: 20, min: 2, max: 100, step: 1, group: '06. Participation' },
      { key: 'participationReturnScale', type: 'number', label: 'Directional-return scale (ATR)', default: 0.5, min: 0.1, max: 3, step: 0.1, group: '06. Participation' },
      { key: 'rvolLogScale', type: 'number', label: 'RVOL intensity scale', default: 0.7, min: 0.1, max: 3, step: 0.05, group: '06. Participation' },
      { key: 'highRvolThreshold', type: 'number', label: 'High RVOL threshold', default: 1.5, min: 1, max: 10, step: 0.1, group: '06. Participation' },
      { key: 'extremeRvolThreshold', type: 'number', label: 'Extreme RVOL threshold', default: 2, min: 1, max: 20, step: 0.1, group: '06. Participation' },
      { key: 'rvolDisplayCap', type: 'number', label: 'RVOL display cap', default: 3, min: 1, max: 20, step: 0.25, group: '06. Participation' },

      { key: 'persistenceLength', type: 'number', label: 'Persistence bars', default: 12, min: 3, max: 60, step: 1, group: '07. Persistence' },

      { key: 'volatilityShortLength', type: 'number', label: 'Short ATR length', default: 14, min: 5, max: 50, step: 1, group: '08. Volatility' },
      { key: 'volatilityLongLength', type: 'number', label: 'Long ATR length', default: 50, min: 20, max: 200, step: 1, group: '08. Volatility' },
      { key: 'volatilityZLookback', type: 'number', label: 'Volatility history', default: 100, min: 30, max: 500, step: 1, group: '08. Volatility' },
      { key: 'volatilityZScale', type: 'number', label: 'Volatility z-score scale', default: 1.5, min: 0.25, max: 5, step: 0.25, group: '08. Volatility' },

      { key: 'includeHigherTimeframes', type: 'boolean', label: 'Include HTF trend in Context', default: true, group: '09. Higher Timeframes' },
      { key: 'showHigherTimeframeMatrix', type: 'boolean', label: 'Show 1H / 4H / 1D / 1W states', default: true, group: '09. Higher Timeframes' },
      { key: 'htfFastEmaLength', type: 'number', label: 'HTF fast EMA', default: 20, min: 2, max: 100, step: 1, group: '09. Higher Timeframes' },
      { key: 'htfSlowEmaLength', type: 'number', label: 'HTF slow EMA', default: 50, min: 5, max: 300, step: 1, group: '09. Higher Timeframes' },
      { key: 'htfAtrLength', type: 'number', label: 'HTF ATR length', default: 14, min: 5, max: 100, step: 1, group: '09. Higher Timeframes' },
      { key: 'htfSlopeLookback', type: 'number', label: 'HTF EMA slope bars', default: 3, min: 1, max: 20, step: 1, group: '09. Higher Timeframes' },
      { key: 'htfPathLookback', type: 'number', label: 'HTF recent-path bars', default: 5, min: 2, max: 20, step: 1, group: '09. Higher Timeframes' },
      { key: 'htfPersistenceLength', type: 'number', label: 'HTF persistence bars', default: 6, min: 3, max: 20, step: 1, group: '09. Higher Timeframes' },
      { key: 'htfSpreadScale', type: 'number', label: 'HTF EMA spread scale (ATR)', default: 0.3, min: 0.05, max: 3, step: 0.05, group: '09. Higher Timeframes' },
      { key: 'htfSlopeScale', type: 'number', label: 'HTF EMA slope scale (ATR/bar)', default: 0.12, min: 0.02, max: 1, step: 0.01, group: '09. Higher Timeframes' },
      { key: 'htfReturnScale', type: 'number', label: 'HTF path-return scale', default: 0.85, min: 0.1, max: 3, step: 0.05, group: '09. Higher Timeframes' },
      { key: 'htfDirectionalThreshold', type: 'number', label: 'HTF directional threshold', default: 20, min: 5, max: 50, step: 5, group: '09. Higher Timeframes' },

      { key: 'showContextLine', type: 'boolean', label: 'Show Context Direction', default: true, group: '10. Visuals' },
      { key: 'showConfidenceLine', type: 'boolean', label: 'Show Context Confidence', default: true, group: '10. Visuals' },
      { key: 'showRvol', type: 'boolean', label: 'Show RVOL columns', default: true, group: '10. Visuals' },
      { key: 'showRsiMomentum', type: 'boolean', label: 'Show RSI momentum score', default: false, group: '10. Visuals' },
      { key: 'showHtfComposite', type: 'boolean', label: 'Show HTF composite', default: false, group: '10. Visuals' },
      { key: 'showRegimeBackground', type: 'boolean', label: 'Subtle regime background', default: true, group: '10. Visuals' },
      { key: 'regimeBackgroundTransparency', type: 'number', label: 'Regime background transparency', default: 96, min: 85, max: 100, step: 1, group: '10. Visuals' },

      { key: 'showDashboard', type: 'boolean', label: 'Show dashboard', default: true, group: '11. Dashboard' },
      {
        key: 'dashboardMode', type: 'select', label: 'Dashboard mode', default: 'Detailed', group: '11. Dashboard',
        options: [{ label: 'Detailed', value: 'Detailed' }, { label: 'Compact', value: 'Compact' }],
      },
      {
        key: 'dashboardPosition', type: 'select', label: 'Dashboard position', default: 'top-right', group: '11. Dashboard',
        options: [
          { label: 'Top Right', value: 'top-right' },
          { label: 'Top Left', value: 'top-left' },
          { label: 'Bottom Right', value: 'bottom-right' },
          { label: 'Bottom Left', value: 'bottom-left' },
        ],
      },
      {
        key: 'dashboardSize', type: 'select', label: 'Dashboard text size', default: 'Small', group: '11. Dashboard',
        options: [
          { label: 'Tiny', value: 'Tiny' },
          { label: 'Small', value: 'Small' },
          { label: 'Normal', value: 'Normal' },
        ],
      },

      { key: 'enableAlerts', type: 'boolean', label: 'Enable alert conditions', default: true, group: '12. Alerts' },
      { key: 'highConfidenceDirectionThreshold', type: 'number', label: 'High-confidence direction threshold', default: 55, min: 20, max: 100, step: 5, group: '12. Alerts' },
      { key: 'highConfidenceThreshold', type: 'number', label: 'High-confidence confidence threshold', default: 60, min: 20, max: 100, step: 5, group: '12. Alerts' },
      { key: 'contextFailureWindow', type: 'number', label: 'Strong-regime failure window (bars)', default: 12, min: 2, max: 50, step: 1, group: '12. Alerts' },

      { key: 'showLegacyComparison', type: 'boolean', label: 'Show v0.1 binary-score comparison', default: false, group: '13. Research' },
    ],

    plots: [
      {
        key: 'rvol',
        type: 'column',
        title: 'RVOL normalized',
        style: { color: withAlpha(NEUTRAL, 0.12) },
        // The source tints each column by the sign of the participation score.
        colorBy({ index, values }) {
          const p = values.participation?.[index]
          if (!Number.isFinite(p)) return withAlpha(NEUTRAL, 0.12)
          return p >= 0 ? withAlpha(BULLISH, 0.18) : withAlpha(BEARISH, 0.18)
        },
      },
      // The fill baseline, invisible in the source and invisible here. The
      // visible zero line is the 'Balanced' reference level below.
      { key: 'zero', type: 'line', title: 'Context Fill Baseline', style: { color: withAlpha(NEUTRAL, 0), lineWidth: 1 } },
      {
        key: 'context',
        type: 'line',
        title: 'Context Direction',
        style: { color: NEUTRAL, lineWidth: 3 },
        colorBy({ index, values }) {
          const r = values.regime?.[index]
          return regimeColor(Number.isFinite(r) ? r : REGIME_BALANCED)
        },
      },
      { key: 'confidence', type: 'line', title: 'Confidence Line', style: { color: withAlpha(LIGHT_PURPLE, 0.85), lineWidth: 1 } },
      { key: 'rsiMomentum', type: 'line', title: 'RSI Momentum', style: { color: withAlpha(NEON_PURPLE, 0.75), lineWidth: 1 } },
      { key: 'htfComposite', type: 'line', title: 'HTF Composite', style: { color: withAlpha(HTF_COLOR, 0.8), lineWidth: 2 } },
      { key: 'legacy', type: 'line', title: 'Legacy v0.1 Score x20', style: { color: withAlpha(LEGACY_COLOR, 0.7), lineWidth: 1 } },
    ],

    // The source fills between the context line and zero in the regime colour.
    // A fill takes one colour per side rather than one per bar, so the tint is
    // the bullish / bearish pair; the line itself still carries all seven
    // regime colours through colorBy.
    fills: [{ between: ['context', 'zero'], colorUp: BULLISH, colorDown: BEARISH, opacity: 0.09 }],

    calc(bars, settings, store, ctx) {
      const out = compute(bars, settings, ctx)
      const columns = {}
      for (const key of Object.keys(out)) columns[key] = nulls(out[key])
      return columns
    },

    // The source's invisible +/-100 hlines exist to pin the scale; a fixed
    // range does the same and every column here lives inside it.
    range: () => ({ min: -105, max: 105 }),

    levels: () => [
      { price: 75, title: '+75 Strong Bull', color: withAlpha(STRONG_BULL_COLOR, 0.3), lineStyle: 'dotted' },
      { price: 45, title: '+45 Bull', color: withAlpha(BULLISH, 0.22), lineStyle: 'dotted' },
      { price: 20, title: '+20 Bull Lean', color: withAlpha(BULLISH, 0.12), lineStyle: 'dotted' },
      { price: 0, title: 'Balanced', color: withAlpha(NEUTRAL, 0.45), lineStyle: 'dashed' },
      { price: -20, title: '-20 Bear Lean', color: withAlpha(BEARISH, 0.12), lineStyle: 'dotted' },
      { price: -45, title: '-45 Bear', color: withAlpha(BEARISH, 0.22), lineStyle: 'dotted' },
      { price: -75, title: '-75 Strong Bear', color: withAlpha(STRONG_BEAR_COLOR, 0.3), lineStyle: 'dotted' },
    ],

    background({ bars, values, settings }) {
      if (settings.showRegimeBackground === false) return bars.map(() => null)
      const transparency = Math.max(85, Math.min(100, Math.floor(Number(settings.regimeBackgroundTransparency) || 96)))
      const alpha = (100 - transparency) / 100
      if (alpha <= 0) return bars.map(() => null)
      return bars.map((_, i) => {
        const r = values.regime?.[i]
        if (!Number.isFinite(r)) return null
        return withAlpha(regimeColor(r), alpha)
      })
    },

    table({ bars, values, settings }) {
      if (settings.showDashboard === false || bars.length === 0) return null
      const i = bars.length - 1
      const at = (key) => {
        const v = values[key]?.[i]
        return v == null ? NaN : v
      }

      const highRvol = Math.max(1, Math.min(10, Number(settings.highRvolThreshold) || 1.5))
      const extremeRvol = Math.max(1, Math.min(20, Number(settings.extremeRvolThreshold) || 2))
      const threshold = Math.max(5, Math.min(50, Number(settings.htfDirectionalThreshold) || 20))
      const detailed = String(settings.dashboardMode ?? 'Detailed') !== 'Compact'
      const size = String(settings.dashboardSize ?? 'Small')
      const fontSize = size === 'Normal' ? 13 : size === 'Tiny' ? 9 : 11

      const direction = at('direction')
      const confidence = at('conf')
      const state = Number.isFinite(at('regime')) ? at('regime') : REGIME_BALANCED
      const htf = at('htfScore')
      const conviction = at('htfConviction')
      const scores = [at('htf1h'), at('htf4h'), at('htf1d'), at('htf1w')]
      const breadth = breadthText(scores, threshold)
      const zone = zonePreference(direction, confidence)
      const volatility = at('volatility')
      const bar = at('barRvolOut')
      const cumulative = at('cumRvolOut')
      const orState = at('orState')

      const head = (text, align) => ({ text, textColor: '#000000', bgColor: withAlpha(NEON_PURPLE, 0.88), bold: true, align })
      const label = (text, alt) => ({ text, textColor: NEUTRAL, bgColor: alt ? PANEL_ALT : PANEL, align: 'left' })
      const value = (text, colour, alt) => ({ text, textColor: colour, bgColor: alt ? PANEL_ALT : PANEL, align: 'right' })

      const rows = [
        [head('MERIDIAN CONTEXT', 'left'), head('v0.2.1', 'right'), head(regimeText(state), 'right')],
        [label('Direction', false), value(scoreText(direction), scoreColor(direction), false), value(regimeText(state), regimeColor(state), false)],
        [
          label('Confidence', true),
          value(Number.isFinite(confidence) ? String(Math.round(confidence)) : 'n/a', LIGHT_PURPLE, true),
          value(confidenceText(confidence), LIGHT_PURPLE, true),
        ],
        [
          label('Levels Bias', false),
          value('', NEUTRAL, false),
          value(levelsBiasText(direction, confidence), zone > 0 ? BULLISH : zone < 0 ? BEARISH : NEUTRAL, false),
        ],
      ]

      if (detailed) {
        const component = (name, key, alt) => {
          const v = at(key)
          return [label(name, alt), value(scoreText(v), scoreColor(v), alt), value(componentText(v), scoreColor(v), alt)]
        }
        rows.push(component('Trend', 'trend', true))
        rows.push(component('Structure', 'structure', false))
        rows.push(component('Momentum', 'momentum', true))
        rows.push(component('Participation', 'participation', false))
        rows.push(component('Persistence', 'persistence', true))
        rows.push(component('HTF Composite', 'htfScore', false))
        rows.push([
          label('HTF Conviction', true),
          value(Number.isFinite(conviction) ? String(Math.round(conviction)) : 'n/a', LIGHT_PURPLE, true),
          value(breadth, scoreColor(htf), true),
        ])
        if (settings.showHigherTimeframeMatrix !== false) {
          rows.push([
            label('1H / 4H', false),
            value(`${scoreText(scores[0])} / ${scoreText(scores[1])}`, NEUTRAL, false),
            value(`${componentText(scores[0])} / ${componentText(scores[1])}`, scoreColor(at('htfTactical')), false),
          ])
          rows.push([
            label('1D / 1W', true),
            value(`${scoreText(scores[2])} / ${scoreText(scores[3])}`, NEUTRAL, true),
            value(`${componentText(scores[2])} / ${componentText(scores[3])}`, scoreColor(at('htfMacro')), true),
          ])
        }
        rows.push([
          label('RVOL Bar / Cum', false),
          value(`${ratioText(bar)} / ${ratioText(cumulative)}`, NEUTRAL, false),
          value(rvolState(bar, highRvol, extremeRvol), Number.isFinite(bar) && bar >= highRvol ? NEON_PURPLE : NEUTRAL, false),
        ])
        rows.push([
          label('Volatility', true),
          value(Number.isFinite(volatility) ? String(Math.round(volatility)) : 'n/a', NEUTRAL, true),
          value(volatilityText(volatility), volatility >= 60 ? NEON_PURPLE : NEUTRAL, true),
        ])
        rows.push([
          label('Session', false),
          value(at('rth') === 1 ? 'RTH' : 'OUTSIDE', at('rth') === 1 ? BULLISH : NEUTRAL, false),
          value(
            orState === 3 ? 'OR: LOWER TF' : orState === 2 ? 'OR: FINAL' : orState === 1 ? 'OR: FORMING' : 'OR: n/a',
            NEUTRAL,
            false
          ),
        ])
      } else {
        rows.push([
          label('HTF', true),
          value(scoreText(htf), scoreColor(htf), true),
          value(Number.isFinite(conviction) ? `Q ${Math.round(conviction)} - ${breadth}` : 'n/a', scoreColor(htf), true),
        ])
        rows.push([
          label('RVOL', false),
          value(ratioText(bar), NEUTRAL, false),
          value(rvolState(bar, highRvol, extremeRvol), Number.isFinite(bar) && bar >= highRvol ? NEON_PURPLE : NEUTRAL, false),
        ])
        rows.push([
          label('Volatility', true),
          value(Number.isFinite(volatility) ? String(Math.round(volatility)) : 'n/a', NEUTRAL, true),
          value(volatilityText(volatility), volatility >= 60 ? NEON_PURPLE : NEUTRAL, true),
        ])
      }

      return {
        rows,
        options: {
          position: String(settings.dashboardPosition ?? 'top-right'),
          fontSize,
          borderColor: withAlpha(NEUTRAL, 0.12),
          borderWidth: 1,
          cellWidth: [118, 96, 132],
          cellHeight: fontSize + 8,
        },
      }
    },

    alerts: [
      {
        id: 'meridian-strong-bull',
        title: 'Strong Bull Context',
        message: 'Entered Strong Bull context.',
        when: ({ values, settings, index }) => enteredState(values, settings, index, REGIME_STRONG_BULL),
      },
      {
        id: 'meridian-strong-bear',
        title: 'Strong Bear Context',
        message: 'Entered Strong Bear context.',
        when: ({ values, settings, index }) => enteredState(values, settings, index, REGIME_STRONG_BEAR),
      },
      {
        id: 'meridian-bullish-transition',
        title: 'Bullish Context Transition',
        message: 'Transitioned into bullish context.',
        when: ({ values, settings, index }) => {
          if (settings.enableAlerts === false || index < 1) return false
          const now = values.regime?.[index]
          const previous = values.regime?.[index - 1]
          if (!Number.isFinite(now) || !Number.isFinite(previous)) return false
          return now > REGIME_BALANCED && previous <= REGIME_BALANCED
        },
      },
      {
        id: 'meridian-bearish-transition',
        title: 'Bearish Context Transition',
        message: 'Transitioned into bearish context.',
        when: ({ values, settings, index }) => {
          if (settings.enableAlerts === false || index < 1) return false
          const now = values.regime?.[index]
          const previous = values.regime?.[index - 1]
          if (!Number.isFinite(now) || !Number.isFinite(previous)) return false
          return now < REGIME_BALANCED && previous >= REGIME_BALANCED
        },
      },
      {
        id: 'meridian-high-confidence',
        title: 'High-Confidence Directional Context',
        message: 'Reached a high-confidence directional context.',
        when: ({ values, settings, index }) => {
          if (settings.enableAlerts === false || index < 1) return false
          const directionThreshold = Math.max(20, Math.min(100, Number(settings.highConfidenceDirectionThreshold) || 55))
          const confidenceThreshold = Math.max(20, Math.min(100, Number(settings.highConfidenceThreshold) || 60))
          const raw = (k) => {
            const d = values.direction?.[k]
            const c = values.conf?.[k]
            if (!Number.isFinite(d) || !Number.isFinite(c)) return false
            return Math.abs(d) >= directionThreshold && c >= confidenceThreshold
          }
          return raw(index) && !raw(index - 1)
        },
      },
      {
        id: 'meridian-aligned-rvol',
        title: 'Aligned RVOL Surge',
        message: 'High-RVOL bar aligned with Context Direction.',
        when: ({ values, settings, index }) => {
          if (settings.enableAlerts === false || index < 1) return false
          const high = Math.max(1, Math.min(10, Number(settings.highRvolThreshold) || 1.5))
          const raw = (k) => {
            const rvol = values.barRvolOut?.[k]
            const participation = values.participation?.[k]
            const direction = values.direction?.[k]
            if (!Number.isFinite(rvol) || rvol < high) return false
            if (!Number.isFinite(participation) || !Number.isFinite(direction)) return false
            if (Math.abs(direction) < 20) return false
            return sign(participation) === sign(direction)
          }
          return raw(index) && !raw(index - 1)
        },
      },
      {
        id: 'meridian-bull-failure',
        title: 'Bull Context Failure',
        message: 'Lost a recent Strong Bull context inside the failure window.',
        when: ({ values, settings, index }) => contextFailure(values, settings, index, 1),
      },
      {
        id: 'meridian-bear-failure',
        title: 'Bear Context Failure',
        message: 'Lost a recent Strong Bear context inside the failure window.',
        when: ({ values, settings, index }) => contextFailure(values, settings, index, -1),
      },
    ],
  })

  /** A regime latch that has just moved into `target`. */
  function enteredState(values, settings, index, target) {
    if (settings.enableAlerts === false || index < 1) return false
    const now = values.regime?.[index]
    const previous = values.regime?.[index - 1]
    if (!Number.isFinite(now) || !Number.isFinite(previous)) return false
    return now === target && previous !== target
  }

  /**
   * The source remembers the bar a strong regime was entered on and fires when
   * direction falls back through +/-20 within the window. Scanning back over
   * the window finds the same entry, because an older one is out of it anyway.
   */
  function contextFailure(values, settings, index, side) {
    if (settings.enableAlerts === false || index < 1) return false
    const window = Math.max(2, Math.min(50, Math.floor(Number(settings.contextFailureWindow) || 12)))
    const now = values.direction?.[index]
    const previous = values.direction?.[index - 1]
    if (!Number.isFinite(now) || !Number.isFinite(previous)) return false
    if (side > 0 ? !(now < 20 && previous >= 20) : !(now > -20 && previous <= -20)) return false

    const target = side > 0 ? REGIME_STRONG_BULL : REGIME_STRONG_BEAR
    const first = Math.max(1, index - window)
    for (let j = index; j >= first; j--) {
      const state = values.regime?.[j]
      const before = values.regime?.[j - 1]
      if (!Number.isFinite(state) || !Number.isFinite(before)) continue
      if (state === target && before !== target) return true
    }
    return false
  }
}
