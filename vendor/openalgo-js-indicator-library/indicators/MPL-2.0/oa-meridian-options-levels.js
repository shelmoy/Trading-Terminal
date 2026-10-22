/**
 * Meridian - Options Levels - ported to openalgo-charts from Pine Script v6.
 *
 * Source: https://github.com/sukesan7/meridian-indicators/blob/82bfd140decb5439c2db0be840f9deaf5cde24b0/src/options/meridian-options-levels.pine
 * Repo:   sukesan7/meridian-indicators
 * License: MPL-2.0
 * SPDX-FileCopyrightText: (c) sukesan7
 * SPDX-FileCopyrightText: (c) 2026 marketcalls (port to openalgo-charts)
 * SPDX-License-Identifier: MPL-2.0
 *
 * Collects session, swing, gap, round-number and VWAP levels into scored
 * clusters, then keeps one support and one resistance reaction zone alive and
 * tracks how price behaves at each: approaching, inside, rejecting, accepting,
 * broken or flipped.
 */

export default function ({
  registerIndicator,
  sourceValues,
  atr,
  smaSeededEma,
  pivotHigh,
  pivotLow,
  highest,
  lowest,
  nulls,
  clamp,
  withAlpha,
  sessionFlags,
  parseSessionSpec,
  isValidTimezone,
  isIntradayInterval,
  DEFAULT_TIMEZONE,
  utcSecondsToZonedParts,
  zonedDayIndex,
  zonedWeekIndex,
  zonedWallClockToUtcSeconds,
  precisionForStep,
}) {
  /* Candidate source types, as in the Pine source. */
  const SRC_PDH = 1
  const SRC_PDL = 2
  const SRC_PDC = 3
  const SRC_PMH = 4
  const SRC_PML = 5
  const SRC_PWH = 6
  const SRC_PWL = 7
  const SRC_ORH = 8
  const SRC_ORL = 9
  const SRC_RTH_OPEN = 10
  const SRC_PIVOT_HIGH = 11
  const SRC_PIVOT_LOW = 12
  const SRC_GAP = 13
  const SRC_ROUND = 14
  const SRC_VWAP = 15
  const SRC_VWAP_BAND = 16
  const SRC_EVENT_AVWAP = 17
  const SRC_ATR_PROJECTION = 18

  const STATE_DISTANT = 1
  const STATE_APPROACHING = 2
  const STATE_INSIDE = 3
  const STATE_REJECTING = 4
  const STATE_ACCEPTING = 5
  const STATE_BROKEN = 6
  const STATE_FLIPPED = 7

  const SOURCE_NAMES = {
    [SRC_PDH]: 'PDH',
    [SRC_PDL]: 'PDL',
    [SRC_PDC]: 'PDC',
    [SRC_PMH]: 'PMH',
    [SRC_PML]: 'PML',
    [SRC_PWH]: 'PWH',
    [SRC_PWL]: 'PWL',
    [SRC_ORH]: 'ORH',
    [SRC_ORL]: 'ORL',
    [SRC_RTH_OPEN]: 'RTH OPEN',
    [SRC_PIVOT_HIGH]: 'PIV H',
    [SRC_PIVOT_LOW]: 'PIV L',
    [SRC_GAP]: 'GAP',
    [SRC_ROUND]: 'ROUND',
    [SRC_VWAP]: 'VWAP',
    [SRC_VWAP_BAND]: 'VWAP BAND',
    [SRC_EVENT_AVWAP]: 'EVENT AVWAP',
    [SRC_ATR_PROJECTION]: 'ATR PROJ',
  }

  const SOURCE_FAMILIES = {
    [SRC_PDH]: 'DAY',
    [SRC_PDL]: 'DAY',
    [SRC_PDC]: 'DAY',
    [SRC_PMH]: 'PREMARKET',
    [SRC_PML]: 'PREMARKET',
    [SRC_PWH]: 'WEEK',
    [SRC_PWL]: 'WEEK',
    [SRC_ORH]: 'OR',
    [SRC_ORL]: 'OR',
    [SRC_RTH_OPEN]: 'SESSION',
    [SRC_PIVOT_HIGH]: 'PIVOT',
    [SRC_PIVOT_LOW]: 'PIVOT',
    [SRC_GAP]: 'GAP',
    [SRC_ROUND]: 'ROUND',
    [SRC_VWAP]: 'VWAP',
    [SRC_VWAP_BAND]: 'VWAP',
    [SRC_EVENT_AVWAP]: 'EVENT',
    [SRC_ATR_PROJECTION]: 'PROJECTION',
  }

  const STATE_TEXT = {
    [STATE_APPROACHING]: 'APPROACHING',
    [STATE_INSIDE]: 'INSIDE',
    [STATE_REJECTING]: 'REJECTING',
    [STATE_ACCEPTING]: 'ACCEPTING',
    [STATE_BROKEN]: 'BROKEN',
    [STATE_FLIPPED]: 'FLIPPED',
  }

  const sourceName = (t) => SOURCE_NAMES[t] ?? 'LEVEL'
  const sourceFamily = (t) => SOURCE_FAMILIES[t] ?? 'OTHER'
  const stateText = (s) => STATE_TEXT[s] ?? 'DISTANT'

  const baseRecencyFor = (t) => {
    if (t === SRC_PWH || t === SRC_PWL) return 78
    if (t === SRC_PDH || t === SRC_PDL || t === SRC_PDC) return 88
    return 100
  }

  /* Pine f_positiveSat: a 0..100 saturating map of a positive excursion. */
  const positiveSat = (x) => (!Number.isFinite(x) || x <= 0 ? (Number.isFinite(x) ? 0 : NaN) : (100 * x) / (x + 0.5))

  /* Pine f_participationScore: relative volume mapped onto 0..100. */
  const participationScore = (rvol) => (Number.isFinite(rvol) ? clamp((rvol - 1) * 50, 0, 100) : NaN)

  /* A cleared field arrives as '', and Number('') is 0, so never use `|| default`
   * on an input whose minimum is 0: a deliberate zero would silently revert. */
  const num = (v, dflt, lo, hi) => {
    if (v === '' || v === null || v === undefined) return dflt
    const x = Number(v)
    if (!Number.isFinite(x)) return dflt
    return Math.min(hi, Math.max(lo, x))
  }
  const int = (v, dflt, lo, hi) => Math.round(num(v, dflt, lo, hi))
  const text = (v, dflt) => {
    const s = typeof v === 'string' ? v.trim() : ''
    return s === '' ? dflt : s
  }
  const flag = (v, dflt) => (typeof v === 'boolean' ? v : dflt)

  const PRICE_SOURCES = new Set(['open', 'high', 'low', 'close', 'hl2', 'hlc3', 'ohlc4', 'volume'])

  registerIndicator({
    id: 'oa-meridian-options-levels',
    name: 'Meridian - Options Levels',
    category: 'Meridian',
    placement: 'onchart',

    inputs: [
      /* 01. Sessions */
      {
        key: 'sessionTimezone',
        type: 'text',
        label: 'Session timezone',
        default: 'America/New_York',
        group: '01. Sessions',
        tooltip: 'IANA zone the session windows are read in. Set Asia/Kolkata with a 0915-1530 regular session for NSE instruments.',
      },
      {
        key: 'rthInput',
        type: 'text',
        label: 'Regular session',
        default: '0930-1600',
        group: '01. Sessions',
        tooltip: 'HHMM-HHMM in the session timezone.',
      },
      {
        key: 'premarketInput',
        type: 'text',
        label: 'Premarket session',
        default: '0400-0930',
        group: '01. Sessions',
        tooltip: 'HHMM-HHMM in the session timezone. Leave a window the instrument never trades in to disable premarket levels.',
      },
      { key: 'weekdaysOnly', type: 'boolean', label: 'Monday-Friday only', default: true, group: '01. Sessions' },
      { key: 'openingRangeMinutes', type: 'number', label: 'Opening-range minutes', default: 15, min: 1, max: 120, step: 1, group: '01. Sessions' },

      /* 02. Display */
      {
        key: 'displayMode',
        type: 'select',
        label: 'Display mode',
        default: 'Reaction Zones',
        group: '02. Display',
        options: [
          { label: 'Reaction Zones', value: 'Reaction Zones' },
          { label: 'Zones + Key References', value: 'Zones + Key References' },
          { label: 'Legacy / Debug', value: 'Legacy / Debug' },
        ],
        tooltip: 'Reaction Zones draws the zone boxes only. The other modes add the reference lines and the debug readout.',
      },
      { key: 'showZoneText', type: 'boolean', label: 'Show zone text', default: true, group: '02. Display' },
      { key: 'showDashboard', type: 'boolean', label: 'Show compact dashboard', default: true, group: '02. Display' },
      { key: 'zoneBackBars', type: 'number', label: 'Zone history bars', default: 12, min: 1, max: 250, step: 1, group: '02. Display' },
      { key: 'zoneForwardBars', type: 'number', label: 'Zone projection bars', default: 40, min: 5, max: 250, step: 1, group: '02. Display' },
      { key: 'showEdgeSignals', type: 'boolean', label: 'Show buy / sell edge zones', default: true, group: '02. Display' },
      { key: 'edgeSignalMinimumActionability', type: 'number', label: 'Edge zone minimum actionability', default: 55, min: 0, max: 100, step: 1, group: '02. Display' },
      { key: 'edgeSignalHeightPct', type: 'number', label: 'Edge zone height (% of parent zone)', default: 0.2, min: 0.05, max: 0.5, step: 0.01, group: '02. Display' },
      { key: 'showOpeningRangeBox', type: 'boolean', label: 'Highlight opening-range window', default: true, group: '02. Display' },
      /* Colour inputs are normally the chart's job, but the zone boxes are
       * drawings rather than plots and the style dialog generates nothing for
       * them, so these three stay inputs exactly as the source declares them. */
      { key: 'resistanceColor', type: 'color', label: 'Resistance zone', default: '#F87171', group: '02. Display' },
      { key: 'supportColor', type: 'color', label: 'Support zone', default: '#2DD4BF', group: '02. Display' },
      { key: 'neutralColor', type: 'color', label: 'Neutral / broken state', default: '#A1A1AA', group: '02. Display' },

      /* 03. Reaction Zones */
      { key: 'atrLength', type: 'number', label: 'Confirmed daily ATR length', default: 14, min: 5, max: 100, step: 1, group: '03. Reaction Zones' },
      { key: 'maxDistanceAtr', type: 'number', label: 'Maximum candidate distance (daily ATR)', default: 2.5, min: 0.5, max: 10, step: 0.25, group: '03. Reaction Zones' },
      { key: 'clusterAtrFraction', type: 'number', label: 'Cluster tolerance (daily ATR)', default: 0.08, min: 0.02, max: 0.25, step: 0.01, group: '03. Reaction Zones' },
      { key: 'clusterMinimumTicks', type: 'number', label: 'Minimum cluster tolerance (ticks)', default: 4, min: 1, max: 100, step: 1, group: '03. Reaction Zones' },
      { key: 'clusterMinimumPct', type: 'number', label: 'Minimum cluster tolerance (% as decimal)', default: 0.0005, min: 0, max: 0.01, step: 0.0001, group: '03. Reaction Zones' },
      { key: 'minZoneAtr', type: 'number', label: 'Minimum zone half-width (daily ATR)', default: 0.02, min: 0.005, max: 0.1, step: 0.005, group: '03. Reaction Zones' },
      { key: 'maxZoneAtr', type: 'number', label: 'Maximum zone half-width (daily ATR)', default: 0.12, min: 0.03, max: 0.4, step: 0.01, group: '03. Reaction Zones' },
      { key: 'minZoneTicks', type: 'number', label: 'Minimum zone half-width (ticks)', default: 4, min: 1, max: 100, step: 1, group: '03. Reaction Zones' },
      { key: 'dispersionMultiplier', type: 'number', label: 'Cluster dispersion multiplier', default: 1.25, min: 0.5, max: 3, step: 0.05, group: '03. Reaction Zones' },
      { key: 'actionabilityDecay', type: 'number', label: 'Distance decay', default: 0.45, min: 0.05, max: 2, step: 0.05, group: '03. Reaction Zones' },
      { key: 'switchMargin', type: 'number', label: 'Zone switch margin', default: 10, min: 1, max: 30, step: 1, group: '03. Reaction Zones' },
      { key: 'minimumZoneStrength', type: 'number', label: 'Minimum zone strength', default: 45, min: 0, max: 100, step: 1, group: '03. Reaction Zones' },
      { key: 'refreshBars', type: 'number', label: 'Cluster refresh bars', default: 3, min: 1, max: 20, step: 1, group: '03. Reaction Zones' },
      { key: 'approachingAtr', type: 'number', label: 'Approaching distance (daily ATR)', default: 0.2, min: 0.02, max: 1, step: 0.01, group: '03. Reaction Zones' },
      { key: 'rejectionDisplacementAtr', type: 'number', label: 'Rejection displacement (daily ATR)', default: 0.03, min: 0, max: 0.25, step: 0.01, group: '03. Reaction Zones' },
      { key: 'breakDisplacementAtr', type: 'number', label: 'Break displacement (daily ATR)', default: 0.04, min: 0, max: 0.3, step: 0.01, group: '03. Reaction Zones' },
      { key: 'breakClosesRequired', type: 'number', label: 'Closes beyond zone for break', default: 2, min: 1, max: 5, step: 1, group: '03. Reaction Zones' },
      { key: 'acceptanceClosesRequired', type: 'number', label: 'Closes in / through zone for acceptance', default: 2, min: 1, max: 5, step: 1, group: '03. Reaction Zones' },
      { key: 'stateHoldBars', type: 'number', label: 'Event-state hold bars', default: 3, min: 1, max: 20, step: 1, group: '03. Reaction Zones' },
      { key: 'flipWatchMinutes', type: 'number', label: 'Broken-zone flip watch (minutes)', default: 30, min: 5, max: 240, step: 1, group: '03. Reaction Zones' },
      { key: 'flipRetestAtr', type: 'number', label: 'Flip retest tolerance (daily ATR)', default: 0.04, min: 0, max: 0.25, step: 0.01, group: '03. Reaction Zones' },

      /* 04. Candidate Sources */
      { key: 'usePriorDay', type: 'boolean', label: 'Previous day / close', default: true, group: '04. Candidate Sources' },
      { key: 'usePriorWeek', type: 'boolean', label: 'Previous week', default: true, group: '04. Candidate Sources' },
      { key: 'usePremarket', type: 'boolean', label: 'Premarket high / low', default: true, group: '04. Candidate Sources' },
      { key: 'useOpeningRange', type: 'boolean', label: 'Finalized opening range', default: true, group: '04. Candidate Sources' },
      { key: 'useRthOpen', type: 'boolean', label: 'RTH open', default: true, group: '04. Candidate Sources' },
      { key: 'usePivots', type: 'boolean', label: 'Confirmed swing pivots', default: true, group: '04. Candidate Sources' },
      { key: 'pivotLeftBars', type: 'number', label: 'Pivot left bars', default: 3, min: 1, max: 20, step: 1, group: '04. Candidate Sources' },
      { key: 'pivotRightBars', type: 'number', label: 'Pivot right bars', default: 3, min: 1, max: 20, step: 1, group: '04. Candidate Sources' },
      { key: 'maxPivotRecords', type: 'number', label: 'Maximum pivot records', default: 36, min: 10, max: 60, step: 1, group: '04. Candidate Sources' },
      { key: 'pivotMaxAgeBars', type: 'number', label: 'Pivot maximum age (bars)', default: 600, min: 50, max: 3000, step: 1, group: '04. Candidate Sources' },
      { key: 'pivotDecayBars', type: 'number', label: 'Pivot recency decay (bars)', default: 240, min: 20, max: 1500, step: 1, group: '04. Candidate Sources' },
      { key: 'useRoundNumbers', type: 'boolean', label: 'Adaptive round numbers', default: true, group: '04. Candidate Sources' },
      { key: 'useAtrProjections', type: 'boolean', label: 'ATR projections', default: false, group: '04. Candidate Sources' },
      { key: 'useGapStructure', type: 'boolean', label: 'Gap structure', default: true, group: '04. Candidate Sources' },
      { key: 'gapMinimumAtr', type: 'number', label: 'Minimum gap (daily ATR)', default: 0.15, min: 0.02, max: 2, step: 0.01, group: '04. Candidate Sources' },
      { key: 'useVwapCandidate', type: 'boolean', label: 'RTH VWAP as candidate', default: true, group: '04. Candidate Sources' },
      { key: 'useVwapBandCandidates', type: 'boolean', label: 'VWAP bands as candidates', default: false, group: '04. Candidate Sources' },

      /* 05. Reaction Model */
      { key: 'reactionLookback', type: 'number', label: 'Reaction lookback bars', default: 120, min: 30, max: 400, step: 1, group: '05. Reaction Model' },
      { key: 'reactionWindow', type: 'number', label: 'Reaction observation bars', default: 6, min: 2, max: 20, step: 1, group: '05. Reaction Model' },
      { key: 'touchCooldownBars', type: 'number', label: 'Touch cooldown bars', default: 8, min: 2, max: 50, step: 1, group: '05. Reaction Model' },
      { key: 'maxReactionTouches', type: 'number', label: 'Maximum historical touches scored', default: 6, min: 1, max: 12, step: 1, group: '05. Reaction Model' },
      { key: 'touchMinimumTicks', type: 'number', label: 'Touch tolerance (ticks)', default: 2, min: 1, max: 50, step: 1, group: '05. Reaction Model' },
      { key: 'touchAtrFraction', type: 'number', label: 'Touch tolerance (daily ATR)', default: 0.025, min: 0.005, max: 0.15, step: 0.005, group: '05. Reaction Model' },

      /* 06. Event AVWAP */
      {
        key: 'eventAnchorMode',
        type: 'select',
        label: 'Event AVWAP anchor',
        default: 'Automatic earnings',
        group: '06. Event AVWAP',
        options: [
          { label: 'Automatic earnings (unavailable here)', value: 'Automatic earnings' },
          { label: 'Manual timestamp', value: 'Manual timestamp' },
          { label: 'Disabled', value: 'Disabled' },
        ],
        tooltip: 'The chart carries no earnings calendar, so the automatic mode never anchors. Use Manual timestamp to anchor the event VWAP yourself.',
      },
      {
        key: 'manualEventTime',
        type: 'text',
        label: 'Manual event timestamp',
        default: '',
        group: '06. Event AVWAP',
        tooltip: 'YYYY-MM-DD or YYYY-MM-DD HH:MM, read in the session timezone.',
      },
      { key: 'eventMaxAgeDays', type: 'number', label: 'Maximum event age (days)', default: 20, min: 1, max: 90, step: 1, group: '06. Event AVWAP' },
      { key: 'eventMinBars', type: 'number', label: 'Minimum bars before AVWAP contributes', default: 5, min: 1, max: 100, step: 1, group: '06. Event AVWAP' },
      { key: 'eventMaxDistanceAtr', type: 'number', label: 'Maximum AVWAP distance (daily ATR)', default: 2, min: 0.25, max: 10, step: 0.25, group: '06. Event AVWAP' },

      /* 07. VWAP */
      { key: 'showVwap', type: 'boolean', label: 'Show regular-session VWAP', default: true, group: '07. VWAP' },
      { key: 'vwapSource', type: 'source', label: 'VWAP source', default: 'hlc3', group: '07. VWAP' },
      { key: 'showVwapBand1', type: 'boolean', label: 'Show +/-1 stdev band', default: false, group: '07. VWAP' },
      { key: 'showVwapBand2', type: 'boolean', label: 'Show +/-2 stdev band', default: false, group: '07. VWAP' },
      { key: 'vwapBand1Multiplier', type: 'number', label: 'Band 1 multiplier', default: 1, min: 0.1, step: 0.1, group: '07. VWAP' },
      { key: 'vwapBand2Multiplier', type: 'number', label: 'Band 2 multiplier', default: 2, min: 0.1, step: 0.1, group: '07. VWAP' },
      { key: 'showEmas', type: 'boolean', label: 'Show 9 / 21 EMA in Legacy / Debug', default: false, group: '07. VWAP' },

      /* 08. Dashboard & Alerts */
      { key: 'enableAlerts', type: 'boolean', label: 'Enable transition alerts', default: true, group: '08. Dashboard & Alerts' },
      { key: 'showResearchValues', type: 'boolean', label: 'Show research values in the dashboard', default: false, group: '08. Dashboard & Alerts' },
    ],

    plots: [
      { key: 'pdh', type: 'line', title: 'PDH', style: { color: withAlpha('#E4E4E7', 0.65), lineWidth: 1 } },
      { key: 'pdl', type: 'line', title: 'PDL', style: { color: withAlpha('#E4E4E7', 0.65), lineWidth: 1 } },
      { key: 'pdc', type: 'line', title: 'PDC', style: { color: withAlpha('#7DD3FC', 0.55), lineWidth: 1 } },
      { key: 'pwh', type: 'line', title: 'PWH', style: { color: withAlpha('#D4D4D8', 0.45), lineWidth: 1 } },
      { key: 'pwl', type: 'line', title: 'PWL', style: { color: withAlpha('#D4D4D8', 0.45), lineWidth: 1 } },
      { key: 'pmh', type: 'line', title: 'PMH', style: { color: withAlpha('#67E8F9', 0.55), lineWidth: 1 } },
      { key: 'pml', type: 'line', title: 'PML', style: { color: withAlpha('#67E8F9', 0.55), lineWidth: 1 } },
      { key: 'orh', type: 'line', title: 'ORH', style: { color: withAlpha('#FBBF24', 0.6), lineWidth: 1 } },
      { key: 'orl', type: 'line', title: 'ORL', style: { color: withAlpha('#FBBF24', 0.6), lineWidth: 1 } },
      { key: 'rthOpenPlot', type: 'line', title: 'RTH Open', style: { color: withAlpha('#BAE6FD', 0.5), lineWidth: 1 } },

      { key: 'vwapPlot', type: 'line', title: 'RTH VWAP', style: { color: '#C4B5FD', lineWidth: 2 } },
      { key: 'vwapU1', type: 'line', title: 'VWAP +1 stdev', style: { color: withAlpha('#A78BFA', 0.65), lineWidth: 1 } },
      { key: 'vwapL1', type: 'line', title: 'VWAP -1 stdev', style: { color: withAlpha('#A78BFA', 0.65), lineWidth: 1 } },
      { key: 'vwapU2', type: 'line', title: 'VWAP +2 stdev', style: { color: withAlpha('#A78BFA', 0.45), lineWidth: 1 } },
      { key: 'vwapL2', type: 'line', title: 'VWAP -2 stdev', style: { color: withAlpha('#A78BFA', 0.45), lineWidth: 1 } },

      { key: 'ema9', type: 'line', title: 'EMA 9', style: { color: withAlpha('#38BDF8', 0.75), lineWidth: 1 } },
      { key: 'ema21', type: 'line', title: 'EMA 21', style: { color: withAlpha('#FDE68A', 0.75), lineWidth: 1 } },
      { key: 'eventAvwapPlot', type: 'line', title: 'Event AVWAP', style: { color: withAlpha('#F472B6', 0.85), lineWidth: 2 } },

      { key: 'gapHighPlot', type: 'line', title: 'Active Gap High', style: { color: withAlpha('#FB7185', 0.35), lineWidth: 1 } },
      { key: 'gapLowPlot', type: 'line', title: 'Active Gap Low', style: { color: withAlpha('#34D399', 0.35), lineWidth: 1 } },
      { key: 'gapMidPlot', type: 'line', title: 'Active Gap Mid', style: { color: withAlpha('#FBBF24', 0.3), lineWidth: 1 } },
      { key: 'gapBoundaryPlot', type: 'line', title: 'Active Gap Unfilled Boundary', style: { color: withAlpha('#F8FAFC', 0.45), lineWidth: 1 } },
    ],

    calc(bars, settings, store, ctx) {
      const n = bars.length

      const col = () => new Array(n).fill(NaN)
      const zeros = () => new Array(n).fill(0)
      const strings = () => new Array(n).fill('')

      /* Plot columns. */
      const pdh = col()
      const pdl = col()
      const pdc = col()
      const pwh = col()
      const pwl = col()
      const pmh = col()
      const pml = col()
      const orh = col()
      const orl = col()
      const rthOpenPlot = col()
      const vwapPlot = col()
      const vwapU1 = col()
      const vwapL1 = col()
      const vwapU2 = col()
      const vwapL2 = col()
      const ema9Col = col()
      const ema21Col = col()
      const eventAvwapPlot = col()
      const gapHighPlot = col()
      const gapLowPlot = col()
      const gapMidPlot = col()
      const gapBoundaryPlot = col()

      /* Columns no plot declares: the drawings, the dashboard and the alerts
       * all read them, and a hook is never handed `store`. */
      const supValid = zeros()
      const supLow = col()
      const supHigh = col()
      const supCenter = col()
      const supStrength = col()
      const supAct = col()
      const supMean = col()
      const supRx = col()
      const supDiv = col()
      const supState = col()
      const supSelBar = col()
      const supSources = strings()
      const resValid = zeros()
      const resLow = col()
      const resHigh = col()
      const resCenter = col()
      const resStrength = col()
      const resAct = col()
      const resMean = col()
      const resRx = col()
      const resDiv = col()
      const resState = col()
      const resSelBar = col()
      const resSources = strings()
      const orStartBar = col()
      const orKnownBar = col()
      const orFinalizedCol = zeros()
      const orHighRaw = col()
      const orLowRaw = col()
      const gapHighRaw = col()
      const gapLowRaw = col()
      const gapMidRaw = col()
      const gapBoundaryRaw = col()
      const gapOn = zeros()
      const normAtrCol = col()
      const nearestZoneStateCol = col()
      const tickCol = col()
      const intradayCol = zeros()
      const evEnteredSupport = zeros()
      const evEnteredResistance = zeros()
      const evSupportRejection = zeros()
      const evResistanceRejection = zeros()
      const evSupportBreakAcceptance = zeros()
      const evResistanceBreakAcceptance = zeros()
      const evZoneFlip = zeros()
      const evHigherQualityZone = zeros()

      const result = () => ({
        pdh: nulls(pdh),
        pdl: nulls(pdl),
        pdc: nulls(pdc),
        pwh: nulls(pwh),
        pwl: nulls(pwl),
        pmh: nulls(pmh),
        pml: nulls(pml),
        orh: nulls(orh),
        orl: nulls(orl),
        rthOpenPlot: nulls(rthOpenPlot),
        vwapPlot: nulls(vwapPlot),
        vwapU1: nulls(vwapU1),
        vwapL1: nulls(vwapL1),
        vwapU2: nulls(vwapU2),
        vwapL2: nulls(vwapL2),
        ema9: nulls(ema9Col),
        ema21: nulls(ema21Col),
        eventAvwapPlot: nulls(eventAvwapPlot),
        gapHighPlot: nulls(gapHighPlot),
        gapLowPlot: nulls(gapLowPlot),
        gapMidPlot: nulls(gapMidPlot),
        gapBoundaryPlot: nulls(gapBoundaryPlot),
        supValid,
        supLow,
        supHigh,
        supCenter,
        supStrength,
        supAct,
        supMean,
        supRx,
        supDiv,
        supState,
        supSelBar,
        supSources,
        resValid,
        resLow,
        resHigh,
        resCenter,
        resStrength,
        resAct,
        resMean,
        resRx,
        resDiv,
        resState,
        resSelBar,
        resSources,
        orStartBar,
        orKnownBar,
        orFinalized: orFinalizedCol,
        orHighRaw,
        orLowRaw,
        gapHighRaw,
        gapLowRaw,
        gapMidRaw,
        gapBoundaryRaw,
        gapOn,
        normAtr: normAtrCol,
        nearestZoneState: nearestZoneStateCol,
        tickSize: tickCol,
        isIntraday: intradayCol,
        evEnteredSupport,
        evEnteredResistance,
        evSupportRejection,
        evResistanceRejection,
        evSupportBreakAcceptance,
        evResistanceBreakAcceptance,
        evZoneFlip,
        evHigherQualityZone,
      })

      if (n === 0) return result()

      /* ---- settings ------------------------------------------------------ */
      const tzWanted = text(settings.sessionTimezone, 'America/New_York')
      const zone = isValidTimezone(tzWanted) ? tzWanted : DEFAULT_TIMEZONE
      const weekdaysOnly = flag(settings.weekdaysOnly, true)
      const dayCodes = weekdaysOnly ? ':23456' : ':1234567'
      const specOr = (raw, fallback) => {
        const candidate = `${text(raw, fallback)}${dayCodes}`
        return parseSessionSpec(candidate) ? candidate : `${fallback}${dayCodes}`
      }
      const rthSession = specOr(settings.rthInput, '0930-1600')
      const premarketSession = specOr(settings.premarketInput, '0400-0930')
      const openingRangeMinutes = int(settings.openingRangeMinutes, 15, 1, 120)

      const displayMode = text(settings.displayMode, 'Reaction Zones')
      const showZoneText = flag(settings.showZoneText, true)
      const zoneBackBars = int(settings.zoneBackBars, 12, 1, 250)
      const zoneForwardBars = int(settings.zoneForwardBars, 40, 5, 250)
      const edgeSignalMinimumActionability = num(settings.edgeSignalMinimumActionability, 55, 0, 100)
      const edgeSignalHeightPct = num(settings.edgeSignalHeightPct, 0.2, 0.05, 0.5)

      const atrLength = int(settings.atrLength, 14, 5, 100)
      const maxDistanceAtr = num(settings.maxDistanceAtr, 2.5, 0.5, 10)
      const clusterAtrFraction = num(settings.clusterAtrFraction, 0.08, 0.02, 0.25)
      const clusterMinimumTicks = int(settings.clusterMinimumTicks, 4, 1, 100)
      const clusterMinimumPct = num(settings.clusterMinimumPct, 0.0005, 0, 0.01)
      const minZoneAtr = num(settings.minZoneAtr, 0.02, 0.005, 0.1)
      const maxZoneAtr = num(settings.maxZoneAtr, 0.12, 0.03, 0.4)
      const minZoneTicks = int(settings.minZoneTicks, 4, 1, 100)
      const dispersionMultiplier = num(settings.dispersionMultiplier, 1.25, 0.5, 3)
      const actionabilityDecay = num(settings.actionabilityDecay, 0.45, 0.05, 2)
      const switchMargin = num(settings.switchMargin, 10, 1, 30)
      const minimumZoneStrength = num(settings.minimumZoneStrength, 45, 0, 100)
      const refreshBars = int(settings.refreshBars, 3, 1, 20)
      const approachingAtr = num(settings.approachingAtr, 0.2, 0.02, 1)
      const rejectionDisplacementAtr = num(settings.rejectionDisplacementAtr, 0.03, 0, 0.25)
      const breakDisplacementAtr = num(settings.breakDisplacementAtr, 0.04, 0, 0.3)
      const breakClosesRequired = int(settings.breakClosesRequired, 2, 1, 5)
      const acceptanceClosesRequired = int(settings.acceptanceClosesRequired, 2, 1, 5)
      const stateHoldBars = int(settings.stateHoldBars, 3, 1, 20)
      const flipWatchMinutes = int(settings.flipWatchMinutes, 30, 5, 240)
      const flipRetestAtr = num(settings.flipRetestAtr, 0.04, 0, 0.25)

      const usePriorDay = flag(settings.usePriorDay, true)
      const usePriorWeek = flag(settings.usePriorWeek, true)
      const usePremarket = flag(settings.usePremarket, true)
      const useOpeningRange = flag(settings.useOpeningRange, true)
      const useRthOpen = flag(settings.useRthOpen, true)
      const usePivots = flag(settings.usePivots, true)
      const pivotLeftBars = int(settings.pivotLeftBars, 3, 1, 20)
      const pivotRightBars = int(settings.pivotRightBars, 3, 1, 20)
      const maxPivotRecords = int(settings.maxPivotRecords, 36, 10, 60)
      const pivotMaxAgeBars = int(settings.pivotMaxAgeBars, 600, 50, 3000)
      const pivotDecayBars = int(settings.pivotDecayBars, 240, 20, 1500)
      const useRoundNumbers = flag(settings.useRoundNumbers, true)
      const useAtrProjections = flag(settings.useAtrProjections, false)
      const useGapStructure = flag(settings.useGapStructure, true)
      const gapMinimumAtr = num(settings.gapMinimumAtr, 0.15, 0.02, 2)
      const useVwapCandidate = flag(settings.useVwapCandidate, true)
      const useVwapBandCandidates = flag(settings.useVwapBandCandidates, false)

      const reactionLookback = int(settings.reactionLookback, 120, 30, 400)
      const reactionWindow = int(settings.reactionWindow, 6, 2, 20)
      const touchCooldownBars = int(settings.touchCooldownBars, 8, 2, 50)
      const maxReactionTouches = int(settings.maxReactionTouches, 6, 1, 12)
      const touchMinimumTicks = int(settings.touchMinimumTicks, 2, 1, 50)
      const touchAtrFraction = num(settings.touchAtrFraction, 0.025, 0.005, 0.15)

      const eventAnchorMode = text(settings.eventAnchorMode, 'Automatic earnings')
      const eventMaxAgeDays = int(settings.eventMaxAgeDays, 20, 1, 90)
      const eventMinBars = int(settings.eventMinBars, 5, 1, 100)
      const eventMaxDistanceAtr = num(settings.eventMaxDistanceAtr, 2, 0.25, 10)

      const showVwap = flag(settings.showVwap, true)
      const vwapSourceKey = PRICE_SOURCES.has(settings.vwapSource) ? settings.vwapSource : 'hlc3'
      const showVwapBand1 = flag(settings.showVwapBand1, false)
      const showVwapBand2 = flag(settings.showVwapBand2, false)
      const vwapBand1Multiplier = num(settings.vwapBand1Multiplier, 1, 0.1, Infinity)
      const vwapBand2Multiplier = num(settings.vwapBand2Multiplier, 2, 0.1, Infinity)
      const showEmas = flag(settings.showEmas, false)

      const showKeyReferences = displayMode === 'Zones + Key References' || displayMode === 'Legacy / Debug'
      const showLegacy = displayMode === 'Legacy / Debug'

      /* ---- bar columns --------------------------------------------------- */
      const time = new Array(n)
      const open = new Array(n)
      const high = new Array(n)
      const low = new Array(n)
      const close = new Array(n)
      const vol = new Array(n)
      const hlc3 = new Array(n)
      for (let i = 0; i < n; i++) {
        const b = bars[i]
        time[i] = b.time
        open[i] = b.open
        high[i] = b.high
        low[i] = b.low
        close[i] = b.close
        vol[i] = Number.isFinite(b.volume) ? b.volume : NaN
        hlc3[i] = (b.high + b.low + b.close) / 3
      }

      /* syminfo.mintick. The host may not know it (pitfall 21), so keep a tiny
       * price-scaled floor for every place Pine uses mintick as a guard. */
      const rawTick = Number(ctx?.tickSize)
      const tick = Number.isFinite(rawTick) && rawTick > 0 ? rawTick : 0
      let reference = 0
      for (let i = n - 1; i >= 0; i--) {
        if (Number.isFinite(close[i])) {
          reference = Math.abs(close[i])
          break
        }
      }
      const eps = tick > 0 ? tick : Math.max(reference * 1e-6, 1e-8)
      const intraday = ctx?.interval === undefined ? true : isIntradayInterval(ctx.interval)

      const inRth = sessionFlags(time, rthSession, zone)
      const inPremarket = sessionFlags(time, premarketSession, zone)

      const dayKey = new Array(n)
      const dayIdx = new Array(n)
      const weekIdx = new Array(n)
      for (let i = 0; i < n; i++) {
        const p = utcSecondsToZonedParts(time[i], zone)
        dayKey[i] = p.year * 10000 + p.month * 100 + p.day
        dayIdx[i] = zonedDayIndex(time[i], zone)
        weekIdx[i] = zonedWeekIndex(time[i], zone)
      }

      /* ---- ATR: chart and previous confirmed daily ----------------------- */
      const chartAtr = atr(high, low, close, atrLength)

      /* request.security(tickerid, "1D", ta.atr(len)[1], lookahead_on) is the
       * daily ATR through the PREVIOUS completed day, known at this day's open,
       * so folding the chart's own bars up to daily reproduces it without
       * lookahead. */
      const dHigh = []
      const dLow = []
      const dClose = []
      const dayOfBar = new Array(n)
      let dCursor = -1
      for (let i = 0; i < n; i++) {
        if (i === 0 || dayIdx[i] !== dayIdx[i - 1]) {
          dHigh.push(high[i])
          dLow.push(low[i])
          dClose.push(close[i])
          dCursor += 1
        } else {
          if (high[i] > dHigh[dCursor]) dHigh[dCursor] = high[i]
          if (low[i] < dLow[dCursor]) dLow[dCursor] = low[i]
          dClose[dCursor] = close[i]
        }
        dayOfBar[i] = dCursor
      }
      const dailyAtr = dHigh.length > 0 ? atr(dHigh, dLow, dClose, atrLength) : []

      const normAtr = new Array(n)
      for (let i = 0; i < n; i++) {
        const prior = dayOfBar[i] - 1
        const confirmed = prior >= 0 ? dailyAtr[prior] : NaN
        normAtr[i] = Number.isFinite(confirmed) && confirmed > 0 ? confirmed : chartAtr[i]
        normAtrCol[i] = normAtr[i]
        tickCol[i] = tick
        intradayCol[i] = intraday ? 1 : 0
      }

      /* ta.sma(volume, 20): na while any bar in the window carries no volume. */
      const volumeBaseline = new Array(n).fill(NaN)
      {
        let sum = 0
        let missing = 0
        for (let i = 0; i < n; i++) {
          if (Number.isFinite(vol[i])) sum += vol[i]
          else missing += 1
          if (i >= 20) {
            const gone = vol[i - 20]
            if (Number.isFinite(gone)) sum -= gone
            else missing -= 1
          }
          if (i >= 19 && missing === 0) volumeBaseline[i] = sum / 20
        }
      }

      /* ---- session-anchored VWAP and its bands --------------------------- */
      const vwapSrc = sourceValues(bars, vwapSourceKey)
      const sessionVwap = col()
      const band1Up = col()
      const band1Dn = col()
      const band2Up = col()
      const band2Dn = col()

      /* ---- EMAs (Pine ta.ema seeds from the SMA of the first `length`) ---- */
      const fastEma = smaSeededEma(close, 9)
      const slowEma = smaSeededEma(close, 21)

      /* ---- pivots -------------------------------------------------------- */
      const confirmedPivotHigh = pivotHigh(high, pivotLeftBars, pivotRightBars)
      const confirmedPivotLow = pivotLow(low, pivotLeftBars, pivotRightBars)
      const pivotConfirmationLow = lowest(low, pivotRightBars + 1)
      const pivotConfirmationHigh = highest(high, pivotRightBars + 1)

      /* ---- manual event anchor ------------------------------------------- */
      let manualEventTime = NaN
      {
        const raw = text(settings.manualEventTime, '')
        const m = /^(\d{4})-(\d{1,2})-(\d{1,2})(?:[ T](\d{1,2}):(\d{2}))?$/.exec(raw)
        if (m) {
          const parsed = zonedWallClockToUtcSeconds(
            Number(m[1]),
            Number(m[2]),
            Number(m[3]),
            m[4] === undefined ? 0 : Number(m[4]),
            m[5] === undefined ? 0 : Number(m[5]),
            0,
            zone
          )
          if (Number.isFinite(parsed)) manualEventTime = parsed
        }
      }

      /* ---- scoring helpers ----------------------------------------------- */
      const reactionMetrics = (level, knownBar, i) => {
        let reactionSum = 0
        let impulseSum = 0
        let volumeSum = 0
        let volumeSamples = 0
        let touches = 0
        let lastAcceptedOffset = NaN
        let mostRecentTouchAge = NaN
        const historyLimit = Number.isFinite(knownBar)
          ? Math.min(reactionLookback, Math.max(i - knownBar - 1, 0))
          : reactionLookback
        const top = Math.min(reactionLookback, historyLimit)
        for (let off = reactionWindow; off <= top; off++) {
          if (touches >= maxReactionTouches) break
          const b = i - off
          if (b < 0) continue
          const localAtr = normAtr[b]
          const baseAtr = Number.isFinite(localAtr) ? localAtr : normAtr[i]
          const tolerance = Math.max(touchMinimumTicks * eps, baseAtr * touchAtrFraction)
          const touched =
            Number.isFinite(low[b]) &&
            Number.isFinite(high[b]) &&
            low[b] <= level + tolerance &&
            high[b] >= level - tolerance
          const cooled = !Number.isFinite(lastAcceptedOffset) || off - lastAcceptedOffset >= touchCooldownBars
          if (!touched || !cooled) continue

          const prior = b - 1 >= 0 ? close[b - 1] : NaN
          let direction
          if (Number.isFinite(prior) && prior > level + tolerance * 0.25) direction = 1
          else if (Number.isFinite(prior) && prior < level - tolerance * 0.25) direction = -1
          else direction = Number.isFinite(close[b]) && close[b] >= level ? 1 : -1

          let mfe = 0
          let mae = 0
          let persistenceCount = 0
          for (let j = 1; j <= reactionWindow; j++) {
            const o = b + j
            if (o > i) continue
            const hi = high[o]
            const lo = low[o]
            const cl = close[o]
            if (direction === 1) {
              if (Number.isFinite(hi)) mfe = Math.max(mfe, hi - level)
              if (Number.isFinite(lo)) mae = Math.max(mae, level - lo)
              if (Number.isFinite(cl) && cl >= level) persistenceCount += 1
            } else {
              if (Number.isFinite(lo)) mfe = Math.max(mfe, level - lo)
              if (Number.isFinite(hi)) mae = Math.max(mae, hi - level)
              if (Number.isFinite(cl) && cl <= level) persistenceCount += 1
            }
          }
          const ratio = mfe / Math.max(mfe + mae, eps)
          const persistence = (100 * persistenceCount) / reactionWindow
          const reaction = 75 * ratio + 0.25 * persistence
          const impulse = Number.isFinite(localAtr) && localAtr > 0 ? positiveSat(mfe / localAtr) : NaN
          reactionSum += reaction
          impulseSum += Number.isFinite(impulse) ? impulse : 0
          const baseline = volumeBaseline[b]
          const rvol =
            Number.isFinite(vol[b]) && Number.isFinite(baseline) && baseline > 0 ? vol[b] / baseline : NaN
          const volumeScore = participationScore(rvol)
          if (Number.isFinite(volumeScore)) {
            volumeSum += volumeScore
            volumeSamples += 1
          }
          touches += 1
          lastAcceptedOffset = off
          mostRecentTouchAge = Number.isFinite(mostRecentTouchAge) ? Math.min(mostRecentTouchAge, off) : off
        }
        const reactionQuality = touches > 0 ? reactionSum / touches : NaN
        const impulseQuality = touches > 0 ? impulseSum / touches : NaN
        const countScore = touches > 0 ? (100 * touches) / (touches + 2) : NaN
        const touchQuality =
          touches > 0
            ? countScore * (0.5 + (0.5 * (Number.isFinite(reactionQuality) ? reactionQuality : 50)) / 100)
            : NaN
        const volumeEvidence = volumeSamples > 0 ? volumeSum / volumeSamples : NaN
        return { reactionQuality, impulseQuality, touchQuality, volumeEvidence, mostRecentTouchAge }
      }

      const candidateScore = (sourceQuality, reactionQuality, impulseQuality, touchQuality, recency, volumeEvidence) => {
        let weighted = 0.3 * sourceQuality + 0.1 * recency
        let weights = 0.4
        if (Number.isFinite(reactionQuality)) {
          weighted += 0.25 * reactionQuality
          weights += 0.25
        }
        if (Number.isFinite(impulseQuality)) {
          weighted += 0.18 * impulseQuality
          weights += 0.18
        }
        if (Number.isFinite(touchQuality)) {
          weighted += 0.12 * touchQuality
          weights += 0.12
        }
        if (Number.isFinite(volumeEvidence)) {
          weighted += 0.05 * volumeEvidence
          weights += 0.05
        }
        return clamp(weighted / Math.max(weights, 0.001), 0, 100)
      }

      const addCandidate = (registry, level, baseWeight, sourceType, polarity, o) => {
        const opts = o ?? {}
        const originBar = opts.originBar
        const knownBar = opts.knownBar
        const originImpulse = opts.originImpulse
        const originVolume = opts.originVolume
        const recencyOverride = opts.recencyOverride
        const scanReactions = opts.scanReactions === true
        const atrNow = opts.atr
        const maxDistance = opts.maxDistance
        const i = opts.index

        if (!Number.isFinite(level) || level <= 0) return
        if (!Number.isFinite(atrNow) || atrNow <= 0) return
        if (!(Math.abs(level - close[i]) <= maxDistance)) return

        for (const existing of registry) {
          if (existing.sourceType === sourceType && Math.abs(existing.price - level) <= eps * 0.5) return
        }

        let reactionQuality = NaN
        let reactionImpulse = NaN
        let touchQuality = NaN
        let reactionVolume = NaN
        let mostRecentTouchAge = NaN
        if (scanReactions) {
          const m = reactionMetrics(level, knownBar, i)
          reactionQuality = m.reactionQuality
          reactionImpulse = m.impulseQuality
          touchQuality = m.touchQuality
          reactionVolume = m.volumeEvidence
          mostRecentTouchAge = m.mostRecentTouchAge
        }
        const impulseQuality = !Number.isFinite(originImpulse)
          ? reactionImpulse
          : !Number.isFinite(reactionImpulse)
            ? originImpulse
            : Math.max(originImpulse, reactionImpulse)
        const volumeEvidence = !Number.isFinite(originVolume)
          ? reactionVolume
          : !Number.isFinite(reactionVolume)
            ? originVolume
            : Math.max(originVolume, reactionVolume)
        const baseRecency = baseRecencyFor(sourceType)
        const decay = Math.max(pivotDecayBars, 1)
        const originRecency = Number.isFinite(originBar)
          ? 100 / (1 + Math.max(i - originBar, 0) / decay)
          : baseRecency
        const touchRecency = Number.isFinite(mostRecentTouchAge) ? 100 / (1 + mostRecentTouchAge / decay) : NaN
        const touchRecencyOrZero = Number.isFinite(touchRecency) ? touchRecency : 0
        const recency = Number.isFinite(recencyOverride)
          ? recencyOverride
          : sourceType === SRC_PIVOT_HIGH || sourceType === SRC_PIVOT_LOW
            ? Math.max(originRecency, touchRecencyOrZero)
            : Math.max(baseRecency, touchRecencyOrZero)
        const finalScore = candidateScore(
          baseWeight,
          reactionQuality,
          impulseQuality,
          touchQuality,
          recency,
          volumeEvidence
        )
        registry.push({
          price: level,
          baseWeight,
          score: finalScore,
          reaction: reactionQuality,
          impulse: impulseQuality,
          touchQuality,
          recency,
          volumeEvidence,
          sourceType,
          name: sourceName(sourceType),
          family: sourceFamily(sourceType),
          polarity,
        })
      }

      const newCluster = (c) => {
        const weight = Math.max(c.score, 1)
        return {
          center: c.price,
          low: c.price,
          high: c.price,
          strength: c.score,
          actionability: c.score,
          weightedMean: c.score,
          maxScore: c.score,
          reactionQuality: c.reaction,
          weightSum: weight,
          priceWeightSum: c.price * weight,
          squareWeightSum: c.price * c.price * weight,
          scoreWeightSum: c.score * weight,
          reactionWeightSum: Number.isFinite(c.reaction) ? c.reaction * weight : 0,
          reactionWeight: Number.isFinite(c.reaction) ? weight : 0,
          supportWeight: c.polarity === 1 ? weight : 0,
          resistanceWeight: c.polarity === -1 ? weight : 0,
          memberCount: 1,
          diversityCount: 1,
          families: `|${c.family}|`,
          sourceTokens: `|${c.name}|`,
          sources: c.name,
          sourceNameCount: 1,
        }
      }

      const clusterAdd = (cluster, c, duplicateTolerance) => {
        const sameFamily = cluster.families.includes(`|${c.family}|`)
        const nearDuplicate = Math.abs(c.price - cluster.center) <= duplicateTolerance
        const redundancyPenalty = sameFamily ? (nearDuplicate ? 0.55 : 0.78) : 1
        const weight = Math.max(c.score * redundancyPenalty, 1)
        cluster.weightSum += weight
        cluster.priceWeightSum += c.price * weight
        cluster.squareWeightSum += c.price * c.price * weight
        cluster.scoreWeightSum += c.score * weight
        cluster.maxScore = Math.max(cluster.maxScore, c.score)
        if (Number.isFinite(c.reaction)) {
          cluster.reactionWeightSum += c.reaction * weight
          cluster.reactionWeight += weight
        }
        if (c.polarity === 1) cluster.supportWeight += weight
        else if (c.polarity === -1) cluster.resistanceWeight += weight
        cluster.memberCount += 1
        if (!sameFamily) {
          cluster.diversityCount += 1
          cluster.families += `${c.family}|`
        }
        const sourceToken = `|${c.name}|`
        if (!cluster.sourceTokens.includes(sourceToken)) {
          cluster.sourceTokens += `${c.name}|`
          if (cluster.sourceNameCount < 3) {
            cluster.sources += ` + ${c.name}`
            cluster.sourceNameCount += 1
          }
        }
        cluster.center = cluster.priceWeightSum / cluster.weightSum
        return cluster
      }

      const finalizeCluster = (cluster, atrNow, i) => {
        cluster.center = cluster.priceWeightSum / Math.max(cluster.weightSum, 0.001)
        const variance = Math.max(
          cluster.squareWeightSum / Math.max(cluster.weightSum, 0.001) - cluster.center * cluster.center,
          0
        )
        const weightedStd = Math.sqrt(variance)
        const minimumWidth = Math.max(minZoneTicks * eps, atrNow * minZoneAtr)
        const maximumWidth = Math.max(minimumWidth, atrNow * maxZoneAtr)
        const halfWidth = clamp(Math.max(weightedStd * dispersionMultiplier, minimumWidth), minimumWidth, maximumWidth)
        cluster.low = cluster.center - halfWidth
        cluster.high = cluster.center + halfWidth
        cluster.weightedMean = cluster.scoreWeightSum / Math.max(cluster.weightSum, 0.001)
        cluster.reactionQuality =
          cluster.reactionWeight > 0 ? cluster.reactionWeightSum / cluster.reactionWeight : NaN
        const redundantMembers = Math.max(cluster.memberCount - cluster.diversityCount, 0)
        const diversityScore = clamp(
          25 + Math.max(cluster.diversityCount - 1, 0) * 20 + Math.min(redundantMembers, 3) * 5,
          0,
          100
        )
        let raw = 0.45 * cluster.weightedMean + 0.25 * cluster.maxScore + 0.2 * diversityScore
        let weights = 0.9
        if (Number.isFinite(cluster.reactionQuality)) {
          raw += 0.1 * cluster.reactionQuality
          weights += 0.1
        }
        cluster.strength = clamp(raw / weights, 0, 100)
        const c = close[i]
        const distanceToZone = c < cluster.low ? cluster.low - c : c > cluster.high ? c - cluster.high : 0
        const distanceAtr = distanceToZone / Math.max(atrNow, eps)
        cluster.actionability = cluster.strength / (1 + distanceAtr * actionabilityDecay)
        return cluster
      }

      const buildClusters = (registry, tolerance, atrNow, i) => {
        const out = []
        if (registry.length === 0) return out
        registry.sort((a, b) => a.price - b.price)
        const duplicateTolerance = Math.max(eps * 2, tolerance * 0.2)
        let current = null
        for (const candidate of registry) {
          if (current === null) current = newCluster(candidate)
          else if (Math.abs(candidate.price - current.center) <= tolerance) {
            current = clusterAdd(current, candidate, duplicateTolerance)
          } else {
            out.push(finalizeCluster(current, atrNow, i))
            current = newCluster(candidate)
          }
        }
        if (current !== null) out.push(finalizeCluster(current, atrNow, i))
        return out
      }

      const clusterPolarityMatch = (cluster, polarity) => {
        const hasSupportAuthority = cluster.supportWeight > 0
        const hasResistanceAuthority = cluster.resistanceWeight > 0
        return polarity === 1
          ? !hasResistanceAuthority || (hasSupportAuthority && cluster.supportWeight >= cluster.resistanceWeight)
          : !hasSupportAuthority || (hasResistanceAuthority && cluster.resistanceWeight >= cluster.supportWeight)
      }

      const bestClusterIndex = (clusters, polarity, blockedWatch, tolerance, i) => {
        let bestIndex = -1
        let bestActionability = -1
        for (let k = 0; k < clusters.length; k++) {
          const cluster = clusters[k]
          const sideMatch = polarity === 1 ? cluster.center < close[i] : cluster.center > close[i]
          const polarityMatch = clusterPolarityMatch(cluster, polarity)
          const blocked =
            blockedWatch.valid &&
            ((cluster.high >= blockedWatch.low && cluster.low <= blockedWatch.high) ||
              Math.abs(cluster.center - blockedWatch.center) <= tolerance * 1.5)
          if (
            sideMatch &&
            polarityMatch &&
            !blocked &&
            cluster.strength >= minimumZoneStrength &&
            cluster.actionability > bestActionability
          ) {
            bestActionability = cluster.actionability
            bestIndex = k
          }
        }
        return bestIndex
      }

      const matchingClusterIndex = (clusters, zoneRef, tolerance) => {
        let matchIndex = -1
        let nearest = 1e12
        if (!zoneRef.valid) return matchIndex
        for (let k = 0; k < clusters.length; k++) {
          const cluster = clusters[k]
          const distance = Math.abs(cluster.center - zoneRef.center)
          const overlap = cluster.high >= zoneRef.low && cluster.low <= zoneRef.high
          const polarityMatch = zoneRef.polarityFlipped || clusterPolarityMatch(cluster, zoneRef.polarity)
          if (
            cluster.strength >= minimumZoneStrength &&
            polarityMatch &&
            (overlap || distance <= tolerance * 1.5) &&
            distance < nearest
          ) {
            nearest = distance
            matchIndex = k
          }
        }
        return matchIndex
      }

      const emptyZone = () => ({
        valid: false,
        center: NaN,
        low: NaN,
        high: NaN,
        strength: NaN,
        actionability: NaN,
        weightedMean: NaN,
        reactionQuality: NaN,
        diversityCount: 0,
        sources: '',
        polarity: 0,
        polarityFlipped: false,
        state: STATE_DISTANT,
        stateBar: NaN,
        selectedBar: NaN,
        insideCloses: 0,
        beyondCloses: 0,
        missedRefreshes: 0,
      })

      const emptyWatch = () => ({
        valid: false,
        center: NaN,
        low: NaN,
        high: NaN,
        strength: NaN,
        weightedMean: NaN,
        reactionQuality: NaN,
        diversityCount: 0,
        sources: '',
        brokenTime: NaN,
      })

      const zoneFromCluster = (cluster, polarity, state, selectedBar, i) => ({
        valid: true,
        center: cluster.center,
        low: cluster.low,
        high: cluster.high,
        strength: cluster.strength,
        actionability: cluster.actionability,
        weightedMean: cluster.weightedMean,
        reactionQuality: cluster.reactionQuality,
        diversityCount: cluster.diversityCount,
        sources: cluster.sources,
        polarity,
        polarityFlipped: false,
        state,
        stateBar: i,
        selectedBar,
        insideCloses: 0,
        beyondCloses: 0,
        missedRefreshes: 0,
      })

      const refreshZone = (zoneRef, cluster) => ({
        ...zoneRef,
        center: cluster.center,
        low: cluster.low,
        high: cluster.high,
        strength: cluster.strength,
        actionability: cluster.actionability,
        weightedMean: cluster.weightedMean,
        reactionQuality: cluster.reactionQuality,
        diversityCount: cluster.diversityCount,
        sources: cluster.sources,
        missedRefreshes: 0,
      })

      const zoneToWatch = (zoneRef, i) => ({
        valid: zoneRef.valid,
        center: zoneRef.center,
        low: zoneRef.low,
        high: zoneRef.high,
        strength: zoneRef.strength,
        weightedMean: zoneRef.weightedMean,
        reactionQuality: zoneRef.reactionQuality,
        diversityCount: zoneRef.diversityCount,
        sources: zoneRef.sources,
        brokenTime: time[i],
      })

      const zoneFromWatch = (watch, polarity, i) => ({
        valid: true,
        center: watch.center,
        low: watch.low,
        high: watch.high,
        strength: watch.strength,
        actionability: watch.strength,
        weightedMean: watch.weightedMean,
        reactionQuality: watch.reactionQuality,
        diversityCount: watch.diversityCount,
        sources: watch.sources,
        polarity,
        polarityFlipped: true,
        state: STATE_FLIPPED,
        stateBar: i,
        selectedBar: i,
        insideCloses: 0,
        beyondCloses: 0,
        missedRefreshes: 0,
      })

      const roundSteps = (price) => {
        const minor = price < 5 ? 0.1 : price < 20 ? 0.25 : price < 100 ? 0.5 : price < 500 ? 1 : 5
        const major = price < 5 ? 0.25 : price < 20 ? 0.5 : price < 100 ? 1 : price < 500 ? 5 : 10
        return [minor, major]
      }

      /* ---- carried state -------------------------------------------------- */
      let currentDayHigh = NaN
      let currentDayLow = NaN
      let currentDayClose = NaN
      let previousDayHigh = NaN
      let previousDayLow = NaN
      let previousDayClose = NaN
      let previousDayKnownBar = NaN
      let currentSessionOpen = NaN
      let currentSessionOpenKnownBar = NaN

      let trackedWeekKey = NaN
      let currentWeekHigh = NaN
      let currentWeekLow = NaN
      let previousWeekHigh = NaN
      let previousWeekLow = NaN
      let previousWeekKnownBar = NaN

      let premarketHigh = NaN
      let premarketLow = NaN
      let premarketDayKey = NaN
      let premarketHighKnownBar = NaN
      let premarketLowKnownBar = NaN

      let openingRangeEndTime = NaN
      let openingRangeStartBar = NaN
      let openingRangeHigh = NaN
      let openingRangeLow = NaN
      let openingRangeFinalized = false
      let openingRangeKnownBar = NaN

      let gapActive = false
      let gapFilled = false
      let gapDirection = 0
      let gapHigh = NaN
      let gapLow = NaN
      let gapMid = NaN
      let gapUnfilledBoundary = NaN
      let gapKnownBar = NaN

      let pendingEventAnchor = false
      let manualAnchorConsumed = false
      let eventAnchorTime = NaN
      let eventAnchorBar = NaN
      let eventCumPV = 0
      let eventCumVolume = 0
      let eventBars = 0

      let cumPV = 0
      let cumV = 0
      let cumP2V = 0

      const pivots = []

      let supportZone = emptyZone()
      let resistanceZone = emptyZone()
      let supportBreakWatch = emptyWatch()
      let resistanceBreakWatch = emptyWatch()

      /* ---- the bar loop --------------------------------------------------- */
      for (let i = 0; i < n; i++) {
        const newCalendarDay = i === 0 || dayKey[i] !== dayKey[i - 1]
        const prevInRth = i > 0 ? inRth[i - 1] : false
        const prevInPremarket = i > 0 ? inPremarket[i - 1] : false
        const rthStart = inRth[i] && (newCalendarDay || !prevInRth)
        const premarketStart = inPremarket[i] && (newCalendarDay || !prevInPremarket)
        const atrNow = normAtr[i]
        const clusterTolerance = Math.max(
          clusterMinimumTicks * eps,
          Math.max((Number.isFinite(atrNow) ? atrNow : 0) * clusterAtrFraction, close[i] * clusterMinimumPct)
        )
        const maximumCandidateDistance = atrNow * maxDistanceAtr

        /* previous day / session open */
        const dailyLevelRoll = premarketStart || (rthStart && !prevInPremarket)
        if (dailyLevelRoll) {
          if (Number.isFinite(currentDayHigh)) {
            previousDayHigh = currentDayHigh
            previousDayLow = currentDayLow
            previousDayClose = currentDayClose
            previousDayKnownBar = i
          }
          currentDayHigh = NaN
          currentDayLow = NaN
          currentDayClose = NaN
          currentSessionOpen = NaN
          currentSessionOpenKnownBar = NaN
        }
        if (rthStart) {
          currentSessionOpen = open[i]
          currentSessionOpenKnownBar = i
          currentDayHigh = high[i]
          currentDayLow = low[i]
          currentDayClose = close[i]
        } else if (inRth[i]) {
          currentDayHigh = Number.isFinite(currentDayHigh) ? Math.max(currentDayHigh, high[i]) : high[i]
          currentDayLow = Number.isFinite(currentDayLow) ? Math.min(currentDayLow, low[i]) : low[i]
          currentDayClose = close[i]
        }

        /* previous week */
        const currentWeekKey = weekIdx[i]
        if (!Number.isFinite(trackedWeekKey)) trackedWeekKey = currentWeekKey
        if (Number.isFinite(trackedWeekKey) && currentWeekKey !== trackedWeekKey) {
          if (Number.isFinite(currentWeekHigh)) {
            previousWeekHigh = currentWeekHigh
            previousWeekLow = currentWeekLow
            previousWeekKnownBar = i
          }
          trackedWeekKey = currentWeekKey
          currentWeekHigh = NaN
          currentWeekLow = NaN
        }
        if (inRth[i]) {
          currentWeekHigh = Number.isFinite(currentWeekHigh) ? Math.max(currentWeekHigh, high[i]) : high[i]
          currentWeekLow = Number.isFinite(currentWeekLow) ? Math.min(currentWeekLow, low[i]) : low[i]
        }

        /* premarket */
        if (premarketStart) {
          premarketHigh = high[i]
          premarketLow = low[i]
          premarketDayKey = dayKey[i]
          premarketHighKnownBar = i
          premarketLowKnownBar = i
        } else if (inPremarket[i]) {
          if (!Number.isFinite(premarketHigh) || high[i] > premarketHigh) {
            premarketHigh = high[i]
            premarketHighKnownBar = i
          }
          if (!Number.isFinite(premarketLow) || low[i] < premarketLow) {
            premarketLow = low[i]
            premarketLowKnownBar = i
          }
          premarketDayKey = dayKey[i]
        }
        if (rthStart && (premarketDayKey !== dayKey[i] || !Number.isFinite(premarketHigh) || !Number.isFinite(premarketLow))) {
          premarketHigh = NaN
          premarketLow = NaN
          premarketHighKnownBar = NaN
          premarketLowKnownBar = NaN
        }

        /* opening range */
        if (premarketStart) {
          openingRangeEndTime = NaN
          openingRangeStartBar = NaN
          openingRangeHigh = NaN
          openingRangeLow = NaN
          openingRangeFinalized = false
          openingRangeKnownBar = NaN
        }
        if (rthStart) {
          openingRangeEndTime = time[i] + openingRangeMinutes * 60
          openingRangeStartBar = i
          openingRangeHigh = high[i]
          openingRangeLow = low[i]
          openingRangeFinalized = false
          openingRangeKnownBar = NaN
        }
        const inOpeningRange = inRth[i] && Number.isFinite(openingRangeEndTime) && time[i] < openingRangeEndTime
        if (inOpeningRange && !rthStart) {
          openingRangeHigh = Math.max(openingRangeHigh, high[i])
          openingRangeLow = Math.min(openingRangeLow, low[i])
        }
        if (inRth[i] && !inOpeningRange && !openingRangeFinalized && Number.isFinite(openingRangeEndTime)) {
          openingRangeFinalized = true
          openingRangeKnownBar = i
        }

        /* gap structure */
        if (premarketStart) {
          gapActive = false
          gapFilled = false
          gapDirection = 0
          gapHigh = NaN
          gapLow = NaN
          gapMid = NaN
          gapUnfilledBoundary = NaN
          gapKnownBar = NaN
        }
        if (rthStart) {
          gapActive =
            useGapStructure &&
            Number.isFinite(previousDayClose) &&
            Number.isFinite(atrNow) &&
            atrNow > 0 &&
            Math.abs(open[i] - previousDayClose) >= atrNow * gapMinimumAtr
          gapFilled = false
          gapDirection = gapActive ? (open[i] > previousDayClose ? 1 : -1) : 0
          gapHigh = gapActive ? Math.max(open[i], previousDayClose) : NaN
          gapLow = gapActive ? Math.min(open[i], previousDayClose) : NaN
          gapMid = gapActive ? (open[i] + previousDayClose) * 0.5 : NaN
          gapUnfilledBoundary = gapActive ? open[i] : NaN
          gapKnownBar = gapActive ? i : NaN
        }
        if (gapActive && !gapFilled && inRth[i]) {
          gapUnfilledBoundary =
            gapDirection === 1 ? Math.min(gapUnfilledBoundary, low[i]) : Math.max(gapUnfilledBoundary, high[i])
          gapFilled =
            gapDirection === 1
              ? gapUnfilledBoundary <= gapLow
              : gapDirection === -1
                ? gapUnfilledBoundary >= gapHigh
                : true
        }

        /* session VWAP and its bands */
        if (rthStart) {
          cumPV = 0
          cumV = 0
          cumP2V = 0
        }
        {
          const v = Number.isFinite(vol[i]) && vol[i] > 0 ? vol[i] : 0
          const s = vwapSrc[i]
          if (v > 0 && Number.isFinite(s)) {
            cumPV += s * v
            cumV += v
            cumP2V += s * s * v
          }
          if (cumV > 0) {
            const vw = cumPV / cumV
            const variance = Math.max(cumP2V / cumV - vw * vw, 0)
            const sd = Math.sqrt(variance)
            sessionVwap[i] = vw
            band1Up[i] = vw + vwapBand1Multiplier * sd
            band1Dn[i] = vw - vwapBand1Multiplier * sd
            band2Up[i] = vw + vwapBand2Multiplier * sd
            band2Dn[i] = vw - vwapBand2Multiplier * sd
          }
        }

        /* event AVWAP. request.earnings has no equivalent here, so the
         * automatic mode never observes an event; the manual anchor works. */
        const manualEventObserved =
          eventAnchorMode === 'Manual timestamp' &&
          Number.isFinite(manualEventTime) &&
          manualEventTime > 0 &&
          !manualAnchorConsumed &&
          time[i] >= manualEventTime &&
          (i === 0 || time[i - 1] < manualEventTime)
        let startEventAnchorNow = false
        if (manualEventObserved) {
          manualAnchorConsumed = true
          if (inRth[i]) startEventAnchorNow = true
          else pendingEventAnchor = true
        }
        if (pendingEventAnchor && rthStart) {
          startEventAnchorNow = true
          pendingEventAnchor = false
        }
        if (startEventAnchorNow) {
          eventAnchorTime = time[i]
          eventAnchorBar = i
          eventCumPV = 0
          eventCumVolume = 0
          eventBars = 0
        }
        if (eventAnchorMode !== 'Disabled' && Number.isFinite(eventAnchorTime) && time[i] >= eventAnchorTime) {
          if (Number.isFinite(vol[i]) && vol[i] > 0) {
            eventCumPV += hlc3[i] * vol[i]
            eventCumVolume += vol[i]
          }
          eventBars += 1
        }
        const eventAvwap = eventCumVolume > 0 ? eventCumPV / eventCumVolume : NaN
        const eventAgeDays = Number.isFinite(eventAnchorTime)
          ? Math.max(time[i] - eventAnchorTime, 0) / 86400
          : NaN
        const eventRecency = Number.isFinite(eventAgeDays)
          ? 100 / (1 + eventAgeDays / Math.max(eventMaxAgeDays * 0.5, 1))
          : NaN
        const eventCandidateValid =
          eventAnchorMode !== 'Disabled' &&
          Number.isFinite(eventAvwap) &&
          eventBars >= eventMinBars &&
          Number.isFinite(eventAgeDays) &&
          eventAgeDays <= eventMaxAgeDays &&
          Number.isFinite(atrNow) &&
          Math.abs(eventAvwap - close[i]) <= atrNow * eventMaxDistanceAtr

        /* confirmed swing pivots */
        let newPivotAdded = false
        const ph = confirmedPivotHigh[i]
        if (usePivots && Number.isFinite(ph)) {
          const originAtr = normAtr[Math.max(i - pivotRightBars, 0)]
          const excursion =
            Number.isFinite(originAtr) && originAtr > 0 && Number.isFinite(pivotConfirmationLow[i])
              ? (ph - pivotConfirmationLow[i]) / originAtr
              : 0
          const baseWeight = clamp(55 + excursion * 10, 55, 75)
          const originImpulse = positiveSat(excursion)
          const baselineAt = volumeBaseline[Math.max(i - pivotRightBars, 0)]
          const volumeAt = vol[Math.max(i - pivotRightBars, 0)]
          const originRvol =
            Number.isFinite(baselineAt) && baselineAt > 0 && Number.isFinite(volumeAt) ? volumeAt / baselineAt : NaN
          const originVolume = participationScore(originRvol)
          let merged = false
          for (const pivot of pivots) {
            if (
              pivot.polarity === -1 &&
              Math.abs(pivot.price - ph) <= Math.max(eps * 2, (Number.isFinite(atrNow) ? atrNow : 0) * 0.015)
            ) {
              pivot.pivotBar = i - pivotRightBars
              pivot.baseWeight = Math.max(pivot.baseWeight, baseWeight)
              pivot.originImpulse = Math.max(pivot.originImpulse, originImpulse)
              pivot.originVolume = !Number.isFinite(pivot.originVolume)
                ? originVolume
                : !Number.isFinite(originVolume)
                  ? pivot.originVolume
                  : Math.max(pivot.originVolume, originVolume)
              merged = true
              newPivotAdded = true
            }
          }
          if (!merged) {
            pivots.push({
              price: ph,
              polarity: -1,
              pivotBar: i - pivotRightBars,
              knownBar: i,
              baseWeight,
              originImpulse,
              originVolume,
            })
            newPivotAdded = true
          }
        }
        const pl = confirmedPivotLow[i]
        if (usePivots && Number.isFinite(pl)) {
          const originAtr = normAtr[Math.max(i - pivotRightBars, 0)]
          const excursion =
            Number.isFinite(originAtr) && originAtr > 0 && Number.isFinite(pivotConfirmationHigh[i])
              ? (pivotConfirmationHigh[i] - pl) / originAtr
              : 0
          const baseWeight = clamp(55 + excursion * 10, 55, 75)
          const originImpulse = positiveSat(excursion)
          const baselineAt = volumeBaseline[Math.max(i - pivotRightBars, 0)]
          const volumeAt = vol[Math.max(i - pivotRightBars, 0)]
          const originRvol =
            Number.isFinite(baselineAt) && baselineAt > 0 && Number.isFinite(volumeAt) ? volumeAt / baselineAt : NaN
          const originVolume = participationScore(originRvol)
          let merged = false
          for (const pivot of pivots) {
            if (
              pivot.polarity === 1 &&
              Math.abs(pivot.price - pl) <= Math.max(eps * 2, (Number.isFinite(atrNow) ? atrNow : 0) * 0.015)
            ) {
              pivot.pivotBar = i - pivotRightBars
              pivot.baseWeight = Math.max(pivot.baseWeight, baseWeight)
              pivot.originImpulse = Math.max(pivot.originImpulse, originImpulse)
              pivot.originVolume = !Number.isFinite(pivot.originVolume)
                ? originVolume
                : !Number.isFinite(originVolume)
                  ? pivot.originVolume
                  : Math.max(pivot.originVolume, originVolume)
              merged = true
              newPivotAdded = true
            }
          }
          if (!merged) {
            pivots.push({
              price: pl,
              polarity: 1,
              pivotBar: i - pivotRightBars,
              knownBar: i,
              baseWeight,
              originImpulse,
              originVolume,
            })
            newPivotAdded = true
          }
        }
        for (let k = 0; k < pivots.length; ) {
          if (i - pivots[k].pivotBar > pivotMaxAgeBars) pivots.splice(k, 1)
          else k += 1
        }
        while (pivots.length > maxPivotRecords) pivots.shift()

        /* zone lifecycle */
        let enteredSupport = false
        let enteredResistance = false
        let supportRejection = false
        let resistanceRejection = false
        let supportBreakAcceptance = false
        let resistanceBreakAcceptance = false
        let zoneFlip = false
        let higherQualityZoneSelected = false
        let zoneInvalidated = false

        if (supportZone.valid && supportZone.state === STATE_BROKEN && i > supportZone.stateBar) {
          supportZone = emptyZone()
        }
        if (resistanceZone.valid && resistanceZone.state === STATE_BROKEN && i > resistanceZone.stateBar) {
          resistanceZone = emptyZone()
        }

        if (supportZone.valid) {
          const z = supportZone
          const overlap = high[i] >= z.low && low[i] <= z.high
          const beyond = close[i] < z.low
          const distance = close[i] > z.high ? (close[i] - z.high) / Math.max(atrNow, eps) : 0
          const previousState = z.state
          const closeInside = close[i] >= z.low && close[i] <= z.high
          enteredSupport =
            overlap &&
            previousState !== STATE_INSIDE &&
            previousState !== STATE_REJECTING &&
            previousState !== STATE_ACCEPTING &&
            previousState !== STATE_FLIPPED
          z.insideCloses = closeInside ? z.insideCloses + 1 : 0
          z.beyondCloses = beyond ? z.beyondCloses + 1 : 0
          const hardBreak = close[i] < z.low - atrNow * breakDisplacementAtr
          const confirmedBreak = hardBreak || z.beyondCloses >= breakClosesRequired
          const rejection = overlap && close[i] > z.high + atrNow * rejectionDisplacementAtr
          const accepting =
            (z.insideCloses >= acceptanceClosesRequired || z.beyondCloses > 0) && !rejection && !confirmedBreak
          if (confirmedBreak) {
            z.state = STATE_BROKEN
            z.stateBar = i
            supportBreakWatch = zoneToWatch(z, i)
            supportBreakAcceptance = previousState !== STATE_BROKEN
            zoneInvalidated = true
          } else if (rejection) {
            z.state = STATE_REJECTING
            z.stateBar = i
            supportRejection = previousState !== STATE_REJECTING
          } else if (accepting) {
            z.state = STATE_ACCEPTING
            z.stateBar = i
            supportBreakAcceptance = previousState !== STATE_ACCEPTING
          } else if (overlap) {
            z.state = STATE_INSIDE
            z.stateBar = previousState !== STATE_INSIDE ? i : z.stateBar
          } else if (
            previousState === STATE_REJECTING ||
            previousState === STATE_ACCEPTING ||
            previousState === STATE_FLIPPED
          ) {
            if (i - z.stateBar > stateHoldBars) {
              z.state = distance <= approachingAtr ? STATE_APPROACHING : STATE_DISTANT
            }
          } else {
            z.state = distance <= approachingAtr ? STATE_APPROACHING : STATE_DISTANT
          }
        }

        if (resistanceZone.valid) {
          const z = resistanceZone
          const overlap = high[i] >= z.low && low[i] <= z.high
          const beyond = close[i] > z.high
          const distance = close[i] < z.low ? (z.low - close[i]) / Math.max(atrNow, eps) : 0
          const previousState = z.state
          const closeInside = close[i] >= z.low && close[i] <= z.high
          enteredResistance =
            overlap &&
            previousState !== STATE_INSIDE &&
            previousState !== STATE_REJECTING &&
            previousState !== STATE_ACCEPTING &&
            previousState !== STATE_FLIPPED
          z.insideCloses = closeInside ? z.insideCloses + 1 : 0
          z.beyondCloses = beyond ? z.beyondCloses + 1 : 0
          const hardBreak = close[i] > z.high + atrNow * breakDisplacementAtr
          const confirmedBreak = hardBreak || z.beyondCloses >= breakClosesRequired
          const rejection = overlap && close[i] < z.low - atrNow * rejectionDisplacementAtr
          const accepting =
            (z.insideCloses >= acceptanceClosesRequired || z.beyondCloses > 0) && !rejection && !confirmedBreak
          if (confirmedBreak) {
            z.state = STATE_BROKEN
            z.stateBar = i
            resistanceBreakWatch = zoneToWatch(z, i)
            resistanceBreakAcceptance = previousState !== STATE_BROKEN
            zoneInvalidated = true
          } else if (rejection) {
            z.state = STATE_REJECTING
            z.stateBar = i
            resistanceRejection = previousState !== STATE_REJECTING
          } else if (accepting) {
            z.state = STATE_ACCEPTING
            z.stateBar = i
            resistanceBreakAcceptance = previousState !== STATE_ACCEPTING
          } else if (overlap) {
            z.state = STATE_INSIDE
            z.stateBar = previousState !== STATE_INSIDE ? i : z.stateBar
          } else if (
            previousState === STATE_REJECTING ||
            previousState === STATE_ACCEPTING ||
            previousState === STATE_FLIPPED
          ) {
            if (i - z.stateBar > stateHoldBars) {
              z.state = distance <= approachingAtr ? STATE_APPROACHING : STATE_DISTANT
            }
          } else {
            z.state = distance <= approachingAtr ? STATE_APPROACHING : STATE_DISTANT
          }
        }

        if (supportBreakWatch.valid) {
          const w = supportBreakWatch
          const expired = time[i] - w.brokenTime > flipWatchMinutes * 60
          const retested = high[i] >= w.low - atrNow * flipRetestAtr && low[i] <= w.high + atrNow * flipRetestAtr
          const heldAsResistance =
            time[i] > w.brokenTime && retested && close[i] < w.low - atrNow * rejectionDisplacementAtr
          if (heldAsResistance) {
            const flipped = zoneFromWatch(w, -1, i)
            const activateFlip =
              !resistanceZone.valid ||
              flipped.actionability >= resistanceZone.actionability ||
              flipped.strength >= resistanceZone.strength + switchMargin
            if (activateFlip) {
              resistanceZone = flipped
              zoneFlip = true
            }
            supportBreakWatch = emptyWatch()
          } else if (expired) {
            supportBreakWatch = emptyWatch()
          }
        }

        if (resistanceBreakWatch.valid) {
          const w = resistanceBreakWatch
          const expired = time[i] - w.brokenTime > flipWatchMinutes * 60
          const retested = high[i] >= w.low - atrNow * flipRetestAtr && low[i] <= w.high + atrNow * flipRetestAtr
          const heldAsSupport =
            time[i] > w.brokenTime && retested && close[i] > w.high + atrNow * rejectionDisplacementAtr
          if (heldAsSupport) {
            const flipped = zoneFromWatch(w, 1, i)
            const activateFlip =
              !supportZone.valid ||
              flipped.actionability >= supportZone.actionability ||
              flipped.strength >= supportZone.strength + switchMargin
            if (activateFlip) {
              supportZone = flipped
              zoneFlip = true
            }
            resistanceBreakWatch = emptyWatch()
          } else if (expired) {
            resistanceBreakWatch = emptyWatch()
          }
        }

        /* cluster rebuild */
        const rebuildClusters =
          Number.isFinite(atrNow) &&
          atrNow > 0 &&
          (newPivotAdded || rthStart || premarketStart || zoneInvalidated || i % refreshBars === 0)

        if (rebuildClusters) {
          const registry = []
          const base = {
            index: i,
            atr: atrNow,
            maxDistance: maximumCandidateDistance,
            originBar: NaN,
            knownBar: NaN,
            originImpulse: NaN,
            originVolume: NaN,
            recencyOverride: NaN,
            scanReactions: false,
          }
          if (usePriorDay) {
            addCandidate(registry, previousDayHigh, 75, SRC_PDH, -1, { ...base, knownBar: previousDayKnownBar, scanReactions: true })
            addCandidate(registry, previousDayLow, 75, SRC_PDL, 1, { ...base, knownBar: previousDayKnownBar, scanReactions: true })
            addCandidate(registry, previousDayClose, 55, SRC_PDC, 0, { ...base, knownBar: previousDayKnownBar, scanReactions: true })
          }
          if (usePriorWeek) {
            addCandidate(registry, previousWeekHigh, 80, SRC_PWH, -1, { ...base, knownBar: previousWeekKnownBar, scanReactions: true })
            addCandidate(registry, previousWeekLow, 80, SRC_PWL, 1, { ...base, knownBar: previousWeekKnownBar, scanReactions: true })
          }
          if (usePremarket && Number.isFinite(premarketHigh) && Number.isFinite(premarketLow)) {
            const premarketWeight = inPremarket[i] ? 55 : 65
            addCandidate(registry, premarketHigh, premarketWeight, SRC_PMH, -1, { ...base, knownBar: premarketHighKnownBar, scanReactions: true })
            addCandidate(registry, premarketLow, premarketWeight, SRC_PML, 1, { ...base, knownBar: premarketLowKnownBar, scanReactions: true })
          }
          if (useOpeningRange && openingRangeFinalized) {
            addCandidate(registry, openingRangeHigh, 65, SRC_ORH, -1, { ...base, knownBar: openingRangeKnownBar, scanReactions: true })
            addCandidate(registry, openingRangeLow, 65, SRC_ORL, 1, { ...base, knownBar: openingRangeKnownBar, scanReactions: true })
          }
          if (useRthOpen) {
            const rthOpenWeight = gapActive && !gapFilled ? 55 : 45
            addCandidate(registry, currentSessionOpen, rthOpenWeight, SRC_RTH_OPEN, 0, { ...base, knownBar: currentSessionOpenKnownBar, scanReactions: true })
          }
          if (useGapStructure && gapActive && !gapFilled) {
            if (!usePriorDay) {
              addCandidate(registry, previousDayClose, 55, SRC_GAP, 0, { ...base, knownBar: gapKnownBar, recencyOverride: 100, scanReactions: true })
            }
            if (!useRthOpen) {
              addCandidate(registry, currentSessionOpen, 55, SRC_GAP, 0, { ...base, knownBar: gapKnownBar, recencyOverride: 100, scanReactions: true })
            }
            addCandidate(registry, gapMid, 35, SRC_GAP, 0, { ...base, knownBar: gapKnownBar, recencyOverride: 100, scanReactions: true })
            const distinctGapBoundary =
              Number.isFinite(gapUnfilledBoundary) &&
              Math.abs(gapUnfilledBoundary - gapMid) > clusterTolerance &&
              Math.abs(gapUnfilledBoundary - currentSessionOpen) > clusterTolerance &&
              Math.abs(gapUnfilledBoundary - previousDayClose) > clusterTolerance
            if (distinctGapBoundary) {
              const gapBoundaryPolarity = gapDirection === 1 ? 1 : -1
              addCandidate(registry, gapUnfilledBoundary, 55, SRC_GAP, gapBoundaryPolarity, { ...base, originBar: i, knownBar: i, recencyOverride: 100 })
            }
          }
          if (useVwapCandidate && inRth[i] && Number.isFinite(sessionVwap[i])) {
            addCandidate(registry, sessionVwap[i], 55, SRC_VWAP, 0, { ...base, originBar: i, knownBar: i, recencyOverride: 100 })
          }
          if (useVwapBandCandidates && inRth[i]) {
            addCandidate(registry, band1Up[i], 25, SRC_VWAP_BAND, -1, { ...base, originBar: i, knownBar: i, recencyOverride: 100 })
            addCandidate(registry, band1Dn[i], 25, SRC_VWAP_BAND, 1, { ...base, originBar: i, knownBar: i, recencyOverride: 100 })
          }
          if (eventCandidateValid) {
            const eventSourceWeight = 75 * (0.6 + (0.4 * eventRecency) / 100)
            addCandidate(registry, eventAvwap, eventSourceWeight, SRC_EVENT_AVWAP, 0, { ...base, originBar: eventAnchorBar, knownBar: eventAnchorBar, recencyOverride: eventRecency })
          }
          if (useAtrProjections && Number.isFinite(currentSessionOpen)) {
            const p = { ...base, originBar: currentSessionOpenKnownBar, knownBar: currentSessionOpenKnownBar, recencyOverride: 100 }
            addCandidate(registry, currentSessionOpen + atrNow * 0.5, 20, SRC_ATR_PROJECTION, -1, p)
            addCandidate(registry, currentSessionOpen - atrNow * 0.5, 20, SRC_ATR_PROJECTION, 1, p)
            addCandidate(registry, currentSessionOpen + atrNow, 20, SRC_ATR_PROJECTION, -1, p)
            addCandidate(registry, currentSessionOpen - atrNow, 20, SRC_ATR_PROJECTION, 1, p)
            if (Number.isFinite(previousDayClose)) {
              const q = { ...base, originBar: previousDayKnownBar, knownBar: previousDayKnownBar, recencyOverride: 100 }
              addCandidate(registry, previousDayClose + atrNow, 20, SRC_ATR_PROJECTION, -1, q)
              addCandidate(registry, previousDayClose - atrNow, 20, SRC_ATR_PROJECTION, 1, q)
            }
          }
          if (useRoundNumbers) {
            const [minorStep, majorStep] = roundSteps(close[i])
            const minorBelow = Math.floor(close[i] / minorStep) * minorStep
            const majorBelow = Math.floor(close[i] / majorStep) * majorStep
            const r = { ...base, recencyOverride: 100, scanReactions: true }
            addCandidate(registry, minorBelow, 25, SRC_ROUND, 0, r)
            addCandidate(registry, minorBelow + minorStep, 25, SRC_ROUND, 0, r)
            addCandidate(registry, majorBelow, 25, SRC_ROUND, 0, r)
            addCandidate(registry, majorBelow + majorStep, 25, SRC_ROUND, 0, r)
          }
          if (usePivots) {
            for (const pivot of pivots) {
              const sourceType = pivot.polarity === -1 ? SRC_PIVOT_HIGH : SRC_PIVOT_LOW
              addCandidate(registry, pivot.price, pivot.baseWeight, sourceType, pivot.polarity, {
                ...base,
                originBar: pivot.pivotBar,
                knownBar: pivot.knownBar,
                originImpulse: pivot.originImpulse,
                originVolume: pivot.originVolume,
                scanReactions: true,
              })
            }
          }

          const clusters = buildClusters(registry, clusterTolerance, atrNow, i)
          const supportMatchIndex = matchingClusterIndex(clusters, supportZone, clusterTolerance)
          const resistanceMatchIndex = matchingClusterIndex(clusters, resistanceZone, clusterTolerance)
          if (supportZone.valid) {
            if (supportMatchIndex >= 0) supportZone = refreshZone(supportZone, clusters[supportMatchIndex])
            else {
              supportZone.missedRefreshes += 1
              if (supportZone.missedRefreshes >= 3 || rthStart || premarketStart) supportZone = emptyZone()
            }
          }
          if (resistanceZone.valid) {
            if (resistanceMatchIndex >= 0) resistanceZone = refreshZone(resistanceZone, clusters[resistanceMatchIndex])
            else {
              resistanceZone.missedRefreshes += 1
              if (resistanceZone.missedRefreshes >= 3 || rthStart || premarketStart) resistanceZone = emptyZone()
            }
          }

          const bestSupportIndex = bestClusterIndex(clusters, 1, resistanceBreakWatch, clusterTolerance, i)
          const bestResistanceIndex = bestClusterIndex(clusters, -1, supportBreakWatch, clusterTolerance, i)

          const initialStateFor = (cluster) =>
            cluster.high >= low[i] && cluster.low <= high[i]
              ? STATE_INSIDE
              : Math.abs(cluster.center - close[i]) / atrNow <= approachingAtr
                ? STATE_APPROACHING
                : STATE_DISTANT

          if (bestSupportIndex >= 0) {
            const bestSupport = clusters[bestSupportIndex]
            const sameSupport =
              supportZone.valid &&
              ((bestSupport.high >= supportZone.low && bestSupport.low <= supportZone.high) ||
                Math.abs(bestSupport.center - supportZone.center) <= clusterTolerance * 1.5)
            if (!supportZone.valid) {
              const initialState = initialStateFor(bestSupport)
              supportZone = zoneFromCluster(bestSupport, 1, initialState, i, i)
              enteredSupport = enteredSupport || initialState === STATE_INSIDE
            } else if (
              !sameSupport &&
              (bestSupport.strength >= supportZone.strength + switchMargin ||
                bestSupport.actionability >= supportZone.actionability + switchMargin)
            ) {
              const replacementState = initialStateFor(bestSupport)
              supportZone = zoneFromCluster(bestSupport, 1, replacementState, i, i)
              enteredSupport = enteredSupport || replacementState === STATE_INSIDE
              higherQualityZoneSelected = true
            }
          }

          if (bestResistanceIndex >= 0) {
            const bestResistance = clusters[bestResistanceIndex]
            const sameResistance =
              resistanceZone.valid &&
              ((bestResistance.high >= resistanceZone.low && bestResistance.low <= resistanceZone.high) ||
                Math.abs(bestResistance.center - resistanceZone.center) <= clusterTolerance * 1.5)
            if (!resistanceZone.valid) {
              const initialState = initialStateFor(bestResistance)
              resistanceZone = zoneFromCluster(bestResistance, -1, initialState, i, i)
              enteredResistance = enteredResistance || initialState === STATE_INSIDE
            } else if (
              !sameResistance &&
              (bestResistance.strength >= resistanceZone.strength + switchMargin ||
                bestResistance.actionability >= resistanceZone.actionability + switchMargin)
            ) {
              const replacementState = initialStateFor(bestResistance)
              resistanceZone = zoneFromCluster(bestResistance, -1, replacementState, i, i)
              enteredResistance = enteredResistance || replacementState === STATE_INSIDE
              higherQualityZoneSelected = true
            }
          }
        }

        /* ---- outputs for this bar --------------------------------------- */
        if (showKeyReferences && usePriorDay) {
          pdh[i] = previousDayHigh
          pdl[i] = previousDayLow
          pdc[i] = previousDayClose
        }
        if (showKeyReferences && usePriorWeek) {
          pwh[i] = previousWeekHigh
          pwl[i] = previousWeekLow
        }
        if (showKeyReferences && usePremarket) {
          pmh[i] = premarketHigh
          pml[i] = premarketLow
        }
        if (showKeyReferences && useOpeningRange) {
          orh[i] = openingRangeHigh
          orl[i] = openingRangeLow
        }
        if (showKeyReferences && useRthOpen) rthOpenPlot[i] = currentSessionOpen

        if (showVwap && inRth[i]) {
          vwapPlot[i] = sessionVwap[i]
          if (showVwapBand1) {
            vwapU1[i] = band1Up[i]
            vwapL1[i] = band1Dn[i]
          }
          if (showVwapBand2) {
            vwapU2[i] = band2Up[i]
            vwapL2[i] = band2Dn[i]
          }
        }
        if (showLegacy && showEmas) {
          ema9Col[i] = fastEma[i]
          ema21Col[i] = slowEma[i]
        }
        if (showLegacy && eventCandidateValid) eventAvwapPlot[i] = eventAvwap
        if (showLegacy && gapActive && !gapFilled) {
          gapHighPlot[i] = gapHigh
          gapLowPlot[i] = gapLow
          gapMidPlot[i] = gapMid
          gapBoundaryPlot[i] = gapUnfilledBoundary
        }

        if (gapActive && !gapFilled) {
          gapOn[i] = 1
          gapHighRaw[i] = gapHigh
          gapLowRaw[i] = gapLow
          gapMidRaw[i] = gapMid
          gapBoundaryRaw[i] = gapUnfilledBoundary
        }

        orStartBar[i] = openingRangeStartBar
        orKnownBar[i] = openingRangeKnownBar
        orFinalizedCol[i] = openingRangeFinalized ? 1 : 0
        orHighRaw[i] = openingRangeHigh
        orLowRaw[i] = openingRangeLow

        if (supportZone.valid) {
          supValid[i] = 1
          supLow[i] = supportZone.low
          supHigh[i] = supportZone.high
          supCenter[i] = supportZone.center
          supStrength[i] = supportZone.strength
          supAct[i] = supportZone.actionability
          supMean[i] = supportZone.weightedMean
          supRx[i] = supportZone.reactionQuality
          supDiv[i] = supportZone.diversityCount
          supState[i] = supportZone.state
          supSelBar[i] = supportZone.selectedBar
          supSources[i] = supportZone.sources
        }
        if (resistanceZone.valid) {
          resValid[i] = 1
          resLow[i] = resistanceZone.low
          resHigh[i] = resistanceZone.high
          resCenter[i] = resistanceZone.center
          resStrength[i] = resistanceZone.strength
          resAct[i] = resistanceZone.actionability
          resMean[i] = resistanceZone.weightedMean
          resRx[i] = resistanceZone.reactionQuality
          resDiv[i] = resistanceZone.diversityCount
          resState[i] = resistanceZone.state
          resSelBar[i] = resistanceZone.selectedBar
          resSources[i] = resistanceZone.sources
        }

        if (supportZone.valid && resistanceZone.valid) {
          nearestZoneStateCol[i] =
            Math.abs(close[i] - supportZone.center) <= Math.abs(resistanceZone.center - close[i])
              ? supportZone.state
              : -resistanceZone.state
        } else if (supportZone.valid) nearestZoneStateCol[i] = supportZone.state
        else if (resistanceZone.valid) nearestZoneStateCol[i] = -resistanceZone.state

        evEnteredSupport[i] = enteredSupport ? 1 : 0
        evEnteredResistance[i] = enteredResistance ? 1 : 0
        evSupportRejection[i] = supportRejection ? 1 : 0
        evResistanceRejection[i] = resistanceRejection ? 1 : 0
        evSupportBreakAcceptance[i] = supportBreakAcceptance ? 1 : 0
        evResistanceBreakAcceptance[i] = resistanceBreakAcceptance ? 1 : 0
        evZoneFlip[i] = zoneFlip ? 1 : 0
        evHigherQualityZone[i] = higherQualityZoneSelected ? 1 : 0
      }

      return result()
    },

    /* box.new for the opening range, the two zones and the two edge boxes.
     * Pine redraws them at barstate.islast only, so these read the last bar. */
    draws({ bars, values, settings }) {
      const n = bars.length
      if (n === 0) return []
      const last = n - 1
      const items = []

      const flagOf = (v, dflt) => (typeof v === 'boolean' ? v : dflt)
      const numOf = (v, dflt, lo, hi) => {
        if (v === '' || v === null || v === undefined) return dflt
        const x = Number(v)
        if (!Number.isFinite(x)) return dflt
        return Math.min(hi, Math.max(lo, x))
      }
      const colorOf = (v, dflt) => (typeof v === 'string' && v.trim() !== '' ? v : dflt)

      const showZoneTextOn = flagOf(settings.showZoneText, true)
      const showEdgeSignals = flagOf(settings.showEdgeSignals, true)
      const showOpeningRangeBox = flagOf(settings.showOpeningRangeBox, true)
      const useOpeningRange = flagOf(settings.useOpeningRange, true)
      const zoneBackBars = Math.round(numOf(settings.zoneBackBars, 12, 1, 250))
      const zoneForwardBars = Math.round(numOf(settings.zoneForwardBars, 40, 5, 250))
      const edgeMinAct = numOf(settings.edgeSignalMinimumActionability, 55, 0, 100)
      const edgeHeightPct = numOf(settings.edgeSignalHeightPct, 0.2, 0.05, 0.5)
      const supportColor = colorOf(settings.supportColor, '#2DD4BF')
      const resistanceColor = colorOf(settings.resistanceColor, '#F87171')
      const neutralColor = colorOf(settings.neutralColor, '#A1A1AA')

      const tick = Number(values.tickSize?.[last]) || 0
      const guard = tick > 0 ? tick : Math.max(Math.abs(bars[last].close) * 1e-6, 1e-8)

      /* bar_index + N has no bar behind it, so project forward on the median
       * spacing of the recent bars instead. */
      const deltas = []
      for (let i = Math.max(1, n - 21); i < n; i++) {
        const d = bars[i].time - bars[i - 1].time
        if (Number.isFinite(d) && d > 0) deltas.push(d)
      }
      deltas.sort((a, b) => a - b)
      const step = deltas.length > 0 ? deltas[Math.floor(deltas.length / 2)] : 60
      const rightTime = bars[last].time + zoneForwardBars * step
      const leftTimeFrom = (selectedBar) => {
        const fallback = Math.max(0, last - zoneBackBars)
        const sb = Number.isFinite(selectedBar) ? Math.max(0, Math.min(last, Math.round(selectedBar))) : fallback
        return bars[Math.max(sb, fallback)].time
      }

      const fillAlphaFor = (state) =>
        state === 3 ? 0.2 : state === 4 || state === 7 ? 0.18 : state === 5 ? 0.16 : state === 2 ? 0.12 : state === 6 ? 0.07 : 0.08
      const borderAlphaFor = (state) =>
        state === 3 || state === 4 || state === 7 ? 0.95 : state === 5 ? 0.85 : state === 2 ? 0.65 : state === 6 ? 0.5 : 0.35
      const stateLabel = (s) =>
        s === 2 ? 'APPROACHING' : s === 3 ? 'INSIDE' : s === 4 ? 'REJECTING' : s === 5 ? 'ACCEPTING' : s === 6 ? 'BROKEN' : s === 7 ? 'FLIPPED' : 'DISTANT'

      /* opening-range window */
      const orHigh = values.orHighRaw?.[last]
      const orLow = values.orLowRaw?.[last]
      const orStart = values.orStartBar?.[last]
      const orKnown = values.orKnownBar?.[last]
      const orDone = values.orFinalized?.[last] === 1
      if (
        showOpeningRangeBox &&
        useOpeningRange &&
        Number.isFinite(orStart) &&
        Number.isFinite(orHigh) &&
        Number.isFinite(orLow)
      ) {
        const leftIdx = Math.max(0, Math.min(last, Math.round(orStart)))
        const rightIdx = orDone && Number.isFinite(orKnown) ? Math.max(0, Math.min(last, Math.round(orKnown))) : last
        items.push({
          kind: 'box',
          from: { time: bars[leftIdx].time, price: orHigh },
          to: { time: bars[Math.max(rightIdx, leftIdx)].time, price: orLow },
          color: withAlpha('#FBBF24', 0.45),
          fillColor: '#FBBF24',
          opacity: 0.1,
          lineWidth: 1,
        })
      }

      /* support zone and its buy edge */
      if (values.supValid?.[last] === 1) {
        const zLow = values.supLow[last]
        const zHigh = values.supHigh[last]
        const state = values.supState[last]
        if (Number.isFinite(zLow) && Number.isFinite(zHigh)) {
          const base = state === 6 ? neutralColor : supportColor
          const leftTime = leftTimeFrom(values.supSelBar[last])
          items.push({
            kind: 'box',
            from: { time: leftTime, price: zHigh },
            to: { time: rightTime, price: zLow },
            color: withAlpha(base, borderAlphaFor(state)),
            fillColor: base,
            opacity: fillAlphaFor(state),
            lineWidth: state === 3 || state === 4 || state === 7 ? 2 : 1,
            text: showZoneTextOn ? `SUPPORT | ${stateLabel(state)}` : undefined,
            textColor: supportColor,
          })
          const act = values.supAct[last]
          if (showEdgeSignals && state !== 6 && Number.isFinite(act) && act >= edgeMinAct) {
            const parentHeight = Math.max(zHigh - zLow, guard * 2)
            const edgeHeight = Math.max(parentHeight * edgeHeightPct, guard * 2)
            const edgeTop = Math.min(zLow + edgeHeight, zHigh)
            items.push({
              kind: 'box',
              from: { time: leftTime, price: edgeTop },
              to: { time: rightTime, price: zLow },
              color: '#14B8A6',
              fillColor: '#14B8A6',
              opacity: 0.28,
              lineWidth: 1,
              text: showZoneTextOn ? 'BUY' : undefined,
              textColor: '#CCFBF1',
            })
          }
        }
      }

      /* resistance zone and its sell edge */
      if (values.resValid?.[last] === 1) {
        const zLow = values.resLow[last]
        const zHigh = values.resHigh[last]
        const state = values.resState[last]
        if (Number.isFinite(zLow) && Number.isFinite(zHigh)) {
          const base = state === 6 ? neutralColor : resistanceColor
          const leftTime = leftTimeFrom(values.resSelBar[last])
          items.push({
            kind: 'box',
            from: { time: leftTime, price: zHigh },
            to: { time: rightTime, price: zLow },
            color: withAlpha(base, borderAlphaFor(state)),
            fillColor: base,
            opacity: fillAlphaFor(state),
            lineWidth: state === 3 || state === 4 || state === 7 ? 2 : 1,
            text: showZoneTextOn ? `RESISTANCE | ${stateLabel(state)}` : undefined,
            textColor: resistanceColor,
          })
          const act = values.resAct[last]
          if (showEdgeSignals && state !== 6 && Number.isFinite(act) && act >= edgeMinAct) {
            const parentHeight = Math.max(zHigh - zLow, guard * 2)
            const edgeHeight = Math.max(parentHeight * edgeHeightPct, guard * 2)
            const edgeBottom = Math.max(zHigh - edgeHeight, zLow)
            items.push({
              kind: 'box',
              from: { time: leftTime, price: zHigh },
              to: { time: rightTime, price: edgeBottom },
              color: '#FB7185',
              fillColor: '#FB7185',
              opacity: 0.28,
              lineWidth: 1,
              text: showZoneTextOn ? 'SELL' : undefined,
              textColor: '#FFE4E6',
            })
          }
        }
      }

      return items
    },

    /* Pine draws two tables: the compact dashboard and, in Legacy / Debug, a
     * scoring readout. The contract allows one, so they are stacked here. */
    table({ bars, values, settings }) {
      const n = bars.length
      if (n === 0) return null
      if (settings.showDashboard === false) return null
      const last = n - 1

      const tick = Number(values.tickSize?.[last]) || 0
      const digits = tick > 0 ? precisionForStep(tick) : 2
      const price = (v) => (Number.isFinite(v) ? v.toFixed(digits) : 'n/a')
      const whole = (v) => (Number.isFinite(v) ? String(Math.round(v)) : 'n/a')
      const stateLabel = (s) =>
        s === 2 ? 'APPROACHING' : s === 3 ? 'INSIDE' : s === 4 ? 'REJECTING' : s === 5 ? 'ACCEPTING' : s === 6 ? 'BROKEN' : s === 7 ? 'FLIPPED' : 'DISTANT'

      const supOk = values.supValid?.[last] === 1
      const resOk = values.resValid?.[last] === 1
      const close = bars[last].close
      const atrNow = values.normAtr?.[last]
      const guard = tick > 0 ? tick : Math.max(Math.abs(close) * 1e-6, 1e-8)

      const rows = []
      rows.push(['MERIDIAN LEVELS', 'v0.2.1'])
      rows.push(['Resistance', resOk ? `${price(values.resLow[last])}-${price(values.resHigh[last])}` : 'n/a'])
      rows.push(['Support', supOk ? `${price(values.supLow[last])}-${price(values.supHigh[last])}` : 'n/a'])
      let nearestState = 'n/a'
      if (supOk && resOk) {
        nearestState =
          Math.abs(close - values.supCenter[last]) <= Math.abs(values.resCenter[last] - close)
            ? `S ${stateLabel(values.supState[last])}`
            : `R ${stateLabel(values.resState[last])}`
      } else if (supOk) nearestState = `S ${stateLabel(values.supState[last])}`
      else if (resOk) nearestState = `R ${stateLabel(values.resState[last])}`
      rows.push(['State', nearestState])
      rows.push(['Daily ATR', price(atrNow)])

      if (values.isIntraday?.[last] === 0) {
        rows.push(['Note', 'Designed for intraday charts'])
      }

      const distanceAtr = (lo, hi) => {
        if (!Number.isFinite(lo) || !Number.isFinite(hi)) return 'n/a'
        const d = close < lo ? lo - close : close > hi ? close - hi : 0
        return `${(d / Math.max(Number.isFinite(atrNow) ? atrNow : 0, guard)).toFixed(2)}A`
      }

      if (settings.displayMode === 'Legacy / Debug') {
        rows.push([
          'R SCORE',
          resOk
            ? `Str ${whole(values.resStrength[last])} | Act ${whole(values.resAct[last])} | Dist ${distanceAtr(values.resLow[last], values.resHigh[last])}`
            : 'n/a',
        ])
        rows.push([
          'R REACTION',
          resOk
            ? `Rx ${whole(values.resRx[last])} | Mean ${whole(values.resMean[last])} | Div ${whole(values.resDiv[last])}`
            : 'n/a',
        ])
        rows.push(['R SOURCES', resOk ? values.resSources[last] || 'n/a' : 'n/a'])
        rows.push([
          'S SCORE',
          supOk
            ? `Str ${whole(values.supStrength[last])} | Act ${whole(values.supAct[last])} | Dist ${distanceAtr(values.supLow[last], values.supHigh[last])}`
            : 'n/a',
        ])
        rows.push([
          'S REACTION',
          supOk
            ? `Rx ${whole(values.supRx[last])} | Mean ${whole(values.supMean[last])} | Div ${whole(values.supDiv[last])}`
            : 'n/a',
        ])
        rows.push(['S SOURCES', supOk ? values.supSources[last] || 'n/a' : 'n/a'])
      }

      /* Pine routes nine values to the Data Window; there is no Data Window
       * here, so all nine come out as rows, in the order the source plots
       * them. The four gap plots below are display.none in Pine, which has no
       * equivalent either, so they ride along on the same toggle. */
      if (settings.showResearchValues === true) {
        const score = (v) => (Number.isFinite(v) ? v.toFixed(2) : 'n/a')
        rows.push(['Support Zone Low', supOk ? price(values.supLow[last]) : 'n/a'])
        rows.push(['Support Zone High', supOk ? price(values.supHigh[last]) : 'n/a'])
        rows.push(['Support Zone Strength', supOk ? score(values.supStrength[last]) : 'n/a'])
        rows.push(['Resistance Zone Low', resOk ? price(values.resLow[last]) : 'n/a'])
        rows.push(['Resistance Zone High', resOk ? price(values.resHigh[last]) : 'n/a'])
        rows.push(['Resistance Zone Strength', resOk ? score(values.resStrength[last]) : 'n/a'])
        rows.push(['Zone State', Number.isFinite(values.nearestZoneState[last]) ? String(values.nearestZoneState[last]) : 'n/a'])
        rows.push(['Support Zone Actionability', supOk ? score(values.supAct[last]) : 'n/a'])
        rows.push(['Resistance Zone Actionability', resOk ? score(values.resAct[last]) : 'n/a'])
        rows.push(['Gap High', values.gapOn[last] === 1 ? price(values.gapHighRaw[last]) : 'n/a'])
        rows.push(['Gap Low', values.gapOn[last] === 1 ? price(values.gapLowRaw[last]) : 'n/a'])
        rows.push(['Gap Mid', values.gapOn[last] === 1 ? price(values.gapMidRaw[last]) : 'n/a'])
        rows.push(['Gap Unfilled Boundary', values.gapOn[last] === 1 ? price(values.gapBoundaryRaw[last]) : 'n/a'])
      }

      return { rows }
    },

    alerts: [
      {
        id: 'meridian-entered-resistance',
        title: 'Entered Resistance Zone',
        message: 'Price entered the active Meridian resistance reaction zone.',
        when: ({ values, settings, index }) =>
          settings.enableAlerts !== false && values.evEnteredResistance[index] === 1,
      },
      {
        id: 'meridian-entered-support',
        title: 'Entered Support Zone',
        message: 'Price entered the active Meridian support reaction zone.',
        when: ({ values, settings, index }) =>
          settings.enableAlerts !== false && values.evEnteredSupport[index] === 1,
      },
      {
        id: 'meridian-resistance-rejection',
        title: 'Resistance Rejection',
        message: 'Price rejected the active Meridian resistance reaction zone.',
        when: ({ values, settings, index }) =>
          settings.enableAlerts !== false && values.evResistanceRejection[index] === 1,
      },
      {
        id: 'meridian-support-rejection',
        title: 'Support Rejection',
        message: 'Price rejected the active Meridian support reaction zone.',
        when: ({ values, settings, index }) =>
          settings.enableAlerts !== false && values.evSupportRejection[index] === 1,
      },
      {
        id: 'meridian-resistance-break',
        title: 'Resistance Break / Acceptance',
        message: 'Price is accepting through or has broken the active Meridian resistance zone.',
        when: ({ values, settings, index }) =>
          settings.enableAlerts !== false && values.evResistanceBreakAcceptance[index] === 1,
      },
      {
        id: 'meridian-support-break',
        title: 'Support Break / Acceptance',
        message: 'Price is accepting through or has broken the active Meridian support zone.',
        when: ({ values, settings, index }) =>
          settings.enableAlerts !== false && values.evSupportBreakAcceptance[index] === 1,
      },
      {
        id: 'meridian-zone-flip',
        title: 'Zone Flip',
        message: 'A Meridian reaction zone flipped side.',
        when: ({ values, settings, index }) => settings.enableAlerts !== false && values.evZoneFlip[index] === 1,
      },
      {
        id: 'meridian-better-zone',
        title: 'New Higher-Quality Zone Selected',
        message: 'A materially stronger Meridian reaction zone was selected.',
        when: ({ values, settings, index }) =>
          settings.enableAlerts !== false && values.evHigherQualityZone[index] === 1,
      },
    ],
  })
}
