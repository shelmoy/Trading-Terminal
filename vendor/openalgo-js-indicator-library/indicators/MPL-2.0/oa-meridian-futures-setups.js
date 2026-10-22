/**
 * Meridian Futures Setups - ported to openalgo-charts from Pine Script v6.
 *
 * Source: https://github.com/sukesan7/meridian-indicators/blob/82bfd140decb5439c2db0be840f9deaf5cde24b0/src/futures/meridian-futures-setups.pine
 * Repo:   sukesan7/meridian-indicators
 * License: MPL-2.0, v0.3.6-beta
 * SPDX-FileCopyrightText: (c) sukesan7
 * SPDX-FileCopyrightText: (c) 2026 marketcalls (port to openalgo-charts)
 * SPDX-License-Identifier: MPL-2.0
 *
 * A multi-timeframe ICT-style setup engine. It registers Fair Value Gaps and
 * Order Blocks from the chart timeframe and from folded 5m/15m/30m/1H/4H bars,
 * flips invalidated ones into Inversion FVGs and Breaker Blocks, scores every
 * live zone out of 100 across six independent categories (zone authority,
 * multi-timeframe overlap, structure, liquidity, market context, intermarket),
 * and turns the best qualifying touch into a trade plan with a stop and 1R,
 * 1.5R and 2R objectives.
 *
 * Porting notes, all deliberate:
 *
 * - request.security is folded, not faked. The 5/15/30/60/240 payloads are
 *   rebuilt from the chart's own bars, bucketed from the 18:00 futures session
 *   open in the session timezone, which is how CME intraday higher-timeframe
 *   bars align. Only closed buckets are read (the source indexes [1] to [4]
 *   inside the payload), so nothing looks ahead.
 * - The NQ/ES SMT divergence needs a second instrument and cannot be expressed
 *   here, so its inputs are omitted rather than left as dead controls. The
 *   intermarket category therefore scores at most 4 of its 5 points.
 * - RESEARCH_BUILD is a compile-time false in the source, which makes the zone
 *   boxes, liquidity-pool lines and candidate labels unreachable there. It is
 *   exposed here as the "Research build" switch, defaulting to false so the
 *   shipped behaviour is identical.
 * - Colour, transparency, line-width and label-size inputs are dropped: the
 *   chart generates style controls, and drawings carry the source's own values
 *   as constants.
 * - The symbol and timeframe gates keep the source defaults, so the engine is
 *   idle until "Allow symbols other than NQ/ES" and, above 1 minute, "Allow
 *   chart timeframes above 1 minute" are switched on. The regime table names
 *   whichever one is holding it.
 */

const BULL_SIGNAL = '#21ff99'
const BEAR_SIGNAL = '#ff3a63'
const BULL_ZONE = '#55cdb0'
const BEAR_ZONE = '#e06782'
const RISK_COLOR = '#ff385b'
const REWARD_COLOR = '#2def8f'
const STOP_COLOR = '#ff3760'
const TARGET_COLOR = '#40ff9b'
const ACCENT_COLOR = '#9b5de5'
const NEUTRAL_COLOR = '#878b97'

// The source's transparencies, expressed as the opacity the draw layer wants.
const OP_SETUP = 0.1
const OP_RISK = 0.1
const OP_REWARD1 = 0.13
const OP_REWARD15 = 0.08
const OP_REWARD2 = 0.05
const OP_HISTORICAL = 0.04

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
const MAX_PIVOTS = 60
const MAX_LIQUIDITY_POOLS = 24
const MAX_TRADES = 20
const MAX_SESSION_SLOTS = 1500
const POOL_SUPPORT = 1
const POOL_RESISTANCE = -1

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

const PANEL_POSITIONS = {
  'Top Left': 'top-left',
  'Top Center': 'top-center',
  'Top Right': 'top-right',
  'Middle Left': 'middle-left',
  'Middle Center': 'middle-center',
  'Middle Right': 'middle-right',
  'Bottom Left': 'bottom-left',
  'Bottom Center': 'bottom-center',
  'Bottom Right': 'bottom-right',
}
const PANEL_FONT = { Tiny: 9, Small: 10, Normal: 12, Large: 14 }
const TF_LIST = [5, 15, 30, 60, 240]

export default function ({
  registerIndicator,
  nulls,
  clamp,
  withAlpha,
  roundToTick,
  sma: taSma,
  stdev: taStdev,
  rsi: taRsi,
  atr: taAtr,
  smaSeededEma: taEma,
  highest: taHighest,
  lowest: taLowest,
  pivotHigh: taPivotHigh,
  pivotLow: taPivotLow,
  parseSessionSpec,
  inSessionAt,
  isValidTimezone,
  zoneOffsetSeconds,
  utcSecondsToZonedParts,
  intervalToSeconds,
}) {
  // A cleared number field arrives as '', and Number('') is 0, which would turn
  // every setting with a zero floor into its default and every other one into
  // a zero-length window.
  const num = (value, fallback, lo, hi) => {
    if (value === '' || value === null || value === undefined) return fallback
    const parsed = Number(value)
    if (!Number.isFinite(parsed)) return fallback
    return Math.min(hi, Math.max(lo, parsed))
  }
  const int = (value, fallback, lo, hi) => Math.round(num(value, fallback, lo, hi))
  const bool = (value, fallback) => (typeof value === 'boolean' ? value : fallback)
  const pick = (value, options, fallback) => (options.indexOf(value) >= 0 ? value : fallback)
  const fin = (value) => Number.isFinite(value)

  registerIndicator({
    id: 'oa-meridian-futures-setups',
    name: 'Meridian - Futures Setups',
    category: 'Meridian',
    placement: 'onchart',

    inputs: [
      { key: 'indicatorEnabled', type: 'boolean', label: 'Enable indicator', default: true, group: G_GENERAL },
      {
        key: 'allowUnsupportedSymbols',
        type: 'boolean',
        label: 'Allow symbols other than NQ/ES',
        default: false,
        tooltip: 'The engine is tuned for NQ and ES futures. Switch this on to run it on any other instrument.',
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

      { key: 'useChartZones', type: 'boolean', label: 'Chart-timeframe zones', default: true, group: G_TIMEFRAMES },
      { key: 'use5m', type: 'boolean', label: '5-minute zones', default: true, group: G_TIMEFRAMES },
      { key: 'use15m', type: 'boolean', label: '15-minute zones', default: true, group: G_TIMEFRAMES },
      { key: 'use30m', type: 'boolean', label: '30-minute zones', default: true, group: G_TIMEFRAMES },
      { key: 'use1h', type: 'boolean', label: '1-hour zones', default: true, group: G_TIMEFRAMES },
      { key: 'use4h', type: 'boolean', label: '4-hour zones', default: true, group: G_TIMEFRAMES },
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
        tooltip: 'A zone must be at least this many price ticks wide. The tick comes from the price scale, or is inferred from bar ranges when the host has not set one.',
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
      { key: 'minimumCategories', type: 'number', label: 'Minimum independent categories', default: 4, min: 2, max: 6, step: 1, group: G_SCORING },
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

      { key: 'showRegimePanel', type: 'boolean', label: 'Show multi-timeframe regime panel', default: true, group: G_VISUAL },
      {
        key: 'panelPosition',
        type: 'select',
        label: 'Regime table position',
        default: 'Bottom Right',
        options: Object.keys(PANEL_POSITIONS).map((k) => ({ label: k, value: k })),
        group: G_VISUAL,
      },
      {
        key: 'panelTextSize',
        type: 'select',
        label: 'Regime table text size',
        default: 'Tiny',
        options: Object.keys(PANEL_FONT).map((k) => ({ label: k, value: k })),
        group: G_VISUAL,
      },
      {
        key: 'showZoneScores',
        type: 'boolean',
        label: 'Show scores in zone labels',
        default: false,
        tooltip: 'When disabled, zone labels use only the timeframe and concept name.',
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
        tooltip: 'Inside right places the label at the zone midpoint near its right edge. Above right preserves the earlier label position.',
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

      {
        key: 'researchBuild',
        type: 'boolean',
        label: 'Research build',
        default: false,
        tooltip: 'The source ships this as a compile-time false, which hides every diagnostic below. Switch it on to see zones, pools and rejected candidates.',
        group: G_RESEARCH,
      },
      { key: 'showAllResearchZones', type: 'boolean', label: 'Show active research zones', default: false, group: G_RESEARCH },
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
      { key: 'showLiquidityPoolLines', type: 'boolean', label: 'Show active liquidity-pool lines', default: false, group: G_RESEARCH },
      { key: 'liquidityPoolForwardMinutes', type: 'number', label: 'Liquidity-line forward projection', default: 10, min: 1, max: 120, step: 1, group: G_RESEARCH },
      {
        key: 'showInvalidatedZoneHistory',
        type: 'boolean',
        label: 'Show recently invalidated zones',
        default: true,
        tooltip: 'Keeps the original FVG or Order Block visible up to its invalidation candle, so FVG to IFVG and OB to BB transitions stay auditable.',
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
    ],

    // The source plots nothing: every mark it makes is a box, a line, a label
    // or a table cell. These columns exist so draws, table and alerts can read
    // the engine, which is why every one of them is hidden.
    plots: [
      { key: 'signal', type: 'line', title: 'Signal', style: { visible: false } },
      { key: 'entry', type: 'line', title: 'Entry', style: { visible: false } },
      { key: 'stop', type: 'line', title: 'Stop', style: { visible: false } },
      { key: 'target1', type: 'line', title: 'Target 1R', style: { visible: false } },
      { key: 'target15', type: 'line', title: 'Target 1.5R', style: { visible: false } },
      { key: 'target2', type: 'line', title: 'Target 2R', style: { visible: false } },
      { key: 'regime', type: 'line', title: 'Weighted Regime', style: { visible: false } },
      { key: 'regimeLocal', type: 'line', title: 'Execution Regime', style: { visible: false } },
      { key: 'candidateScore', type: 'line', title: 'Latest Candidate Score', style: { visible: false } },
    ],

    calc(bars, settings, store, ctx) {
      const n = bars.length
      const column = () => new Array(n).fill(null)
      const values = {
        signal: column(),
        entry: column(),
        stop: column(),
        target1: column(),
        target15: column(),
        target2: column(),
        regime: column(),
        regimeLocal: column(),
        candidateScore: column(),
        buyEvent: column(),
        sellEvent: column(),
        targetEvent: column(),
        stopEvent: column(),
        state: column(),
      }
      if (n === 0) return values

      /* ---- settings ------------------------------------------------------ */
      const indicatorEnabled = bool(settings.indicatorEnabled, true)
      const allowUnsupportedSymbols = bool(settings.allowUnsupportedSymbols, false)
      const allowNonOneMinuteCharts = bool(settings.allowNonOneMinuteCharts, false)
      const zone = isValidTimezone(settings.sessionTimezone) ? settings.sessionTimezone : 'America/New_York'
      const spec = (value, fallback) => {
        const text = String(value === null || value === undefined ? '' : value).trim()
        return (text ? parseSessionSpec(text) : null) || parseSessionSpec(fallback)
      }
      const futuresSpec = spec(settings.futuresSession, '1800-1700:1234567')
      const overnightSpec = spec(settings.overnightSession, '1800-0930:1234567')
      const rthSpec = spec(settings.rthSession, '0930-1600:23456')
      const signalSpec = spec(settings.signalSession, '0800-1600:23456')
      const maximumActiveTrades = int(settings.maximumActiveTrades, 3, 1, 3)
      const showPastTrades = bool(settings.showPastTrades, false)
      const pastTradeRetentionHours = int(settings.pastTradeRetentionHours, 22, 1, 72)
      const completedRetentionMinutes = int(settings.completedRetentionMinutes, 5, 0, 120)

      const useChartZones = bool(settings.useChartZones, true)
      const useTf = {
        5: bool(settings.use5m, true),
        15: bool(settings.use15m, true),
        30: bool(settings.use30m, true),
        60: bool(settings.use1h, true),
        240: bool(settings.use4h, true),
      }
      const zoneLife = {
        chart: int(settings.chartZoneLifeMinutes, 10, 2, 60),
        5: int(settings.zoneLife5m, 30, 5, 240),
        15: int(settings.zoneLife15m, 60, 15, 720),
        30: int(settings.zoneLife30m, 90, 30, 1440),
        60: int(settings.zoneLife1h, 120, 60, 2880),
        240: int(settings.zoneLife4h, 1380, 120, 2880),
      }
      const fourHourZonesUntilSessionEnd = bool(settings.fourHourZonesUntilSessionEnd, true)
      const zoneLifetimeMode = pick(settings.zoneLifetimeMode, ['Fixed by timeframe', 'Shorten weaker zones'], 'Fixed by timeframe')
      const transformedZoneLifetimePercent = int(settings.transformedZoneLifetimePercent, 50, 10, 100)
      const strongZoneScore = int(settings.strongZoneScore, 80, 50, 100)
      const moderateZoneScore = int(settings.moderateZoneScore, 65, 30, 95)

      const enableFvg = bool(settings.enableFvg, true)
      const enableIfvg = bool(settings.enableIfvg, true)
      const enableOb = bool(settings.enableOb, true)
      const enableBb = bool(settings.enableBb, true)
      const minimumZoneTicks = int(settings.minimumZoneTicks, 5, 1, 100)
      const minimumZoneAtr = num(settings.minimumZoneAtr, 0.03, 0, 2)
      const maximumZoneAtr = num(settings.maximumZoneAtr, 1.5, 0.1, 10)
      const htfDisplacementAtr = num(settings.htfDisplacementAtr, 0.75, 0.2, 3)
      const htfDisplacementBodyFraction = num(settings.htfDisplacementBodyFraction, 0.55, 0.2, 1)
      const htfBosLookback = int(settings.htfBosLookback, 5, 2, 20)

      const pivotLeft = int(settings.pivotLeft, 2, 1, 10)
      const pivotRight = int(settings.pivotRight, 2, 1, 10)
      const structureValidityBars = int(settings.structureValidityBars, 5, 1, 20)
      const structureValiditySeconds = int(settings.structureValidityMinutes, 30, 5, 180) * 60
      const displacementValiditySeconds = int(settings.displacementValidityMinutes, 20, 3, 120) * 60
      const executionDisplacementAtr = num(settings.executionDisplacementAtr, 0.65, 0.1, 3)
      const executionBodyFraction = num(settings.executionBodyFraction, 0.52, 0.1, 1)
      const useLiquidityPools = bool(settings.useLiquidityPools, true)
      const liquidityPoolToleranceTicks = int(settings.liquidityPoolToleranceTicks, 10, 2, 100)
      const liquidityPoolMinimumTouches = int(settings.liquidityPoolMinimumTouches, 3, 2, 8)
      const liquidityPoolLookbackBars = int(settings.liquidityPoolLookbackBars, 360, 30, 2000)
      const liquidityPoolBreakTicks = int(settings.liquidityPoolBreakTicks, 3, 1, 50)
      const usePoolsAsObjectives = bool(settings.usePoolsAsObjectives, true)
      const liquiditySweepValidityBars = int(settings.liquiditySweepValidityBars, 12, 1, 60)
      const openingRangeMinutes = int(pick(String(settings.openingRangeMinutes), ['5', '15', '30'], '15'), 15, 5, 30)

      const useVwap = bool(settings.useVwap, true)
      const useRsi = bool(settings.useRsi, true)
      const rsiLength = int(settings.rsiLength, 14, 2, 50)
      const useZScore = bool(settings.useZScore, true)
      const zScoreLength = int(settings.zScoreLength, 50, 10, 300)
      const zScoreExtreme = num(settings.zScoreExtreme, 1.5, 0.5, 4)
      const usePowerOfThree = bool(settings.usePowerOfThree, true)
      const useOpeningRange = bool(settings.useOpeningRange, true)
      const useRvol = bool(settings.useRvol, true)
      const rvolBaselineSessions = int(settings.rvolBaselineSessions, 30, 5, 60)
      const rvolMinimumSamples = int(settings.rvolMinimumSamples, 5, 2, 30)
      const elevatedRvol = num(settings.elevatedRvol, 1.25, 0.5, 5)

      const minimumScore = int(settings.minimumScore, 80, 50, 100)
      const minimumCategories = int(settings.minimumCategories, 4, 2, 6)
      const requireStructure = bool(settings.requireStructure, true)
      const requireDisplacement = bool(settings.requireDisplacement, true)
      const maximumEntryTouches = int(settings.maximumEntryTouches, 2, 1, 6)
      const oneTradePerStructuralLeg = bool(settings.oneTradePerStructuralLeg, true)
      const sameDirectionCooldownBars = int(settings.sameDirectionCooldownBars, 5, 0, 60)
      const minimumObjectiveR = num(settings.minimumObjectiveR, 0.8, 0, 3)

      const entryMode = pick(settings.entryMode, ['First touch', 'Midpoint reclaim', 'Rejection close'], 'Rejection close')
      const atrLength = int(settings.atrLength, 14, 5, 100)
      const stopBufferTicks = int(settings.stopBufferTicks, 2, 0, 100)
      const stopLimitMode = pick(settings.stopLimitMode, ['Automatic', 'Custom', 'Off'], 'Automatic')
      const customMaxStopTicks = int(settings.customMaxStopTicks, 40, 2, 400)
      const maximumStopAtr = num(settings.maximumStopAtr, 0.8, 0.1, 5)
      const tradeDurationSeconds = int(settings.tradeDurationMinutes, 30, 5, 240) * 60
      const maximumRetainedTrades = int(settings.maximumRetainedTrades, 20, 3, MAX_TRADES)

      const showZoneScores = bool(settings.showZoneScores, false)
      const zoneLabelPlacement = pick(settings.zoneLabelPlacement, ['Inside right', 'Above right'], 'Inside right')
      const liquidityLabelOffsetTicks = int(settings.liquidityLabelOffsetTicks, 2, 0, 20)

      const researchBuild = bool(settings.researchBuild, false)
      const showAllResearchZones = bool(settings.showAllResearchZones, false)
      const researchZoneFilter = pick(settings.researchZoneFilter, ['Relevant only', 'All active'], 'Relevant only')
      const showLiquidityPoolLines = bool(settings.showLiquidityPoolLines, false)
      const liquidityPoolForwardSeconds = int(settings.liquidityPoolForwardMinutes, 10, 1, 120) * 60
      const showInvalidatedZoneHistory = bool(settings.showInvalidatedZoneHistory, true)
      const invalidatedZoneRetentionSeconds = int(settings.invalidatedZoneRetentionMinutes, 120, 5, 1440) * 60
      const maximumResearchZones = int(settings.maximumResearchZones, 20, 5, 60)
      const researchCandidateMinimum = int(settings.researchCandidateMinimum, 35, 0, 100)
      const showRejectedCandidates = bool(settings.showRejectedCandidates, false)

      /* ---- instrument and chart geometry --------------------------------- */
      let barSeconds = 0
      if (n >= 2) {
        const diffs = []
        for (let i = 1; i < n; i++) {
          const d = bars[i].time - bars[i - 1].time
          if (d > 0) diffs.push(d)
        }
        if (diffs.length > 0) {
          diffs.sort((a, b) => a - b)
          barSeconds = diffs[Math.floor(diffs.length / 2)]
        }
      }
      if (!(barSeconds > 0)) {
        let fromInterval = 0
        try {
          if (ctx && ctx.interval) fromInterval = Number(intervalToSeconds(ctx.interval))
        } catch (e) {
          fromInterval = 0
        }
        barSeconds = fromInterval > 0 ? fromInterval : 60
      }

      // syminfo.mintick has no direct equivalent. The price scale carries one
      // when the host set a minMove; otherwise a tick is inferred from the
      // typical bar range so the tick-denominated filters keep their meaning.
      const hostTick = Number(ctx && ctx.tickSize) > 0 ? Number(ctx.tickSize) : 0
      let tick = hostTick
      if (!(tick > 0)) {
        const ranges = []
        for (let i = 0; i < n; i++) {
          const r = bars[i].high - bars[i].low
          if (r > 0) ranges.push(r)
        }
        ranges.sort((a, b) => a - b)
        const median = ranges.length > 0 ? ranges[Math.floor(ranges.length / 2)] : 0
        tick = median > 0 ? median / 20 : 0.01
      }
      if (!(tick > 0)) tick = 0.01
      const snap = (v) => (hostTick > 0 && fin(v) ? roundToTick(v, hostTick) : v)

      const symbolText = String(ctx && ctx.symbol ? ctx.symbol : '').toUpperCase()
      const rootMatch = symbolText.match(/^[A-Z]+/)
      const rootSymbol = rootMatch ? rootMatch[0] : ''
      const symbolKnown = rootSymbol !== ''
      const chartIsNq = rootSymbol === 'NQ' || rootSymbol === 'MNQ'
      const chartIsEs = rootSymbol === 'ES' || rootSymbol === 'MES'
      const supportedSymbol = chartIsNq || chartIsEs
      // The source can always read a root. When the host has named no symbol
      // there is nothing to check, so the gate cannot be what refuses.
      const symbolGateOk = supportedSymbol || allowUnsupportedSymbols || !symbolKnown
      const isIntraday = barSeconds < 86400
      const chartMinutes = isIntraday ? Math.round(barSeconds / 60) : 0
      const supportedTimeframe =
        isIntraday && (chartMinutes === 1 || (allowNonOneMinuteCharts && chartMinutes >= 1 && chartMinutes <= 5))
      // The source's engineSupported covers only the symbol and the timeframe.
      // "Enable indicator" gates zone registration instead, one level down.
      const engineSupported = symbolGateOk && supportedTimeframe
      const executionTfLabel = chartMinutes === 1 ? '1M' : chartMinutes > 0 ? String(chartMinutes) + 'M' : 'D'
      // The source passes timeframe.period as the chart zone's sourceTf, so on a
      // 2m to 5m chart those zones take that timeframe's authority points,
      // overlap rank and lifetime, not the 1m ones.
      const chartTf = chartMinutes > 0 ? String(chartMinutes) : 'chart'
      const autoMaxStopTicks = chartIsEs ? 12 : 32

      /* ---- base series --------------------------------------------------- */
      const high = new Array(n)
      const low = new Array(n)
      const close = new Array(n)
      const open = new Array(n)
      const volume = new Array(n)
      const times = new Array(n)
      for (let i = 0; i < n; i++) {
        const b = bars[i]
        high[i] = b.high
        low[i] = b.low
        close[i] = b.close
        open[i] = b.open
        volume[i] = fin(b.volume) ? b.volume : 0
        times[i] = b.time
      }
      const closeTime = (i) => times[i] + barSeconds

      const atrArr = taAtr(high, low, close, atrLength)
      const rsiArr = taRsi(close, rsiLength)
      const zMean = taSma(close, zScoreLength)
      const zStd = taStdev(close, zScoreLength)
      const zScore = new Array(n).fill(NaN)
      for (let i = 0; i < n; i++) {
        if (fin(zStd[i]) && zStd[i] > 0 && fin(zMean[i])) zScore[i] = (close[i] - zMean[i]) / zStd[i]
      }
      const localEma20 = taEma(close, 20)
      const localEma50 = taEma(close, 50)
      const pivotHighArr = taPivotHigh(high, pivotLeft, pivotRight)
      const pivotLowArr = taPivotLow(low, pivotLeft, pivotRight)
      const chartHighest = taHighest(high, htfBosLookback)
      const chartLowest = taLowest(low, htfBosLookback)

      /* ---- calendar ------------------------------------------------------ */
      const offset = new Array(n)
      const localSec = new Array(n)
      const tradingDay = new Array(n)
      const dateKey = new Array(n)
      const minuteOfDay = new Array(n)
      for (let i = 0; i < n; i++) {
        offset[i] = zoneOffsetSeconds(times[i], zone)
        localSec[i] = times[i] + offset[i]
        tradingDay[i] = Math.floor((localSec[i] - 64800) / 86400)
        const p = utcSecondsToZonedParts(times[i], zone)
        dateKey[i] = p.year * 10000 + p.month * 100 + p.day
        minuteOfDay[i] = p.hour * 60 + p.minute
      }
      // The CME week opens with the Sunday-evening trading day. Day 0 of the
      // 18:00-anchored day index is a Thursday, so +4 puts Sunday first.
      const weekIndex = tradingDay.map((d) => Math.floor((d + 4) / 7))

      // timestamp(tz, y, m, d, hh, mm) for the calendar day a bar falls on.
      const wallClock = (i, hour, minute, dayOffset) => {
        const dayStart = Math.floor(localSec[i] / 86400) * 86400
        const target = dayStart + dayOffset * 86400 + hour * 3600 + minute * 60
        let utc = target - offset[i]
        const refined = zoneOffsetSeconds(utc, zone)
        if (refined !== offset[i]) utc = target - refined
        return utc
      }

      const inSpec = (specValue, i) => {
        if (!specValue) return false
        try {
          return inSessionAt(times[i], specValue, zone) === true
        } catch (e) {
          return false
        }
      }
      const inFutures = new Array(n)
      const inOvernight = new Array(n)
      const inRth = new Array(n)
      const inSignalWindow = new Array(n)
      for (let i = 0; i < n; i++) {
        inFutures[i] = inSpec(futuresSpec, i)
        inOvernight[i] = inSpec(overnightSpec, i)
        inRth[i] = inSpec(rthSpec, i)
        inSignalWindow[i] = inSpec(signalSpec, i)
      }

      // request.security(tickerid, "1D" / "1W", [high[1], low[1]], lookahead_on)
      // folded: the previous bucket's extremes, available from its first bar.
      const previousExtremes = (bucketOf) => {
        const hi = new Array(n).fill(NaN)
        const lo = new Array(n).fill(NaN)
        let key = null
        let curHigh = -Infinity
        let curLow = Infinity
        let prevHigh = NaN
        let prevLow = NaN
        for (let i = 0; i < n; i++) {
          if (bucketOf[i] !== key) {
            if (key !== null) {
              prevHigh = curHigh
              prevLow = curLow
            }
            key = bucketOf[i]
            curHigh = -Infinity
            curLow = Infinity
          }
          hi[i] = prevHigh
          lo[i] = prevLow
          if (high[i] > curHigh) curHigh = high[i]
          if (low[i] < curLow) curLow = low[i]
        }
        return [hi, lo]
      }
      const dailyExtremes = previousExtremes(tradingDay)
      const weeklyExtremes = previousExtremes(weekIndex)
      const pdhArr = dailyExtremes[0]
      const pdlArr = dailyExtremes[1]
      const pwhArr = weeklyExtremes[0]
      const pwlArr = weeklyExtremes[1]

      /* ---- higher timeframes, folded from the chart's own bars ------------ */
      const at = (arr, k) => (k >= 0 && k < arr.length && fin(arr[k]) ? arr[k] : NaN)

      const buildHtf = (minutes) => {
        const size = minutes * 60
        const bucket = new Array(n)
        const H = { time: [], open: [], high: [], low: [], close: [], volume: [], day: [] }
        let current = null
        for (let i = 0; i < n; i++) {
          const b = Math.floor((localSec[i] - 64800) / size)
          if (b !== current) {
            current = b
            H.time.push(times[i])
            H.open.push(open[i])
            H.high.push(high[i])
            H.low.push(low[i])
            H.close.push(close[i])
            H.volume.push(volume[i])
            H.day.push(tradingDay[i])
          } else {
            const k = H.time.length - 1
            if (high[i] > H.high[k]) H.high[k] = high[i]
            if (low[i] < H.low[k]) H.low[k] = low[i]
            H.close[k] = close[i]
            H.volume[k] += volume[i]
          }
          bucket[i] = H.time.length - 1
        }
        const m = H.close.length
        const D = {
          atr: taAtr(H.high, H.low, H.close, atrLength),
          ema20: taEma(H.close, 20),
          ema50: taEma(H.close, 50),
          rsi: taRsi(H.close, rsiLength),
          volAvg: taSma(H.volume, 20),
          highest: taHighest(H.high, htfBosLookback),
          lowest: taLowest(H.low, htfBosLookback),
          vwap: new Array(m).fill(NaN),
        }
        // ta.vwap re-anchors on the session, which for CME futures is 18:00.
        let pv = 0
        let vv = 0
        let day = null
        for (let k = 0; k < m; k++) {
          if (H.day[k] !== day) {
            day = H.day[k]
            pv = 0
            vv = 0
          }
          pv += ((H.high[k] + H.low[k] + H.close[k]) / 3) * H.volume[k]
          vv += H.volume[k]
          D.vwap[k] = vv > 0 ? pv / vv : NaN
        }
        return { bucket, H, D, payload: new Array(m).fill(null) }
      }

      const htfPayload = (tf, N) => {
        if (N < 1) return null
        if (tf.payload[N]) return tf.payload[N]
        const H = tf.H
        const D = tf.D
        const i1 = N - 1
        const i2 = N - 2
        const i3 = N - 3
        const i4 = N - 4
        const c1 = at(H.close, i1)
        const o1 = at(H.open, i1)
        const h1 = at(H.high, i1)
        const l1 = at(H.low, i1)
        const atr1 = at(D.atr, i1)
        const range1 = h1 - l1
        const body1 = Math.abs(c1 - o1)
        const bodyFraction = range1 > 0 ? body1 / range1 : 0
        const bullDisplacement = c1 > o1 && body1 >= atr1 * htfDisplacementAtr && bodyFraction >= htfDisplacementBodyFraction
        const bearDisplacement = c1 < o1 && body1 >= atr1 * htfDisplacementAtr && bodyFraction >= htfDisplacementBodyFraction
        const priorHigh = at(D.highest, i2)
        const priorLow = at(D.lowest, i2)
        const c2 = at(H.close, i2)
        const o2 = at(H.open, i2)

        let regime = 0
        const e201 = at(D.ema20, i1)
        const e501 = at(D.ema50, i1)
        const e204 = at(D.ema20, i4)
        const vwap1 = at(D.vwap, i1)
        const rsi1 = at(D.rsi, i1)
        const c4 = at(H.close, i4)
        const volAvg1 = at(D.volAvg, i1)
        const vol1 = at(H.volume, i1)
        if (c1 > e201 && e201 > e501) regime += 28
        else if (c1 < e201 && e201 < e501) regime -= 28
        if (e201 > e204) regime += 14
        else if (e201 < e204) regime -= 14
        if (c1 > vwap1) regime += 16
        else if (c1 < vwap1) regime -= 16
        if (rsi1 >= 60) regime += 16
        else if (rsi1 >= 53) regime += 8
        else if (rsi1 <= 40) regime -= 16
        else if (rsi1 <= 47) regime -= 8
        const momentum = atr1 > 0 ? (c1 - c4) / atr1 : 0
        if (momentum >= 1) regime += 16
        else if (momentum >= 0.35) regime += 8
        else if (momentum <= -1) regime -= 16
        else if (momentum <= -0.35) regime -= 8
        const volRatio = volAvg1 > 0 ? vol1 / volAvg1 : 1
        if (volRatio >= 1.2) regime += regime > 0 ? 10 : regime < 0 ? -10 : 0
        regime = Math.round(clamp(regime, -100, 100))

        const result = {
          bullFvg: l1 > at(H.high, i3),
          bullFvgTop: l1,
          bullFvgBottom: at(H.high, i3),
          bullFvgTime: at(H.time, i3),
          bearFvg: h1 < at(H.low, i3),
          bearFvgTop: at(H.low, i3),
          bearFvgBottom: h1,
          bearFvgTime: at(H.time, i3),
          bullOb: bullDisplacement && c1 > priorHigh && c2 < o2,
          bearOb: bearDisplacement && c1 < priorLow && c2 > o2,
          obTop: at(H.high, i2),
          obBottom: at(H.low, i2),
          obTime: at(H.time, i2),
          atr: atr1,
          regime,
        }
        tf.payload[N] = result
        return result
      }

      // The source computes every security call whatever the gates say: the
      // regime panel is explicitly the diagnostic that survives them.
      const htf = {}
      for (let t = 0; t < TF_LIST.length; t++) htf[TF_LIST[t]] = buildHtf(TF_LIST[t])

      /* ---- zone helpers -------------------------------------------------- */
      const timeframeRank = (tf) => (tf === '240' ? 6 : tf === '60' ? 5 : tf === '30' ? 4 : tf === '15' ? 3 : tf === '5' ? 2 : 1)
      const timeframeLabel = (tf) =>
        tf === '240' ? '4H' : tf === '60' ? '1H' : tf === '30' ? '30M' : tf === '15' ? '15M' : tf === '5' ? '5M' : executionTfLabel
      const zoneMaxLifeMinutes = (tf) =>
        tf === '240'
          ? zoneLife[240]
          : tf === '60'
            ? zoneLife[60]
            : tf === '30'
              ? zoneLife[30]
              : tf === '15'
                ? zoneLife[15]
                : tf === '5'
                  ? zoneLife[5]
                  : zoneLife.chart
      const zoneLifeMinutes = (tf, score) => {
        const maximumLife = zoneMaxLifeMinutes(tf)
        const multiplier =
          zoneLifetimeMode === 'Fixed by timeframe' ? 1 : score >= strongZoneScore ? 1 : score >= moderateZoneScore ? 0.75 : 0.5
        return Math.max(2, Math.round(maximumLife * multiplier))
      }
      // 17:00 local on the day of the timestamp itself, never on the day of the
      // bar being processed: the source derives y/m/d from the detection time,
      // so re-evaluating an old 4H zone must keep giving the same close. A zone
      // holds one detectedTime for its whole life, so memoising on it is exact.
      const sessionCloseMemo = new Map()
      const wallClockAt = (t, hour, minute, dayOffset) => {
        const off = zoneOffsetSeconds(t, zone)
        const dayStart = Math.floor((t + off) / 86400) * 86400
        const target = dayStart + dayOffset * 86400 + hour * 3600 + minute * 60
        let utc = target - off
        const refined = zoneOffsetSeconds(utc, zone)
        if (refined !== off) utc = target - refined
        return utc
      }
      const futuresSessionCloseAfter = (timestamp) => {
        const cached = sessionCloseMemo.get(timestamp)
        if (cached !== undefined) return cached
        const today = wallClockAt(timestamp, 17, 0, 0)
        const result = timestamp < today ? today : wallClockAt(timestamp, 17, 0, 1)
        sessionCloseMemo.set(timestamp, result)
        return result
      }
      const zoneExpiryTime = (detectedTime, tf, score, lifetimeFactor) => {
        const safeFactor = clamp(lifetimeFactor, 0.1, 1)
        if (tf === '240' && fourHourZonesUntilSessionEnd) {
          const sessionClose = futuresSessionCloseAfter(detectedTime)
          const remaining = Math.max(120, sessionClose - detectedTime)
          return detectedTime + Math.round(remaining * safeFactor)
        }
        const baseMinutes = zoneLifeMinutes(tf, score)
        return detectedTime + Math.max(2, Math.round(baseMinutes * safeFactor)) * 60
      }
      const zoneAuthorityRaw = (tf, zoneType, top, bottom, sourceAtr) => {
        const tfPoints = tf === '240' ? 22 : tf === '60' ? 18 : tf === '30' ? 15 : tf === '15' ? 12 : tf === '5' ? 8 : 5
        const typePoints = zoneType === 'BB' ? 4 : zoneType === 'IFVG' ? 3 : zoneType === 'OB' ? 2 : 0
        const sizeAtr = sourceAtr > 0 ? Math.abs(top - bottom) / sourceAtr : 0
        const widthPoints = Math.round(clamp(sizeAtr / 0.6, 0, 1) * 4)
        return Math.min(tfPoints + typePoints + widthPoints, 30)
      }

      /* ---- engine state -------------------------------------------------- */
      const zones = []
      const activeZones = []
      const zoneIds = new Set()
      const liquidityPools = []
      const trades = []
      const pivotMarks = []
      const candidateLabels = []

      const dropActive = (z) => {
        const k = activeZones.indexOf(z)
        if (k >= 0) activeZones.splice(k, 1)
      }
      const activeTradeCount = () => {
        let count = 0
        for (let t = 0; t < trades.length; t++) if (trades[t].state === T_ACTIVE) count += 1
        return count
      }

      const registerZone = (i, zoneType, direction, tf, topValue, bottomValue, sourceTime, sourceAtrValue, lifetimeFactor) => {
        const top = Math.max(topValue, bottomValue)
        const bottom = Math.min(topValue, bottomValue)
        const sourceAtr = !fin(sourceAtrValue) || sourceAtrValue <= 0 ? atrArr[i] : sourceAtrValue
        if (!fin(top) || !fin(bottom) || !fin(sourceTime)) return
        const width = top - bottom
        const sizeAtr = fin(sourceAtr) && sourceAtr > 0 ? width / sourceAtr : NaN
        const sizeTicks = width / tick
        const id = zoneType + '|' + direction + '|' + tf + '|' + sourceTime
        const typeEnabled = zoneType === 'FVG' ? enableFvg : zoneType === 'IFVG' ? enableIfvg : zoneType === 'OB' ? enableOb : enableBb
        if (
          indicatorEnabled &&
          typeEnabled &&
          !zoneIds.has(id) &&
          fin(sizeAtr) &&
          sizeTicks >= minimumZoneTicks &&
          sizeAtr >= minimumZoneAtr &&
          sizeAtr <= maximumZoneAtr
        ) {
          const initialAuthority = zoneAuthorityRaw(tf, zoneType, top, bottom, sourceAtr)
          const detectedTime = closeTime(i)
          const zoneValue = {
            id,
            zoneType,
            sourceTf: tf,
            sourceRank: timeframeRank(tf),
            direction,
            top,
            bottom,
            midpoint: (top + bottom) * 0.5,
            sourceAtr,
            originTime: sourceTime,
            detectedTime,
            detectedBar: i,
            expiryTime: zoneExpiryTime(detectedTime, tf, Math.max(initialAuthority, moderateZoneScore), lifetimeFactor),
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
          activeZones.push(zoneValue)
          zoneIds.add(id)
        }
        while (zones.length > MAX_ZONES) {
          const old = zones.shift()
          zoneIds.delete(old.id)
          dropActive(old)
        }
      }

      // Only active zones can contribute overlap, so the scan is over those
      // rather than over every zone the engine has ever held.
      const overlapPoints = (target) => {
        let points = 0
        for (let k = 0; k < activeZones.length; k++) {
          const other = activeZones[k]
          if (other === target || other.direction !== target.direction) continue
          if (!(Math.max(target.bottom, other.bottom) < Math.min(target.top, other.top))) continue
          const tf = other.sourceTf
          const rankPoints = tf === '240' ? 15 : tf === '60' ? 12 : tf === '30' ? 9 : tf === '15' ? 7 : tf === '5' ? 4 : 2
          const nested = target.bottom >= other.bottom && target.top <= other.top
          points += rankPoints + (nested ? 3 : 0)
        }
        return Math.min(points, 25)
      }

      const nearPrice = (a, b, tolerance) => fin(a) && fin(b) && Math.abs(a - b) <= tolerance

      const registerLiquidityPool = (i, side, pivotPrice, originBar, originTime) => {
        const tolerance = liquidityPoolToleranceTicks * tick
        let matched = null
        let nearest = Infinity
        for (let k = 0; k < liquidityPools.length; k++) {
          const pool = liquidityPools[k]
          const distance = Math.abs(pool.price - pivotPrice)
          const eligible =
            pool.active && pool.side === side && originBar - pool.lastTouchBar <= liquidityPoolLookbackBars && distance <= tolerance
          if (eligible && distance < nearest) {
            matched = pool
            nearest = distance
          }
        }
        if (!matched) {
          liquidityPools.push({
            id: 'LP|' + side + '|' + originTime,
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
          const newBoundaryExtreme = side === POOL_SUPPORT ? pivotPrice < matched.price : pivotPrice > matched.price
          if (newBoundaryExtreme) {
            matched.price = pivotPrice
            matched.firstBar = originBar
            matched.firstTime = originTime
          }
          matched.touches += 1
          matched.lastTouchBar = originBar
          matched.lastTouchTime = originTime
          if (!fin(matched.qualifiedTime) && matched.touches >= liquidityPoolMinimumTouches) matched.qualifiedTime = closeTime(i)
        }
        while (liquidityPools.length > MAX_LIQUIDITY_POOLS) liquidityPools.shift()
      }

      const poolNearZone = (zoneValue) => {
        const requiredSide = zoneValue.direction === DIR_BULL ? POOL_SUPPORT : POOL_RESISTANCE
        const tolerance = liquidityPoolToleranceTicks * tick
        let bestTouches = 0
        let bestPrice = NaN
        for (let k = 0; k < liquidityPools.length; k++) {
          const pool = liquidityPools[k]
          const inRange = pool.price >= zoneValue.bottom - tolerance && pool.price <= zoneValue.top + tolerance
          if (
            pool.active &&
            pool.side === requiredSide &&
            pool.touches >= liquidityPoolMinimumTouches &&
            inRange &&
            pool.touches > bestTouches
          ) {
            bestTouches = pool.touches
            bestPrice = pool.price
          }
        }
        return { price: bestPrice, touches: bestTouches }
      }

      const nearestPoolObjective = (direction, entryPrice) => {
        const requiredSide = direction === DIR_BULL ? POOL_RESISTANCE : POOL_SUPPORT
        let bestPrice = NaN
        let bestDistance = Infinity
        for (let k = 0; k < liquidityPools.length; k++) {
          const pool = liquidityPools[k]
          const validDirection = direction === DIR_BULL ? pool.price > entryPrice : pool.price < entryPrice
          if (pool.active && pool.side === requiredSide && pool.touches >= liquidityPoolMinimumTouches && validDirection) {
            const distance = Math.abs(pool.price - entryPrice)
            if (distance < bestDistance) {
              bestDistance = distance
              bestPrice = pool.price
            }
          }
        }
        return bestPrice
      }

      const objectiveDistance = (direction, entryPrice, references) => {
        let result = NaN
        for (let k = 0; k < references.length; k++) {
          const level = references[k]
          if (!fin(level)) continue
          const valid = direction === DIR_BULL ? level > entryPrice : level < entryPrice
          const distance = Math.abs(level - entryPrice)
          if (valid && (!fin(result) || distance < result)) result = distance
        }
        return result
      }

      const stopValid = (direction, entryPrice, stopPrice, atrValue) => {
        const risk = Math.abs(entryPrice - stopPrice)
        const riskTicks = risk / tick
        const riskAtr = fin(atrValue) && atrValue > 0 ? risk / atrValue : NaN
        const maxTicks = stopLimitMode === 'Automatic' ? autoMaxStopTicks : customMaxStopTicks
        const sideValid = direction === DIR_BULL ? stopPrice < entryPrice : stopPrice > entryPrice
        const limitsValid =
          stopLimitMode === 'Off' || (riskTicks >= 2 && riskTicks <= maxTicks && (!fin(riskAtr) || riskAtr <= maximumStopAtr))
        return sideValid && risk > tick && limitsValid
      }

      const entryTrigger = (i, zoneValue) => {
        const intersects = low[i] <= zoneValue.top && high[i] >= zoneValue.bottom
        if (entryMode === 'First touch') return intersects
        if (entryMode === 'Midpoint reclaim') {
          return zoneValue.direction === DIR_BULL
            ? intersects && low[i] <= zoneValue.midpoint && close[i] > zoneValue.midpoint
            : intersects && high[i] >= zoneValue.midpoint && close[i] < zoneValue.midpoint
        }
        return zoneValue.direction === DIR_BULL
          ? intersects && close[i] > zoneValue.midpoint && close[i] > open[i]
          : intersects && close[i] < zoneValue.midpoint && close[i] < open[i]
      }

      /* ---- carried state ------------------------------------------------- */
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
      let latestSwingHigh = NaN
      let previousSwingHigh = NaN
      let latestSwingLow = NaN
      let previousSwingLow = NaN
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
      const regimeByTf = { 5: NaN, 15: NaN, 30: NaN, 60: NaN, 240: NaN }
      let localRegimeScore = 0
      let weightedRegimeScore = 0

      // Everything the source guards with barstate.isconfirmed. A forming bar
      // is not confirmed, so a signal cannot appear and then unprint.
      const lastConfirmed = !!(ctx && ctx.barState && ctx.barState.isConfirmed === true)

      /* ---- the bar loop -------------------------------------------------- */
      for (let i = 0; i < n; i++) {
        const isConfirmed = i < n - 1 || lastConfirmed
        const tClose = closeTime(i)
        const atrNow = fin(atrArr[i]) ? atrArr[i] : NaN
        const newTradingDay = i > 0 && tradingDay[i] !== tradingDay[i - 1]
        const newFuturesSession = inFutures[i] && (i === 0 || !inFutures[i - 1] || newTradingDay)
        const newOvernight = inOvernight[i] && (i === 0 || !inOvernight[i - 1] || newTradingDay)
        const newRth = inRth[i] && (i === 0 || !inRth[i - 1] || dateKey[i] !== dateKey[i - 1])
        const hlc3 = (high[i] + low[i] + close[i]) / 3

        if (newFuturesSession) {
          futuresPv = hlc3 * volume[i]
          futuresVolume = volume[i]
        } else if (inFutures[i]) {
          futuresPv += hlc3 * volume[i]
          futuresVolume += volume[i]
        }
        if (newRth) {
          rthPv = hlc3 * volume[i]
          rthVolume = volume[i]
        } else if (inRth[i]) {
          rthPv += hlc3 * volume[i]
          rthVolume += volume[i]
        }
        const futuresVwap = futuresVolume > 0 ? futuresPv / futuresVolume : NaN
        const rthVwap = rthVolume > 0 ? rthPv / rthVolume : NaN
        const activeVwap = inRth[i] && fin(rthVwap) ? rthVwap : futuresVwap

        const minutesSinceFuturesOpen = minuteOfDay[i] >= 1080 ? minuteOfDay[i] - 1080 : minuteOfDay[i] + 360
        const sessionSlot = chartMinutes > 0 ? Math.floor(minutesSinceFuturesOpen / chartMinutes) : -1
        const validSessionSlot = inFutures[i] && sessionSlot >= 0 && sessionSlot < MAX_SESSION_SLOTS
        let rvol = NaN
        if (validSessionSlot) {
          const existing = rvolSlots.get(sessionSlot)
          if (existing && existing.count >= rvolMinimumSamples) {
            const average = existing.sum / existing.count
            if (average > 0) rvol = volume[i] / average
          }
          if (isConfirmed) {
            const slot = existing || { sum: 0, count: 0, writePosition: 0, history: new Array(rvolBaselineSessions).fill(NaN) }
            const old = slot.history[slot.writePosition]
            slot.sum = slot.sum - (fin(old) ? old : 0) + volume[i]
            slot.count = Math.min(slot.count + (fin(old) ? 0 : 1), rvolBaselineSessions)
            slot.history[slot.writePosition] = volume[i]
            slot.writePosition = (slot.writePosition + 1) % rvolBaselineSessions
            rvolSlots.set(sessionSlot, slot)
          }
        }

        if (newOvernight) {
          overnightHigh = high[i]
          overnightLow = low[i]
        } else if (inOvernight[i]) {
          overnightHigh = !fin(overnightHigh) ? high[i] : Math.max(overnightHigh, high[i])
          overnightLow = !fin(overnightLow) ? low[i] : Math.min(overnightLow, low[i])
        }

        let inOpeningRange = false
        if (inRth[i]) {
          const openingRangeStart = wallClock(i, 9, 30, 0)
          inOpeningRange = isIntraday && times[i] < openingRangeStart + openingRangeMinutes * 60 && tClose > openingRangeStart
        }
        if (newRth) {
          openingRangeHigh = high[i]
          openingRangeLow = low[i]
          openingRangeComplete = false
        } else if (inOpeningRange) {
          openingRangeHigh = Math.max(fin(openingRangeHigh) ? openingRangeHigh : high[i], high[i])
          openingRangeLow = Math.min(fin(openingRangeLow) ? openingRangeLow : low[i], low[i])
        } else if (inRth[i] && !openingRangeComplete && fin(openingRangeHigh)) {
          openingRangeComplete = true
        }

        const pdh = pdhArr[i]
        const pdl = pdlArr[i]
        const pwh = pwhArr[i]
        const pwl = pwlArr[i]

        /* higher-timeframe payloads, and the zones they register */
        for (let t = 0; t < TF_LIST.length; t++) {
          const minutes = TF_LIST[t]
          const tf = htf[minutes]
          const payload = htfPayload(tf, tf.bucket[i])
          regimeByTf[minutes] = payload ? payload.regime : NaN
          if (!payload || !engineSupported || !isConfirmed || !useTf[minutes]) continue
          const key = String(minutes)
          if (payload.bullFvg) {
            registerZone(i, 'FVG', DIR_BULL, key, payload.bullFvgTop, payload.bullFvgBottom, payload.bullFvgTime, payload.atr, 1)
          }
          if (payload.bearFvg) {
            registerZone(i, 'FVG', DIR_BEAR, key, payload.bearFvgTop, payload.bearFvgBottom, payload.bearFvgTime, payload.atr, 1)
          }
          if (payload.bullOb) registerZone(i, 'OB', DIR_BULL, key, payload.obTop, payload.obBottom, payload.obTime, payload.atr, 1)
          if (payload.bearOb) registerZone(i, 'OB', DIR_BEAR, key, payload.obTop, payload.obBottom, payload.obTime, payload.atr, 1)
        }

        /* chart-timeframe zones */
        const chartRange = high[i] - low[i]
        const chartBody = Math.abs(close[i] - open[i])
        const chartBodyFraction = chartRange > 0 ? chartBody / chartRange : 0
        const chartBullDisp =
          close[i] > open[i] && chartBody >= atrNow * htfDisplacementAtr && chartBodyFraction >= htfDisplacementBodyFraction
        const chartBearDisp =
          close[i] < open[i] && chartBody >= atrNow * htfDisplacementAtr && chartBodyFraction >= htfDisplacementBodyFraction
        if (engineSupported && useChartZones && isConfirmed && i >= 2) {
          if (low[i] > high[i - 2]) registerZone(i, 'FVG', DIR_BULL, chartTf, low[i], high[i - 2], times[i - 2], atrNow, 1)
          if (high[i] < low[i - 2]) registerZone(i, 'FVG', DIR_BEAR, chartTf, low[i - 2], high[i], times[i - 2], atrNow, 1)
          if (chartBullDisp && close[i] > at(chartHighest, i - 1) && close[i - 1] < open[i - 1]) {
            registerZone(i, 'OB', DIR_BULL, chartTf, high[i - 1], low[i - 1], times[i - 1], atrNow, 1)
          }
          if (chartBearDisp && close[i] < at(chartLowest, i - 1) && close[i - 1] > open[i - 1]) {
            registerZone(i, 'OB', DIR_BEAR, chartTf, high[i - 1], low[i - 1], times[i - 1], atrNow, 1)
          }
        }

        /* pivots, swings and liquidity pools */
        if (isConfirmed && fin(pivotHighArr[i])) {
          previousSwingHigh = latestSwingHigh
          latestSwingHigh = pivotHighArr[i]
          const originBar = i - pivotRight
          const originTime = times[originBar >= 0 ? originBar : 0]
          pivotMarks.push({ price: pivotHighArr[i], side: DIR_BULL, originBar, originTime })
          if (useLiquidityPools) registerLiquidityPool(i, POOL_RESISTANCE, pivotHighArr[i], originBar, originTime)
        }
        if (isConfirmed && fin(pivotLowArr[i])) {
          previousSwingLow = latestSwingLow
          latestSwingLow = pivotLowArr[i]
          const originBar = i - pivotRight
          const originTime = times[originBar >= 0 ? originBar : 0]
          pivotMarks.push({ price: pivotLowArr[i], side: DIR_BEAR, originBar, originTime })
          if (useLiquidityPools) registerLiquidityPool(i, POOL_SUPPORT, pivotLowArr[i], originBar, originTime)
        }
        while (pivotMarks.length > MAX_PIVOTS) pivotMarks.shift()

        /* structure */
        const prevClose = i > 0 ? close[i - 1] : NaN
        const bullStructureEvent =
          isConfirmed && fin(latestSwingHigh) && close[i] > latestSwingHigh && fin(prevClose) && prevClose <= latestSwingHigh
        const bearStructureEvent =
          isConfirmed && fin(latestSwingLow) && close[i] < latestSwingLow && fin(prevClose) && prevClose >= latestSwingLow
        if (bullStructureEvent) {
          lastBullStructureType = trendDirection === DIR_BEAR ? 'MSS' : 'BOS'
          lastBullStructureBar = i
          lastBullStructureTime = tClose
          trendDirection = DIR_BULL
          structuralLegId += 1
        }
        if (bearStructureEvent) {
          lastBearStructureType = trendDirection === DIR_BULL ? 'MSS' : 'BOS'
          lastBearStructureBar = i
          lastBearStructureTime = tClose
          trendDirection = DIR_BEAR
          structuralLegId += 1
        }

        /* execution displacement */
        const executionBodyFrac = chartRange > 0 ? chartBody / chartRange : 0
        if (isConfirmed && close[i] > open[i] && chartBody >= atrNow * executionDisplacementAtr && executionBodyFrac >= executionBodyFraction) {
          lastBullDisplacementTime = tClose
        }
        if (isConfirmed && close[i] < open[i] && chartBody >= atrNow * executionDisplacementAtr && executionBodyFrac >= executionBodyFraction) {
          lastBearDisplacementTime = tClose
        }

        /* liquidity-pool sweeps */
        const poolTolerance = liquidityPoolToleranceTicks * tick
        let bullPoolSweep = false
        let bearPoolSweep = false
        if (isConfirmed && useLiquidityPools && liquidityPools.length > 0) {
          const breakDistance = liquidityPoolBreakTicks * tick
          for (let p = liquidityPools.length - 1; p >= 0; p--) {
            const pool = liquidityPools[p]
            if (!pool.active) continue
            const tooOld = i - pool.lastTouchBar > liquidityPoolLookbackBars
            const qualified = pool.touches >= liquidityPoolMinimumTouches
            const supportSweep = pool.side === POOL_SUPPORT && qualified && low[i] < pool.price - tick && close[i] > pool.price
            const resistanceSweep = pool.side === POOL_RESISTANCE && qualified && high[i] > pool.price + tick && close[i] < pool.price
            const supportBroken = pool.side === POOL_SUPPORT && close[i] < pool.price - breakDistance
            const resistanceBroken = pool.side === POOL_RESISTANCE && close[i] > pool.price + breakDistance
            if (supportSweep) {
              bullPoolSweep = true
              lastBullPoolSweepPrice = pool.price
              lastBullPoolSweepTouches = pool.touches
              pool.active = false
              pool.terminalTime = tClose
            } else if (resistanceSweep) {
              bearPoolSweep = true
              lastBearPoolSweepPrice = pool.price
              lastBearPoolSweepTouches = pool.touches
              pool.active = false
              pool.terminalTime = tClose
            } else if (supportBroken || resistanceBroken || tooOld) {
              pool.active = false
              pool.terminalTime = tClose
            }
          }
        }

        const bullStaticSweep =
          isConfirmed &&
          ((fin(overnightLow) && low[i] < overnightLow && close[i] > overnightLow) ||
            (fin(pdl) && low[i] < pdl && close[i] > pdl) ||
            (fin(pwl) && low[i] < pwl && close[i] > pwl) ||
            (openingRangeComplete && fin(openingRangeLow) && low[i] < openingRangeLow && close[i] > openingRangeLow))
        const bearStaticSweep =
          isConfirmed &&
          ((fin(overnightHigh) && high[i] > overnightHigh && close[i] < overnightHigh) ||
            (fin(pdh) && high[i] > pdh && close[i] < pdh) ||
            (fin(pwh) && high[i] > pwh && close[i] < pwh) ||
            (openingRangeComplete && fin(openingRangeHigh) && high[i] > openingRangeHigh && close[i] < openingRangeHigh))
        if (bullPoolSweep || bullStaticSweep) lastBullLiquidityBar = i
        if (bearPoolSweep || bearStaticSweep) lastBearLiquidityBar = i

        /* market context */
        const bullVwapReject =
          isConfirmed && useVwap && fin(activeVwap) && low[i] <= activeVwap && close[i] > activeVwap && close[i] > open[i]
        const bearVwapReject =
          isConfirmed && useVwap && fin(activeVwap) && high[i] >= activeVwap && close[i] < activeVwap && close[i] < open[i]
        const zPrev = i > 0 ? zScore[i - 1] : NaN
        const bullZReversal = useZScore && fin(zScore[i]) && fin(zPrev) && zPrev <= -zScoreExtreme && zScore[i] > zPrev
        const bearZReversal = useZScore && fin(zScore[i]) && fin(zPrev) && zPrev >= zScoreExtreme && zScore[i] < zPrev
        const rsiNow = rsiArr[i]
        const rsiPrev = i > 0 ? rsiArr[i - 1] : NaN
        const bullRsiContext =
          useRsi && fin(rsiNow) && fin(rsiPrev) && ((rsiPrev < 35 && rsiNow > rsiPrev) || (rsiNow > 50 && rsiNow > rsiPrev))
        const bearRsiContext =
          useRsi && fin(rsiNow) && fin(rsiPrev) && ((rsiPrev > 65 && rsiNow < rsiPrev) || (rsiNow < 50 && rsiNow < rsiPrev))
        const bullPo3 = usePowerOfThree && bullStaticSweep && fin(futuresVwap) && close[i] > futuresVwap
        const bearPo3 = usePowerOfThree && bearStaticSweep && fin(futuresVwap) && close[i] < futuresVwap
        const bullOrb =
          useOpeningRange && openingRangeComplete && fin(openingRangeHigh) && close[i] > openingRangeHigh && low[i] <= openingRangeHigh
        const bearOrb =
          useOpeningRange && openingRangeComplete && fin(openingRangeLow) && close[i] < openingRangeLow && high[i] >= openingRangeLow

        /* regime */
        const nz = (v) => (fin(v) ? v : 0)
        const e20 = localEma20[i]
        const e50 = localEma50[i]
        const e20Back = i >= 3 ? localEma20[i - 3] : NaN
        const closeBack = i >= 3 ? close[i - 3] : NaN
        let localScore = 0
        if (close[i] > e20 && e20 > e50) localScore += 28
        else if (close[i] < e20 && e20 < e50) localScore -= 28
        if (e20 > e20Back) localScore += 14
        else if (e20 < e20Back) localScore -= 14
        if (close[i] > activeVwap) localScore += 16
        else if (close[i] < activeVwap) localScore -= 16
        if (rsiNow >= 60) localScore += 16
        else if (rsiNow >= 53) localScore += 8
        else if (rsiNow <= 40) localScore -= 16
        else if (rsiNow <= 47) localScore -= 8
        const localMomentum = fin(atrNow) && atrNow > 0 ? (close[i] - closeBack) / atrNow : 0
        if (localMomentum >= 1) localScore += 16
        else if (localMomentum >= 0.35) localScore += 8
        else if (localMomentum <= -1) localScore -= 16
        else if (localMomentum <= -0.35) localScore -= 8
        if ((fin(rvol) ? rvol : 1) >= elevatedRvol) localScore += localScore > 0 ? 10 : localScore < 0 ? -10 : 0
        localRegimeScore = Math.round(clamp(localScore, -100, 100))
        weightedRegimeScore = Math.round(
          (nz(regimeByTf[240]) * 25 +
            nz(regimeByTf[60]) * 20 +
            nz(regimeByTf[30]) * 15 +
            nz(regimeByTf[15]) * 15 +
            nz(regimeByTf[5]) * 15 +
            localRegimeScore * 10) /
            100
        )

        /* scoring one zone against everything computed above */
        const scoreZone = (zoneValue) => {
          const zonePoints = zoneAuthorityRaw(zoneValue.sourceTf, zoneValue.zoneType, zoneValue.top, zoneValue.bottom, zoneValue.sourceAtr)
          const overlap = overlapPoints(zoneValue)

          const structureTimeValue = zoneValue.direction === DIR_BULL ? lastBullStructureTime : lastBearStructureTime
          const structureBarValue = zoneValue.direction === DIR_BULL ? lastBullStructureBar : lastBearStructureBar
          const structureTypeValue = zoneValue.direction === DIR_BULL ? lastBullStructureType : lastBearStructureType
          const immediateStructure = fin(structureBarValue) && i - structureBarValue <= structureValidityBars
          const timedStructure = fin(structureTimeValue) && tClose - structureTimeValue <= structureValiditySeconds
          const sameLegStructure =
            zoneValue.structuralLegId > 0 && zoneValue.structuralLegId === structuralLegId && trendDirection === zoneValue.direction
          const structureRecent = immediateStructure || timedStructure || sameLegStructure
          const mssRecent = structureRecent && structureTypeValue === 'MSS'

          const displacementTimeValue = zoneValue.direction === DIR_BULL ? lastBullDisplacementTime : lastBearDisplacementTime
          const displacementRecent = fin(displacementTimeValue) && tClose - displacementTimeValue <= displacementValiditySeconds
          let structurePoints =
            (mssRecent ? 14 : structureRecent ? 10 : trendDirection === zoneValue.direction ? 6 : 0) + (displacementRecent ? 6 : 0)
          structurePoints = Math.min(structurePoints, 20)

          const liquidityBar = zoneValue.direction === DIR_BULL ? lastBullLiquidityBar : lastBearLiquidityBar
          const liquidityRecent = fin(liquidityBar) && i - liquidityBar <= liquiditySweepValidityBars
          const near = poolNearZone(zoneValue)
          const poolNear = useLiquidityPools && near.touches >= liquidityPoolMinimumTouches && fin(near.price)
          const sweptPoolPrice = zoneValue.direction === DIR_BULL ? lastBullPoolSweepPrice : lastBearPoolSweepPrice
          const sweptPoolTouches = zoneValue.direction === DIR_BULL ? lastBullPoolSweepTouches : lastBearPoolSweepTouches
          const sweptPoolNearZone =
            liquidityRecent &&
            sweptPoolTouches >= liquidityPoolMinimumTouches &&
            fin(sweptPoolPrice) &&
            sweptPoolPrice >= zoneValue.bottom - poolTolerance &&
            sweptPoolPrice <= zoneValue.top + poolTolerance
          const wide = fin(atrNow) ? atrNow * 0.2 : NaN
          const tight = fin(atrNow) ? atrNow * 0.15 : NaN
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
          const poolStrengthPoints = poolNear ? Math.min(7, 4 + Math.max(0, near.touches - liquidityPoolMinimumTouches)) : 0
          let liquidityPoints =
            (liquidityRecent ? 6 : 0) +
            (sweptPoolNearZone ? 3 : 0) +
            poolStrengthPoints +
            (staticNearZone ? 3 : 0) +
            (zoneValue.touchCount <= 1 ? 1 : 0)
          liquidityPoints = Math.min(liquidityPoints, 15)

          const vwapAligned =
            zoneValue.direction === DIR_BULL
              ? bullVwapReject || (nearPrice(zoneValue.midpoint, activeVwap, tight) && close[i] >= activeVwap)
              : bearVwapReject || (nearPrice(zoneValue.midpoint, activeVwap, tight) && close[i] <= activeVwap)
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
          contextPoints = Math.trunc(clamp(contextPoints, 0, 10))

          // The SMT term is structurally absent: it needs a second instrument.
          const po3Aligned = zoneValue.direction === DIR_BULL ? bullPo3 : bearPo3
          const orbAligned = zoneValue.direction === DIR_BULL ? bullOrb : bearOrb
          const intermarketPoints = Math.min((po3Aligned ? 2 : 0) + (orbAligned ? 2 : 0), 5)

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
            'Z ' +
            zonePoints +
            ' | MTF ' +
            overlap +
            ' | S ' +
            structurePoints +
            ' | L ' +
            liquidityPoints +
            ' | C ' +
            contextPoints +
            ' | X ' +
            intermarketPoints
          return { totalScore, categories, breakdown, structureRecent, displacementRecent }
        }

        /* the zone lifecycle pass */
        let bestZone = null
        let bestScore = -1
        let researchBestScore = -1
        let bestCategories = 0
        let bestBreakdown = ''
        let bestStop = NaN
        let bestRisk = NaN
        let researchCandidateEvent = false

        if (isConfirmed && zones.length > 0) {
          const snapshot = zones.slice()
          for (let z = snapshot.length - 1; z >= 0; z--) {
            const zoneValue = snapshot[z]
            if (zoneValue.state !== Z_ACTIVE) continue
            const closeInvalid = zoneValue.direction === DIR_BULL ? close[i] < zoneValue.bottom : close[i] > zoneValue.top
            if (closeInvalid) {
              const transformedType =
                zoneValue.zoneType === 'FVG' && enableIfvg ? 'IFVG' : zoneValue.zoneType === 'OB' && enableBb ? 'BB' : ''
              const originalDirection = zoneValue.direction
              const originalTop = zoneValue.top
              const originalBottom = zoneValue.bottom
              const originalSourceTf = zoneValue.sourceTf
              const originalAtr = zoneValue.sourceAtr
              zoneValue.state = Z_INVALID
              zoneValue.terminalTime = tClose
              zoneValue.rejectionReason = transformedType !== '' ? 'Inverted to ' + transformedType : 'Closed through invalidation'
              dropActive(zoneValue)
              if (transformedType !== '') {
                registerZone(
                  i,
                  transformedType,
                  -originalDirection,
                  originalSourceTf,
                  originalTop,
                  originalBottom,
                  times[i],
                  originalAtr,
                  transformedZoneLifetimePercent * 0.01
                )
              }
              continue
            }

            const intersects = low[i] <= zoneValue.top && high[i] >= zoneValue.bottom
            const penetration =
              zoneValue.direction === DIR_BULL ? Math.max(0, zoneValue.top - low[i]) : Math.max(0, high[i] - zoneValue.bottom)
            zoneValue.fillPercent = clamp(penetration / Math.max(zoneValue.top - zoneValue.bottom, tick), 0, 1)
            const firstInteractionNow = intersects && !zoneValue.wasIntersecting && i > zoneValue.detectedBar
            if (firstInteractionNow) zoneValue.touchCount += 1
            zoneValue.wasIntersecting = intersects

            const scored = scoreZone(zoneValue)
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
              zoneValue.lifetimeFactor
            )

            if (tClose > zoneValue.expiryTime) {
              zoneValue.state = Z_EXPIRED
              zoneValue.terminalTime = zoneValue.expiryTime
              zoneValue.rejectionReason = 'Zone expired'
              dropActive(zoneValue)
              continue
            }

            const trigger = i > zoneValue.detectedBar && entryTrigger(i, zoneValue)
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
            const stopValue = snap(
              zoneValue.direction === DIR_BULL ? zoneValue.bottom - stopBufferTicks * tick : zoneValue.top + stopBufferTicks * tick
            )
            const stopGate = stopValid(zoneValue.direction, close[i], stopValue, atrNow)
            const riskValue = Math.abs(close[i] - stopValue)
            const poolObjective = usePoolsAsObjectives ? nearestPoolObjective(zoneValue.direction, close[i]) : NaN
            const distance = objectiveDistance(zoneValue.direction, close[i], [
              pdh,
              pdl,
              pwh,
              pwl,
              overnightHigh,
              overnightLow,
              openingRangeHigh,
              openingRangeLow,
              poolObjective,
            ])
            const objectiveGate = minimumObjectiveR <= 0 || !fin(distance) || riskValue <= 0 || distance / riskValue >= minimumObjectiveR
            const scoreGate = scored.totalScore >= minimumScore && scored.categories >= minimumCategories
            const liveQualified =
              engineSupported &&
              inSignalWindow[i] &&
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
              latestCandidateZone = timeframeLabel(zoneValue.sourceTf) + ' ' + zoneValue.zoneType
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
                            : !inSignalWindow[i]
                              ? 'Outside signal window'
                              : 'Lifecycle gate'
            }

            if (researchBuild && intersects && scored.totalScore >= researchCandidateMinimum && !zoneValue.candidateCounted) {
              researchCandidateEvent = true
              zoneValue.candidateCounted = true
            }

            if (liveQualified && scored.totalScore > bestScore) {
              bestZone = zoneValue
              bestScore = scored.totalScore
              bestCategories = scored.categories
              bestBreakdown = scored.breakdown
              bestStop = stopValue
              bestRisk = riskValue
            }
          }
        }

        /* trade creation */
        if (isConfirmed && bestZone && activeTradeCount() < maximumActiveTrades) {
          const entryTime = tClose
          const plannedEnd = entryTime + tradeDurationSeconds
          const entryValue = close[i]
          const direction = bestZone.direction
          const target1 = snap(direction === DIR_BULL ? entryValue + bestRisk : entryValue - bestRisk)
          const target15 = snap(direction === DIR_BULL ? entryValue + bestRisk * 1.5 : entryValue - bestRisk * 1.5)
          const target2 = snap(direction === DIR_BULL ? entryValue + bestRisk * 2 : entryValue - bestRisk * 2)
          trades.push({
            id: 'MFS|' + times[i] + '|' + i,
            zoneType: bestZone.zoneType,
            sourceTf: bestZone.sourceTf,
            direction,
            state: T_ACTIVE,
            score: bestScore,
            categoryCount: bestCategories,
            evidence: timeframeLabel(bestZone.sourceTf) + ' ' + bestZone.zoneType + ' | ' + bestBreakdown,
            entryTime,
            entryBar: i,
            plannedEndTime: plannedEnd,
            terminalTime: NaN,
            entryPrice: entryValue,
            stopPrice: bestStop,
            target1,
            target15,
            target2,
            target1Hit: false,
            target15Hit: false,
            zoneTop: bestZone.top,
            zoneBottom: bestZone.bottom,
            outcome: null,
          })
          bestZone.state = Z_TRIGGERED
          bestZone.terminalTime = entryTime
          bestZone.structuralLegId = structuralLegId
          dropActive(bestZone)
          if (direction === DIR_BULL) {
            lastBullTradeBar = i
            lastBullTradeLeg = structuralLegId
            values.buyEvent[i] = 1
            values.signal[i] = 1
          } else {
            lastBearTradeBar = i
            lastBearTradeLeg = structuralLegId
            values.sellEvent[i] = 1
            values.signal[i] = -1
          }
          values.entry[i] = entryValue
          values.stop[i] = bestStop
          values.target1[i] = target1
          values.target15[i] = target15
          values.target2[i] = target2
        }

        /* trade management */
        if (isConfirmed && trades.length > 0) {
          for (let t = trades.length - 1; t >= 0; t--) {
            const trade = trades[t]
            if (trade.state === T_ACTIVE && i > trade.entryBar) {
              const stopHit = trade.direction === DIR_BULL ? low[i] <= trade.stopPrice : high[i] >= trade.stopPrice
              const target2Hit = trade.direction === DIR_BULL ? high[i] >= trade.target2 : low[i] <= trade.target2
              const target15Hit = trade.direction === DIR_BULL ? high[i] >= trade.target15 : low[i] <= trade.target15
              const target1Hit = trade.direction === DIR_BULL ? high[i] >= trade.target1 : low[i] <= trade.target1
              if (stopHit) {
                trade.state = T_STOPPED
                trade.terminalTime = tClose
                trade.outcome = { text: 'STOP -1R', price: trade.stopPrice, time: tClose }
                values.stopEvent[i] = 1
              } else if (target2Hit) {
                trade.target1Hit = true
                trade.target15Hit = true
                trade.state = T_COMPLETED
                trade.terminalTime = tClose
                trade.outcome = { text: 'TARGET +2R', price: trade.target2, time: tClose }
                values.targetEvent[i] = 1
              } else {
                if (target15Hit) {
                  trade.target15Hit = true
                  trade.target1Hit = true
                } else if (target1Hit) {
                  trade.target1Hit = true
                }
                if (tClose >= trade.plannedEndTime) {
                  trade.state = T_EXPIRED
                  trade.terminalTime = trade.plannedEndTime
                  trade.outcome = {
                    text: trade.target15Hit ? 'TIME +1.5R' : trade.target1Hit ? 'TIME +1R' : 'TIME',
                    price: trade.target15Hit ? trade.target15 : trade.target1Hit ? trade.target1 : trade.entryPrice,
                    time: trade.plannedEndTime,
                  }
                }
              }
            }
            if (trade.state !== T_ACTIVE) {
              const retention = (showPastTrades ? pastTradeRetentionHours * 60 : completedRetentionMinutes) * 60
              if (fin(trade.terminalTime) && times[i] > trade.terminalTime + retention) trades.splice(t, 1)
            }
          }
        }
        while (trades.length > maximumRetainedTrades) trades.shift()

        /* rejected-candidate labels */
        if (
          researchBuild &&
          showRejectedCandidates &&
          isConfirmed &&
          researchCandidateEvent &&
          fin(latestCandidateScore) &&
          latestCandidateScore >= researchCandidateMinimum &&
          latestCandidateReason !== 'LIVE QUALIFIED'
        ) {
          candidateLabels.push({
            time: times[i],
            price: close[i],
            text: 'CANDIDATE ' + latestCandidateScore + '\n' + latestCandidateReason,
          })
          while (candidateLabels.length > 80) candidateLabels.shift()
        }

        values.regime[i] = weightedRegimeScore
        values.regimeLocal[i] = localRegimeScore
        values.candidateScore[i] = fin(latestCandidateScore) ? latestCandidateScore : null
      }

      /* ---- the snapshot the hooks read ----------------------------------- */
      const last = n - 1
      const tCloseLast = closeTime(last)
      const atrLast = fin(atrArr[last]) ? atrArr[last] : NaN

      const researchZones = []
      if (researchBuild && showAllResearchZones) {
        let shown = 0
        for (let z = zones.length - 1; z >= 0 && shown < maximumResearchZones; z--) {
          const zoneValue = zones[z]
          const zoneDistance =
            close[last] > zoneValue.top
              ? close[last] - zoneValue.top
              : close[last] < zoneValue.bottom
                ? zoneValue.bottom - close[last]
                : 0
          const relevant =
            researchZoneFilter === 'All active' ||
            zoneValue.score >= researchCandidateMinimum ||
            (fin(atrLast) && zoneDistance <= atrLast * 4)
          const activeVisible = zoneValue.state === Z_ACTIVE
          const invalidVisible =
            showInvalidatedZoneHistory &&
            zoneValue.state === Z_INVALID &&
            fin(zoneValue.terminalTime) &&
            tCloseLast <= zoneValue.terminalTime + invalidatedZoneRetentionSeconds
          if (!relevant || !(activeVisible || invalidVisible)) continue
          const rightTime = activeVisible ? zoneValue.expiryTime : zoneValue.terminalTime
          if (!fin(rightTime)) continue
          const duration = Math.max(rightTime - zoneValue.originTime, 60)
          const labelInset = Math.min(30, Math.max(10, Math.round(duration * 0.05)))
          researchZones.push({
            top: zoneValue.top,
            bottom: zoneValue.bottom,
            left: zoneValue.originTime,
            right: rightTime,
            direction: zoneValue.direction,
            active: activeVisible,
            labelTime: zoneLabelPlacement === 'Inside right' ? rightTime - Math.round(labelInset * 0.55) : rightTime,
            labelPrice:
              zoneLabelPlacement === 'Inside right'
                ? zoneValue.midpoint
                : zoneValue.top + Math.max(tick * 4, (zoneValue.top - zoneValue.bottom) * 0.1),
            labelText:
              timeframeLabel(zoneValue.sourceTf) +
              ' ' +
              zoneValue.zoneType +
              (activeVisible ? '' : ' invalid') +
              (showZoneScores ? ' ' + zoneValue.score : ''),
          })
          shown += 1
        }
      }

      const poolLines = []
      if (researchBuild && showLiquidityPoolLines) {
        let shown = 0
        for (let p = liquidityPools.length - 1; p >= 0 && shown < 8; p--) {
          const pool = liquidityPools[p]
          if (!pool.active || pool.touches < liquidityPoolMinimumTouches) continue
          poolLines.push({
            side: pool.side,
            price: pool.price,
            left: pool.firstTime,
            right: tCloseLast + liquidityPoolForwardSeconds,
            labelPrice:
              pool.side === POOL_SUPPORT
                ? pool.price - liquidityLabelOffsetTicks * tick
                : pool.price + liquidityLabelOffsetTicks * tick,
            text: pool.side === POOL_SUPPORT ? 'SUPPORT ZONE' : 'RESISTANCE ZONE',
          })
          shown += 1
        }
      }

      values.state[last] = {
        trades: trades.map((t) => ({
          direction: t.direction,
          terminal: t.state !== T_ACTIVE,
          entryTime: t.entryTime,
          rightTime: t.state !== T_ACTIVE && fin(t.terminalTime) ? t.terminalTime : t.plannedEndTime,
          entryPrice: t.entryPrice,
          stopPrice: t.stopPrice,
          target1: t.target1,
          target15: t.target15,
          target2: t.target2,
          zoneTop: t.zoneTop,
          zoneBottom: t.zoneBottom,
          score: t.score,
          label: (t.direction === DIR_BULL ? 'BUY ' : 'SELL ') + t.score,
          evidence: t.evidence,
          outcome: t.outcome,
        })),
        researchZones,
        poolLines,
        candidates: candidateLabels.slice(),
        regime: {
          240: regimeByTf[240],
          60: regimeByTf[60],
          30: regimeByTf[30],
          15: regimeByTf[15],
          5: regimeByTf[5],
          local: localRegimeScore,
        },
        executionTfLabel,
        engineText: engineSupported ? 'READY' : supportedSymbol || !symbolKnown ? 'USE 1M' : 'CHECK SYMBOL',
        thresholdText: minimumScore + ' and ' + minimumCategories + ' categories',
        latestText: fin(latestCandidateScore) ? latestCandidateScore + ' ' + latestCandidateZone : '-',
        latestCategories: fin(latestCandidateCategories) ? latestCandidateCategories : null,
        latestBreakdown: latestCandidateBreakdown,
        latestReason: latestCandidateReason,
        swingHigh: fin(previousSwingHigh) ? previousSwingHigh : null,
        swingLow: fin(previousSwingLow) ? previousSwingLow : null,
      }

      values.signal = nulls(values.signal)
      values.entry = nulls(values.entry)
      values.stop = nulls(values.stop)
      values.target1 = nulls(values.target1)
      values.target15 = nulls(values.target15)
      values.target2 = nulls(values.target2)
      values.regime = nulls(values.regime)
      values.regimeLocal = nulls(values.regimeLocal)
      values.candidateScore = nulls(values.candidateScore)
      return values
    },

    // box.new / line.new / label.new all land here. Anchors are bar times, so
    // a trade plan stays welded to the candle it was taken on.
    draws({ bars, values }) {
      if (bars.length === 0) return []
      const snapshot = values.state[bars.length - 1]
      if (!snapshot) return []
      const out = []
      const finite = (a, b, c) => Number.isFinite(a) && Number.isFinite(b) && (c === undefined || Number.isFinite(c))

      const box = (left, right, top, bottom, color, opacity) => {
        if (!finite(left, right) || !finite(top, bottom)) return
        if (top === bottom) return
        out.push({
          kind: 'box',
          from: { time: left, price: Math.max(top, bottom) },
          to: { time: right, price: Math.min(top, bottom) },
          color: withAlpha(color, 0),
          fillColor: color,
          opacity,
        })
      }
      const line = (left, right, price, color, style) => {
        if (!finite(left, right, price)) return
        out.push({
          kind: 'line',
          from: { time: left, price },
          to: { time: right, price },
          color,
          lineWidth: 2,
          lineStyle: style || 'solid',
        })
      }
      const label = (time, price, text, color) => {
        if (!finite(time, price) || typeof text !== 'string' || text === '') return
        out.push({ kind: 'label', at: { time, price }, text, color })
      }

      for (let k = 0; k < snapshot.researchZones.length; k++) {
        const zoneValue = snapshot.researchZones[k]
        const color = zoneValue.direction === DIR_BULL ? BULL_ZONE : BEAR_ZONE
        box(zoneValue.left, zoneValue.right, zoneValue.top, zoneValue.bottom, color, zoneValue.active ? 0.06 : 0.03)
        label(zoneValue.labelTime, zoneValue.labelPrice, zoneValue.labelText, color)
      }

      for (let k = 0; k < snapshot.poolLines.length; k++) {
        const pool = snapshot.poolLines[k]
        const color = pool.side === POOL_SUPPORT ? BULL_ZONE : BEAR_ZONE
        line(pool.left, pool.right, pool.price, withAlpha(color, 0.68), 'dashed')
        label(pool.right, pool.labelPrice, pool.text, color)
      }

      for (let k = 0; k < snapshot.candidates.length; k++) {
        const candidate = snapshot.candidates[k]
        label(candidate.time, candidate.price, candidate.text, NEUTRAL_COLOR)
      }

      for (let k = 0; k < snapshot.trades.length; k++) {
        const trade = snapshot.trades[k]
        const bull = trade.direction === DIR_BULL
        const faded = trade.terminal
        const setupColor = faded ? NEUTRAL_COLOR : bull ? BULL_ZONE : BEAR_ZONE
        const stopColor = faded ? withAlpha(STOP_COLOR, 0.4) : STOP_COLOR
        const targetColor = faded ? withAlpha(TARGET_COLOR, 0.4) : TARGET_COLOR
        box(trade.entryTime, trade.rightTime, trade.zoneTop, trade.zoneBottom, setupColor, faded ? OP_HISTORICAL : OP_SETUP)
        box(trade.entryTime, trade.rightTime, trade.entryPrice, trade.stopPrice, RISK_COLOR, faded ? OP_HISTORICAL : OP_RISK)
        box(trade.entryTime, trade.rightTime, trade.entryPrice, trade.target1, REWARD_COLOR, faded ? OP_HISTORICAL : OP_REWARD1)
        box(trade.entryTime, trade.rightTime, trade.target1, trade.target15, REWARD_COLOR, faded ? OP_HISTORICAL : OP_REWARD15)
        box(trade.entryTime, trade.rightTime, trade.target15, trade.target2, REWARD_COLOR, faded ? OP_HISTORICAL : OP_REWARD2)
        line(trade.entryTime, trade.rightTime, trade.stopPrice, stopColor)
        line(trade.entryTime, trade.rightTime, trade.target1, targetColor)
        line(trade.entryTime, trade.rightTime, trade.target15, targetColor)
        line(trade.entryTime, trade.rightTime, trade.target2, targetColor)
        label(trade.entryTime, trade.entryPrice, trade.label, bull ? BULL_SIGNAL : BEAR_SIGNAL)
        label(trade.rightTime, trade.stopPrice, 'STOP', STOP_COLOR)
        label(trade.rightTime, trade.target1, '1R', TARGET_COLOR)
        label(trade.rightTime, trade.target15, '1.5R', TARGET_COLOR)
        label(trade.rightTime, trade.target2, '2R', TARGET_COLOR)
        if (trade.outcome) {
          const outcomeColor =
            trade.outcome.text.indexOf('STOP') === 0
              ? STOP_COLOR
              : trade.outcome.text.indexOf('TARGET') === 0
                ? TARGET_COLOR
                : NEUTRAL_COLOR
          label(trade.outcome.time, trade.outcome.price, trade.outcome.text, outcomeColor)
        }
      }
      return out
    },

    table({ bars, values, settings }) {
      if (bars.length === 0) return null
      if (settings.showRegimePanel === false) return null
      const snapshot = values.state[bars.length - 1]
      if (!snapshot) return null

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
        !Number.isFinite(score) ? NEUTRAL_COLOR : score >= 25 ? BULL_SIGNAL : score <= -25 ? BEAR_SIGNAL : NEUTRAL_COLOR
      const scoreText = (score) => (Number.isFinite(score) ? String(Math.abs(score)) : '-')
      const cell = (name, score) => ({
        text: name + '\n' + regimeText(score) + ' ' + scoreText(score),
        bgColor: withAlpha(regimeColor(score), 0.18),
        textColor: '#ffffff',
        align: 'center',
      })
      const plain = (text, color) => ({
        text,
        bgColor: withAlpha(color || NEUTRAL_COLOR, 0.12),
        textColor: '#ffffff',
        align: 'center',
      })
      const titleCell = (text) => ({
        text,
        bgColor: withAlpha(ACCENT_COLOR, 0.88),
        textColor: '#ffffff',
        bold: true,
        align: 'center',
      })
      const regime = snapshot.regime
      const ready = snapshot.engineText === 'READY'

      return {
        rows: [
          [titleCell('MERIDIAN REGIME DETECTION'), titleCell(''), titleCell('')],
          [cell('4H', regime[240]), cell('1H', regime[60]), cell('30M', regime[30])],
          [cell('15M', regime[15]), cell('5M', regime[5]), cell(snapshot.executionTfLabel, regime.local)],
          [
            plain('ENGINE\n' + snapshot.engineText, ready ? BULL_SIGNAL : BEAR_SIGNAL),
            plain('THRESHOLD\n' + snapshot.thresholdText),
            plain('LATEST\n' + snapshot.latestText),
          ],
        ],
        options: {
          position: PANEL_POSITIONS[settings.panelPosition] || 'bottom-right',
          fontSize: PANEL_FONT[settings.panelTextSize] || 9,
          cellWidth: 120,
          cellHeight: 30,
          borderColor: withAlpha(NEUTRAL_COLOR, 0.22),
          borderWidth: 1,
        },
      }
    },

    alerts: [
      {
        id: 'meridian-buy',
        title: 'Meridian BUY',
        message: 'Meridian Futures Setups produced a confirmed BUY signal.',
        when: ({ values, settings, index }) =>
          settings.enableAlerts !== false && settings.alertSignals !== false && values.buyEvent[index] === 1,
      },
      {
        id: 'meridian-sell',
        title: 'Meridian SELL',
        message: 'Meridian Futures Setups produced a confirmed SELL signal.',
        when: ({ values, settings, index }) =>
          settings.enableAlerts !== false && settings.alertSignals !== false && values.sellEvent[index] === 1,
      },
      {
        id: 'meridian-target',
        title: 'Meridian target',
        message: 'A Meridian Futures Setups trade reached 2R.',
        when: ({ values, settings, index }) =>
          settings.enableAlerts !== false && settings.alertTargets !== false && values.targetEvent[index] === 1,
      },
      {
        id: 'meridian-stop',
        title: 'Meridian stop',
        message: 'A Meridian Futures Setups trade reached its stop.',
        when: ({ values, settings, index }) =>
          settings.enableAlerts !== false && settings.alertStops !== false && values.stopEvent[index] === 1,
      },
    ],
  })
}
