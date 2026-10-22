/**
 * Meridian Futures Context - ported to openalgo-charts from Pine Script v6.
 *
 * Source: https://github.com/sukesan7/meridian-indicators/blob/82bfd140decb5439c2db0be840f9deaf5cde24b0/src/futures/meridian-futures-context.pine
 * Repo:   sukesan7/meridian-indicators
 * License: MPL-2.0
 * SPDX-FileCopyrightText: (c) sukesan7
 * SPDX-FileCopyrightText: (c) 2026 marketcalls (port to openalgo-charts)
 * SPDX-License-Identifier: MPL-2.0
 *
 * A session context study for index futures. It measures participation against
 * a same-time-of-day volume baseline built from prior sessions, realized
 * volatility against its own baseline, location and dispersion around the
 * session VWAP, EMA structure and trend quality, then folds all of it into a
 * single regime verdict with a confidence score.
 */

export default function ({
  registerIndicator,
  sourceValues,
  sma,
  stdev,
  smaSeededEma,
  atr,
  trueRange,
  nulls,
  sessionFlags,
  utcSecondsToZonedParts,
  zonedWallClockToUtcSeconds,
  isValidTimezone,
  intervalToSeconds,
  withAlpha,
}) {
  // Pine defaults for the theme colours. An indicator does not declare colour
  // inputs here, the chart generates them per plot. The histogram ramp below is
  // the one place the source picks a colour per bar, so those stay as constants
  // rather than becoming settings.
  const COLOR_HISTOGRAM_BULL = '#15803d'
  const COLOR_HISTOGRAM_BEAR = '#b91c1c'
  const COLOR_NEUTRAL = '#94a3b8'
  const COLOR_PARTICIPATION = '#2dd4bf'
  const COLOR_VOLATILITY = '#f472b6'
  const COLOR_SECONDARY = '#6366f1'

  const DEFAULT_SESSION = '0930-1600:23456'
  const DEFAULT_TZ = 'America/New_York'
  const MAX_RTH_SLOTS = 500
  const DIRECTION_MAXIMUM = 4.2
  const SOURCE_NAMES = ['open', 'high', 'low', 'close', 'hl2', 'hlc3', 'ohlc4', 'volume']

  const REGIME_TEXT = {
    2: 'Bull Expansion',
    1: 'Bull Trend',
    '-1': 'Bear Trend',
    '-2': 'Bear Expansion',
    3: 'Balanced Rotation',
    4: 'Compression',
    5: 'Volatility Expansion',
    9: 'Outside RTH',
    0: 'Transition',
  }
  const EMA_TEXT = ['Compressed', 'Bull Expansion', 'Bear Expansion', 'Bull Pullback',
    'Bear Pullback', 'Bull Stack', 'Bear Stack', 'Tangled']
  const VWAP_TEXT = ['Inactive', 'Rotating', 'Above and rising', 'Below and falling', 'Above VWAP', 'Below VWAP']
  const PARTICIPATION_TEXT = ['Inactive', 'Warming Up', 'Extreme', 'Elevated', 'Quiet', 'Normal']
  const VOLATILITY_TEXT = ['Warming Up', 'Expanding', 'Contracting', 'Normal']
  const TREND_TEXT = ['Strong', 'Weak', 'Moderate']
  const RANGE_TEXT = ['Inactive', 'Warming Up', 'Expanded', 'Compressed', 'Normal']
  const PHASE_TEXT = ['Outside RTH', 'Opening Drive', 'Price Discovery', 'Midday', 'Late Session', 'Power Hour']

  // A cleared number field arrives as '', and Number('') is 0, which is a legal
  // value for several of these. Fall back to the declared default first.
  const num = (value, fallback, min, max) => {
    if (value === '' || value === null || value === undefined) return fallback
    const x = Number(value)
    if (!Number.isFinite(x)) return fallback
    return Math.min(max, Math.max(min, x))
  }
  const int = (value, fallback, min, max) => Math.round(num(value, fallback, min, max))
  const pickSource = (value, fallback) =>
    (typeof value === 'string' && SOURCE_NAMES.includes(value) ? value : fallback)

  // Pine's math.max/math.min propagate na, and JavaScript's propagate NaN, so
  // f_clamp carries a warmup gap through every score exactly as the source does.
  const fClamp = (value, lower, upper) => Math.max(lower, Math.min(upper, value))
  const nz = (value) => (Number.isFinite(value) ? value : 0)
  const safeRatio = (numerator, denominator) =>
    (Number.isFinite(numerator) && Number.isFinite(denominator) && Math.abs(denominator) > 1e-12
      ? numerator / denominator
      : NaN)

  // f_zscore. sma and stdev are both NaN-strict over their window, which is
  // what Pine does, so the warmup length matches without help.
  const zscore = (values, length) => {
    const mean = sma(values, length)
    const deviation = stdev(values, length)
    const out = new Array(values.length).fill(NaN)
    for (let i = 0; i < values.length; i++) {
      if (!Number.isFinite(deviation[i]) || deviation[i] <= 1e-12) continue
      if (!Number.isFinite(values[i]) || !Number.isFinite(mean[i])) continue
      out[i] = (values[i] - mean[i]) / deviation[i]
    }
    return out
  }

  /**
   * Pine's ta.rma: seeded by the SMA of the first `length` values and restarted
   * whenever the input goes na. The library's own rma poisons permanently on a
   * leading NaN, and every Wilder series inside ta.dmi starts from ta.change,
   * which is na on bar 0, so the DMI needs this version.
   */
  const pineRma = (values, length) => {
    const size = values.length
    const out = new Array(size).fill(NaN)
    if (length <= 0) return out
    const alpha = 1 / length
    let prev = NaN
    for (let i = 0; i < size; i++) {
      const x = values[i]
      if (Number.isFinite(prev)) {
        if (!Number.isFinite(x)) {
          prev = NaN
          continue
        }
        prev = alpha * x + (1 - alpha) * prev
        out[i] = prev
      } else if (i >= length - 1) {
        let sum = 0
        let ok = true
        for (let j = i - length + 1; j <= i; j++) {
          const y = values[j]
          if (!Number.isFinite(y)) {
            ok = false
            break
          }
          sum += y
        }
        if (ok) {
          prev = sum / length
          out[i] = prev
        }
      }
    }
    return out
  }

  /** ta.dmi(diLength, adxSmoothing), including the fixnan on the two DI legs. */
  const dmi = (high, low, close, diLength, adxSmoothing) => {
    const size = close.length
    const tr = trueRange(high, low, close)
    const plusDM = new Array(size).fill(NaN)
    const minusDM = new Array(size).fill(NaN)
    for (let i = 1; i < size; i++) {
      const up = high[i] - high[i - 1]
      const down = -(low[i] - low[i - 1])
      plusDM[i] = up > down && up > 0 ? up : 0
      minusDM[i] = down > up && down > 0 ? down : 0
    }
    const trur = pineRma(tr, diLength)
    const smoothPlus = pineRma(plusDM, diLength)
    const smoothMinus = pineRma(minusDM, diLength)

    const plusDI = new Array(size).fill(NaN)
    const minusDI = new Array(size).fill(NaN)
    let lastPlus = NaN
    let lastMinus = NaN
    for (let i = 0; i < size; i++) {
      const range = trur[i]
      const usable = Number.isFinite(range) && Math.abs(range) > 1e-12
      const p = usable && Number.isFinite(smoothPlus[i]) ? (100 * smoothPlus[i]) / range : NaN
      const m = usable && Number.isFinite(smoothMinus[i]) ? (100 * smoothMinus[i]) / range : NaN
      if (Number.isFinite(p)) lastPlus = p
      if (Number.isFinite(m)) lastMinus = m
      plusDI[i] = lastPlus
      minusDI[i] = lastMinus
    }

    const dx = new Array(size).fill(NaN)
    for (let i = 0; i < size; i++) {
      const p = plusDI[i]
      const m = minusDI[i]
      if (!Number.isFinite(p) || !Number.isFinite(m)) continue
      const total = p + m
      dx[i] = Math.abs(p - m) / (total === 0 ? 1 : total)
    }
    const smoothed = pineRma(dx, adxSmoothing)
    const adx = new Array(size).fill(NaN)
    for (let i = 0; i < size; i++) {
      if (Number.isFinite(smoothed[i])) adx[i] = 100 * smoothed[i]
    }
    return { plusDI, minusDI, adx }
  }

  /**
   * timeframe.in_seconds(). ctx.interval is authoritative when the host supplies
   * one, otherwise the bars say what the spacing is and the median positive gap
   * ignores the overnight break.
   */
  const timeframeSeconds = (bars, ctx) => {
    const declared = ctx && typeof ctx.interval === 'string' ? ctx.interval : ''
    if (declared !== '') {
      try {
        const seconds = intervalToSeconds(declared)
        if (Number.isFinite(seconds) && seconds > 0) return seconds
      } catch {
        // An interval the library does not know: fall through to the bars.
      }
    }
    const gaps = []
    for (let i = 1; i < bars.length; i++) {
      const delta = bars[i].time - bars[i - 1].time
      if (Number.isFinite(delta) && delta > 0) gaps.push(delta)
    }
    if (gaps.length === 0) return 0
    gaps.sort((a, b) => a - b)
    return gaps[Math.floor(gaps.length / 2)]
  }

  const trimZeros = (text) => (text.indexOf('.') >= 0 ? text.replace(/0+$/, '').replace(/\.$/, '') : text)
  const numberText = (value, decimals) =>
    (Number.isFinite(value) ? trimZeros(value.toFixed(decimals)) : 'n/a')
  const signedText = (value, decimals) =>
    (Number.isFinite(value) ? (value > 0 ? '+' : '') + trimZeros(value.toFixed(decimals)) : 'n/a')
  const ratioText = (value) => (Number.isFinite(value) ? trimZeros(value.toFixed(2)) + 'x' : 'n/a')

  registerIndicator({
    id: 'oa-meridian-futures-context',
    name: 'Meridian Futures Context',
    category: 'Meridian',
    placement: 'pane',

    inputs: [
      { key: 'indicatorEnabled', type: 'boolean', label: 'Enable indicator', default: true, group: '01 - General' },
      {
        key: 'sessionTimezone',
        type: 'text',
        label: 'Analysis time zone',
        default: 'America/New_York',
        group: '01 - General',
        tooltip: 'Use an IANA time zone. America/New_York is recommended for CME index futures.',
      },
      {
        key: 'classifyOutsideRTH',
        type: 'boolean',
        label: 'Classify outside RTH',
        default: false,
        group: '01 - General',
        tooltip: 'When disabled, the dashboard reports Outside RTH while participation metrics pause. Technical metrics continue calculating.',
      },

      {
        key: 'rthSession',
        type: 'text',
        label: 'RTH session',
        default: '0930-1600:23456',
        group: '02 - Session and Baselines',
        tooltip: 'Session spec as HHMM-HHMM:days, with 1 for Sunday through 7 for Saturday.',
      },
      { key: 'rthOpenHour', type: 'number', label: 'RTH open hour', default: 9, min: 0, max: 23, step: 1, group: '02 - Session and Baselines' },
      { key: 'rthOpenMinute', type: 'number', label: 'RTH open minute', default: 30, min: 0, max: 59, step: 1, group: '02 - Session and Baselines' },
      {
        key: 'baselineSessions',
        type: 'number',
        label: 'Historical sessions',
        default: 40,
        min: 5,
        max: 60,
        step: 1,
        group: '02 - Session and Baselines',
        tooltip: 'Number of prior sessions retained for each same-time chart slot.',
      },
      { key: 'minimumBaselineSamples', type: 'number', label: 'Minimum samples before display', default: 10, min: 3, max: 40, step: 1, group: '02 - Session and Baselines' },
      {
        key: 'maximumSupportedMinutes',
        type: 'number',
        label: 'Maximum supported chart timeframe',
        default: 30,
        min: 1,
        max: 60,
        step: 1,
        group: '02 - Session and Baselines',
        tooltip: 'Same-time RVOL is intended for minute-based intraday charts. 1m, 5m and 15m are recommended.',
      },

      { key: 'elevatedRvolThreshold', type: 'number', label: 'Elevated bar RVOL', default: 1.25, min: 1, max: 5, step: 0.05, group: '03 - Participation and RVOL' },
      { key: 'extremeRvolThreshold', type: 'number', label: 'Extreme bar RVOL', default: 1.75, min: 1, max: 10, step: 0.05, group: '03 - Participation and RVOL' },
      { key: 'elevatedCumulativeRvol', type: 'number', label: 'Elevated cumulative RVOL', default: 1.15, min: 1, max: 5, step: 0.05, group: '03 - Participation and RVOL' },
      { key: 'quietRvolThreshold', type: 'number', label: 'Quiet RVOL', default: 0.75, min: 0.1, max: 1, step: 0.05, group: '03 - Participation and RVOL' },

      { key: 'realizedVolLength', type: 'number', label: 'Rolling return window', default: 30, min: 5, max: 300, step: 1, group: '04 - Realized Volatility' },
      { key: 'realizedVolBaselineLength', type: 'number', label: 'Volatility baseline length', default: 150, min: 20, max: 1000, step: 1, group: '04 - Realized Volatility' },
      { key: 'realizedVolZLength', type: 'number', label: 'Volatility z-score length', default: 150, min: 20, max: 1000, step: 1, group: '04 - Realized Volatility' },
      { key: 'volatilityExpansionRatio', type: 'number', label: 'Expansion ratio', default: 1.2, min: 1.01, max: 5, step: 0.05, group: '04 - Realized Volatility' },
      { key: 'volatilityContractionRatio', type: 'number', label: 'Contraction ratio', default: 0.8, min: 0.1, max: 0.99, step: 0.05, group: '04 - Realized Volatility' },

      { key: 'vwapSource', type: 'source', label: 'VWAP source', default: 'hlc3', group: '05 - VWAP Context' },
      { key: 'vwapSlopeLookback', type: 'number', label: 'VWAP slope lookback', default: 5, min: 1, max: 100, step: 1, group: '05 - VWAP Context' },
      { key: 'vwapCrossLookback', type: 'number', label: 'VWAP crossing lookback', default: 20, min: 5, max: 200, step: 1, group: '05 - VWAP Context' },
      { key: 'strongVwapSlopeAtr', type: 'number', label: 'Strong VWAP slope (ATR)', default: 0.12, min: 0.01, max: 2, step: 0.01, group: '05 - VWAP Context' },
      { key: 'vwapRotationZ', type: 'number', label: 'Rotation distance (sigma)', default: 0.55, min: 0.1, max: 3, step: 0.05, group: '05 - VWAP Context' },
      { key: 'rotationCrossTarget', type: 'number', label: 'Crosses indicating rotation', default: 3, min: 1, max: 20, step: 1, group: '05 - VWAP Context' },

      { key: 'emaSource', type: 'source', label: 'EMA source', default: 'close', group: '06 - EMA Structure' },
      { key: 'emaFastLength', type: 'number', label: 'Fast EMA', default: 9, min: 1, max: 200, step: 1, group: '06 - EMA Structure' },
      { key: 'emaMidLength', type: 'number', label: 'Mid EMA', default: 20, min: 2, max: 300, step: 1, group: '06 - EMA Structure' },
      { key: 'emaSlowLength', type: 'number', label: 'Slow EMA', default: 50, min: 3, max: 500, step: 1, group: '06 - EMA Structure' },
      { key: 'emaSlopeLookback', type: 'number', label: 'Slope lookback', default: 5, min: 1, max: 100, step: 1, group: '06 - EMA Structure' },
      { key: 'emaCompressionAtr', type: 'number', label: 'Compression spread (ATR)', default: 0.18, min: 0.01, max: 3, step: 0.01, group: '06 - EMA Structure' },
      { key: 'emaExpansionAtr', type: 'number', label: 'Expansion spread (ATR)', default: 0.65, min: 0.05, max: 5, step: 0.05, group: '06 - EMA Structure' },

      { key: 'atrLength', type: 'number', label: 'ATR length', default: 14, min: 2, max: 200, step: 1, group: '07 - Trend Quality' },
      { key: 'diLength', type: 'number', label: 'DI length', default: 14, min: 2, max: 100, step: 1, group: '07 - Trend Quality' },
      { key: 'adxSmoothing', type: 'number', label: 'ADX smoothing', default: 14, min: 2, max: 100, step: 1, group: '07 - Trend Quality' },
      { key: 'weakAdx', type: 'number', label: 'Weak ADX', default: 17, min: 1, max: 50, step: 0.5, group: '07 - Trend Quality' },
      { key: 'strongAdx', type: 'number', label: 'Strong ADX', default: 28, min: 5, max: 80, step: 0.5, group: '07 - Trend Quality' },
      { key: 'efficiencyLength', type: 'number', label: 'Directional efficiency length', default: 20, min: 2, max: 300, step: 1, group: '07 - Trend Quality' },
      { key: 'weakEfficiency', type: 'number', label: 'Weak efficiency', default: 0.22, min: 0.01, max: 0.9, step: 0.01, group: '07 - Trend Quality' },
      { key: 'strongEfficiency', type: 'number', label: 'Strong efficiency', default: 0.55, min: 0.05, max: 1, step: 0.01, group: '07 - Trend Quality' },

      { key: 'directionThreshold', type: 'number', label: 'Directional threshold', default: 0.34, min: 0.05, max: 0.9, step: 0.01, group: '09 - Regime Engine' },
      { key: 'trendThreshold', type: 'number', label: 'Trend-quality threshold', default: 0.54, min: 0.05, max: 0.95, step: 0.01, group: '09 - Regime Engine' },
      { key: 'expansionThreshold', type: 'number', label: 'Expansion threshold', default: 0.56, min: 0.05, max: 0.95, step: 0.01, group: '09 - Regime Engine' },
      { key: 'compressionThreshold', type: 'number', label: 'Compression threshold', default: 0.62, min: 0.05, max: 0.95, step: 0.01, group: '09 - Regime Engine' },
      { key: 'balanceThreshold', type: 'number', label: 'Balance threshold', default: 0.58, min: 0.05, max: 0.95, step: 0.01, group: '09 - Regime Engine' },
      { key: 'rangeExpansionRatio', type: 'number', label: 'Range expansion ratio', default: 1.18, min: 1.01, max: 5, step: 0.05, group: '09 - Regime Engine' },
      { key: 'rangeCompressionRatio', type: 'number', label: 'Range compression ratio', default: 0.78, min: 0.1, max: 0.99, step: 0.05, group: '09 - Regime Engine' },

      { key: 'showBarRvol', type: 'boolean', label: 'Show bar RVOL histogram', default: true, group: '10 - Supporting Plots' },
      { key: 'showCumulativeRvol', type: 'boolean', label: 'Show cumulative RVOL', default: true, group: '10 - Supporting Plots' },
      { key: 'showRealizedVolRatio', type: 'boolean', label: 'Show realized-volatility ratio', default: true, group: '10 - Supporting Plots' },
      { key: 'showRangeRatio', type: 'boolean', label: 'Show developing-range ratio', default: false, group: '10 - Supporting Plots' },
      {
        key: 'plotCap',
        type: 'number',
        label: 'Visual plot cap',
        default: 4,
        min: 1.5,
        max: 20,
        step: 0.5,
        group: '10 - Supporting Plots',
        tooltip: 'Caps extreme values visually without changing dashboard calculations or alerts.',
      },

      { key: 'showDashboard', type: 'boolean', label: 'Show context dashboard', default: true, group: '12 - Dashboard and Alerts' },
      { key: 'alertRvolThreshold', type: 'number', label: 'RVOL alert threshold', default: 2, min: 1, max: 20, step: 0.1, group: '12 - Dashboard and Alerts' },
      { key: 'alertVolatilityRatio', type: 'number', label: 'Volatility alert threshold', default: 1.4, min: 1, max: 10, step: 0.05, group: '12 - Dashboard and Alerts' },
    ],

    plots: [
      {
        key: 'barRvolPlot',
        type: 'column',
        title: 'Same-time Bar RVOL',
        style: { color: COLOR_HISTOGRAM_BULL, base: 1, lineWidth: 1 },
        colorBy({ index, values, settings }) {
          const raw = values && values.barRvol ? values.barRvol[index] : NaN
          if (!Number.isFinite(raw)) return withAlpha(COLOR_NEUTRAL, 0.3)
          const quiet = num(settings && settings.quietRvolThreshold, 0.75, 0.1, 1)
          const extreme = num(settings && settings.extremeRvolThreshold, 1.75, 1, 10)
          if (raw >= 1) {
            const strength = fClamp((raw - 1) / Math.max(extreme - 1, 0.01), 0, 1)
            return withAlpha(COLOR_HISTOGRAM_BULL, 0.28 + 0.67 * strength)
          }
          const strength = fClamp((1 - raw) / Math.max(1 - quiet, 0.01), 0, 1)
          return withAlpha(COLOR_HISTOGRAM_BEAR, 0.28 + 0.64 * strength)
        },
      },
      { key: 'cumRvolPlot', type: 'line', title: 'Cumulative RVOL', style: { color: COLOR_PARTICIPATION, lineWidth: 2 } },
      { key: 'volRatioPlot', type: 'line', title: 'Realized Volatility Ratio', style: { color: COLOR_VOLATILITY, lineWidth: 2 } },
      { key: 'rangeRatioPlot', type: 'line', title: 'Developing Range Ratio', style: { color: COLOR_SECONDARY, lineWidth: 1 } },
    ],

    levels: () => [{ price: 1, title: 'Normal Baseline', color: withAlpha(COLOR_NEUTRAL, 0.45), dashed: true }],

    calc(bars, settings, _store, ctx) {
      const size = bars.length
      const column = () => new Array(size).fill(NaN)

      const enabled = settings.indicatorEnabled !== false
      const classifyOutside = settings.classifyOutsideRTH === true
      const showBarRvol = settings.showBarRvol !== false
      const showCumRvol = settings.showCumulativeRvol !== false
      const showVolRatio = settings.showRealizedVolRatio !== false
      const showRangeRatio = settings.showRangeRatio === true

      const zoneRaw = typeof settings.sessionTimezone === 'string' ? settings.sessionTimezone.trim() : ''
      const zone = isValidTimezone(zoneRaw) ? zoneRaw : DEFAULT_TZ
      const specRaw = typeof settings.rthSession === 'string' ? settings.rthSession.trim() : ''
      const sessionSpec = specRaw !== '' ? specRaw : DEFAULT_SESSION

      const rthOpenHour = int(settings.rthOpenHour, 9, 0, 23)
      const rthOpenMinute = int(settings.rthOpenMinute, 30, 0, 59)
      const baselineSessions = int(settings.baselineSessions, 40, 5, 60)
      const minimumBaselineSamples = int(settings.minimumBaselineSamples, 10, 3, 40)
      const maximumSupportedMinutes = int(settings.maximumSupportedMinutes, 30, 1, 60)

      const elevatedRvol = num(settings.elevatedRvolThreshold, 1.25, 1, 5)
      const extremeRvol = num(settings.extremeRvolThreshold, 1.75, 1, 10)
      const elevatedCumRvol = num(settings.elevatedCumulativeRvol, 1.15, 1, 5)
      const quietRvol = num(settings.quietRvolThreshold, 0.75, 0.1, 1)

      const realizedVolLength = int(settings.realizedVolLength, 30, 5, 300)
      const realizedVolBaselineLength = int(settings.realizedVolBaselineLength, 150, 20, 1000)
      const realizedVolZLength = int(settings.realizedVolZLength, 150, 20, 1000)
      const volatilityExpansionRatio = num(settings.volatilityExpansionRatio, 1.2, 1.01, 5)
      const volatilityContractionRatio = num(settings.volatilityContractionRatio, 0.8, 0.1, 0.99)

      const vwapSourceName = pickSource(settings.vwapSource, 'hlc3')
      const vwapSlopeLookback = int(settings.vwapSlopeLookback, 5, 1, 100)
      const vwapCrossLookback = int(settings.vwapCrossLookback, 20, 5, 200)
      const strongVwapSlopeAtr = num(settings.strongVwapSlopeAtr, 0.12, 0.01, 2)
      const vwapRotationZ = num(settings.vwapRotationZ, 0.55, 0.1, 3)
      const rotationCrossTarget = int(settings.rotationCrossTarget, 3, 1, 20)

      const emaSourceName = pickSource(settings.emaSource, 'close')
      const emaFastLength = int(settings.emaFastLength, 9, 1, 200)
      const emaMidLength = int(settings.emaMidLength, 20, 2, 300)
      const emaSlowLength = int(settings.emaSlowLength, 50, 3, 500)
      const emaSlopeLookback = int(settings.emaSlopeLookback, 5, 1, 100)
      const emaCompressionAtr = num(settings.emaCompressionAtr, 0.18, 0.01, 3)
      const emaExpansionAtr = num(settings.emaExpansionAtr, 0.65, 0.05, 5)

      const atrLength = int(settings.atrLength, 14, 2, 200)
      const diLength = int(settings.diLength, 14, 2, 100)
      const adxSmoothing = int(settings.adxSmoothing, 14, 2, 100)
      const weakAdx = num(settings.weakAdx, 17, 1, 50)
      const strongAdx = num(settings.strongAdx, 28, 5, 80)
      const efficiencyLength = int(settings.efficiencyLength, 20, 2, 300)
      const weakEfficiency = num(settings.weakEfficiency, 0.22, 0.01, 0.9)
      const strongEfficiency = num(settings.strongEfficiency, 0.55, 0.05, 1)

      const directionThreshold = num(settings.directionThreshold, 0.34, 0.05, 0.9)
      const trendThreshold = num(settings.trendThreshold, 0.54, 0.05, 0.95)
      const expansionThreshold = num(settings.expansionThreshold, 0.56, 0.05, 0.95)
      const compressionThreshold = num(settings.compressionThreshold, 0.62, 0.05, 0.95)
      const balanceThreshold = num(settings.balanceThreshold, 0.58, 0.05, 0.95)
      const rangeExpansionRatio = num(settings.rangeExpansionRatio, 1.18, 1.01, 5)
      const rangeCompressionRatio = num(settings.rangeCompressionRatio, 0.78, 0.1, 0.99)

      const plotCap = num(settings.plotCap, 4, 1.5, 20)
      const minTick = Number(ctx && ctx.tickSize) || 0

      if (size === 0) {
        return {
          barRvolPlot: [], cumRvolPlot: [], volRatioPlot: [], rangeRatioPlot: [],
          barRvol: [], cumRvol: [], volRatio: [], rangeRatio: [], realizedVolZ: [],
          directionScore: [], trendQuality: [], expansionScore: [], compressionScore: [],
          balanceScore: [], vwapZ: [], emaSpreadAtr: [], efficiency: [], adx: [],
          regimeCode: [], regimeConfidence: [], inRth: [], slotSamples: [], supported: [],
          emaStateCode: [], vwapStateCode: [], participationCode: [], volatilityCode: [],
          trendStrengthCode: [], rangeStateCode: [], sessionPhaseCode: [],
        }
      }

      /* ---- price series and the studies that do not need the session ---- */

      const high = bars.map((b) => b.high)
      const low = bars.map((b) => b.low)
      const close = bars.map((b) => b.close)
      const open = bars.map((b) => b.open)
      const times = bars.map((b) => b.time)
      // nz(volume, 0.0). Index series carry no volume at all.
      const volume = bars.map((b) => (Number.isFinite(b.volume) ? b.volume : 0))

      const vwapSrc = sourceValues(bars, vwapSourceName)
      const emaSrc = sourceValues(bars, emaSourceName)

      const atrSeries = atr(high, low, close, atrLength)
      const emaFast = smaSeededEma(emaSrc, emaFastLength)
      const emaMid = smaSeededEma(emaSrc, emaMidLength)
      const emaSlow = smaSeededEma(emaSrc, emaSlowLength)

      const emaSpreadAtr = column()
      const emaFastSlopeAtr = column()
      for (let i = 0; i < size; i++) {
        const a = atrSeries[i]
        if (!Number.isFinite(a) || a <= 0) continue
        if (Number.isFinite(emaFast[i]) && Number.isFinite(emaMid[i]) && Number.isFinite(emaSlow[i])) {
          const maximum = Math.max(emaFast[i], Math.max(emaMid[i], emaSlow[i]))
          const minimum = Math.min(emaFast[i], Math.min(emaMid[i], emaSlow[i]))
          emaSpreadAtr[i] = (maximum - minimum) / a
        }
        const back = i - emaSlopeLookback
        if (back >= 0 && Number.isFinite(emaFast[i]) && Number.isFinite(emaFast[back])) {
          emaFastSlopeAtr[i] = (emaFast[i] - emaFast[back]) / a
        }
      }

      const trend = dmi(high, low, close, diLength, adxSmoothing)
      const plusDI = trend.plusDI
      const minusDI = trend.minusDI
      const adx = trend.adx

      // ta.sma(math.abs(ta.change(close)), len) * len. ta.change is na on bar 0,
      // so the first finite value lands one bar after the window fills.
      const absChange = column()
      for (let i = 1; i < size; i++) absChange[i] = Math.abs(close[i] - close[i - 1])
      const pathMean = sma(absChange, efficiencyLength)
      const efficiency = column()
      for (let i = 0; i < size; i++) {
        const totalPath = Number.isFinite(pathMean[i]) ? pathMean[i] * efficiencyLength : NaN
        const back = i - efficiencyLength
        if (!Number.isFinite(totalPath) || totalPath <= 0 || back < 0) continue
        efficiency[i] = Math.abs(close[i] - close[back]) / totalPath
      }

      const logReturnSquared = new Array(size).fill(0)
      for (let i = 1; i < size; i++) {
        if (close[i] > 0 && close[i - 1] > 0) {
          const r = Math.log(close[i] / close[i - 1])
          logReturnSquared[i] = r * r
        }
      }
      const varianceMean = sma(logReturnSquared, realizedVolLength)
      const realizedVolatility = new Array(size).fill(0)
      for (let i = 0; i < size; i++) {
        const variance = Number.isFinite(varianceMean[i]) ? varianceMean[i] * realizedVolLength : 0
        realizedVolatility[i] = Math.sqrt(Math.max(variance, 0))
      }
      const realizedVolBaseline = smaSeededEma(realizedVolatility, realizedVolBaselineLength)
      const volRatio = column()
      for (let i = 0; i < size; i++) volRatio[i] = safeRatio(realizedVolatility[i], realizedVolBaseline[i])
      const realizedVolZ = zscore(realizedVolatility, realizedVolZLength)

      /* ---- the session pass: RTH state, same-time baselines, session VWAP ---- */

      const tfSeconds = timeframeSeconds(bars, ctx)
      const isIntraday = tfSeconds > 0 && tfSeconds < 86400
      const tfMinutes = isIntraday ? Math.round(tfSeconds / 60) : 0
      const supported = isIntraday && tfSeconds >= 60 && tfMinutes <= maximumSupportedMinutes

      const inSession = sessionFlags(times, sessionSpec, zone)

      const slotVolumeHistory = new Array(MAX_RTH_SLOTS * baselineSessions).fill(NaN)
      const slotRangeHistory = new Array(MAX_RTH_SLOTS * baselineSessions).fill(NaN)
      const slotVolumeSums = new Array(MAX_RTH_SLOTS).fill(0)
      const slotRangeSums = new Array(MAX_RTH_SLOTS).fill(0)
      const slotSampleCounts = new Array(MAX_RTH_SLOTS).fill(0)
      const slotWriteIndices = new Array(MAX_RTH_SLOTS).fill(0)

      let rthOpenPrice = NaN
      let rthHigh = NaN
      let rthLow = NaN
      let sessionCumulativeVolume = 0
      let expectedCumulativeVolume = 0
      let vwapCumulativeVolume = 0
      let vwapCumulativePV = 0
      let vwapCumulativeP2V = 0

      const barRvol = column()
      const cumRvol = column()
      const rangeRatio = column()
      const vwapSeries = column()
      const vwapZ = column()
      const slotSamplesCol = new Array(size).fill(0)
      const slotIndex = new Array(size).fill(-1)
      const baselineReadyCol = new Array(size).fill(0)
      const rthOpenCol = column()
      const inRthCol = new Array(size).fill(0)
      const phaseMinutes = new Array(size).fill(0)

      let previousInRth = false
      let previousDateKey = NaN

      for (let i = 0; i < size; i++) {
        const parts = utcSecondsToZonedParts(times[i], zone)
        const dateKey = parts.year * 10000 + parts.month * 100 + parts.day
        phaseMinutes[i] = parts.hour * 60 + parts.minute
        const cur = inSession[i] === true
        inRthCol[i] = cur ? 1 : 0
        const newRth = cur && (!previousInRth || dateKey !== previousDateKey)

        let slot = -1
        if (cur && supported && tfSeconds > 0) {
          const rthStart = zonedWallClockToUtcSeconds(
            parts.year, parts.month, parts.day, rthOpenHour, rthOpenMinute, 0, zone
          )
          slot = Math.floor((times[i] - rthStart) / tfSeconds)
        }
        const validSlot = slot >= 0 && slot < MAX_RTH_SLOTS
        slotIndex[i] = validSlot ? slot : -1

        const samples = validSlot ? slotSampleCounts[slot] : 0
        const slotVolumeAverage = validSlot && samples > 0 ? slotVolumeSums[slot] / samples : NaN
        const slotRangeAverage = validSlot && samples > 0 ? slotRangeSums[slot] / samples : NaN
        const baselineReady = validSlot && samples >= minimumBaselineSamples
        slotSamplesCol[i] = samples
        baselineReadyCol[i] = baselineReady ? 1 : 0

        if (newRth) {
          rthOpenPrice = open[i]
          rthHigh = high[i]
          rthLow = low[i]
          sessionCumulativeVolume = volume[i]
          expectedCumulativeVolume = nz(slotVolumeAverage)
        } else if (cur) {
          rthHigh = !Number.isFinite(rthHigh) ? high[i] : Math.max(rthHigh, high[i])
          rthLow = !Number.isFinite(rthLow) ? low[i] : Math.min(rthLow, low[i])
          sessionCumulativeVolume += volume[i]
          expectedCumulativeVolume += nz(slotVolumeAverage)
        }
        rthOpenCol[i] = rthOpenPrice

        const developingRange =
          cur && Number.isFinite(rthHigh) && Number.isFinite(rthLow) ? rthHigh - rthLow : NaN
        if (cur && baselineReady) {
          barRvol[i] = safeRatio(volume[i], slotVolumeAverage)
          rangeRatio[i] = safeRatio(developingRange, slotRangeAverage)
          if (expectedCumulativeVolume > 0) {
            cumRvol[i] = sessionCumulativeVolume / expectedCumulativeVolume
          }
        }

        // Pine writes the slot ring on barstate.isconfirmed, after the values
        // above have been read, so a bar never counts towards its own baseline.
        // Over a historical recompute every bar is confirmed.
        if (cur && validSlot) {
          const writeIndex = slotWriteIndices[slot]
          const historyIndex = slot * baselineSessions + writeIndex
          const existingCount = slotSampleCounts[slot]
          const oldVolume = slotVolumeHistory[historyIndex]
          const oldRange = slotRangeHistory[historyIndex]
          const currentVolume = volume[i]
          const currentRange = nz(developingRange)

          slotVolumeHistory[historyIndex] = currentVolume
          slotRangeHistory[historyIndex] = currentRange
          if (existingCount < baselineSessions) {
            slotVolumeSums[slot] += currentVolume
            slotRangeSums[slot] += currentRange
            slotSampleCounts[slot] = existingCount + 1
          } else {
            slotVolumeSums[slot] += currentVolume - nz(oldVolume)
            slotRangeSums[slot] += currentRange - nz(oldRange)
          }
          slotWriteIndices[slot] = (writeIndex + 1) % baselineSessions
        }

        if (newRth) {
          vwapCumulativeVolume = 0
          vwapCumulativePV = 0
          vwapCumulativeP2V = 0
        }
        if (cur) {
          const barVolume = volume[i]
          const price = Number.isFinite(vwapSrc[i]) ? vwapSrc[i] : 0
          vwapCumulativeVolume += barVolume
          vwapCumulativePV += price * barVolume
          vwapCumulativeP2V += price * price * barVolume
        }
        const vwap = vwapCumulativeVolume > 0 ? vwapCumulativePV / vwapCumulativeVolume : NaN
        vwapSeries[i] = vwap
        if (Number.isFinite(vwap)) {
          const variance = Math.max(vwapCumulativeP2V / vwapCumulativeVolume - vwap * vwap, 0)
          const deviation = Math.sqrt(variance)
          if (cur && Number.isFinite(deviation) && deviation > minTick) {
            vwapZ[i] = (close[i] - vwap) / deviation
          }
        }

        previousInRth = cur
        previousDateKey = dateKey
      }

      /* ---- VWAP slope, crossings and the regime engine ---- */

      const vwapSlopeAtr = column()
      const crossSeries = new Array(size).fill(0)
      for (let i = 0; i < size; i++) {
        const a = atrSeries[i]
        const back = i - vwapSlopeLookback
        if (
          inRthCol[i] === 1 && slotIndex[i] >= vwapSlopeLookback && back >= 0 &&
          Number.isFinite(a) && a > 0 &&
          Number.isFinite(vwapSeries[i]) && Number.isFinite(vwapSeries[back])
        ) {
          vwapSlopeAtr[i] = (vwapSeries[i] - vwapSeries[back]) / a
        }
        if (i > 0 && inRthCol[i] === 1) {
          const a1 = close[i - 1]
          const b1 = vwapSeries[i - 1]
          const a2 = close[i]
          const b2 = vwapSeries[i]
          if (Number.isFinite(a1) && Number.isFinite(b1) && Number.isFinite(a2) && Number.isFinite(b2)) {
            if ((a1 <= b1 && a2 > b2) || (a1 >= b1 && a2 < b2)) crossSeries[i] = 1
          }
        }
      }
      const crossMean = sma(crossSeries, vwapCrossLookback)

      const directionScore = column()
      const trendQuality = column()
      const expansionScore = column()
      const compressionScore = column()
      const balanceScore = column()
      const regimeCode = new Array(size).fill(0)
      const regimeConfidence = column()
      const emaStateCode = new Array(size).fill(7)
      const vwapStateCode = new Array(size).fill(0)
      const participationCode = new Array(size).fill(0)
      const volatilityCode = new Array(size).fill(0)
      const trendStrengthCode = new Array(size).fill(2)
      const rangeStateCode = new Array(size).fill(0)
      const sessionPhaseCode = new Array(size).fill(0)

      for (let i = 0; i < size; i++) {
        const cur = inRthCol[i] === 1
        const ready = baselineReadyCol[i] === 1
        const spread = emaSpreadAtr[i]
        const slope = vwapSlopeAtr[i]
        const eff = efficiency[i]
        const adxValue = adx[i]
        const vwap = vwapSeries[i]
        const crossCount = Number.isFinite(crossMean[i]) ? crossMean[i] * vwapCrossLookback : NaN

        const bullStack = emaFast[i] > emaMid[i] && emaMid[i] > emaSlow[i]
        const bearStack = emaFast[i] < emaMid[i] && emaMid[i] < emaSlow[i]
        const compressed = Number.isFinite(spread) && spread <= emaCompressionAtr
        const expanded = Number.isFinite(spread) && spread >= emaExpansionAtr

        emaStateCode[i] = compressed ? 0
          : bullStack && expanded && emaFastSlopeAtr[i] > 0 ? 1
          : bearStack && expanded && emaFastSlopeAtr[i] < 0 ? 2
          : bullStack && close[i] < emaFast[i] && close[i] >= emaMid[i] ? 3
          : bearStack && close[i] > emaFast[i] && close[i] <= emaMid[i] ? 4
          : bullStack ? 5
          : bearStack ? 6
          : 7

        const rotating =
          cur && Number.isFinite(vwapZ[i]) && Math.abs(vwapZ[i]) <= vwapRotationZ &&
          crossCount >= rotationCrossTarget
        vwapStateCode[i] = !cur || !Number.isFinite(vwap) ? 0
          : rotating ? 1
          : close[i] > vwap && nz(slope) > 0 ? 2
          : close[i] < vwap && nz(slope) < 0 ? 3
          : close[i] > vwap ? 4
          : 5

        const emaDirection = bullStack ? 1 : bearStack ? -1 : close[i] >= emaMid[i] ? 0.25 : -0.25
        const vwapDirection = cur && Number.isFinite(vwap)
          ? (close[i] >= vwap ? 0.6 : -0.6) +
            (nz(slope) > 0.02 ? 0.4 : nz(slope) < -0.02 ? -0.4 : 0)
          : 0
        const diDirection = plusDI[i] > minusDI[i] ? 0.7 : plusDI[i] < minusDI[i] ? -0.7 : 0
        const effBack = i - efficiencyLength
        const efficiencyDirection = Number.isFinite(eff)
          ? eff * (effBack >= 0 && close[i] >= close[effBack] ? 0.7 : -0.7)
          : 0
        // Relative strength needs a second instrument, which a chart study
        // cannot request here, so its contribution is the Pine value for
        // "not ready", which is zero.
        const relativeDirection = 0
        const openDirection = cur && Number.isFinite(rthOpenCol[i])
          ? (close[i] >= rthOpenCol[i] ? 0.35 : -0.35)
          : 0
        const directionRaw =
          emaDirection + vwapDirection + diDirection + efficiencyDirection +
          relativeDirection + openDirection
        const direction = fClamp(directionRaw / DIRECTION_MAXIMUM, -1, 1)
        directionScore[i] = direction

        const adxScore = fClamp((adxValue - weakAdx) / Math.max(strongAdx - weakAdx, 0.1), 0, 1)
        const efficiencyScore = fClamp(
          (nz(eff) - weakEfficiency) / Math.max(strongEfficiency - weakEfficiency, 0.01), 0, 1
        )
        const emaSeparationScore = fClamp(nz(spread) / Math.max(emaExpansionAtr, 0.01), 0, 1)
        const vwapSlopeScore = fClamp(Math.abs(nz(slope)) / Math.max(strongVwapSlopeAtr, 0.01), 0, 1)
        const quality =
          adxScore * 0.35 + efficiencyScore * 0.3 + emaSeparationScore * 0.2 + vwapSlopeScore * 0.15
        trendQuality[i] = quality

        const volatilityExpansionScore = fClamp(
          (nz(volRatio[i]) - 1) / Math.max(volatilityExpansionRatio - 1, 0.01), 0, 1
        )
        const rangeExpansionScore = fClamp(
          (nz(rangeRatio[i]) - 1) / Math.max(rangeExpansionRatio - 1, 0.01), 0, 1
        )
        const cumulativeParticipationScore = fClamp(
          (nz(cumRvol[i]) - 1) / Math.max(elevatedCumRvol - 1, 0.01), 0, 1
        )
        const barParticipationScore = fClamp(
          (nz(barRvol[i]) - 1) / Math.max(elevatedRvol - 1, 0.01), 0, 1
        )
        let expansionNumerator = volatilityExpansionScore * 0.35
        let expansionDenominator = 0.35
        if (Number.isFinite(rangeRatio[i])) {
          expansionNumerator += rangeExpansionScore * 0.3
          expansionDenominator += 0.3
        }
        if (Number.isFinite(cumRvol[i])) {
          expansionNumerator += cumulativeParticipationScore * 0.2
          expansionDenominator += 0.2
        }
        if (Number.isFinite(barRvol[i])) {
          expansionNumerator += barParticipationScore * 0.15
          expansionDenominator += 0.15
        }
        const expansion = expansionDenominator > 0 ? expansionNumerator / expansionDenominator : 0
        expansionScore[i] = expansion

        const emaCompressionScore = 1 - fClamp(nz(spread) / Math.max(emaCompressionAtr, 0.01), 0, 1)
        const adxCompressionScore = 1 - fClamp(adxValue / Math.max(weakAdx, 0.1), 0, 1)
        const volatilityCompressionScore =
          1 - fClamp((nz(volRatio[i]) - 0.55) / Math.max(1 - 0.55, 0.01), 0, 1)
        const rangeCompressionScore = Number.isFinite(rangeRatio[i])
          ? 1 - fClamp((rangeRatio[i] - 0.45) / Math.max(rangeCompressionRatio - 0.45, 0.01), 0, 1)
          : 0
        const efficiencyCompressionScore = 1 - fClamp(nz(eff) / Math.max(weakEfficiency, 0.01), 0, 1)
        const compression =
          emaCompressionScore * 0.3 + adxCompressionScore * 0.2 + volatilityCompressionScore * 0.2 +
          rangeCompressionScore * 0.15 + efficiencyCompressionScore * 0.15
        compressionScore[i] = compression

        const crossRotationScore = fClamp(crossCount / Math.max(rotationCrossTarget, 1), 0, 1)
        const vwapNearScore = 1 - fClamp(Math.abs(nz(vwapZ[i])) / 1.5, 0, 1)
        const lowEfficiencyScore = 1 - fClamp(nz(eff) / Math.max(strongEfficiency, 0.01), 0, 1)
        const lowDirectionScore = 1 - Math.abs(direction)
        const balance =
          crossRotationScore * 0.3 + vwapNearScore * 0.25 + lowEfficiencyScore * 0.25 +
          lowDirectionScore * 0.2
        balanceScore[i] = balance

        const directional = Math.abs(direction) >= directionThreshold
        const trending = quality >= trendThreshold && directional
        const expanding = expansion >= expansionThreshold
        const compressing = compression >= compressionThreshold
        const balanced = balance >= balanceThreshold

        let code = 0
        if (!cur && !classifyOutside) code = 9
        else if (compressing && !expanding) code = 4
        else if (expanding && directional) code = direction > 0 ? 2 : -2
        else if (trending) code = direction > 0 ? 1 : -1
        else if (balanced) code = 3
        else if (expanding) code = 5
        regimeCode[i] = code

        const maximumCompeting =
          Math.max(quality, Math.max(expansion, Math.max(compression, balance)))
        let agreement
        if (code === 2 || code === -2) agreement = (expansion + quality + Math.abs(direction)) / 3
        else if (code === 1 || code === -1) agreement = (quality + Math.abs(direction) + (1 - balance)) / 3
        else if (code === 3) agreement = balance
        else if (code === 4) agreement = compression
        else if (code === 5) agreement = expansion
        else if (code === 9) agreement = 1
        else agreement = fClamp(1.2 - maximumCompeting, 0.35, 0.72)
        regimeConfidence[i] = Math.round(fClamp(agreement, 0, 1) * 100)

        participationCode[i] = !cur ? 0
          : !ready ? 1
          : nz(barRvol[i]) >= extremeRvol ? 2
          : nz(barRvol[i]) >= elevatedRvol || nz(cumRvol[i]) >= elevatedCumRvol ? 3
          : nz(barRvol[i]) <= quietRvol && nz(cumRvol[i]) <= quietRvol ? 4
          : 5
        volatilityCode[i] = !Number.isFinite(volRatio[i]) ? 0
          : volRatio[i] >= volatilityExpansionRatio ? 1
          : volRatio[i] <= volatilityContractionRatio ? 2
          : 3
        trendStrengthCode[i] = adxValue >= strongAdx ? 0 : adxValue <= weakAdx ? 1 : 2
        rangeStateCode[i] = !cur ? 0
          : !ready ? 1
          : nz(rangeRatio[i]) >= rangeExpansionRatio ? 2
          : nz(rangeRatio[i]) <= rangeCompressionRatio ? 3
          : 4
        const minutes = phaseMinutes[i]
        sessionPhaseCode[i] = !cur ? 0
          : minutes < 600 ? 1
          : minutes < 660 ? 2
          : minutes < 840 ? 3
          : minutes < 900 ? 4
          : 5
      }

      /* ---- plot columns ---- */

      const cap = (value, show) =>
        (enabled && show && Number.isFinite(value) ? Math.min(value, plotCap) : NaN)
      const barRvolPlot = column()
      const cumRvolPlot = column()
      const volRatioPlot = column()
      const rangeRatioPlot = column()
      for (let i = 0; i < size; i++) {
        barRvolPlot[i] = cap(barRvol[i], showBarRvol)
        cumRvolPlot[i] = cap(cumRvol[i], showCumRvol)
        volRatioPlot[i] = cap(volRatio[i], showVolRatio)
        rangeRatioPlot[i] = cap(rangeRatio[i], showRangeRatio)
      }

      return {
        barRvolPlot: nulls(barRvolPlot),
        cumRvolPlot: nulls(cumRvolPlot),
        volRatioPlot: nulls(volRatioPlot),
        rangeRatioPlot: nulls(rangeRatioPlot),
        barRvol,
        cumRvol,
        volRatio,
        rangeRatio,
        realizedVolZ,
        directionScore,
        trendQuality,
        expansionScore,
        compressionScore,
        balanceScore,
        vwapZ,
        emaSpreadAtr,
        efficiency,
        adx,
        regimeCode,
        regimeConfidence,
        inRth: inRthCol,
        slotSamples: slotSamplesCol,
        supported: new Array(size).fill(supported ? 1 : 0),
        emaStateCode,
        vwapStateCode,
        participationCode,
        volatilityCode,
        trendStrengthCode,
        rangeStateCode,
        sessionPhaseCode,
      }
    },

    table({ bars, values, settings }) {
      if (bars.length === 0) return null
      if (settings.indicatorEnabled === false || settings.showDashboard === false) return null
      const i = bars.length - 1
      const at = (key) => {
        const col = values[key]
        return col ? col[i] : NaN
      }
      const baselineSessions = int(settings.baselineSessions, 40, 5, 60)
      const regime = REGIME_TEXT[String(at('regimeCode'))] || 'Transition'
      const confidence = at('regimeConfidence')
      const samples = at('slotSamples')
      const supported = at('supported') === 1

      return {
        rows: [
          ['Regime', regime + ' (' + (Number.isFinite(confidence) ? confidence + '%' : 'n/a') + ')'],
          ['Bias', signedText(at('directionScore') * 100, 1)],
          ['Participation', PARTICIPATION_TEXT[at('participationCode')] || 'n/a'],
          ['RVOL bar / cum', ratioText(at('barRvol')) + '   ' + ratioText(at('cumRvol'))],
          ['Trend structure',
            (EMA_TEXT[at('emaStateCode')] || 'n/a') + '   ' + (TREND_TEXT[at('trendStrengthCode')] || 'n/a')],
          ['ADX / efficiency', numberText(at('adx'), 1) + '   ' + numberText(at('efficiency'), 2)],
          ['Volatility', VOLATILITY_TEXT[at('volatilityCode')] || 'n/a'],
          ['RV ratio / z', ratioText(at('volRatio')) + '   ' + signedText(at('realizedVolZ'), 2)],
          ['Location / range',
            (VWAP_TEXT[at('vwapStateCode')] || 'n/a') + '   ' + (RANGE_TEXT[at('rangeStateCode')] || 'n/a')],
          ['VWAP z / range', signedText(at('vwapZ'), 2) + '   ' + ratioText(at('rangeRatio'))],
          ['EMA spread / ATR', numberText(at('emaSpreadAtr'), 2)],
          ['Scores T/E/C/B',
            numberText(at('trendQuality'), 2) + '  ' + numberText(at('expansionScore'), 2) + '  ' +
            numberText(at('compressionScore'), 2) + '  ' + numberText(at('balanceScore'), 2)],
          ['Relative strength', 'Not available on a single-symbol study'],
          [
            'Session',
            supported
              ? (PHASE_TEXT[at('sessionPhaseCode')] || 'n/a') + '   samples ' +
                (Number.isFinite(samples) ? samples : 0) + '/' + baselineSessions
              : 'Unsupported timeframe for same-time RVOL. Use 1m, 5m or 15m.',
          ],
        ],
      }
    },

    alerts: [
      {
        id: 'regime-change',
        title: 'Meridian: futures regime changed',
        message: 'Meridian Futures Context: the confirmed RTH regime changed.',
        when({ values, index }) {
          if (index < 1) return false
          const code = values.regimeCode
          const rth = values.inRth
          if (!code || !rth) return false
          return rth[index] === 1 && Number.isFinite(code[index]) &&
            Number.isFinite(code[index - 1]) && code[index] !== code[index - 1]
        },
      },
      {
        id: 'rvol-spike',
        title: 'Meridian: same-time RVOL spike',
        message: 'Meridian Futures Context: same-time bar RVOL crossed the configured alert threshold.',
        when({ values, settings, index }) {
          const col = values.barRvol
          const rth = values.inRth
          if (!col || !rth) return false
          const threshold = num(settings.alertRvolThreshold, 2, 1, 20)
          const current = col[index]
          const previous = index > 0 ? col[index - 1] : NaN
          return rth[index] === 1 && Number.isFinite(current) && current >= threshold &&
            nz(previous) < threshold
        },
      },
      {
        id: 'volatility-expansion',
        title: 'Meridian: realized volatility expansion',
        message: 'Meridian Futures Context: rolling realized volatility crossed the configured expansion alert threshold.',
        when({ values, settings, index }) {
          const col = values.volRatio
          if (!col) return false
          const threshold = num(settings.alertVolatilityRatio, 1.4, 1, 10)
          const current = col[index]
          const previous = index > 0 ? col[index - 1] : NaN
          return Number.isFinite(current) && current >= threshold && nz(previous) < threshold
        },
      },
    ],
  })
}
