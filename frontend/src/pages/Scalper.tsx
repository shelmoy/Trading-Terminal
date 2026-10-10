/**
 * Scalper.tsx — External 3-Pane Scalping Terminal (SPOT + CALL CE + PUT PE)
 *
 * Imports and composes all original OpenAlgo Chart SDK components from the
 * Trading terminal (ChartPane, TradingTerminal, DrawingRail, RightRail,
 * WatchlistPanel, OptionChainPanel, AlertsPanel, ObjectsPanel, DataWindowPanel,
 * StrategiesPanel, BacktestPanel, ScriptPanel, AgentPanel, ChartBottomBar,
 * WorkspaceReplayBar, TradingDock, GridDividers) without modifying a single
 * line of the core SDK or /trading page.
 *
 * Live data architecture:
 *   • Direct WebSocket streaming via TradingTerminal
 *   • Shared compact strike selectors with persistent chart settings
 *   • Dedicated per-pane storage namespace (oa-trading-scalper-p0/p1/p2)
 */

import { Activity, Eye, Link2 as LinkIcon } from 'lucide-react'
import { type ChartObjects, createLinkGroup, type LinkGroup } from 'openalgo-charts'
import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { apiClient } from '@/api/client'
import { scalpingApi } from '@/api/scalping'
import { tradingApi } from '@/api/trading'
import { Navbar } from '@/components/layout/Navbar'
import { BacktestPanel } from '@/components/trading/BacktestPanel'
import {
  BOTTOM_BAR_PX,
  type BottomBarControl,
  ChartBottomBar,
} from '@/components/trading/ChartBottomBar'
import { ChartPane } from '@/components/trading/ChartPane'
import { ScalperHeader } from '@/components/trading/ScalperHeader'
import { ScalperPaneHeader } from '@/components/trading/ScalperPaneHeader'
import { ScalperOrderButton } from '@/components/trading/ScalperOrderButton'
import { ScalperStrikePicker } from '@/components/trading/ScalperStrikePicker'
import '@/components/trading/scalper-surfaces.css'
import { DrawingRail } from '@/components/trading/DrawingRail'
import {
  type ChartOrderBridgeRef,
  ChartOrderBridgeContext,
} from '@/components/trading/dock/chartOrderBridge'
import { DOCK_ID } from '@/components/trading/dock/DockShell'
import { type DockTab, escapeTarget, writeDockTab } from '@/components/trading/dock/dockState'
import { TradingDock } from '@/components/trading/dock/TradingDock'
import { GridDividers } from '@/components/trading/GridDividers'
import { IndicatorTemplates } from '@/components/trading/IndicatorTemplates'
import { ObjectsPanel } from '@/components/trading/ObjectsPanel'
import { isPanelId, type PanelId, RightRail } from '@/components/trading/RightRail'
import { TickBox } from '@/components/trading/TickBox'
import { Tip } from '@/components/trading/Tip'
import { type ReplayPickSource, WorkspaceReplayBar } from '@/components/trading/WorkspaceReplayBar'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Switch } from '@/components/ui/switch'
import { useChartWorkspaceCatalog } from '@/hooks/useChartWorkspaceCatalog'
import { type PriceableItem, useLivePrice } from '@/hooks/useLivePrice'
import { useScalperPnlPrices } from '@/hooks/useScalperPnlPrices'
import { useMarketStatus } from '@/hooks/useMarketStatus'
import { useMarketData } from '@/hooks/useMarketData'
import { useOrderEventRefresh } from '@/hooks/useOrderEventRefresh'
import { useOptionChainLive } from '@/hooks/useOptionChainLive'
import type { AgentChartCommand } from '@/lib/agent/stream'
import type { LayoutPreset } from '@/lib/chart/layouts'
import { clearLog, fetchLog, type LoggedFire } from '@/lib/trading/alertLog'
import type { ChartStateView } from '@/lib/trading/chartState'
import { buildDayPnlBook, calculateDayPnl, pnlDay } from '@/lib/trading/dayPnl'
import { calculateBrokerPnl } from '@/lib/trading/brokerPnl'
import { resolveScalperStrikes } from '@/lib/trading/scalperStrikes'
import { historyChord } from '@/lib/trading/chartHistory'
import { chartMayTakeKey } from '@/lib/trading/drawingKeys'
import {
  type GridWeights,
  parseAreas,
  parseTracks,
  readGridWeights,
  tracksTemplate,
  writeGridWeights,
} from '@/lib/trading/gridSizes'
import { idForScript } from '@/lib/trading/openscriptFiles'
import { needsPreviousClose } from '@/lib/trading/previousClose'
import {
  type AlertFire,
  type AlertsView,
  type DrawStats,
  persistFastCache,
  globalBarMemoryCache,
  type SearchRow,
  symbolMetadataCache,
  type TradingTerminal,
} from '@/lib/trading/terminal'
import {
  WorkspaceReplayCoordinator,
  type WorkspaceReplaySnapshot,
} from '@/lib/trading/workspaceReplay'
import { cn } from '@/lib/utils'
import { formatTradingSymbol } from '@/lib/trading/displaySymbol'
import { useAuthStore } from '@/stores/authStore'
import { useThemeStore } from '@/stores/themeStore'
import type { Position, Trade } from '@/types/trading'
import type { OptionChainRow, ScalpingProduct } from '@/types/scalping'
import { showToast } from '@/utils/toast'
import type { MagnetMode } from 'openalgo-charts/draw'

// Lazy-loaded side panels (identical to Trading.tsx)
const AgentPanel = lazy(() =>
  import('@/components/trading/AgentPanel').then((m) => ({ default: m.AgentPanel }))
)
const AlertsPanel = lazy(() =>
  import('@/components/trading/AlertsPanel').then((m) => ({ default: m.AlertsPanel }))
)
const DataWindowPanel = lazy(() =>
  import('@/components/trading/DataWindowPanel').then((m) => ({ default: m.DataWindowPanel }))
)
const OptionChainPanelPromise = import('@/components/trading/OptionChainPanel')
const OptionChainPanel = lazy(() =>
  OptionChainPanelPromise.then((m) => ({ default: m.OptionChainPanel }))
)
const ScriptPanel = lazy(() =>
  import('@/components/trading/ScriptPanel').then((m) => ({ default: m.ScriptPanel }))
)
const StrategiesPanel = lazy(() =>
  import('@/components/trading/StrategiesPanel').then((m) => ({ default: m.StrategiesPanel }))
)
const WatchlistPanel = lazy(() =>
  import('@/components/trading/WatchlistPanel').then((m) => ({ default: m.WatchlistPanel }))
)

// ── Constants & Presets ─────────────────────────────────────────────────────

const NO_DRAW: DrawStats = {
  count: 0,
  canUndo: false,
  canRedo: false,
  hasSelection: false,
  magnet: false,
  magnetMode: 'off',
  removable: 0,
  selectable: 0,
  stay: false,
  tool: null,
  shortcuts: {},
}

const SCALPER_SYNC_KEY = 'oa-scalper-sync'
const SCALPER_PANEL_KEY = 'oa-scalper-panel'
const SCALPER_ARMED_KEY = 'oa-scalper-armed'
const SCALPER_LAYOUT_KEY = 'oa-scalper-layout'
const SCALPER_UNDERLYING_KEY = 'oa-scalper-underlying'
const SCALPER_CE_LOTS_KEY = 'oa-scalper-ce-lots'
const SCALPER_PE_LOTS_KEY = 'oa-scalper-pe-lots'
const SCALPER_PRODUCT_KEY = 'oa-scalper-product'
const ALERT_LOG_LIMIT = 200

export type ScalperPaneId = 'scalper-p0' | 'scalper-p1' | 'scalper-p2'
const ALL_PANE_IDS: ScalperPaneId[] = ['scalper-p0', 'scalper-p1', 'scalper-p2']

interface UnderlyingPreset {
  id: string
  label: string
  spotSymbol: string
  spotExchange: string
  foExchange: string
  defaultLotSize: number
}

const UNDERLYINGS: UnderlyingPreset[] = [
  {
    id: 'NIFTY',
    label: 'NIFTY 50',
    spotSymbol: 'NIFTY',
    spotExchange: 'NSE_INDEX',
    foExchange: 'NFO',
    defaultLotSize: 75,
  },
  {
    id: 'BANKNIFTY',
    label: 'BANKNIFTY',
    spotSymbol: 'BANKNIFTY',
    spotExchange: 'NSE_INDEX',
    foExchange: 'NFO',
    defaultLotSize: 30,
  },
  {
    id: 'FINNIFTY',
    label: 'FINNIFTY',
    spotSymbol: 'FINNIFTY',
    spotExchange: 'NSE_INDEX',
    foExchange: 'NFO',
    defaultLotSize: 65,
  },
  {
    id: 'MIDCPNIFTY',
    label: 'MIDCPNIFTY',
    spotSymbol: 'MIDCPNIFTY',
    spotExchange: 'NSE_INDEX',
    foExchange: 'NFO',
    defaultLotSize: 120,
  },
  {
    id: 'SENSEX',
    label: 'SENSEX',
    spotSymbol: 'SENSEX',
    spotExchange: 'BSE_INDEX',
    foExchange: 'BFO',
    defaultLotSize: 20,
  },
]

const SCALPER_LAYOUTS: Record<'split' | 'cols3', LayoutPreset> = {
  split: {
    id: 'scalper-split',
    label: '1 + 2 Split (SPOT | CE / PE)',
    cols: '1.15fr 1fr',
    rows: '1fr 1fr',
    areas: '"a b" "a c"',
    cells: ['a', 'b', 'c'],
  },
  cols3: {
    id: 'scalper-cols3',
    label: '3 Columns (SPOT | CE | PE)',
    cols: '1fr 1fr 1fr',
    rows: '1fr',
    areas: '"a b c"',
    cells: ['a', 'b', 'c'],
  },
}

interface SyncState {
  crosshair: boolean
  viewport: boolean
  symbol: boolean
  interval: boolean
}
const SYNC_DEFAULT: SyncState = {
  crosshair: true,
  viewport: true,
  symbol: false,
  interval: true,
}

function loggedToFire(row: LoggedFire): AlertFire {
  return {
    key: `log-${row.id}`,
    alertId: row.alertId,
    title: row.title,
    message: row.message,
    symbol: row.symbol,
    exchange: row.exchange,
    ...(typeof row.price === 'number' ? { price: row.price } : {}),
    firedAt: row.firedAt ?? 0,
    delivered: row.delivered,
  }
}

function readArmed(): boolean {
  try {
    return localStorage.getItem(SCALPER_ARMED_KEY) === '1'
  } catch {
    return false
  }
}

function readSync(): SyncState {
  try {
    const raw = localStorage.getItem(SCALPER_SYNC_KEY)
    if (!raw) return SYNC_DEFAULT
    const p = JSON.parse(raw) as Partial<SyncState>
    return {
      crosshair: p.crosshair ?? SYNC_DEFAULT.crosshair,
      viewport: p.viewport ?? SYNC_DEFAULT.viewport,
      symbol: p.symbol ?? SYNC_DEFAULT.symbol,
      interval: p.interval ?? SYNC_DEFAULT.interval,
    }
  } catch {
    return SYNC_DEFAULT
  }
}

function presetWeights(preset: LayoutPreset): GridWeights {
  return { columns: parseTracks(preset.cols), rows: parseTracks(preset.rows) }
}

/**
 * Wraps `createLinkGroup()` with a gap-safe, clamped `_onViewport` handler so
 * scrolling or zooming out on SPOT (which may have more historical bars or
 * multi-day overnight/weekend gaps) can NEVER push the CE and PE option charts
 * into negative logical indices (`from < 0, to < 0`) where 0 bars exist.
 */
function createScalperLinkGroup(): LinkGroup {
  const group = createLinkGroup()
  group.setOptions({ ...SYNC_DEFAULT, symbol: false })
  // biome-ignore lint/suspicious/noExplicitAny: overriding internal LinkGroup viewport broadcast for safe multi-instrument sync
  const g = group as any

  g._onViewport = function (sourceMember: {
    // biome-ignore lint/suspicious/noExplicitAny: internal chart reference
    chart: any
  }) {
    if (this._broadcasting || this._destroyed) return
    const leaderChart = sourceMember?.chart
    if (!leaderChart || leaderChart.isDestroyed) {
      this._prune?.()
      return
    }
    let leaderRange = leaderChart.getVisibleLogicalRange?.()
    const leaderLayer = leaderChart.dataLayer
    if (!leaderRange || !leaderLayer || leaderLayer.length === 0) return

    const leaderLen: number = leaderLayer.length
    let leaderSpan: number = leaderRange.to - leaderRange.from
    if (!(leaderSpan > 0) || !Number.isFinite(leaderSpan)) return

    // Guard the leader chart itself so rapid dragging/zooming out never pushes
    // all of its own bars off-screen into empty negative/positive index space.
    const maxLeaderSpan = Math.max(leaderLen + 12, 40)
    let clampedLeader: { from: number; to: number } | null = null
    let shouldLoadLeaderHistory = false

    if (leaderSpan > maxLeaderSpan) {
      leaderSpan = maxLeaderSpan
      const lTo = Math.min(leaderLen + 4, leaderRange.from + leaderSpan)
      const lFrom = Math.max(-2, lTo - leaderSpan)
      clampedLeader = { from: lFrom, to: lTo }
    } else if (leaderRange.to < Math.min(leaderLen, 4)) {
      const lFrom = -2
      const lTo = Math.min(leaderLen + 4, lFrom + leaderSpan)
      clampedLeader = { from: lFrom, to: lTo }
      shouldLoadLeaderHistory = true
    } else if (leaderRange.from > Math.max(0, leaderLen - 4)) {
      const lTo = leaderLen + 3
      const lFrom = Math.max(-2, lTo - leaderSpan)
      clampedLeader = { from: lFrom, to: lTo }
    }

    if (clampedLeader) {
      leaderRange = clampedLeader
      this._broadcasting = true
      try {
        leaderChart.setVisibleLogicalRange(leaderRange)
      } finally {
        this._broadcasting = false
      }
      if (shouldLoadLeaderHistory) {
        leaderChart._maybeLoadHistory?.()
      }
    }

    if (!this._options?.viewport) return

    // Clamp leader indices to valid bar indices [0 .. leaderLen - 1] so we never
    // extrapolate wall-clock overnight/weekend gaps into thousands of fake bars.
    const clampedLeaderToIdx = Math.max(0, Math.min(leaderLen - 1, Math.round(leaderRange.to)))
    const clampedLeaderFromIdx = Math.max(0, Math.min(leaderLen - 1, Math.round(leaderRange.from)))
    const tTo: number | undefined = leaderLayer.indexToTime(clampedLeaderToIdx)
    const tFrom: number | undefined = leaderLayer.indexToTime(clampedLeaderFromIdx)
    if (tTo === undefined || !Number.isFinite(tTo)) return

    // Right-hand whitespace offset (in bars) when leader is panned past its latest bar
    const rightOverhang =
      leaderRange.to > leaderLen - 1 ? Math.min(leaderRange.to - (leaderLen - 1), 10) : 0

    // biome-ignore lint/suspicious/noExplicitAny: internal follower member
    this._broadcast?.(sourceMember, (followerMember: { chart: any }) => {
      const fChart = followerMember?.chart
      const fLayer = fChart?.dataLayer
      if (!fChart || fChart.isDestroyed || !fLayer || fLayer.length < 2) return

      const fLen: number = fLayer.length
      const fFirstTime: number | undefined = fLayer.indexToTime(0)
      const fLastTime: number | undefined = fLayer.indexToTime(fLen - 1)
      if (fFirstTime === undefined || fLastTime === undefined) return

      // Constrain the visible bar span on the follower so zooming out on a 2000-bar
      // SPOT chart never squashes a 250-bar option chart into an invisible sliver.
      const maxFollowerSpan = Math.max(fLen + 6, 30)
      const safeSpan = Math.max(10, Math.min(leaderSpan, maxFollowerSpan))
      const minOverlap = Math.min(fLen, 5)

      let fFrom: number
      let fTo: number

      if (tTo <= fFirstTime) {
        // Leader is scrolled to a time earlier than Follower's oldest loaded bar:
        // keep Follower anchored on its oldest bars (never blank negative space)
        // and trigger lazy history loading on Follower!
        fFrom = -1
        fTo = Math.min(fLen + 3, fFrom + safeSpan)
        fChart._maybeLoadHistory?.()
      } else if (tFrom !== undefined && tFrom >= fLastTime) {
        // Leader is scrolled past Follower's newest bar: anchor on Follower's newest bars
        fTo = fLen - 1 + Math.max(rightOverhang, 3)
        fFrom = Math.max(-1, fTo - safeSpan)
      } else {
        // Normal overlapping timestamp window: map right edge timestamp accurately
        const targetToIdx = fLayer.timeToIndexFloat(Math.min(tTo, fLastTime))
        if (!Number.isFinite(targetToIdx)) return

        fTo = targetToIdx + rightOverhang
        fFrom = fTo - safeSpan

        // Guarantee at least `minOverlap` real bars from [0 .. fLen - 1] remain in view
        if (fFrom < -2 || fTo < minOverlap) {
          fFrom = -1
          fTo = Math.min(fLen + 3, fFrom + safeSpan)
        }
        if (fFrom > Math.max(0, fLen - minOverlap) || fTo > fLen + 6) {
          fTo = fLen - 1 + 3
          fFrom = Math.max(-1, fTo - safeSpan)
        }
      }

      if (Number.isFinite(fFrom) && Number.isFinite(fTo) && fTo > fFrom) {
        fChart.setVisibleLogicalRange({ from: fFrom, to: fTo })
        if (fFrom < 20) {
          fChart._maybeLoadHistory?.()
        }
      }
    })
  }

  return group
}

function seedPaneDefaultStorage(
  paneId: ScalperPaneId,
  symbol: string,
  exchange: string,
  overwrite = false
) {
  try {
    const symKey = `oa-trading-${paneId}-symbol`
    const ivKey = `oa-trading-${paneId}-interval`
    const prodKey = `oa-trading-${paneId}-product`
    if (overwrite || !localStorage.getItem(symKey)) {
      localStorage.setItem(symKey, JSON.stringify({ symbol, exchange }))
    }
    if (!localStorage.getItem(ivKey)) {
      localStorage.setItem(ivKey, '1m')
    }
    if (paneId !== 'scalper-p0') {
      localStorage.setItem(prodKey, 'NRML')
    }
  } catch {
    /* ignore storage errors */
  }
}

const SCALPER_INDEX_SNAPSHOTS_KEY = 'openalgo.scalper.indexSnapshots.v1'

// Once the cash market is closed, the broker's quote endpoint may keep an
// older LTP while the chart has already loaded the final session candle. Keep
// the selected option closes from the same history endpoint used by charts so
// the quick picker and chart show one authoritative closing value.
const optionHistoryCloseCache = new Map<string, number>()

interface IndexSnapshot {
  expiries: string[]
  selectedExpiry: string
  chain: OptionChainRow[]
  atmStrike: number | null
  ceStrike: string
  peStrike: string
  updatedAt: number
}

const indexSnapshotsMemory = new Map<string, IndexSnapshot>()

;(function hydrateIndexSnapshots() {
  if (typeof window === 'undefined') return
  try {
    const raw = localStorage.getItem(SCALPER_INDEX_SNAPSHOTS_KEY)
    if (!raw) return
    const parsed = JSON.parse(raw) as Record<string, IndexSnapshot>
    if (!parsed || typeof parsed !== 'object') return
    for (const [k, v] of Object.entries(parsed)) {
      if (v && Array.isArray(v.expiries) && Array.isArray(v.chain)) {
        indexSnapshotsMemory.set(k, v)
      }
    }
  } catch {
    /* ignore */
  }
})()

function readIndexSnapshot(underlyingId: string): IndexSnapshot | null {
  return indexSnapshotsMemory.get(underlyingId) ?? null
}

function writeIndexSnapshot(underlyingId: string, snap: IndexSnapshot): void {
  indexSnapshotsMemory.set(underlyingId, snap)
  try {
    const obj: Record<string, IndexSnapshot> = {}
    for (const [k, v] of indexSnapshotsMemory.entries()) {
      obj[k] = v
    }
    localStorage.setItem(SCALPER_INDEX_SNAPSHOTS_KEY, JSON.stringify(obj))
  } catch {
    /* ignore quota errors */
  }
}
// Pre-seed default underlying and ATM CE/PE before terminals boot so refresh is 0ms
;(function preseedInitialPanes() {
  if (typeof window === 'undefined') return
  try {
    const savedId = localStorage.getItem(SCALPER_UNDERLYING_KEY)
    const preset = UNDERLYINGS.find((u) => u.id === savedId) ?? UNDERLYINGS[0]
    seedPaneDefaultStorage('scalper-p0', preset.spotSymbol, preset.spotExchange, true)
    const snap = readIndexSnapshot(preset.id)
    if (snap && snap.chain.length > 0) {
      const defaults = resolveScalperStrikes(snap.chain, snap.atmStrike)
      const ceRow = snap.chain.find((r) => String(r.strike) === defaults.ce)
      const peRow = snap.chain.find((r) => String(r.strike) === defaults.pe)
      if (ceRow?.ce?.symbol) {
        seedPaneDefaultStorage('scalper-p1', ceRow.ce.symbol, preset.foExchange, true)
      }
      if (peRow?.pe?.symbol) {
        seedPaneDefaultStorage('scalper-p2', peRow.pe.symbol, preset.foExchange, true)
      }
    }
  } catch {
    seedPaneDefaultStorage('scalper-p0', 'NIFTY', 'NSE_INDEX')
  }
})()

export default function Scalper() {
  const account = useAuthStore((state) =>
    state.isAuthenticated ? (state.user?.username ?? null) : null
  )
  return <ScalperWorkspace key={account ?? 'signed-out'} account={account} />
}

function ScalperWorkspace({ account }: { account: string | null }) {
  const workspaceCatalog = useChartWorkspaceCatalog(account)
  const { appMode, toggleAppMode, isTogglingMode } = useThemeStore()
  const broker = useAuthStore((state) => state.user?.broker ?? '')

  // Show/hide standard OpenAlgo top Navbar (collapsed by default so Scalper 915
  // matches the full-screen reference UI, with a 1-click toggle to reveal it).
  const [showMainNavbar, setShowMainNavbar] = useState(false)

  // Layout mode: 'split' (1+2 SPOT left, CE top-right, PE bottom-right) or 'cols3'
  const [layoutMode, setLayoutMode] = useState<'split' | 'cols3'>(() => {
    try {
      return localStorage.getItem(SCALPER_LAYOUT_KEY) === 'cols3' ? 'cols3' : 'split'
    } catch {
      return 'split'
    }
  })

  // Visibility toggles for SPOT / CE / PE panes (all 3 active by default)
  const [visiblePanes, setVisiblePanes] = useState<{
    spot: boolean
    ce: boolean
    pe: boolean
  }>({ spot: true, ce: true, pe: true })

  // Maximized single pane inside the 3-pane grid (null = show normal grid)
  const [maximizedPane, setMaximizedPane] = useState<ScalperPaneId | null>(null)

  const [sync, setSync] = useState<SyncState>(readSync)
  const [armed, setArmed] = useState<boolean>(readArmed)
  const [linkGroup, setLinkGroup] = useState<LinkGroup | null>(null)

  const [apiKey, setApiKey] = useState<string | null>(null)
  const [wsUrl, setWsUrl] = useState<string | null>(null)
  const [noApiKey, setNoApiKey] = useState(false)

  /* ── Underlying & Option Chain state for SPOT / CE / PE ──────────────── */
  const [underlyingId, setUnderlyingId] = useState<string>(() => {
    try {
      const saved = localStorage.getItem(SCALPER_UNDERLYING_KEY)
      return UNDERLYINGS.some((u) => u.id === saved) ? (saved as string) : 'NIFTY'
    } catch {
      return 'NIFTY'
    }
  })
  const activeUnderlying = useMemo(
    () => UNDERLYINGS.find((u) => u.id === underlyingId) ?? UNDERLYINGS[0],
    [underlyingId]
  )

  const initialSnap = useMemo(() => readIndexSnapshot(underlyingId), [underlyingId])
  const [expiries, setExpiries] = useState<string[]>(() => initialSnap?.expiries ?? [])
  const [selectedExpiry, setSelectedExpiry] = useState<string>(
    () => initialSnap?.selectedExpiry ?? ''
  )
  const [chain, setChain] = useState<OptionChainRow[]>(() => initialSnap?.chain ?? [])
  const [atmStrike, setAtmStrike] = useState<number | null>(() => initialSnap?.atmStrike ?? null)
  const [ceStrike, setCeStrike] = useState<string>(() =>
    resolveScalperStrikes(initialSnap?.chain ?? [], initialSnap?.atmStrike).ce)
  const [peStrike, setPeStrike] = useState<string>(() =>
    resolveScalperStrikes(initialSnap?.chain ?? [], initialSnap?.atmStrike).pe)
  // Only explicit choices from the current index/expiry survive chain refreshes.
  const manualStrikesRef = useRef<{ context: string; ce: string | null; pe: string | null }>({
    context: `${underlyingId}:${selectedExpiry}`, ce: null, pe: null,
  })
  const [ceChainOpen, setCeChainOpen] = useState(false)
  const [peChainOpen, setPeChainOpen] = useState(false)
  const [resolvedCloses, setResolvedCloses] = useState<Record<string, number>>({})
  const [optionHistoryCloses, setOptionHistoryCloses] = useState<Record<string, number>>({})
  const [indexHistorySnapshots, setIndexHistorySnapshots] = useState<
    Record<string, { ltp: number; prevClose: number }>
  >({})
  const indexReferencesLoaded = useRef(new Set<string>())
  const [flashes, setFlashes] = useState<Record<string, 'up' | 'down'>>({})
  const prevPricesRef = useRef<Map<string, number>>(new Map())

  // Lot & quantity controls for bottom fast-execution bar (editable both by Lots and Qty)
  const [ceLots, setCeLots] = useState<number>(() => {
    try {
      return Math.max(1, Number(localStorage.getItem(SCALPER_CE_LOTS_KEY)) || 1)
    } catch {
      return 1
    }
  })
  const [peLots, setPeLots] = useState<number>(() => {
    try {
      return Math.max(1, Number(localStorage.getItem(SCALPER_PE_LOTS_KEY)) || 1)
    } catch {
      return 1
    }
  })
  const [ceLotsText, setCeLotsText] = useState<string | null>(null)
  const [peLotsText, setPeLotsText] = useState<string | null>(null)
  const [ceQtyText, setCeQtyText] = useState<string | null>(null)
  const [peQtyText, setPeQtyText] = useState<string | null>(null)
  const [ceCustomQty, setCeCustomQty] = useState<number | null>(null)
  const [peCustomQty, setPeCustomQty] = useState<number | null>(null)
  const [ceChartQtyFocused, setCeChartQtyFocused] = useState(false)
  const [peChartQtyFocused, setPeChartQtyFocused] = useState(false)
  const ceChartQtyInputRef = useRef<HTMLInputElement | null>(null)
  const peChartQtyInputRef = useRef<HTMLInputElement | null>(null)

  const [product, setProduct] = useState<ScalpingProduct>(() => {
    try {
      localStorage.setItem(SCALPER_PRODUCT_KEY, 'NRML')
    } catch {
      /* noop */
    }
    return 'NRML'
  })

  // Margin & Live P&L summary in Scalper header
  const [marginText, setMarginText] = useState<string>('—')
  const [day, setDay] = useState(() => pnlDay())
  const [tradeSnapshot, setTradeSnapshot] = useState<Trade[]>([])
  const [pnlSnapshotScope, setPnlSnapshotScope] = useState('')
  const pnlScope = `${account}:${broker}:${appMode}:${day}`
  const pnlScopeRef = useRef(pnlScope)
  pnlScopeRef.current = pnlScope
  const pnlRefreshRunning = useRef(false)
  const pnlRefreshAgain = useRef(false)
  const pnlRefreshLatest = useRef<(() => Promise<void>) | null>(null)
  useEffect(() => {
    const updateDay = () => setDay(pnlDay())
    const clock = setInterval(updateDay, 1000)
    window.addEventListener('focus', updateDay)
    return () => {
      clearInterval(clock)
      window.removeEventListener('focus', updateDay)
    }
  }, [])
  const [positionSnapshot, setPositionSnapshot] = useState<Position[]>([])
  const [positionSnapshotAt, setPositionSnapshotAt] = useState(0)
  const [orderBusy, setOrderBusy] = useState<Record<string, boolean>>({})
  const [lastOrderMs, setLastOrderMs] = useState<number | null>(null)

  /* ── Shared Drawing Rail state (identical to Trading.tsx) ────────────── */
  const [tool, setTool] = useState<string | null>(null)
  const [magnet, setMagnet] = useState<MagnetMode>('off')
  const [stay, setStay] = useState(false)
  const [latched, setLatched] = useState(false)
  const [showRail, setShowRail] = useState(true)
  const [stats, setStats] = useState<DrawStats>(NO_DRAW)
  const activeRef = useRef<TradingTerminal | null>(null)

  /* ── Side panels & Bottom Dock state (identical to Trading.tsx) ──────── */
  const [panel, setPanel] = useState<PanelId | null>(() => {
    const saved = localStorage.getItem(SCALPER_PANEL_KEY)
    return isPanelId(saved) ? saved : null
  })
  const [scriptSource, setScriptSource] = useState<string | null>(null)
  const [backtestFile, setBacktestFile] = useState<string | null>(null)
  const backtestMarked = useRef<TradingTerminal | null>(null)
  const showScriptSource = useCallback((file: string) => {
    setScriptSource(file)
    setPanel('scripts')
  }, [])

  const [dock, setDock] = useState<DockTab | null>(null)
  const [showDockBar, setShowDockBar] = useState<boolean>(false)
  const [focusedPane, setFocusedPane] = useState<ScalperPaneId>('scalper-p0')
  const [chartRevision, setChartRevision] = useState(0)
  const noteChartChanged = useCallback(() => setChartRevision((at) => at + 1), [])
  const [toolbarHost, setToolbarHost] = useState<HTMLDivElement | null>(null)
  const [paneSymbols, setPaneSymbols] = useState<Record<string, string | null>>({})
  const [paneObjects, setPaneObjects] = useState<Record<string, ChartObjects>>({})
  const [paneAlerts, setPaneAlerts] = useState<Record<string, AlertsView>>({})
  const [alertLog, setAlertLog] = useState<AlertFire[]>([])
  const [alertRevision, setAlertRevision] = useState(0)

  const terminalsRef = useRef<Record<string, TradingTerminal | null>>({})
  const [paneLoadStates, setPaneLoadStates] = useState<Record<string, ChartStateView['kind']>>({})
  const noteLoadState = useCallback((paneId: string, state: ChartStateView) => {
    const kind = state.refreshing ? 'loading' : state.kind
    setPaneLoadStates((prev) => (prev[paneId] === kind ? prev : { ...prev, [paneId]: kind }))
  }, [])
  const foregroundLoading = ALL_PANE_IDS.some((id) => {
    const visible =
      id === 'scalper-p0'
        ? visiblePanes.spot
        : id === 'scalper-p1'
          ? visiblePanes.ce
          : visiblePanes.pe
    return (
      visible &&
      (!maximizedPane || maximizedPane === id) &&
      (!paneLoadStates[id] || paneLoadStates[id] === 'loading')
    )
  })
  const bottomBar = useRef<BottomBarControl | null>(null)
  const orderBridge = useRef<ChartOrderBridgeRef['current']>(null)

  /* ── Replay Coordinator (identical to Trading.tsx) ───────────────────── */
  const replayCoordinator = useRef<WorkspaceReplayCoordinator | null>(null)
  const [replaySnapshot, setReplaySnapshot] = useState<WorkspaceReplaySnapshot>({
    phase: 'idle',
    scope: 'focused',
    ownerId: null,
    state: null,
  })
  const replaySnapshotRef = useRef(replaySnapshot)
  const [replayError, setReplayError] = useState<string | null>(null)
  const [confirmReplayExit, setConfirmReplayExit] = useState(false)
  const replayPickListeners = useRef(new Set<() => void>())
  const replayPick = useRef<ReplayPickSource>({
    subscribe: (listener) => {
      replayPickListeners.current.add(listener)
      return () => {
        replayPickListeners.current.delete(listener)
      }
    },
    time: () => {
      const owner = replaySnapshotRef.current.ownerId
      const terminal = owner ? terminalsRef.current[owner] : null
      return terminal?.replayPickingBar() ? (terminal.replayPickBar()?.time ?? null) : null
    },
  }).current

  const updateReplayMembers = useCallback(() => {
    replayCoordinator.current?.setMembers(
      ALL_PANE_IDS.flatMap((id) => {
        const terminal = terminalsRef.current[id]
        return terminal ? [{ id, terminal }] : []
      })
    )
  }, [])

  useEffect(() => {
    let current = true
    const coordinator = new WorkspaceReplayCoordinator({
      onChange: (snapshot) => {
        replaySnapshotRef.current = snapshot
        if (current) {
          setReplaySnapshot(snapshot)
          if (snapshot.phase !== 'active') setConfirmReplayExit(false)
        }
      },
      onError: (error) => {
        if (current)
          setReplayError(error instanceof Error ? error.message : 'Unable to replay this workspace')
      },
    })
    replayCoordinator.current = coordinator
    const offPick = coordinator.subscribePick(() => {
      for (const listener of [...replayPickListeners.current]) listener()
    })
    updateReplayMembers()
    return () => {
      current = false
      offPick()
      coordinator.destroy()
      if (replayCoordinator.current === coordinator) replayCoordinator.current = null
    }
  }, [updateReplayMembers])

  const stopWorkspaceReplay = useCallback(() => {
    setConfirmReplayExit(false)
    replayCoordinator.current?.stop()
  }, [])

  const requestReplayExit = useCallback(() => {
    if (replaySnapshotRef.current.phase === 'active') setConfirmReplayExit(true)
    else stopWorkspaceReplay()
  }, [stopWorkspaceReplay])

  const startWorkspaceReplay = useCallback(
    (paneId: string) => {
      setReplayError(null)
      const coordinator = replayCoordinator.current
      if (!coordinator) return
      if (coordinator.state().phase !== 'idle') requestReplayExit()
      else {
        if (ALL_PANE_IDS.some((id) => !terminalsRef.current[id])) {
          setReplayError('Every visible chart must be ready before replay')
          return
        }
        updateReplayMembers()
        coordinator.start(paneId)
      }
    },
    [requestReplayExit, updateReplayMembers]
  )

  /* ── Terminal & Pane Callbacks ───────────────────────────────────────── */
  const noteTerminal = useCallback(
    (paneId: string, terminal: TradingTerminal | null) => {
      if (terminal) {
        terminalsRef.current[paneId] = terminal
        if (!activeRef.current) activeRef.current = terminal
        terminal.setFullTradeButtonColors(true)
        if (paneId === 'scalper-p1') {
          terminal.setProduct(product)
          terminal.setQty(ceLots)
        } else if (paneId === 'scalper-p2') {
          terminal.setProduct(product)
          terminal.setQty(peLots)
        }
      } else {
        if (activeRef.current === terminalsRef.current[paneId]) activeRef.current = null
        delete terminalsRef.current[paneId]
      }
      updateReplayMembers()
    },
    [updateReplayMembers, product, ceLots, peLots]
  )

  const noteAlerts = useCallback((paneId: string, view: AlertsView | null) => {
    setPaneAlerts((previous) => {
      if (view) {
        if (previous[paneId] === view) return previous
        return { ...previous, [paneId]: view }
      }
      if (!(paneId in previous)) return previous
      const next = { ...previous }
      delete next[paneId]
      return next
    })
    setAlertRevision((n) => n + 1)
  }, [])

  const noteAlertFired = useCallback((fire: AlertFire) => {
    setAlertLog((previous) =>
      previous.length < ALERT_LOG_LIMIT
        ? [...previous, fire]
        : [...previous.slice(previous.length - ALERT_LOG_LIMIT + 1), fire]
    )
  }, [])

  useEffect(() => {
    let cancelled = false
    void fetchLog().then((fires) => {
      if (cancelled) return
      setAlertLog((live) => [...fires.map(loggedToFire).reverse(), ...live])
    })
    return () => {
      cancelled = true
    }
  }, [])

  const clearAlertLog = useCallback(() => {
    setAlertLog([])
    void clearLog().then((cleared) => {
      if (!cleared) {
        showToast.error('The log could not be cleared. It will be back on the next reload.')
      }
    })
  }, [])

  const noteObjects = useCallback((paneId: string, objects: ChartObjects | null) => {
    setPaneObjects((previous) => {
      if (objects) {
        if (previous[paneId] === objects) return previous
        return { ...previous, [paneId]: objects }
      }
      if (!(paneId in previous)) return previous
      const next = { ...previous }
      delete next[paneId]
      return next
    })
  }, [])

  const panelTarget = useCallback(
    () =>
      terminalsRef.current[focusedPane] ??
      activeRef.current ??
      Object.values(terminalsRef.current)[0] ??
      null,
    [focusedPane]
  )

  const focusPane = useCallback(
    (t: TradingTerminal | null, paneId?: string) => {
      activeRef.current = t
      if (paneId && (ALL_PANE_IDS as string[]).includes(paneId)) {
        setFocusedPane(paneId as ScalperPaneId)
        noteChartChanged()
      }
      if (t) setStats(t.drawStats())
    },
    [noteChartChanged]
  )

  const noteSymbol = useCallback(
    (paneId: string, key: string | null) => {
      setPaneSymbols((prev) => (prev[paneId] === key ? prev : { ...prev, [paneId]: key }))
      noteChartChanged()
      const terminal = terminalsRef.current[paneId]
      if (terminal) bottomBar.current?.paneLoaded(terminal)
    },
    [noteChartChanged]
  )

  /**
   * Smart routing when picking an instrument from Watchlist / Option Chain / Dock:
   * - If it's a Call option (ends with CE) -> routes to CALL pane (scalper-p1)
   * - If it's a Put option (ends with PE)  -> routes to PUT pane (scalper-p2)
   * - Otherwise                            -> routes to focused pane (or SPOT pane)
   */
  const sendToSmartPane = useCallback(
    (row: SearchRow) => {
      stopWorkspaceReplay()
      const symUpper = row.symbol.toUpperCase()
      if (
        (row.exchange === 'NFO' || row.exchange === 'BFO' || row.exchange === 'MCX') &&
        symUpper.endsWith('CE') &&
        terminalsRef.current['scalper-p1']
      ) {
        void terminalsRef.current['scalper-p1']?.ensureSymbol(row)
        return
      }
      if (
        (row.exchange === 'NFO' || row.exchange === 'BFO' || row.exchange === 'MCX') &&
        symUpper.endsWith('PE') &&
        terminalsRef.current['scalper-p2']
      ) {
        void terminalsRef.current['scalper-p2']?.ensureSymbol(row)
        return
      }
      void panelTarget()?.ensureSymbol(row)
    },
    [panelTarget, stopWorkspaceReplay]
  )

  const tradingLocked = useCallback(
    () =>
      replaySnapshotRef.current.phase !== 'idle' ||
      Object.values(terminalsRef.current).some(
        (t) =>
          t !== null &&
          (t.replayActive() ||
            t.replayPickingBar() ||
            t.replayLoadingBars() ||
            t.dataUnavailable() ||
            t.alertDialogOpen())
      ),
    []
  )

  const searchFromFocusedPane = useCallback(
    (query: string, exchange?: string, limit?: number) =>
      panelTarget()?.search(query, exchange, limit) ?? Promise.resolve([]),
    [panelTarget]
  )

  const readChartContext = useCallback(() => panelTarget()?.chartContext() ?? null, [panelTarget])

  const applyChartCommands = useCallback(
    (commands: AgentChartCommand[]) => {
      stopWorkspaceReplay()
      void panelTarget()?.applyChartCommands(commands)
    },
    [panelTarget, stopWorkspaceReplay]
  )

  const captureChart = useCallback(
    () => panelTarget()?.snapshotPng() ?? Promise.resolve(null),
    [panelTarget]
  )

  const openAlertEditor = useCallback(
    (alertId?: string) => {
      void panelTarget()?.openAlerts(undefined, alertId)
    },
    [panelTarget]
  )

  const onPaneDrawStats = useCallback((value: DrawStats) => {
    setStats(value)
    if (activeRef.current?.drawStats().tool === null) {
      setTool(null)
      setLatched(false)
    }
  }, [])

  const pickTool = useCallback((id: string | null, latch = false) => {
    setTool(id)
    setLatched(id !== null && latch)
  }, [])

  const onDrawKey = useCallback((e: KeyboardEvent) => {
    const t = activeRef.current
    if (!t || !t.handleDrawKey(e)) return false
    setTool(t.drawStats().tool)
    setStats(t.drawStats())
    return true
  }, [])

  const act = (fn: (t: TradingTerminal) => void) => {
    const t = activeRef.current
    if (!t) return
    fn(t)
    setStats(t.drawStats())
  }

  /* ── Keyboard Undo/Redo & Escape handlers ────────────────────────────── */
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const direction = historyChord(e)
      if (!direction || e.repeat) return
      if (!chartMayTakeKey(e)) return
      const t = activeRef.current
      if (!t) return
      e.preventDefault()
      e.stopPropagation()
      t.historyPress(direction)
      setStats(t.drawStats())
    }
    window.addEventListener('keydown', onKey, { capture: true })
    return () => window.removeEventListener('keydown', onKey, { capture: true })
  }, [])

  useEffect(() => {
    if (!panel && !dock && !maximizedPane) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return
      if (tool) return
      const target = e.target as HTMLElement | null
      if (
        target &&
        (target.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName))
      ) {
        return
      }
      if (document.body.hasAttribute('data-scroll-locked')) return
      if (
        document.querySelector(
          '[data-trading-dialog-open="true"],' +
            '[data-state="open"][role="dialog"],' +
            '[data-state="open"][data-slot="popover-content"],' +
            '[data-state="open"][role="menu"],' +
            '[data-state="open"][role="listbox"]'
        )
      ) {
        return
      }
      if (maximizedPane) {
        setMaximizedPane(null)
        return
      }
      const dockEl = document.getElementById(DOCK_ID)
      const closes = escapeTarget({
        dock: dock !== null,
        panel: panel !== null,
        focusInDock: !!dockEl && dockEl.contains(document.activeElement),
      })
      if (closes === 'dock') setDock(null)
      else if (closes === 'panel') setPanel(null)
    }
    window.addEventListener('keydown', onKey, { capture: true })
    return () => window.removeEventListener('keydown', onKey, { capture: true })
  }, [panel, dock, tool, maximizedPane])

  /* ── Persistence Effects ─────────────────────────────────────────────── */
  useEffect(() => {
    try {
      localStorage.setItem(SCALPER_LAYOUT_KEY, layoutMode)
    } catch {
      /* noop */
    }
  }, [layoutMode])

  useEffect(() => {
    if (panel) localStorage.setItem(SCALPER_PANEL_KEY, panel)
    else localStorage.removeItem(SCALPER_PANEL_KEY)
  }, [panel])

  useEffect(() => {
    // Keep /trading dock closed by default so switching to Trading tab never pops open Positions dock
    writeDockTab(null)
  }, [])

  useEffect(() => {
    try {
      localStorage.setItem(SCALPER_ARMED_KEY, armed ? '1' : '0')
    } catch {
      /* noop */
    }
  }, [armed])

  useEffect(() => {
    try {
      localStorage.setItem(SCALPER_CE_LOTS_KEY, String(ceLots))
    } catch {
      /* noop */
    }
    terminalsRef.current['scalper-p1']?.setQty(ceLots)
  }, [ceLots])

  useEffect(() => {
    try {
      localStorage.setItem(SCALPER_PE_LOTS_KEY, String(peLots))
    } catch {
      /* noop */
    }
    terminalsRef.current['scalper-p2']?.setQty(peLots)
  }, [peLots])

  useEffect(() => {
    try {
      localStorage.setItem(SCALPER_PRODUCT_KEY, product)
    } catch {
      /* noop */
    }
    terminalsRef.current['scalper-p1']?.setProduct(product)
    terminalsRef.current['scalper-p2']?.setProduct(product)
  }, [product])

  useEffect(() => {
    localStorage.setItem(SCALPER_SYNC_KEY, JSON.stringify(sync))
    linkGroup?.setOptions({ ...sync, symbol: false })
  }, [sync, linkGroup])

  useEffect(() => {
    const group = createScalperLinkGroup()
    setLinkGroup(group)
    return () => group.destroy()
  }, [])

  /* ── API Key & WS URL ────────────────────────────────────────────────── */
  useEffect(() => {
    let alive = true
    ;(async () => {
      try {
        const [keyRes, cfgRes] = await Promise.all([
          fetch('/api/websocket/apikey').then((r) => r.json()),
          fetch('/api/websocket/config').then((r) => r.json()),
        ])
        if (!alive) return
        if (keyRes.status !== 'success') {
          setNoApiKey(true)
          return
        }
        const key = keyRes.api_key as string
        setApiKey(key)
        setWsUrl((cfgRes.websocket_url as string) || 'ws://127.0.0.1:8765')
      } catch {
        if (alive) setNoApiKey(true)
      }
    })()
    return () => {
      alive = false
    }
  }, [])

  /* ── Helper to apply strikes chain, seed metadata, and load CE/PE charts ─ */
  const applyStrikesToPanes = useCallback(
    (
      preset: UnderlyingPreset,
      expiry: string,
      expiriesList: string[],
      rows: OptionChainRow[],
      resolvedAtm: number | null | undefined,
      foExchOverride?: string,
      cacheUpdatedAt?: number
    ) => {
      setChain(rows)
      const context = `${preset.id}:${expiry}`
      if (manualStrikesRef.current.context !== context) {
        manualStrikesRef.current = { context, ce: null, pe: null }
      }
      const selection = resolveScalperStrikes(rows, resolvedAtm, manualStrikesRef.current)
      const atmVal = selection.atm
      setAtmStrike(atmVal)
      setCeStrike(selection.ce)
      setPeStrike(selection.pe)
      if (!rows.length) return
      const ceTargetRow = rows.find((row) => String(row.strike) === selection.ce)
      const peTargetRow = rows.find((row) => String(row.strike) === selection.pe)

      const foExch = foExchOverride || preset.foExchange
      const foExchUpper = foExch.toUpperCase()
      for (const r of rows) {
        if (r.ce?.symbol) {
          symbolMetadataCache.set(`${r.ce.symbol.toUpperCase()}:${foExchUpper}`, {
            symbol: r.ce.symbol,
            exchange: foExch,
            lotsize: r.ce.lotsize ?? preset.defaultLotSize,
            tick_size: r.ce.tick_size ?? 0.05,
          })
        }
        if (r.pe?.symbol) {
          symbolMetadataCache.set(`${r.pe.symbol.toUpperCase()}:${foExchUpper}`, {
            symbol: r.pe.symbol,
            exchange: foExch,
            lotsize: r.pe.lotsize ?? preset.defaultLotSize,
            tick_size: r.pe.tick_size ?? 0.05,
          })
        }
      }
      persistFastCache()

      writeIndexSnapshot(preset.id, {
        expiries: expiriesList,
        selectedExpiry: expiry,
        chain: rows,
        atmStrike: atmVal,
        ceStrike: selection.ce,
        peStrike: selection.pe,
        updatedAt: cacheUpdatedAt ?? Date.now(),
      })

      if (ceTargetRow?.ce?.symbol) {
        seedPaneDefaultStorage('scalper-p1', ceTargetRow.ce.symbol, foExch, true)
        const t1 = terminalsRef.current['scalper-p1']
        if (t1) {
          void t1.ensureSymbol({
            symbol: ceTargetRow.ce.symbol,
            exchange: foExch,
            lotsize: ceTargetRow.ce.lotsize ?? preset.defaultLotSize,
            tick_size: ceTargetRow.ce.tick_size ?? 0.05,
          })
        }
      }
      if (peTargetRow?.pe?.symbol) {
        seedPaneDefaultStorage('scalper-p2', peTargetRow.pe.symbol, foExch, true)
        const t2 = terminalsRef.current['scalper-p2']
        if (t2) {
          void t2.ensureSymbol({
            symbol: peTargetRow.pe.symbol,
            exchange: foExch,
            lotsize: peTargetRow.pe.lotsize ?? preset.defaultLotSize,
            tick_size: peTargetRow.pe.tick_size ?? 0.05,
          })
        }
      }
    },
    []
  )

  const loadedUnderlyingKeyRef = useRef<string>('')

  /* ── 0ms Snapshot-First + Single-Pass Underlying & Expiry Loader ───────── */
  useEffect(() => {
    let alive = true
    const preset = activeUnderlying
    const snap = readIndexSnapshot(preset.id)

    if (snap && snap.expiries.length > 0 && snap.chain.length > 0) {
      setExpiries(snap.expiries)
      const exp =
        selectedExpiry && snap.expiries.includes(selectedExpiry)
          ? selectedExpiry
          : snap.selectedExpiry || snap.expiries[0]
      if (exp !== selectedExpiry) setSelectedExpiry(exp)
      applyStrikesToPanes(preset, exp, snap.expiries, snap.chain, snap.atmStrike, undefined, snap.updatedAt)
      loadedUnderlyingKeyRef.current = `${preset.id}:${exp}`

      // If snapshot is fresh (< 60s), skip redundant network re-fetch on switch
      if (Date.now() - snap.updatedAt < 60_000) {
        return () => {
          alive = false
        }
      }
    } else {
      setExpiries([])
      setSelectedExpiry('')
      setChain([])
    }

    ;(async () => {
      try {
        const expRes = await scalpingApi.getExpiry(preset.id, preset.foExchange, 'options')
        if (!alive) return
        const list = expRes.data ?? []
        if (list.length === 0) return
        setExpiries(list)
        const targetExp = list[0]
        setSelectedExpiry(targetExp)
        loadedUnderlyingKeyRef.current = `${preset.id}:${targetExp}`

        // Chain getStrikes immediately in the same async pass (zero React render waterfall)
        const strikesRes = await scalpingApi.getStrikes(preset.id, preset.foExchange, targetExp, 25)
        if (!alive) return
        const rows = strikesRes.chain ?? []
        // Preserve each explicit choice if a response arrives after a picker change.
        applyStrikesToPanes(
          preset, targetExp, list, rows, strikesRes.atm_strike, strikesRes.fo_exchange
        )
      } catch {
        /* ignore */
      }
    })()

    return () => {
      alive = false
    }
  }, [activeUnderlying, applyStrikesToPanes])

  /* ── Handle user changing Expiry Date from bottom Option Chain dropdown ── */
  useEffect(() => {
    if (!selectedExpiry) return
    const key = `${activeUnderlying.id}:${selectedExpiry}`
    if (loadedUnderlyingKeyRef.current === key) return
    loadedUnderlyingKeyRef.current = key
    let alive = true
    ;(async () => {
      try {
        const res = await scalpingApi.getStrikes(
          activeUnderlying.id,
          activeUnderlying.foExchange,
          selectedExpiry,
          25
        )
        if (!alive) return
        applyStrikesToPanes(
          activeUnderlying,
          selectedExpiry,
          expiries.length ? expiries : [selectedExpiry],
          res.chain ?? [],
          res.atm_strike,
          res.fo_exchange
        )
      } catch {
        /* ignore */
      }
    })()
    return () => {
      alive = false
    }
  }, [activeUnderlying, selectedExpiry, expiries, applyStrikesToPanes])

  // Fetch history for visible panes and explicit selections. Warming every index
  // consumed broker history slots needed by the active SPOT, CE and PE charts.

  /* ── Live Option Chain Hook (LTP + OI + Volume + Greeks via WebSocket) ── */
  const {
    data: liveOptionChain,
    isLoading: isOptionChainLoading,
    isStreaming: isOptionChainStreaming,
    refetch: refetchOptionChain,
  } = useOptionChainLive(
    apiKey,
    activeUnderlying.id,
    activeUnderlying.spotExchange,
    activeUnderlying.foExchange,
    selectedExpiry,
    25,
    {
      enabled: Boolean(apiKey && activeUnderlying.id && selectedExpiry),
      oiRefreshInterval: 10000,
      pauseWhenHidden: true,
    }
  )

  /* ── Real-Time 0–1ms Live Quotes for All 5 Indices (Top & Bottom Dropdowns) ─ */
  const { isMarketOpen } = useMarketStatus()
  const activeMarketOpen = isMarketOpen(activeUnderlying.spotExchange)
  const indexPriceableItems = useMemo<PriceableItem[]>(
    () =>
      UNDERLYINGS.map((u) => ({
        symbol: u.spotSymbol,
        exchange: u.spotExchange,
      })),
    []
  )
  const { data: liveIndicesData, multiQuotes: indexMultiQuotes } = useLivePrice(
    indexPriceableItems,
    {
      enabled: Boolean(apiKey),
      staleThreshold: 15000,
      useMultiQuotesFallback: true,
      multiQuotesRefreshInterval: 10000,
      pauseWhenHidden: true,
    }
  )

  // The header has its own day ledger. Positions/dock retain their existing P&L.
  const dayBook = useMemo(
    () => buildDayPnlBook(positionSnapshot, tradeSnapshot, day),
    [positionSnapshot, tradeSnapshot, day]
  )
  const pnlPrices = useScalperPnlPrices(
    dayBook,
    pnlScope,
    Boolean(apiKey && appMode === 'analyzer' && pnlSnapshotScope === pnlScope)
  )
  const brokerPnlSymbols = useMemo(() => positionSnapshot.filter((row) => Number(row.quantity) !== 0)
    .map(({ symbol, exchange }) => ({ symbol, exchange })), [positionSnapshot])
  const { data: brokerPnlTicks } = useMarketData({ symbols: brokerPnlSymbols,
    enabled: Boolean(apiKey && appMode === 'live' && pnlSnapshotScope === pnlScope), mode: 'LTP' })
  const headerPnl = useMemo(() => {
    if (pnlSnapshotScope !== pnlScope)
      return {
        total: null,
        realized: null,
        open: null,
        message: 'Loading account positions',
      }
    if (appMode === 'live') {
      const marks = new Map<string, number>()
      for (const [key, tick] of brokerPnlTicks) {
        if (typeof tick.lastUpdate === 'number' && typeof tick.data.ltp === 'number' &&
            tick.lastUpdate >= positionSnapshotAt && Date.now() - tick.lastUpdate < 5000 &&
            Number.isFinite(tick.data.ltp) && tick.data.ltp > 0)
          marks.set(key, tick.data.ltp)
      }
      return calculateBrokerPnl(positionSnapshot, marks)
    }
    return calculateDayPnl(dayBook, pnlPrices.marks, pnlPrices.closes)
  }, [dayBook, pnlPrices.marks, pnlPrices.closes, pnlScope, pnlSnapshotScope, appMode,
    brokerPnlTicks, positionSnapshot, positionSnapshotAt])

  // Prioritize visible candles over daily fallback requests for index labels.
  // Fill dropdown reference prices serially afterward, selected index first.
  useEffect(() => {
    if (!apiKey || foregroundLoading) return
    let alive = true
    const pad = (n: number) => String(n).padStart(2, '0')
    const fmtDate = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
    const startDate = fmtDate(new Date(Date.now() - 20 * 86400_000))
    const endDate = fmtDate(new Date())

    void (async () => {
      for (const u of [
        activeUnderlying,
        ...UNDERLYINGS.filter((item) => item.id !== activeUnderlying.id),
      ]) {
        if (!alive) return
        const key = `${u.spotExchange}:${u.spotSymbol}`
        const referenceKey = `${endDate}:${key}`
        if (indexReferencesLoaded.current.has(referenceKey)) continue
        try {
          const [quoteRes, histRes] = await Promise.allSettled([
            tradingApi.getQuotes(apiKey, u.spotSymbol, u.spotExchange),
            apiClient.post<{
              status?: string
              data?: Array<{ close?: number; timestamp?: number }>
            }>('/history', {
              apikey: apiKey,
              symbol: u.spotSymbol,
              exchange: u.spotExchange,
              interval: 'D',
              start_date: startDate,
              end_date: endDate,
            }),
          ])
          if (!alive) return

          const qData =
            quoteRes.status === 'fulfilled' && quoteRes.value?.status === 'success'
              ? quoteRes.value.data
              : undefined
          const bars =
            histRes.status === 'fulfilled' &&
            histRes.value?.data?.status === 'success' &&
            Array.isArray(histRes.value.data.data)
              ? histRes.value.data.data
              : []

          const lastBarClose = Number(bars[bars.length - 1]?.close || 0)
          const prevBarClose = Number(
            (bars.length >= 2 ? bars[bars.length - 2]?.close : bars[0]?.close) || 0
          )

          const ltp = Number(qData?.ltp || 0) || lastBarClose
          const rawPrev = Number(qData?.prev_close || 0)
          const prevClose =
            rawPrev > 0 && rawPrev !== ltp
              ? rawPrev
              : prevBarClose > 0
                ? prevBarClose
                : Number(qData?.open || 0)

          if (ltp > 0 || prevClose > 0) {
            setIndexHistorySnapshots((prev) => ({
              ...prev,
              [key]: {
                ltp: ltp > 0 ? ltp : (prev[key]?.ltp ?? 0),
                prevClose: prevClose > 0 ? prevClose : (prev[key]?.prevClose ?? 0),
              },
            }))
          }
          if (prevClose > 0) {
            setResolvedCloses((prev) =>
              prev[key] === prevClose ? prev : { ...prev, [key]: prevClose }
            )
          }
          if (ltp > 0 && prevClose > 0) indexReferencesLoaded.current.add(referenceKey)
        } catch {
          /* ignore fallback error */
        }
      }
    })()
    return () => {
      alive = false
    }
  }, [apiKey, activeUnderlying, foregroundLoading])

  const indexQuotesById = useMemo(() => {
    const map: Record<
      string,
      {
        ltp: number
        prevClose: number
        change: number | null
        changePct: number | null
      }
    > = {}

    for (const u of UNDERLYINGS) {
      const key = `${u.spotExchange}:${u.spotSymbol}`
      const liveItem = liveIndicesData.find(
        (it) => it.symbol === u.spotSymbol && it.exchange === u.spotExchange
      )
      const mq = indexMultiQuotes.get(key)
      const hist = indexHistorySnapshots[key]
      const isCurrentActive = u.id === activeUnderlying.id
      const chainSpotLtp =
        isCurrentActive &&
        typeof liveOptionChain?.underlying_ltp === 'number' &&
        liveOptionChain.underlying_ltp > 0
          ? liveOptionChain.underlying_ltp
          : 0
      const chainSpotPrev =
        isCurrentActive &&
        typeof liveOptionChain?.underlying_prev_close === 'number' &&
        liveOptionChain.underlying_prev_close > 0
          ? liveOptionChain.underlying_prev_close
          : 0

      // Priority: 0-1ms WebSocket liveItem -> OptionChain live underlying_ltp -> MultiQuotes -> History fallback
      const wsLtp =
        liveItem?._dataSource === 'websocket' &&
        typeof liveItem.ltp === 'number' &&
        liveItem.ltp > 0
          ? liveItem.ltp
          : 0
      const ltp =
        wsLtp ||
        chainSpotLtp ||
        (typeof liveItem?.ltp === 'number' && liveItem.ltp > 0 ? liveItem.ltp : 0) ||
        (typeof mq?.ltp === 'number' && mq.ltp > 0 ? mq.ltp : 0) ||
        (hist?.ltp ?? 0)

      const mqPrev = typeof mq?.prev_close === 'number' ? mq.prev_close : 0
      const resolvedPrev = resolvedCloses[key] ?? 0
      const histPrev = hist?.prevClose ?? 0
      const mqOpen = typeof mq?.open === 'number' ? mq.open : 0

      const prevClose = !needsPreviousClose(mqPrev, ltp)
        ? mqPrev
        : !needsPreviousClose(chainSpotPrev, ltp)
          ? chainSpotPrev
          : resolvedPrev > 0 && resolvedPrev !== ltp
            ? resolvedPrev
            : histPrev > 0 && histPrev !== ltp
              ? histPrev
              : mqOpen > 0 && mqOpen !== ltp
                ? mqOpen
                : resolvedPrev || histPrev || mqPrev || chainSpotPrev || 0

      const hasChange = ltp > 0 && prevClose > 0
      const change = hasChange ? ltp - prevClose : null
      const changePct = hasChange ? ((ltp - prevClose) / prevClose) * 100 : null

      map[u.id] = {
        ltp,
        prevClose,
        change,
        changePct,
      }
    }
    return map
  }, [
    liveIndicesData,
    indexMultiQuotes,
    indexHistorySnapshots,
    activeUnderlying.id,
    liveOptionChain?.underlying_ltp,
    liveOptionChain?.underlying_prev_close,
    resolvedCloses,
  ])

  const activeIndexQuote = indexQuotesById[activeUnderlying.id] ?? {
    ltp: liveOptionChain?.underlying_ltp ?? 0,
    prevClose: liveOptionChain?.underlying_prev_close ?? 0,
    change: null,
    changePct: null,
  }

  /* ── Enriched Live Option Chain (Merging scalping strikes + live OI/LTP) ─ */
  const effectiveAtmStrike = useMemo(() => {
    const liveAtm = liveOptionChain?.atm_strike
    if (typeof liveAtm === 'number' && liveAtm > 0) return liveAtm
    if (typeof atmStrike === 'number' && atmStrike > 0) return atmStrike
    const strikes = (liveOptionChain?.chain?.length ? liveOptionChain.chain : chain).map(
      (r) => r.strike
    )
    if (strikes.length === 0) return null
    const spotLtp = liveOptionChain?.underlying_ltp
    if (typeof spotLtp === 'number' && spotLtp > 0) {
      return strikes.reduce((best, s) =>
        Math.abs(s - spotLtp) < Math.abs(best - spotLtp) ? s : best
      )
    }
    return strikes[Math.floor(strikes.length / 2)] ?? null
  }, [
    liveOptionChain?.atm_strike,
    liveOptionChain?.underlying_ltp,
    liveOptionChain?.chain,
    atmStrike,
    chain,
  ])

  // The option chain is intentionally structure-first for fast startup, and
  // its quote stream is live while the market is open. After close, reconcile
  // the currently selected CE/PE with the exact candle source used by the
  // chart. This is limited to the two selected legs to avoid N*2 history calls.
  useEffect(() => {
    if (!apiKey || activeMarketOpen || foregroundLoading) return
    let alive = true
    const selectedSymbols = [
      chain.find((row) => String(row.strike) === ceStrike)?.ce?.symbol,
      chain.find((row) => String(row.strike) === peStrike)?.pe?.symbol,
    ].filter((symbol): symbol is string => Boolean(symbol))

    for (const symbol of selectedSymbols) {
      const key = `${activeUnderlying.foExchange}:${symbol}`
      // A fresh chart response already contains this option's final close.
      const chartBars = globalBarMemoryCache.get(
        `${symbol.toUpperCase()}:${activeUnderlying.foExchange.toUpperCase()}:1m`
      )
      const chartClose =
        chartBars && Date.now() - chartBars.time < 2_000
          ? Number(chartBars.bars.at(-1)?.close ?? 0)
          : 0
      const cached = chartClose > 0 ? chartClose : optionHistoryCloseCache.get(key)
      if (cached && cached > 0) {
        setOptionHistoryCloses((prev) => (prev[key] === cached ? prev : { ...prev, [key]: cached }))
        continue
      }

      void scalpingApi
        .getHistory(symbol, activeUnderlying.foExchange, '1m')
        .then((history) => {
          if (!alive) return
          const close = Number(history.candles.at(-1)?.close ?? 0)
          if (!(close > 0)) return
          optionHistoryCloseCache.set(key, close)
          setOptionHistoryCloses((prev) => (prev[key] === close ? prev : { ...prev, [key]: close }))
        })
        .catch(() => {
          /* The live quote remains the fallback when history is unavailable. */
        })
    }

    return () => {
      alive = false
    }
  }, [
    apiKey,
    activeMarketOpen,
    foregroundLoading,
    activeUnderlying.foExchange,
    ceStrike,
    peStrike,
    chain,
  ])

  const enrichedChain = useMemo(() => {
    const byStrike = new Map<
      number,
      {
        strike: number
        ce: {
          symbol: string
          label: string
          ltp: number
          oi: number
          volume: number
          prevClose: number
          chgPct: number | null
          lotsize: number
          tick_size: number
          moneyness: 'ITM' | 'ATM' | 'OTM'
          tag: string
        } | null
        pe: {
          symbol: string
          label: string
          ltp: number
          oi: number
          volume: number
          prevClose: number
          chgPct: number | null
          lotsize: number
          tick_size: number
          moneyness: 'ITM' | 'ATM' | 'OTM'
          tag: string
        } | null
      }
    >()

    const defLot = activeUnderlying.defaultLotSize
    const foExch = activeUnderlying.foExchange

    const computeLegChangePct = (
      symbol: string,
      ltp: number,
      rawPrevClose: number,
      rawOpen: number
    ): { refClose: number; chgPct: number | null } => {
      if (!(ltp > 0)) return { refClose: 0, chgPct: null }
      const key = `${foExch}:${symbol}`
      const resolved = resolvedCloses[key]
      const refClose = !needsPreviousClose(rawPrevClose, ltp)
        ? rawPrevClose
        : typeof resolved === 'number' && resolved > 0
          ? resolved
          : rawOpen > 0 && rawOpen !== ltp
            ? rawOpen
            : 0
      if (!(refClose > 0)) return { refClose: 0, chgPct: null }
      return {
        refClose,
        chgPct: ((ltp - refClose) / refClose) * 100,
      }
    }

    for (const r of chain) {
      const ceSym = r.ce?.symbol || ''
      const ceLtp = Number(r.ce?.ltp || 0)
      const ceCalc = ceSym ? computeLegChangePct(ceSym, ceLtp, 0, 0) : { refClose: 0, chgPct: null }

      const peSym = r.pe?.symbol || ''
      const peLtp = Number(r.pe?.ltp || 0)
      const peCalc = peSym ? computeLegChangePct(peSym, peLtp, 0, 0) : { refClose: 0, chgPct: null }

      byStrike.set(r.strike, {
        strike: r.strike,
        ce: ceSym
          ? {
              symbol: ceSym,
              label: r.ce.label || '',
              ltp: ceLtp,
              oi: 0,
              volume: 0,
              prevClose: ceCalc.refClose,
              chgPct: ceCalc.chgPct,
              lotsize: r.ce.lotsize || defLot,
              tick_size: r.ce.tick_size || 0.05,
              moneyness: 'OTM',
              tag: r.ce.label || '',
            }
          : null,
        pe: peSym
          ? {
              symbol: peSym,
              label: r.pe.label || '',
              ltp: peLtp,
              oi: 0,
              volume: 0,
              prevClose: peCalc.refClose,
              chgPct: peCalc.chgPct,
              lotsize: r.pe.lotsize || defLot,
              tick_size: r.pe.tick_size || 0.05,
              moneyness: 'OTM',
              tag: r.pe.label || '',
            }
          : null,
      })
    }

    if (liveOptionChain?.chain) {
      for (const lr of liveOptionChain.chain) {
        const existing = byStrike.get(lr.strike)
        const ceLive = lr.ce
        const peLive = lr.pe
        const ceSym = ceLive?.symbol || existing?.ce?.symbol || ''
        const ceLtp = Number(ceLive?.ltp ?? existing?.ce?.ltp ?? 0)
        const ceCalc = ceSym
          ? computeLegChangePct(
              ceSym,
              ceLtp,
              Number(ceLive?.prev_close ?? 0),
              Number(ceLive?.open ?? 0)
            )
          : { refClose: 0, chgPct: null }

        const peSym = peLive?.symbol || existing?.pe?.symbol || ''
        const peLtp = Number(peLive?.ltp ?? existing?.pe?.ltp ?? 0)
        const peCalc = peSym
          ? computeLegChangePct(
              peSym,
              peLtp,
              Number(peLive?.prev_close ?? 0),
              Number(peLive?.open ?? 0)
            )
          : { refClose: 0, chgPct: null }

        byStrike.set(lr.strike, {
          strike: lr.strike,
          ce: ceSym
            ? {
                symbol: ceSym,
                label: ceLive?.label || existing?.ce?.label || '',
                ltp: ceLtp,
                oi: Number(ceLive?.oi ?? existing?.ce?.oi ?? 0),
                volume: Number(ceLive?.volume ?? existing?.pe?.volume ?? 0),
                prevClose: ceCalc.refClose,
                chgPct: ceCalc.chgPct,
                lotsize: Number(ceLive?.lotsize || existing?.ce?.lotsize || defLot),
                tick_size: Number(ceLive?.tick_size || existing?.ce?.tick_size || 0.05),
                moneyness: 'OTM',
                tag: ceLive?.label || existing?.ce?.label || '',
              }
            : null,
          pe: peSym
            ? {
                symbol: peSym,
                label: peLive?.label || existing?.pe?.label || '',
                ltp: peLtp,
                oi: Number(peLive?.oi ?? existing?.pe?.oi ?? 0),
                volume: Number(peLive?.volume ?? existing?.pe?.volume ?? 0),
                prevClose: peCalc.refClose,
                chgPct: peCalc.chgPct,
                lotsize: Number(peLive?.lotsize || existing?.pe?.lotsize || defLot),
                tick_size: Number(peLive?.tick_size || existing?.pe?.tick_size || 0.05),
                moneyness: 'OTM',
                tag: peLive?.label || existing?.pe?.label || '',
              }
            : null,
        })
      }
    }

    const sorted = Array.from(byStrike.values()).sort((a, b) => a.strike - b.strike)
    const atmIdx =
      effectiveAtmStrike != null ? sorted.findIndex((r) => r.strike === effectiveAtmStrike) : -1

    return sorted.map((r, idx) => {
      const dist = atmIdx >= 0 ? idx - atmIdx : 0
      const isAtm = effectiveAtmStrike != null && r.strike === effectiveAtmStrike
      const ceMoney: 'ITM' | 'ATM' | 'OTM' = isAtm
        ? 'ATM'
        : effectiveAtmStrike != null && r.strike < effectiveAtmStrike
          ? 'ITM'
          : 'OTM'
      const peMoney: 'ITM' | 'ATM' | 'OTM' = isAtm
        ? 'ATM'
        : effectiveAtmStrike != null && r.strike > effectiveAtmStrike
          ? 'ITM'
          : 'OTM'
      const stepCount = Math.abs(dist)
      const ceTag = isAtm ? 'ATM' : `${ceMoney}${stepCount}`
      const peTag = isAtm ? 'ATM' : `${peMoney}${stepCount}`
      const ceHistoryClose = r.ce
        ? optionHistoryCloses[`${activeUnderlying.foExchange}:${r.ce.symbol}`]
        : undefined
      const peHistoryClose = r.pe
        ? optionHistoryCloses[`${activeUnderlying.foExchange}:${r.pe.symbol}`]
        : undefined
      return {
        ...r,
        ce: r.ce
          ? {
              ...r.ce,
              ...(ceHistoryClose && !activeMarketOpen ? { ltp: ceHistoryClose } : {}),
              moneyness: ceMoney,
              tag: ceTag,
            }
          : null,
        pe: r.pe
          ? {
              ...r.pe,
              ...(peHistoryClose && !activeMarketOpen ? { ltp: peHistoryClose } : {}),
              moneyness: peMoney,
              tag: peTag,
            }
          : null,
      }
    })
  }, [
    chain,
    liveOptionChain?.chain,
    activeUnderlying.defaultLotSize,
    activeUnderlying.foExchange,
    effectiveAtmStrike,
    resolvedCloses,
    optionHistoryCloses,
    activeMarketOpen,
  ])

  /* ── 0ms In-Memory Symbol Metadata Seeding for All Option Chain Strikes ─ */
  useEffect(() => {
    if (enrichedChain.length === 0) return
    const foExch = activeUnderlying.foExchange
    const foExchUpper = foExch.toUpperCase()
    for (const row of enrichedChain) {
      if (row.ce?.symbol) {
        symbolMetadataCache.set(`${row.ce.symbol.toUpperCase()}:${foExchUpper}`, {
          symbol: row.ce.symbol,
          exchange: foExch,
          lotsize: row.ce.lotsize || activeUnderlying.defaultLotSize,
          tick_size: row.ce.tick_size || 0.05,
        })
      }
      if (row.pe?.symbol) {
        symbolMetadataCache.set(`${row.pe.symbol.toUpperCase()}:${foExchUpper}`, {
          symbol: row.pe.symbol,
          exchange: foExch,
          lotsize: row.pe.lotsize || activeUnderlying.defaultLotSize,
          tick_size: row.pe.tick_size || 0.05,
        })
      }
    }
  }, [enrichedChain, activeUnderlying.foExchange, activeUnderlying.defaultLotSize])

  /* ── Real-time 0-1ms micro-price tick flash detector (matches OptionChainPanel.tsx) ─ */
  useEffect(() => {
    const newFlashes: Record<string, 'up' | 'down'> = {}
    let hasChanged = false

    for (const u of UNDERLYINGS) {
      const q = indexQuotesById[u.id]
      if (q && q.ltp > 0) {
        const prev = prevPricesRef.current.get(u.id)
        if (prev !== undefined && prev !== q.ltp) {
          newFlashes[u.id] = q.ltp > prev ? 'up' : 'down'
          hasChanged = true
        }
        prevPricesRef.current.set(u.id, q.ltp)
      }
    }

    for (const row of enrichedChain) {
      if (row.ce?.symbol && row.ce.ltp > 0) {
        const prev = prevPricesRef.current.get(row.ce.symbol)
        if (prev !== undefined && prev !== row.ce.ltp) {
          newFlashes[row.ce.symbol] = row.ce.ltp > prev ? 'up' : 'down'
          hasChanged = true
        }
        prevPricesRef.current.set(row.ce.symbol, row.ce.ltp)
      }
      if (row.pe?.symbol && row.pe.ltp > 0) {
        const prev = prevPricesRef.current.get(row.pe.symbol)
        if (prev !== undefined && prev !== row.pe.ltp) {
          newFlashes[row.pe.symbol] = row.pe.ltp > prev ? 'up' : 'down'
          hasChanged = true
        }
        prevPricesRef.current.set(row.pe.symbol, row.pe.ltp)
      }
    }

    if (hasChanged) {
      setFlashes((prev) => ({ ...prev, ...newFlashes }))
      const timer = setTimeout(() => setFlashes({}), 400)
      return () => clearTimeout(timer)
    }
  }, [enrichedChain, indexQuotesById])

  const { maxPainStrike } = useMemo(() => {
    let maxCe = 1
    let maxPe = 1
    let sumCe = 0
    let sumPe = 0
    let ceS: number | null = null
    let peS: number | null = null
    for (const r of enrichedChain) {
      const cOi = r.ce?.oi ?? 0
      const pOi = r.pe?.oi ?? 0
      sumCe += cOi
      sumPe += pOi
      if (cOi > maxCe) {
        maxCe = cOi
        ceS = r.strike
      }
      if (pOi > maxPe) {
        maxPe = pOi
        peS = r.strike
      }
    }

    // Compute Max Pain strike (strike where option writers face minimum intrinsic payout)
    let mpStrike: number | null = null
    if (sumCe + sumPe > 0 && enrichedChain.length > 0) {
      let minPayout = Number.POSITIVE_INFINITY
      for (const candidate of enrichedChain) {
        const s = candidate.strike
        let payout = 0
        for (const r of enrichedChain) {
          const cOi = r.ce?.oi ?? 0
          const pOi = r.pe?.oi ?? 0
          if (s > r.strike && cOi > 0) payout += (s - r.strike) * cOi
          if (s < r.strike && pOi > 0) payout += (r.strike - s) * pOi
        }
        if (payout < minPayout) {
          minPayout = payout
          mpStrike = s
        }
      }
    } else if (effectiveAtmStrike != null) {
      mpStrike = effectiveAtmStrike
    }

    return {
      peakCeOi: maxCe,
      peakPeOi: maxPe,
      maxCeOiStrike: ceS,
      maxPeOiStrike: peS,
      maxPainStrike: mpStrike,
      pcr: sumCe > 0 ? sumPe / sumCe : 0,
    }
  }, [enrichedChain, effectiveAtmStrike])

  // A live chain may arrive first. Seed only an unselected leg; never move the other leg.
  useEffect(() => {
    if (enrichedChain.length > 0 && effectiveAtmStrike != null) {
      const defaults = resolveScalperStrikes(enrichedChain, effectiveAtmStrike)
      if (!ceStrike) setCeStrike(defaults.ce)
      if (!peStrike) setPeStrike(defaults.pe)
    }
  }, [ceStrike, peStrike, enrichedChain.length, effectiveAtmStrike])

  // Switch SPOT, CALL (CE), and PUT (PE) charts in 0ms when user switches underlying from Scalper header
  const handleSelectUnderlying = useCallback((preset: UnderlyingPreset) => {
    manualStrikesRef.current = { context: `${preset.id}:`, ce: null, pe: null }
    setCeChainOpen(false)
    setPeChainOpen(false)
    setUnderlyingId(preset.id)
    try {
      localStorage.setItem(SCALPER_UNDERLYING_KEY, preset.id)
    } catch {
      /* noop */
    }
    seedPaneDefaultStorage('scalper-p0', preset.spotSymbol, preset.spotExchange, true)
    void terminalsRef.current['scalper-p0']?.ensureSymbol({
      symbol: preset.spotSymbol, exchange: preset.spotExchange,
    })
    const snap = readIndexSnapshot(preset.id)
    if (snap && snap.expiries.length > 0 && snap.chain.length > 0) {
      const exp = snap.selectedExpiry || snap.expiries[0]
      loadedUnderlyingKeyRef.current = `${preset.id}:${exp}`
      setExpiries(snap.expiries)
      setSelectedExpiry(exp)
      applyStrikesToPanes(preset, exp, snap.expiries, snap.chain, snap.atmStrike, undefined, snap.updatedAt)
    } else {
      // Clear the previous index before any asynchronous chain request begins.
      setExpiries([])
      setSelectedExpiry('')
      setChain([])
      setAtmStrike(null)
      setCeStrike('')
      setPeStrike('')
    }
  }, [applyStrikesToPanes])

  // Resolved CE and PE option row details from enriched live option chain
  const ceRow = useMemo(
    () => enrichedChain.find((r) => String(r.strike) === ceStrike),
    [enrichedChain, ceStrike]
  )
  const peRow = useMemo(
    () => enrichedChain.find((r) => String(r.strike) === peStrike),
    [enrichedChain, peStrike]
  )

  // Keep CALL (scalper-p1) and PUT (scalper-p2) charts synchronized with selected CE/PE option symbols
  useEffect(() => {
    const leg = ceRow?.ce
    if (!leg?.symbol) return
    const exch = activeUnderlying.foExchange
    seedPaneDefaultStorage('scalper-p1', leg.symbol, exch, true)
    const t1 = terminalsRef.current['scalper-p1']
    const currentKey = paneSymbols['scalper-p1']
    const targetKey = `${exch}:${leg.symbol}`
    if (t1 && currentKey !== targetKey) {
      void t1.ensureSymbol({
        symbol: leg.symbol,
        exchange: exch,
        lotsize: leg.lotsize || activeUnderlying.defaultLotSize,
        tick_size: leg.tick_size || 0.05,
      })
    }
  }, [ceRow?.ce?.symbol, activeUnderlying.foExchange, activeUnderlying.defaultLotSize])

  useEffect(() => {
    const leg = peRow?.pe
    if (!leg?.symbol) return
    const exch = activeUnderlying.foExchange
    seedPaneDefaultStorage('scalper-p2', leg.symbol, exch, true)
    const t2 = terminalsRef.current['scalper-p2']
    const currentKey = paneSymbols['scalper-p2']
    const targetKey = `${exch}:${leg.symbol}`
    if (t2 && currentKey !== targetKey) {
      void t2.ensureSymbol({
        symbol: leg.symbol,
        exchange: exch,
        lotsize: leg.lotsize || activeUnderlying.defaultLotSize,
        tick_size: leg.tick_size || 0.05,
      })
    }
  }, [peRow?.pe?.symbol, activeUnderlying.foExchange, activeUnderlying.defaultLotSize])

  // Parse current pane symbols (fallback when user searches directly inside a ChartPane)
  const parsePaneSymbol = useCallback(
    (paneId: ScalperPaneId, fallbackSym?: string, fallbackExch?: string) => {
      const raw = paneSymbols[paneId]
      if (raw && raw.includes(':')) {
        const idx = raw.indexOf(':')
        return { exchange: raw.slice(0, idx), symbol: raw.slice(idx + 1) }
      }
      if (fallbackSym && fallbackExch) {
        return { symbol: fallbackSym, exchange: fallbackExch }
      }
      return null
    },
    [paneSymbols]
  )

  const spotActiveSym = useMemo(
    () => parsePaneSymbol('scalper-p0', activeUnderlying.spotSymbol, activeUnderlying.spotExchange),
    [parsePaneSymbol, activeUnderlying]
  )
  const ceActiveSym = useMemo(
    () => parsePaneSymbol('scalper-p1', ceRow?.ce?.symbol, activeUnderlying.foExchange),
    [parsePaneSymbol, ceRow, activeUnderlying]
  )
  const peActiveSym = useMemo(
    () => parsePaneSymbol('scalper-p2', peRow?.pe?.symbol, activeUnderlying.foExchange),
    [parsePaneSymbol, peRow, activeUnderlying]
  )

  // The panes can hold different underlyings. A SENSEX PE loaded from the
  // watchlist must use its own 20-unit lot, never the header's NIFTY lot size.
  const ceInstrument = terminalsRef.current['scalper-p1']?.currentInstrument()
  const peInstrument = terminalsRef.current['scalper-p2']?.currentInstrument()
  const ceLotSize =
    ceInstrument &&
    ceInstrument.symbol === ceActiveSym?.symbol &&
    ceInstrument.exchange === ceActiveSym.exchange
      ? ceInstrument.lotsize
      : ceRow?.ce?.lotsize || activeUnderlying.defaultLotSize
  const peLotSize =
    peInstrument &&
    peInstrument.symbol === peActiveSym?.symbol &&
    peInstrument.exchange === peActiveSym.exchange
      ? peInstrument.lotsize
      : peRow?.pe?.lotsize || activeUnderlying.defaultLotSize
  const ceOrderQty = ceCustomQty ?? ceLots * ceLotSize
  const peOrderQty = peCustomQty ?? peLots * peLotSize

  useEffect(() => {
    setCeCustomQty(null)
    setCeQtyText(null)
  }, [ceActiveSym?.symbol, ceActiveSym?.exchange, ceLotSize])

  useEffect(() => {
    setPeCustomQty(null)
    setPeQtyText(null)
  }, [peActiveSym?.symbol, peActiveSym?.exchange, peLotSize])

  // Change CE strike from bottom dropdown -> immediately load into CALL pane (scalper-p1)
  const handleSelectCeStrike = useCallback(
    (strikeStr: string) => {
      manualStrikesRef.current = {
        ...manualStrikesRef.current, context: `${activeUnderlying.id}:${selectedExpiry}`, ce: strikeStr,
      }
      setCeStrike(strikeStr)
      setCeChainOpen(false)
      const snap = readIndexSnapshot(activeUnderlying.id)
      if (snap) {
        writeIndexSnapshot(activeUnderlying.id, { ...snap, ceStrike: strikeStr })
      }
      const row = enrichedChain.find((r) => String(r.strike) === strikeStr)
      const leg = row?.ce ?? chain.find((r) => String(r.strike) === strikeStr)?.ce
      if (leg?.symbol) {
        const exch = activeUnderlying.foExchange
        const lotsize = leg.lotsize ?? activeUnderlying.defaultLotSize
        const tick_size = leg.tick_size ?? 0.05
        symbolMetadataCache.set(`${leg.symbol.toUpperCase()}:${exch.toUpperCase()}`, {
          symbol: leg.symbol,
          exchange: exch,
          lotsize,
          tick_size,
        })
        persistFastCache()
        seedPaneDefaultStorage('scalper-p1', leg.symbol, exch, true)
        void terminalsRef.current['scalper-p1']?.ensureSymbol({
          symbol: leg.symbol,
          exchange: exch,
          lotsize,
          tick_size,
        })
      }
    },
    [enrichedChain, chain, activeUnderlying, selectedExpiry]
  )

  // Change PE strike from bottom dropdown -> immediately load into PUT pane (scalper-p2)
  const handleSelectPeStrike = useCallback(
    (strikeStr: string) => {
      manualStrikesRef.current = {
        ...manualStrikesRef.current, context: `${activeUnderlying.id}:${selectedExpiry}`, pe: strikeStr,
      }
      setPeStrike(strikeStr)
      setPeChainOpen(false)
      const snap = readIndexSnapshot(activeUnderlying.id)
      if (snap) {
        writeIndexSnapshot(activeUnderlying.id, { ...snap, peStrike: strikeStr })
      }
      const row = enrichedChain.find((r) => String(r.strike) === strikeStr)
      const leg = row?.pe ?? chain.find((r) => String(r.strike) === strikeStr)?.pe
      if (leg?.symbol) {
        const exch = activeUnderlying.foExchange
        const lotsize = leg.lotsize ?? activeUnderlying.defaultLotSize
        const tick_size = leg.tick_size ?? 0.05
        symbolMetadataCache.set(`${leg.symbol.toUpperCase()}:${exch.toUpperCase()}`, {
          symbol: leg.symbol,
          exchange: exch,
          lotsize,
          tick_size,
        })
        persistFastCache()
        seedPaneDefaultStorage('scalper-p2', leg.symbol, exch, true)
        void terminalsRef.current['scalper-p2']?.ensureSymbol({
          symbol: leg.symbol,
          exchange: exch,
          lotsize,
          tick_size,
        })
      }
    },
    [enrichedChain, chain, activeUnderlying, selectedExpiry]
  )

  /* ── Funds & Live P&L Fetch ──────────────────────────────────────────── */
  const refreshFundsAndPnl = useCallback(async () => {
    if (!apiKey) return
    if (pnlRefreshRunning.current) {
      pnlRefreshAgain.current = true
      return
    }
    pnlRefreshRunning.current = true
    const scope = `${account}:${broker}:${appMode}:${pnlDay()}`
    try {
      const [fundsResult, posResult, tradesResult] = await Promise.allSettled([
        tradingApi.getFunds(apiKey),
        tradingApi.getPositions(apiKey),
        appMode === 'analyzer' ? tradingApi.getTrades(apiKey) : Promise.resolve(null),
      ])
      if (pnlScopeRef.current !== scope) return
      const fundsRes = fundsResult.status === 'fulfilled' ? fundsResult.value : null
      const posRes = posResult.status === 'fulfilled' ? posResult.value : null
      const tradesRes = tradesResult.status === 'fulfilled' ? tradesResult.value : null
      if (fundsRes?.status === 'success' && fundsRes.data) {
        const cash = Number(fundsRes.data.availablecash || 0)
        if (cash >= 1_00_00_000) {
          setMarginText(`₹${(cash / 1_00_00_000).toFixed(2)}Cr`)
        } else if (cash >= 1_00_000) {
          setMarginText(`₹${(cash / 1_00_000).toFixed(2)}L`)
        } else {
          setMarginText(`₹${cash.toLocaleString('en-IN', { maximumFractionDigits: 0 })}`)
        }
      } else setMarginText('—')
      if (
        posRes?.status === 'success' &&
        Array.isArray(posRes.data) &&
        (appMode === 'live' || (tradesRes?.status === 'success' && Array.isArray(tradesRes.data)))
      ) {
        setPositionSnapshot(posRes.data)
        setPositionSnapshotAt(Date.now())
        setTradeSnapshot(tradesRes?.data ?? [])
        setPnlSnapshotScope(scope)
      }
    } catch {
      /* Retain the last successful snapshot within this day and mode. */
    } finally {
      pnlRefreshRunning.current = false
      if (pnlRefreshAgain.current) {
        pnlRefreshAgain.current = false
        void pnlRefreshLatest.current?.()
      }
    }
  }, [apiKey, appMode, account, broker])
  pnlRefreshLatest.current = refreshFundsAndPnl

  useEffect(() => {
    void refreshFundsAndPnl()
    const timer = setInterval(() => void refreshFundsAndPnl(), 10_000)
    return () => clearInterval(timer)
  }, [refreshFundsAndPnl, pnlScope])
  useOrderEventRefresh(refreshFundsAndPnl, {
    enabled: Boolean(apiKey),
    delay: 250,
    events: ['order_event', 'analyzer_update', 'close_position_event'],
  })

  /* ── Ultra-Fast Order Placement (CE / PE) ────────────────────────────── */
  const executeQuickOrder = useCallback(
    async (
      leg: 'CE' | 'PE',
      action: 'BUY' | 'SELL',
      target: { symbol: string; exchange: string } | null,
      lots: number,
      customQty: number | null
    ) => {
      if (!apiKey) {
        showToast.error('API key not ready')
        return
      }
      if (!target?.symbol) {
        showToast.error(`Select a ${leg} option instrument first`)
        return
      }
      const terminal = terminalsRef.current[leg === 'CE' ? 'scalper-p1' : 'scalper-p2']
      const instrument = terminal?.currentInstrument()
      if (!terminal || !instrument || terminal.dataUnavailable()) {
        showToast.error(`Wait for the ${leg} chart instrument to finish loading`)
        return
      }
      if (instrument.symbol !== target.symbol || instrument.exchange !== target.exchange) {
        showToast.error(`${leg} instrument changed. Wait for the deck to update and try again.`)
        return
      }
      const lotSize = instrument.lotsize
      const qty = customQty ?? lots * lotSize
      if (
        !Number.isSafeInteger(qty) ||
        qty <= 0 ||
        !Number.isSafeInteger(lotSize) ||
        lotSize <= 0 ||
        qty % lotSize !== 0
      ) {
        showToast.error(
          `${leg} quantity must be a positive multiple of ${lotSize} (${lots} lots = ${lots * lotSize} quantity)`
        )
        return
      }
      const busyKey = `${leg}-${action}`
      setOrderBusy((prev) => ({ ...prev, [busyKey]: true }))
      const t0 = performance.now()
      try {
        const res = await tradingApi.placeOrder({
          apikey: apiKey,
          strategy: 'Scalper 915',
          symbol: target.symbol,
          exchange: target.exchange,
          action,
          quantity: qty,
          pricetype: 'MARKET',
          product,
        })
        const elapsed = Math.max(0.1, Number((performance.now() - t0).toFixed(1)))
        setLastOrderMs(elapsed)
        if (res.status === 'success') {
          showToast.success(
            `${action} ${qty} qty ${target.symbol} (${appMode === 'analyzer' ? 'SANDBOX' : 'LIVE'})`
          )
          void refreshFundsAndPnl()
        } else {
          showToast.error(res.message || `Failed to place ${action} ${leg} order`)
        }
      } catch (err) {
        const failure = err as { response?: { data?: { message?: string } }; message?: string }
        showToast.error(
          failure?.response?.data?.message || failure?.message || 'Order execution failed'
        )
      } finally {
        setOrderBusy((prev) => ({ ...prev, [busyKey]: false }))
      }
    },
    [apiKey, product, appMode, refreshFundsAndPnl]
  )

  const handleExitAll = useCallback(async () => {
    if (!apiKey) return
    setOrderBusy((prev) => ({ ...prev, exitAll: true }))
    try {
      await Promise.allSettled([tradingApi.closeAllPositions(), tradingApi.cancelAllOrders()])
      showToast.success('EXIT ALL executed — all positions & open orders flattened')
      void refreshFundsAndPnl()
    } catch (err) {
      showToast.error(err instanceof Error ? err.message : 'Exit All failed')
    } finally {
      setOrderBusy((prev) => ({ ...prev, exitAll: false }))
    }
  }, [apiKey, refreshFundsAndPnl])

  /* ── Dynamic Grid Layout Calculation ─────────────────────────────────── */
  const activePreset = useMemo((): LayoutPreset => {
    const activeCells: string[] = []
    if (visiblePanes.spot) activeCells.push('a')
    if (visiblePanes.ce) activeCells.push('b')
    if (visiblePanes.pe) activeCells.push('c')

    if (activeCells.length === 1) {
      const c = activeCells[0]
      return {
        id: `scalper-single-${c}`,
        label: 'Single',
        cols: '1fr',
        rows: '1fr',
        areas: `"${c}"`,
        cells: [c],
      }
    }
    if (activeCells.length === 2) {
      const [c1, c2] = activeCells
      return {
        id: `scalper-two-${c1}-${c2}`,
        label: '2 Columns',
        cols: '1fr 1fr',
        rows: '1fr',
        areas: `"${c1} ${c2}"`,
        cells: [c1, c2],
      }
    }
    return SCALPER_LAYOUTS[layoutMode]
  }, [visiblePanes, layoutMode])

  const storedWeights = useMemo(
    () => readGridWeights(localStorage, activePreset.id, presetWeights(activePreset)),
    [activePreset]
  )
  const [liveWeights, setLiveWeights] = useState<{ id: string; weights: GridWeights } | null>(null)
  const gridWeights = liveWeights?.id === activePreset.id ? liveWeights.weights : storedWeights
  const keepGridWeights = (weights: GridWeights) => {
    setLiveWeights({ id: activePreset.id, weights })
    writeGridWeights(localStorage, activePreset.id, weights, presetWeights(activePreset))
  }
  const sizedLayout: LayoutPreset = {
    ...activePreset,
    cols: tracksTemplate(gridWeights.columns),
    rows: tracksTemplate(gridWeights.rows),
  }

  /* ── Workspace Toolbar Controls (injected into ChartToolbar) ─────────── */
  const syncOn = sync.crosshair || sync.viewport || sync.symbol || sync.interval
  const syncPicker = (
    <DropdownMenu>
      <Tip
        tip={{
          title: syncOn ? 'Synced Crosshair & Charts ON' : 'Chart sync is off',
          sub: 'Link crosshair, time range, symbol or interval across SPOT, CE and PE',
        }}
      >
        <DropdownMenuTrigger asChild>
          <Button
            variant="outline"
            size="sm"
            className={cn(
              'h-8 shrink-0 gap-1.5 px-2.5 text-xs',
              syncOn && 'border-emerald-500/40 bg-emerald-500/10 text-emerald-400'
            )}
            aria-label="Chart sync"
          >
            <span
              className={cn(
                'h-2 w-2 rounded-full',
                sync.crosshair ? 'bg-emerald-400' : 'bg-muted-foreground'
              )}
            />
            <LinkIcon className="h-3.5 w-3.5" />
            <span className="hidden xl:inline">Synced Crosshair</span>
          </Button>
        </DropdownMenuTrigger>
      </Tip>
      <DropdownMenuContent align="start" className="w-56">
        <div className="px-2 pb-1 pt-1.5 text-[10px] font-medium uppercase tracking-wider text-muted-foreground/70">
          Sync across SPOT · CE · PE
        </div>
        {(
          [
            ['crosshair', 'Crosshair', 'Mirror the hovered bar across all 3 charts'],
            ['viewport', 'Time range', 'Mirror pan and zoom'],
            ['interval', 'Interval', 'Switch timeframe on SPOT, CE & PE together'],
            ['symbol', 'Symbol', 'Load the same instrument everywhere'],
          ] as const
        ).map(([key, label, hint]) => (
          <label
            key={key}
            className="flex w-full cursor-pointer items-start gap-2.5 rounded px-2 py-1.5 text-left transition-colors hover:bg-accent"
          >
            <TickBox
              checked={sync[key]}
              onChange={(next) => {
                if (key === 'symbol' || key === 'interval') stopWorkspaceReplay()
                setSync((p) => ({ ...p, [key]: next }))
              }}
              label={label}
              className="mt-0.5"
            />
            <span className="min-w-0 flex-1">
              <span className="block text-[13px] leading-5">{label}</span>
              <span className="block text-[11px] leading-4 text-muted-foreground">{hint}</span>
            </span>
          </label>
        ))}
        <div className="mt-1 border-t border-border/60 pt-1">
          <button
            type="button"
            onClick={() => {
              for (const id of ALL_PANE_IDS) {
                const t = terminalsRef.current[id]
                const chart = t?.liveChart()
                const len = chart?.dataLayer?.length ?? 0
                if (chart && len > 0) {
                  const to = len - 1 + 4
                  chart.setVisibleLogicalRange({
                    from: Math.max(-1, to - 100),
                    to,
                  })
                }
              }
            }}
            className="flex w-full items-center justify-center gap-1.5 rounded px-2 py-1.5 text-xs font-semibold text-primary hover:bg-primary/10 transition-colors"
          >
            Reset &amp; Fit All 3 Charts
          </button>
        </div>
      </DropdownMenuContent>
    </DropdownMenu>
  )

  const armedControl = (
    <Tip
      tip={{
        title: armed ? 'One-Click is ON' : 'One-Click is off',
        sub: armed
          ? 'Buy and Sell on the chart send a live order at once'
          : 'Buy and Sell on the chart open the order ticket first',
      }}
    >
      <label
        className={cn(
          'flex h-8 shrink-0 cursor-pointer select-none items-center gap-2 rounded-md border px-2 text-xs font-medium transition-colors',
          armed
            ? 'border-destructive/60 bg-destructive/10 text-destructive'
            : 'text-muted-foreground hover:bg-accent hover:text-foreground'
        )}
      >
        <Switch
          checked={armed}
          onCheckedChange={setArmed}
          aria-label="One-Click"
          className={cn(armed && 'data-[state=checked]:bg-destructive')}
        />
        <span className="whitespace-nowrap">
          <span className="hidden lg:inline">One-Click </span>
          {armed ? 'ON' : 'off'}
        </span>
      </label>
    </Tip>
  )

  const paneLabels: Record<ScalperPaneId, string> = {
    'scalper-p0': 'SPOT',
    'scalper-p1': 'CALL (CE)',
    'scalper-p2': 'PUT (PE)',
  }

  const chartSelector = (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="outline"
          size="sm"
          className="h-8 shrink-0 font-semibold text-xs"
          data-workspace-control
          aria-label={`Selected pane: ${paneLabels[focusedPane]}`}
        >
          {paneLabels[focusedPane]}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" data-workspace-control>
        {ALL_PANE_IDS.map((id) => (
          <DropdownMenuItem
            key={id}
            onSelect={() => focusPane(terminalsRef.current[id] ?? null, id)}
            className={cn(id === focusedPane && 'bg-primary/10 text-primary')}
          >
            {paneLabels[id]}
            {paneSymbols[id] ? ` · ${paneSymbols[id]}` : ''}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  )

  const workspaceControls = (
    <>
      <div className="mx-0.5 h-5 w-px shrink-0 bg-border" aria-hidden="true" />
      <IndicatorTemplates key={account} {...workspaceCatalog} target={panelTarget} />
      {armedControl}
      {syncPicker}
    </>
  )

  const alertsPaneId = paneAlerts[focusedPane]
    ? focusedPane
    : ((Object.keys(paneAlerts)[0] as ScalperPaneId | undefined) ?? focusedPane)
  const alertsPaneLabel = `${paneLabels[alertsPaneId] ?? 'Pane'}${
    paneSymbols[alertsPaneId] ? ` · ${paneSymbols[alertsPaneId]}` : ''
  }`

  const objectsPaneId = paneObjects[focusedPane]
    ? focusedPane
    : ((Object.keys(paneObjects)[0] as ScalperPaneId | undefined) ?? focusedPane)
  const objectsPaneLabel = `${paneLabels[objectsPaneId] ?? 'Pane'}${
    paneSymbols[objectsPaneId] ? ` · ${paneSymbols[objectsPaneId]}` : ''
  }`

  const railStats: DrawStats = {
    ...stats,
    tool,
    magnet: magnet !== 'off',
    magnetMode: magnet,
    stay,
  }

  const togglePaneVisibility = (key: 'spot' | 'ce' | 'pe') => {
    setMaximizedPane(null)
    setVisiblePanes((prev) => {
      const next = { ...prev, [key]: !prev[key] }
      // Never allow all 3 panes to be hidden simultaneously
      if (!next.spot && !next.ce && !next.pe) return prev
      return next
    })
  }

  return (
    <ChartOrderBridgeContext.Provider value={orderBridge}>
      <div className="scalper-workspace flex min-h-0 flex-1 flex-col overflow-hidden">
        {/* Optional full OpenAlgo Navbar (can be toggled with 1 click) */}
        {showMainNavbar && <Navbar fluid />}

        <ScalperHeader
          underlying={activeUnderlying}
          underlyings={UNDERLYINGS}
          exchange={spotActiveSym?.exchange ?? activeUnderlying.spotExchange}
          quote={activeIndexQuote}
          quotes={indexQuotesById}
          flashes={flashes}
          expiries={expiries}
          expiry={selectedExpiry}
          atmStrike={effectiveAtmStrike}
          maxPainStrike={maxPainStrike}
          activeView={
            showDockBar && dock === 'positions'
              ? 'positions'
              : showDockBar && dock === 'orders'
                ? 'orders'
                : 'scalper'
          }
          optionChainOpen={panel === 'options'}
          navigationVisible={showMainNavbar}
          sandbox={appMode === 'analyzer'}
          switchingMode={isTogglingMode}
          visiblePanes={visiblePanes}
          layout={layoutMode}
          margin={pnlSnapshotScope === pnlScope ? marginText : '—'}
          broker={broker}
          pnl={headerPnl.total}
          dayPnl={headerPnl}
          pnlValuationNote={appMode === 'live'
            ? `${broker.toUpperCase()} position ledger with current broker quotes. Open-position totals include partial exits. Before charges.`
            : pnlPrices.note}
          pnlDate={day}
          exiting={Boolean(orderBusy.exitAll)}
          onNavigationToggle={() => setShowMainNavbar((v) => !v)}
          onUnderlyingSelect={(id) => {
            const choice = UNDERLYINGS.find((u) => u.id === id)
            if (choice) handleSelectUnderlying(choice)
          }}
          onExpirySelect={setSelectedExpiry}
          onViewSelect={(view) => {
            if (view === 'scalper') {
              setShowDockBar(false)
              setDock(null)
              return
            }
            setDock(view)
            setShowDockBar((v) => (dock === view ? !v : true))
          }}
          onOptionChainToggle={() => setPanel((p) => (p === 'options' ? null : 'options'))}
          onModeToggle={() => void toggleAppMode()}
          onPaneToggle={togglePaneVisibility}
          onLayoutSelect={(layout) => {
            setMaximizedPane(null)
            setLayoutMode(layout)
          }}
          onExitAll={() => void handleExitAll()}
        />

        {/* ═══ MAIN WORKSPACE CONTAINER ═════════════════════════════════════ */}
        <div className="flex flex-1 flex-col overflow-hidden">
          {/* Shared SDK ChartToolbar Host (portalled from focused ChartPane) */}
          <div ref={setToolbarHost} className="min-w-0 shrink-0" data-workspace-toolbar />

          <main className="flex min-h-0 flex-1">
            {/* Left DrawingRail (Original SDK component from Trading.tsx) */}
            {showRail && apiKey && wsUrl && (
              <DrawingRail
                stats={railStats}
                latched={latched}
                onPick={pickTool}
                onUndo={() => act((t) => t.historyPress('undo'))}
                onRedo={() => act((t) => t.historyPress('redo'))}
                onDeleteSelected={() => act((t) => t.removeDrawings(false))}
                onRemoveAll={() => act((t) => t.requestRemoveAllDrawings())}
                onSelectAll={() => act((t) => t.selectAllDrawings())}
                onHideSelected={() => act((t) => t.hideSelectedDrawings())}
                onLockSelected={() => act((t) => t.styleSelectedDrawing({ locked: true }))}
                onMagnet={(v) => {
                  setMagnet(v)
                  for (const t of Object.values(terminalsRef.current)) t?.setMagnet(v)
                }}
                onStay={(v) => {
                  setStay(v)
                  for (const t of Object.values(terminalsRef.current)) t?.setDrawStay(v)
                }}
                onShortcut={onDrawKey}
              />
            )}

            {/* Center 3-Pane Chart Grid + ChartBottomBar */}
            <div className="relative min-h-0 min-w-0 flex-1">
              {noApiKey ? (
                <div className="flex h-full flex-col items-center justify-center gap-2 text-center">
                  <p className="text-sm text-muted-foreground">No API key found for charting.</p>
                  <a href="/apikey" className="text-sm font-medium text-primary underline">
                    Generate an API key
                  </a>
                </div>
              ) : apiKey && wsUrl && linkGroup ? (
                <div className="relative h-full">
                  <div className="absolute inset-x-0 top-0" style={{ bottom: BOTTOM_BAR_PX }}>
                    <div
                      className="scalper-chart-grid grid h-full min-h-0"
                      style={
                        maximizedPane
                          ? {
                              gridTemplateColumns: '1fr',
                              gridTemplateRows: '1fr',
                              gridTemplateAreas: '"max"',
                            }
                          : {
                              gridTemplateColumns: sizedLayout.cols,
                              gridTemplateRows: sizedLayout.rows,
                              gridTemplateAreas: activePreset.areas,
                            }
                      }
                    >
                      {/* ── PANE 0: SPOT (NIFTY 50 / INDEX) ─────────────────── */}
                      {visiblePanes.spot && (!maximizedPane || maximizedPane === 'scalper-p0') && (
                        <div
                          style={{ gridArea: maximizedPane ? 'max' : 'a' }}
                          className="scalper-chart-card flex min-h-0 min-w-0 flex-col overflow-hidden"
                          data-focused={focusedPane === 'scalper-p0'}
                        >
                          <ScalperPaneHeader
                            side="spot"
                            symbol={spotActiveSym?.symbol ?? activeUnderlying.label}
                            exchange={spotActiveSym?.exchange ?? activeUnderlying.spotExchange}
                            focused={focusedPane === 'scalper-p0'}
                            maximized={maximizedPane === 'scalper-p0'}
                            state={paneLoadStates['scalper-p0']}
                            onFocus={() =>
                              focusPane(terminalsRef.current['scalper-p0'] ?? null, 'scalper-p0')
                            }
                            onMaximize={() =>
                              setMaximizedPane((m) => (m === 'scalper-p0' ? null : 'scalper-p0'))
                            }
                          />

                          <div className="relative flex-1 min-h-0">
                            <ChartPane
                              paneId="scalper-p0"
                              paneLabel="SPOT Chart"
                              toolbarHost={toolbarHost}
                              focused={focusedPane === 'scalper-p0'}
                              chartSelector={chartSelector}
                              apiKey={apiKey}
                              wsUrl={wsUrl}
                              style={{ height: '100%', border: 'none', borderRadius: 0 }}
                              sharedTool={tool}
                              sharedMagnet={magnet}
                              sharedStay={stay}
                              sharedLatch={latched}
                              onReplayStart={startWorkspaceReplay}
                              workspaceReplay={replaySnapshot}
                              onBeforeSourceChange={stopWorkspaceReplay}
                              onFocusPane={focusPane}
                              onSymbolChange={noteSymbol}
                              onIntervalChange={noteChartChanged}
                              onTerminalChange={noteTerminal}
                              onChartStateChange={noteLoadState}
                              onObjectsChange={noteObjects}
                              onOpenScriptSource={showScriptSource}
                              onAlertsReady={noteAlerts}
                              onAlertFired={noteAlertFired}
                              onAlertsChanged={() => setAlertRevision((n) => n + 1)}
                              onDrawStats={onPaneDrawStats}
                              onToggleRail={() => setShowRail((v) => !v)}
                              railVisible={showRail}
                              linkGroup={linkGroup}
                              armed={armed}
                              layoutPicker={workspaceControls}
                            />
                          </div>
                        </div>
                      )}

                      {/* ── PANE 1: CALL / CE ───────────────────────────────── */}
                      {visiblePanes.ce && (!maximizedPane || maximizedPane === 'scalper-p1') && (
                        <div
                          style={{ gridArea: maximizedPane ? 'max' : 'b' }}
                          className="scalper-chart-card flex min-h-0 min-w-0 flex-col overflow-hidden"
                          data-focused={focusedPane === 'scalper-p1'}
                        >
                          <ScalperPaneHeader
                            side="ce"
                            symbol={formatTradingSymbol(ceActiveSym?.symbol) || 'Select CE'}
                            exchange={ceActiveSym?.exchange ?? activeUnderlying.foExchange}
                            focused={focusedPane === 'scalper-p1'}
                            maximized={maximizedPane === 'scalper-p1'}
                            state={paneLoadStates['scalper-p1']}
                            onFocus={() =>
                              focusPane(terminalsRef.current['scalper-p1'] ?? null, 'scalper-p1')
                            }
                            onMaximize={() =>
                              setMaximizedPane((m) => (m === 'scalper-p1' ? null : 'scalper-p1'))
                            }
                          />

                          <div className="relative flex-1 min-h-0">
                            <ChartPane
                              paneId="scalper-p1"
                              paneLabel="CALL (CE) Chart"
                              toolbarHost={toolbarHost}
                              focused={focusedPane === 'scalper-p1'}
                              chartSelector={chartSelector}
                              apiKey={apiKey}
                              wsUrl={wsUrl}
                              style={{ height: '100%', border: 'none', borderRadius: 0 }}
                              sharedTool={tool}
                              sharedMagnet={magnet}
                              sharedStay={stay}
                              sharedLatch={latched}
                              onReplayStart={startWorkspaceReplay}
                              workspaceReplay={replaySnapshot}
                              onBeforeSourceChange={stopWorkspaceReplay}
                              onFocusPane={focusPane}
                              onSymbolChange={noteSymbol}
                              onIntervalChange={noteChartChanged}
                              onTerminalChange={noteTerminal}
                              onChartStateChange={noteLoadState}
                              onObjectsChange={noteObjects}
                              onOpenScriptSource={showScriptSource}
                              onAlertsReady={noteAlerts}
                              onAlertFired={noteAlertFired}
                              onAlertsChanged={() => setAlertRevision((n) => n + 1)}
                              onDrawStats={onPaneDrawStats}
                              onToggleRail={() => setShowRail((v) => !v)}
                              railVisible={showRail}
                              linkGroup={linkGroup}
                              armed={armed}
                              externalQty={ceLots}
                              onQtyChange={(_, nextLots) => {
                                setCeCustomQty(null)
                                setCeLots(Math.max(1, nextLots))
                              }}
                              defaultProduct={product}
                              onProductChange={(_, nextProd) => {
                                if (nextProd === 'NRML' || nextProd === 'MIS') {
                                  setProduct(nextProd)
                                }
                              }}
                              onTradeQtyClick={() => {
                                setCeChartQtyFocused(true)
                                setTimeout(() => ceChartQtyInputRef.current?.select(), 0)
                              }}
                              layoutPicker={workspaceControls}
                              defaultVolumeVisible={false}
                            />

                            {/* Editable Middle Lot/Qty Box between On-Chart SELL and BUY buttons */}
                            <div
                              style={{
                                position: 'absolute',
                                // BuySellButtons uses margin 16/52 and scale .8:
                                // SELL=59.2px, qty starts at 76.2px and is 32px wide.
                                // Keep the editor exactly over that canvas chip.
                                left: '76px',
                                top: '52px',
                                width: '32px',
                                height: '34px',
                                zIndex: 12,
                              }}
                              onClick={(e) => e.stopPropagation()}
                              onMouseDown={(e) => e.stopPropagation()}
                              onWheel={(e) => {
                                e.preventDefault()
                                e.stopPropagation()
                                const delta = e.deltaY < 0 ? 1 : -1
                                setCeCustomQty(null)
                                setCeLots((l) => Math.max(1, l + delta))
                              }}
                              title={`Click to edit CE Lots / Quantity (${ceLots}L = ${ceOrderQty} Qty · ${product})`}
                            >
                              <input
                                ref={ceChartQtyInputRef}
                                type="text"
                                inputMode="numeric"
                                aria-label="Edit CE Chart Lots"
                                value={
                                  ceChartQtyFocused ? (ceLotsText ?? String(ceLots)) : `${ceLots}L`
                                }
                                onFocus={(e) => {
                                  setCeChartQtyFocused(true)
                                  setCeLotsText(String(ceLots))
                                  e.currentTarget.select()
                                }}
                                onChange={(e) => {
                                  const raw = e.target.value.replace(/[^0-9]/g, '')
                                  setCeLotsText(raw)
                                  const num = parseInt(raw, 10)
                                  if (Number.isFinite(num) && num >= 1) {
                                    setCeCustomQty(null)
                                    setCeLots(num)
                                  }
                                }}
                                onBlur={() => {
                                  const num = parseInt(ceLotsText ?? '', 10)
                                  const safe =
                                    Number.isFinite(num) && num >= 1 ? num : Math.max(1, ceLots)
                                  setCeLots(safe)
                                  setCeLotsText(null)
                                  setTimeout(() => setCeChartQtyFocused(false), 140)
                                }}
                                onKeyDown={(e) => {
                                  e.stopPropagation()
                                  if (e.key === 'Enter' || e.key === 'Escape') {
                                    e.currentTarget.blur()
                                  } else if (e.key === 'ArrowUp') {
                                    e.preventDefault()
                                    setCeCustomQty(null)
                                    setCeLots((l) => {
                                      const next = l + 1
                                      setCeLotsText(String(next))
                                      return next
                                    })
                                  } else if (e.key === 'ArrowDown') {
                                    e.preventDefault()
                                    setCeCustomQty(null)
                                    setCeLots((l) => {
                                      const next = Math.max(1, l - 1)
                                      setCeLotsText(String(next))
                                      return next
                                    })
                                  }
                                }}
                                className={cn(
                                  'h-full w-full cursor-text select-all rounded-[4px] border text-center font-mono text-[10px] font-bold transition-colors focus:outline-none',
                                  ceChartQtyFocused
                                    ? 'border-[#10a37f] bg-white text-[#0d0d0d] ring-1 ring-[#10a37f]/50 dark:bg-[#171717] dark:text-white'
                                    : 'border-black/15 bg-white/95 text-[#0d0d0d] hover:border-black/30 hover:bg-[#f4f4f4] dark:border-white/15 dark:bg-[#171717]/90 dark:text-[#ececec] dark:hover:border-white/35 dark:hover:bg-[#242424]'
                                )}
                              />
                            </div>

                            {/* Quick Lot & Qty Editor Bar right underneath [SELL] [Lots] [BUY] when focused */}
                            {false && ceChartQtyFocused && (
                              <div
                                style={{
                                  position: 'absolute',
                                  left: '114px',
                                  top: '52px',
                                  zIndex: 20,
                                }}
                                onMouseDown={(e) => {
                                  e.preventDefault()
                                  e.stopPropagation()
                                }}
                                onClick={(e) => e.stopPropagation()}
                                className="flex items-center gap-1.5 rounded-md border border-border bg-popover/95 px-2 py-1 text-[11px] font-mono text-popover-foreground shadow-lg backdrop-blur-md"
                              >
                                <button
                                  type="button"
                                  onClick={() => {
                                    setCeCustomQty(null)
                                    setCeLots((l) => {
                                      const next = Math.max(1, l - 1)
                                      setCeLotsText(String(next))
                                      return next
                                    })
                                  }}
                                  className="flex h-5 w-5 items-center justify-center rounded border border-border/70 bg-muted/50 font-bold hover:bg-muted"
                                >
                                  −
                                </button>
                                <span className="text-[10px] text-muted-foreground">
                                  {ceLots}L ={' '}
                                  <strong className="text-foreground">{ceOrderQty}</strong> Q
                                </span>
                                <button
                                  type="button"
                                  onClick={() => {
                                    setCeCustomQty(null)
                                    setCeLots((l) => {
                                      const next = l + 1
                                      setCeLotsText(String(next))
                                      return next
                                    })
                                  }}
                                  className="flex h-5 w-5 items-center justify-center rounded border border-border/70 bg-muted/50 font-bold hover:bg-muted"
                                >
                                  +
                                </button>
                                <div className="mx-0.5 h-3.5 w-px bg-border" />
                                {[1, 2, 5, 10].map((presetLot) => (
                                  <button
                                    key={presetLot}
                                    type="button"
                                    onClick={() => {
                                      setCeCustomQty(null)
                                      setCeLots(presetLot)
                                      setCeLotsText(String(presetLot))
                                      setCeChartQtyFocused(false)
                                    }}
                                    className={cn(
                                      'rounded px-1.5 py-0.5 text-[10px] font-semibold transition-colors',
                                      ceLots === presetLot
                                        ? 'bg-primary text-primary-foreground'
                                        : 'bg-muted/60 text-muted-foreground hover:bg-muted hover:text-foreground'
                                    )}
                                  >
                                    {presetLot}L
                                  </button>
                                ))}
                                <span className="ml-0.5 rounded bg-[#10a37f]/15 px-1 py-0.5 text-[9px] font-bold text-[#0d8a6a] dark:text-[#34d399]">
                                  {product}
                                </span>
                              </div>
                            )}
                          </div>
                        </div>
                      )}

                      {/* ── PANE 2: PUT / PE ────────────────────────────────── */}
                      {visiblePanes.pe && (!maximizedPane || maximizedPane === 'scalper-p2') && (
                        <div
                          style={{ gridArea: maximizedPane ? 'max' : 'c' }}
                          className="scalper-chart-card flex min-h-0 min-w-0 flex-col overflow-hidden"
                          data-focused={focusedPane === 'scalper-p2'}
                        >
                          <ScalperPaneHeader
                            side="pe"
                            symbol={formatTradingSymbol(peActiveSym?.symbol) || 'Select PE'}
                            exchange={peActiveSym?.exchange ?? activeUnderlying.foExchange}
                            focused={focusedPane === 'scalper-p2'}
                            maximized={maximizedPane === 'scalper-p2'}
                            state={paneLoadStates['scalper-p2']}
                            onFocus={() =>
                              focusPane(terminalsRef.current['scalper-p2'] ?? null, 'scalper-p2')
                            }
                            onMaximize={() =>
                              setMaximizedPane((m) => (m === 'scalper-p2' ? null : 'scalper-p2'))
                            }
                          />

                          <div className="relative flex-1 min-h-0">
                            <ChartPane
                              paneId="scalper-p2"
                              paneLabel="PUT (PE) Chart"
                              toolbarHost={toolbarHost}
                              focused={focusedPane === 'scalper-p2'}
                              chartSelector={chartSelector}
                              apiKey={apiKey}
                              wsUrl={wsUrl}
                              style={{ height: '100%', border: 'none', borderRadius: 0 }}
                              sharedTool={tool}
                              sharedMagnet={magnet}
                              sharedStay={stay}
                              sharedLatch={latched}
                              onReplayStart={startWorkspaceReplay}
                              workspaceReplay={replaySnapshot}
                              onBeforeSourceChange={stopWorkspaceReplay}
                              onFocusPane={focusPane}
                              onSymbolChange={noteSymbol}
                              onIntervalChange={noteChartChanged}
                              onTerminalChange={noteTerminal}
                              onChartStateChange={noteLoadState}
                              onObjectsChange={noteObjects}
                              onOpenScriptSource={showScriptSource}
                              onAlertsReady={noteAlerts}
                              onAlertFired={noteAlertFired}
                              onAlertsChanged={() => setAlertRevision((n) => n + 1)}
                              onDrawStats={onPaneDrawStats}
                              onToggleRail={() => setShowRail((v) => !v)}
                              railVisible={showRail}
                              linkGroup={linkGroup}
                              armed={armed}
                              externalQty={peLots}
                              onQtyChange={(_, nextLots) => {
                                setPeCustomQty(null)
                                setPeLots(Math.max(1, nextLots))
                              }}
                              defaultProduct={product}
                              onProductChange={(_, nextProd) => {
                                if (nextProd === 'NRML' || nextProd === 'MIS') {
                                  setProduct(nextProd)
                                }
                              }}
                              onTradeQtyClick={() => {
                                setPeChartQtyFocused(true)
                                setTimeout(() => peChartQtyInputRef.current?.select(), 0)
                              }}
                              layoutPicker={workspaceControls}
                              defaultVolumeVisible={false}
                            />

                            {/* Editable Middle Lot/Qty Box between On-Chart SELL and BUY buttons */}
                            <div
                              style={{
                                position: 'absolute',
                                // Keep the PE editor aligned with the same
                                // on-chart SELL / quantity / BUY geometry.
                                left: '76px',
                                top: '52px',
                                width: '32px',
                                height: '34px',
                                zIndex: 12,
                              }}
                              onClick={(e) => e.stopPropagation()}
                              onMouseDown={(e) => e.stopPropagation()}
                              onWheel={(e) => {
                                e.preventDefault()
                                e.stopPropagation()
                                const delta = e.deltaY < 0 ? 1 : -1
                                setPeCustomQty(null)
                                setPeLots((l) => Math.max(1, l + delta))
                              }}
                              title={`Click to edit PE Lots / Quantity (${peLots}L = ${peOrderQty} Qty · ${product})`}
                            >
                              <input
                                ref={peChartQtyInputRef}
                                type="text"
                                inputMode="numeric"
                                aria-label="Edit PE Chart Lots"
                                value={
                                  peChartQtyFocused ? (peLotsText ?? String(peLots)) : `${peLots}L`
                                }
                                onFocus={(e) => {
                                  setPeChartQtyFocused(true)
                                  setPeLotsText(String(peLots))
                                  e.currentTarget.select()
                                }}
                                onChange={(e) => {
                                  const raw = e.target.value.replace(/[^0-9]/g, '')
                                  setPeLotsText(raw)
                                  const num = parseInt(raw, 10)
                                  if (Number.isFinite(num) && num >= 1) {
                                    setPeCustomQty(null)
                                    setPeLots(num)
                                  }
                                }}
                                onBlur={() => {
                                  const num = parseInt(peLotsText ?? '', 10)
                                  const safe =
                                    Number.isFinite(num) && num >= 1 ? num : Math.max(1, peLots)
                                  setPeLots(safe)
                                  setPeLotsText(null)
                                  setTimeout(() => setPeChartQtyFocused(false), 140)
                                }}
                                onKeyDown={(e) => {
                                  e.stopPropagation()
                                  if (e.key === 'Enter' || e.key === 'Escape') {
                                    e.currentTarget.blur()
                                  } else if (e.key === 'ArrowUp') {
                                    e.preventDefault()
                                    setPeCustomQty(null)
                                    setPeLots((l) => {
                                      const next = l + 1
                                      setPeLotsText(String(next))
                                      return next
                                    })
                                  } else if (e.key === 'ArrowDown') {
                                    e.preventDefault()
                                    setPeCustomQty(null)
                                    setPeLots((l) => {
                                      const next = Math.max(1, l - 1)
                                      setPeLotsText(String(next))
                                      return next
                                    })
                                  }
                                }}
                                className={cn(
                                  'h-full w-full cursor-text select-all rounded-[4px] border text-center font-mono text-[10px] font-bold transition-colors focus:outline-none',
                                  peChartQtyFocused
                                    ? 'border-[#ef5350] bg-white text-[#0d0d0d] ring-1 ring-[#ef5350]/50 dark:bg-[#171717] dark:text-white'
                                    : 'border-black/15 bg-white/95 text-[#0d0d0d] hover:border-black/30 hover:bg-[#f4f4f4] dark:border-white/15 dark:bg-[#171717]/90 dark:text-[#ececec] dark:hover:border-white/35 dark:hover:bg-[#242424]'
                                )}
                              />
                            </div>

                            {/* Quick Lot & Qty Editor Bar right underneath [SELL] [Lots] [BUY] when focused */}
                            {false && peChartQtyFocused && (
                              <div
                                style={{
                                  position: 'absolute',
                                  left: '114px',
                                  top: '52px',
                                  zIndex: 20,
                                }}
                                onMouseDown={(e) => {
                                  e.preventDefault()
                                  e.stopPropagation()
                                }}
                                onClick={(e) => e.stopPropagation()}
                                className="flex items-center gap-1.5 rounded-md border border-border bg-popover/95 px-2 py-1 text-[11px] font-mono text-popover-foreground shadow-lg backdrop-blur-md"
                              >
                                <button
                                  type="button"
                                  onClick={() => {
                                    setPeCustomQty(null)
                                    setPeLots((l) => {
                                      const next = Math.max(1, l - 1)
                                      setPeLotsText(String(next))
                                      return next
                                    })
                                  }}
                                  className="flex h-5 w-5 items-center justify-center rounded border border-border/70 bg-muted/50 font-bold hover:bg-muted"
                                >
                                  −
                                </button>
                                <span className="text-[10px] text-muted-foreground">
                                  {peLots}L ={' '}
                                  <strong className="text-foreground">{peOrderQty}</strong> Q
                                </span>
                                <button
                                  type="button"
                                  onClick={() => {
                                    setPeCustomQty(null)
                                    setPeLots((l) => {
                                      const next = l + 1
                                      setPeLotsText(String(next))
                                      return next
                                    })
                                  }}
                                  className="flex h-5 w-5 items-center justify-center rounded border border-border/70 bg-muted/50 font-bold hover:bg-muted"
                                >
                                  +
                                </button>
                                <div className="mx-0.5 h-3.5 w-px bg-border" />
                                {[1, 2, 5, 10].map((presetLot) => (
                                  <button
                                    key={presetLot}
                                    type="button"
                                    onClick={() => {
                                      setPeCustomQty(null)
                                      setPeLots(presetLot)
                                      setPeLotsText(String(presetLot))
                                      setPeChartQtyFocused(false)
                                    }}
                                    className={cn(
                                      'rounded px-1.5 py-0.5 text-[10px] font-semibold transition-colors',
                                      peLots === presetLot
                                        ? 'bg-primary text-primary-foreground'
                                        : 'bg-muted/60 text-muted-foreground hover:bg-muted hover:text-foreground'
                                    )}
                                  >
                                    {presetLot}L
                                  </button>
                                ))}
                                <span className="ml-0.5 rounded bg-[#10a37f]/15 px-1 py-0.5 text-[9px] font-bold text-[#0d8a6a] dark:text-[#34d399]">
                                  {product}
                                </span>
                              </div>
                            )}
                          </div>
                        </div>
                      )}
                    </div>

                    {/* Draggable Grid Dividers between SPOT, CE and PE */}
                    {!maximizedPane && activePreset.cells.length > 1 && (
                      <GridDividers
                        key={activePreset.id}
                        cells={parseAreas(activePreset.areas)}
                        weights={gridWeights}
                        onChange={(weights) => setLiveWeights({ id: activePreset.id, weights })}
                        onCommit={keepGridWeights}
                        onReset={() => keepGridWeights(presetWeights(activePreset))}
                      />
                    )}

                    {/* Workspace Replay Bar */}
                    <WorkspaceReplayBar
                      snapshot={replaySnapshot}
                      error={replayError}
                      ownerLabel={
                        replaySnapshot.ownerId
                          ? (paneSymbols[replaySnapshot.ownerId] ?? replaySnapshot.ownerId)
                          : undefined
                      }
                      onScopeChange={(scope) => replayCoordinator.current?.setScope(scope)}
                      onPlay={(speed) => replayCoordinator.current?.play(speed)}
                      onPause={() => replayCoordinator.current?.pause()}
                      onStep={() => replayCoordinator.current?.step()}
                      onStepBack={() => replayCoordinator.current?.stepBack()}
                      onSeek={(index) => replayCoordinator.current?.seek(index)}
                      onStop={requestReplayExit}
                      confirmExit={confirmReplayExit}
                      onCancelExit={() => setConfirmReplayExit(false)}
                      onConfirmExit={stopWorkspaceReplay}
                      pick={replayPick}
                      interval={
                        replaySnapshot.ownerId
                          ? terminalsRef.current[replaySnapshot.ownerId]?.currentInterval()
                          : undefined
                      }
                    />
                  </div>

                  {/* Original SDK ChartBottomBar */}
                  <ChartBottomBar
                    pane={panelTarget}
                    panes={() =>
                      Object.values(terminalsRef.current).filter(
                        (terminal): terminal is TradingTerminal => terminal !== null
                      )
                    }
                    focusKey={focusedPane}
                    control={bottomBar}
                  />
                </div>
              ) : (
                <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
                  Loading Scalper 915 terminal…
                </div>
              )}
            </div>

            {/* ── Right Side Panels (All Original SDK Panels from Trading.tsx) ─ */}
            {apiKey && wsUrl && panel === 'watchlist' && (
              <Suspense fallback={null}>
                <WatchlistPanel
                  apiKey={apiKey}
                  onPick={sendToSmartPane}
                  search={searchFromFocusedPane}
                  activeSymbol={paneSymbols[focusedPane] ?? null}
                />
              </Suspense>
            )}
            {apiKey && wsUrl && panel === 'options' && (
              <Suspense fallback={null}>
                <OptionChainPanel
                  apiKey={apiKey}
                  onPick={sendToSmartPane}
                  activeSymbol={paneSymbols[focusedPane] ?? null}
                />
              </Suspense>
            )}
            {apiKey && wsUrl && panel === 'agent' && (
              <Suspense fallback={null}>
                <AgentPanel
                  getChartContext={readChartContext}
                  onChartCommand={applyChartCommands}
                  onCaptureChart={captureChart}
                />
              </Suspense>
            )}
            {apiKey && wsUrl && panel === 'alerts' && (
              <Suspense fallback={null}>
                <AlertsPanel
                  view={paneAlerts[alertsPaneId] ?? null}
                  log={alertLog}
                  paneLabel={alertsPaneLabel}
                  onEdit={openAlertEditor}
                  onClearLog={clearAlertLog}
                  revision={alertRevision}
                />
              </Suspense>
            )}
            {apiKey && wsUrl && panel === 'objects' && (
              <ObjectsPanel
                model={paneObjects[objectsPaneId] ?? null}
                paneLabel={objectsPaneLabel}
              />
            )}
            {apiKey && wsUrl && panel === 'data' && (
              <Suspense fallback={null}>
                <DataWindowPanel
                  chart={
                    paneObjects[objectsPaneId]
                      ? (terminalsRef.current[objectsPaneId]?.liveChart() ?? null)
                      : null
                  }
                  paneLabel={objectsPaneLabel}
                />
              </Suspense>
            )}
            {apiKey && wsUrl && panel === 'strategies' && (
              <Suspense fallback={null}>
                <StrategiesPanel getChartContext={readChartContext} />
              </Suspense>
            )}
            {apiKey && wsUrl && panel === 'backtest' && (
              <BacktestPanel
                apiKey={apiKey}
                getChartContext={readChartContext}
                chartRevision={chartRevision}
                onMarkChart={(markers, owner) => {
                  const marked = backtestMarked.current
                  const target = markers.length > 0 ? panelTarget() : (marked ?? panelTarget())
                  if (marked && marked !== target) marked.setBacktestMarkers([])
                  const ok =
                    target?.setBacktestMarkers(
                      markers as never,
                      owner
                        ? { indicatorId: idForScript(owner.file), onCleared: owner.onCleared }
                        : null
                    ) ?? false
                  backtestMarked.current = ok && markers.length > 0 ? target : null
                  return ok
                }}
                runFile={backtestFile}
                onRan={() => setBacktestFile(null)}
              />
            )}
            {apiKey && wsUrl && panel === 'scripts' && (
              <Suspense fallback={null}>
                <ScriptPanel
                  onAddToChart={(indicatorId) => {
                    const target = panelTarget()
                    if (!target) return false
                    void target.addIndicatorById(indicatorId)
                    return true
                  }}
                  openFile={scriptSource}
                  onOpened={() => setScriptSource(null)}
                  onBacktest={(file) => {
                    const pane = panelTarget()
                    if (!pane) return false
                    void pane.addIndicatorById(idForScript(file))
                    setBacktestFile(file)
                    setPanel('backtest')
                    return true
                  }}
                />
              </Suspense>
            )}

            {/* Original SDK RightRail */}
            {apiKey && wsUrl && <RightRail active={panel} onSelect={setPanel} />}
          </main>

          {/* Original SDK Bottom TradingDock (Orders, Positions, Trades, GTT) */}
          {apiKey && wsUrl && showDockBar && (
            <TradingDock
              tab={dock}
              onTabChange={(next) => {
                setDock(next)
                if (!next) setShowDockBar(false)
              }}
              apiKey={apiKey}
              onPick={sendToSmartPane}
              activeSymbol={paneSymbols[focusedPane] ?? null}
              tradingLocked={tradingLocked}
              bridge={orderBridge}
            />
          )}

          {/* Contract selection and order execution */}
          <footer className="scalper-execution-bar">
            {/* CALL contract and execution controls */}
            <div className="scalper-order-cluster" data-option-side="CE">
              {/* Call contract selector */}
              <ScalperStrikePicker
                side="CE"
                choices={enrichedChain.map((row) => ({
                  strike: row.strike,
                  symbol: row.ce?.symbol || '',
                  price: row.ce?.ltp,
                  openInterest: row.ce?.oi,
                  label: row.ce?.tag,
                  direction: row.ce?.symbol ? flashes[row.ce.symbol] : undefined,
                }))}
                value={ceStrike}
                atmStrike={effectiveAtmStrike}
                expiry={selectedExpiry}
                open={ceChainOpen}
                onOpenChange={setCeChainOpen}
                onSelect={handleSelectCeStrike}
                loading={isOptionChainLoading}
                streaming={isOptionChainStreaming}
                marketOpen={isMarketOpen(activeUnderlying.spotExchange)}
                onRefresh={() => {
                  void refetchOptionChain()
                }}
                onFullChain={() => setPanel('options')}
              />

              {/* Call market order actions */}
              <ScalperOrderButton
                side="CE" action="BUY" apiKey={apiKey}
                scope={`${account}:${broker}:${appMode}`} sandbox={appMode === 'analyzer'}
                contract={ceActiveSym} quantity={ceOrderQty} product={product}
                disabled={orderBusy['CE-BUY']}
                onClick={() =>
                  void executeQuickOrder('CE', 'BUY', ceActiveSym, ceLots, ceCustomQty)
                }
              />

              {/* Editable call size */}
              <div
                className="scalper-quantity-control"
                onWheel={(e) => {
                  e.preventDefault()
                  const delta = e.deltaY < 0 ? 1 : -1
                  setCeCustomQty(null)
                  setCeLots((l) => Math.max(1, l + delta))
                }}
                title="Edit CE Lots (L) or Quantity (Q) directly between Buy & Sell"
              >
                <button
                  type="button"
                  onClick={() => {
                    setCeCustomQty(null)
                    setCeLotsText(null)
                    setCeQtyText(null)
                    setCeLots((l) => Math.max(1, l - 1))
                  }}
                  className="scalper-step-button"
                  title="Decrease 1 CE lot"
                >
                  −
                </button>

                {/* Direct Editable Lots Input */}
                <div className="flex items-center gap-0.5">
                  <input
                    type="text"
                    inputMode="numeric"
                    aria-label="CE Lots"
                    value={ceLotsText ?? String(ceLots)}
                    onFocus={(e) => {
                      setCeLotsText(String(ceLots))
                      e.currentTarget.select()
                    }}
                    onChange={(e) => {
                      const raw = e.target.value.replace(/[^0-9]/g, '')
                      setCeLotsText(raw)
                      const num = parseInt(raw, 10)
                      if (Number.isFinite(num) && num >= 1) {
                        setCeCustomQty(null)
                        setCeLots(num)
                      }
                    }}
                    onBlur={() => {
                      const num = parseInt(ceLotsText ?? '', 10)
                      const safe = Number.isFinite(num) && num >= 1 ? num : Math.max(1, ceLots)
                      setCeLots(safe)
                      setCeLotsText(null)
                    }}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') e.currentTarget.blur()
                      else if (e.key === 'ArrowUp') {
                        e.preventDefault()
                        setCeCustomQty(null)
                        setCeLots((l) => {
                          const next = l + 1
                          setCeLotsText(String(next))
                          return next
                        })
                      } else if (e.key === 'ArrowDown') {
                        e.preventDefault()
                        setCeCustomQty(null)
                        setCeLots((l) => {
                          const next = Math.max(1, l - 1)
                          setCeLotsText(String(next))
                          return next
                        })
                      }
                    }}
                    className="scalper-lots-input"
                  />
                  <span className="scalper-quantity-unit">lots</span>
                </div>

                {/* Direct Editable Quantity Input */}
                <div className="scalper-total-quantity">
                  <input
                    type="text"
                    inputMode="numeric"
                    aria-label="CE Quantity"
                    value={ceQtyText ?? String(ceOrderQty)}
                    onFocus={(e) => {
                      setCeQtyText(String(ceOrderQty))
                      e.currentTarget.select()
                    }}
                    onChange={(e) => {
                      const raw = e.target.value.replace(/[^0-9]/g, '')
                      setCeQtyText(raw)
                      const num = parseInt(raw, 10)
                      if (Number.isFinite(num) && num >= 1) {
                        setCeCustomQty(num)
                        setCeLots(Math.max(1, Math.round(num / ceLotSize)))
                      }
                    }}
                    onBlur={() => {
                      const num = parseInt(ceQtyText ?? '', 10)
                      if (Number.isFinite(num) && num >= 1) {
                        setCeCustomQty(num)
                        setCeLots(Math.max(1, Math.round(num / ceLotSize)))
                      }
                      setCeQtyText(null)
                    }}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') e.currentTarget.blur()
                    }}
                    className="scalper-qty-input"
                  />
                  <span>qty</span>
                </div>

                <button
                  type="button"
                  onClick={() => {
                    setCeCustomQty(null)
                    setCeLotsText(null)
                    setCeQtyText(null)
                    setCeLots((l) => l + 1)
                  }}
                  className="scalper-step-button"
                  title="Increase 1 CE lot"
                >
                  +
                </button>
              </div>

              <ScalperOrderButton
                side="CE" action="SELL" apiKey={apiKey}
                scope={`${account}:${broker}:${appMode}`} sandbox={appMode === 'analyzer'}
                contract={ceActiveSym} quantity={ceOrderQty} product={product}
                disabled={orderBusy['CE-SELL']}
                onClick={() =>
                  void executeQuickOrder('CE', 'SELL', ceActiveSym, ceLots, ceCustomQty)
                }
              />
            </div>

            {/* Center: OpenAI UI Product Mode (Defaults to NRML) + Sandbox/Live Pill + Latency + Dock Toggle */}
            <div className="scalper-deck-center">
              <button
                type="button"
                onClick={() => setProduct((p) => (p === 'NRML' ? 'MIS' : 'NRML'))}
                className="scalper-deck-control"
                title="Default order product (NRML). Click to toggle NRML / MIS"
              >
                {product} • {armed ? '1-CLICK' : 'TICKET'}
              </button>

              <span
                className="scalper-deck-mode"
                data-sandbox={appMode === 'analyzer' ? 'true' : undefined}
              >
                {appMode === 'analyzer' ? 'SANDBOX' : 'LIVE'}
              </span>

              {lastOrderMs !== null && (
                <span className="scalper-deck-latency">
                  <Activity className="h-3 w-3" />
                  {lastOrderMs}ms
                </span>
              )}

              <button
                type="button"
                onClick={() => {
                  if (!dock) setDock('positions')
                  setShowDockBar((v) => !v)
                }}
                className="scalper-deck-control"
                title="Show or hide the full Positions / Orders / Trades dock"
              >
                <Eye className="h-3 w-3" />
                {showDockBar ? 'Hide Dock ▾' : 'Show Dock ▴'}
              </button>
            </div>

            {/* PUT contract and execution controls */}
            <div className="scalper-order-cluster" data-option-side="PE">
              {/* Put contract selector */}
              <ScalperStrikePicker
                side="PE"
                choices={enrichedChain.map((row) => ({
                  strike: row.strike,
                  symbol: row.pe?.symbol || '',
                  price: row.pe?.ltp,
                  openInterest: row.pe?.oi,
                  label: row.pe?.tag,
                  direction: row.pe?.symbol ? flashes[row.pe.symbol] : undefined,
                }))}
                value={peStrike}
                atmStrike={effectiveAtmStrike}
                expiry={selectedExpiry}
                open={peChainOpen}
                onOpenChange={setPeChainOpen}
                onSelect={handleSelectPeStrike}
                loading={isOptionChainLoading}
                streaming={isOptionChainStreaming}
                marketOpen={isMarketOpen(activeUnderlying.spotExchange)}
                onRefresh={() => {
                  void refetchOptionChain()
                }}
                onFullChain={() => setPanel('options')}
              />
              {/* Put market order actions */}
              <ScalperOrderButton
                side="PE" action="BUY" apiKey={apiKey}
                scope={`${account}:${broker}:${appMode}`} sandbox={appMode === 'analyzer'}
                contract={peActiveSym} quantity={peOrderQty} product={product}
                disabled={orderBusy['PE-BUY']}
                onClick={() =>
                  void executeQuickOrder('PE', 'BUY', peActiveSym, peLots, peCustomQty)
                }
              />

              {/* Editable put size */}
              <div
                className="scalper-quantity-control"
                onWheel={(e) => {
                  e.preventDefault()
                  const delta = e.deltaY < 0 ? 1 : -1
                  setPeCustomQty(null)
                  setPeLots((l) => Math.max(1, l + delta))
                }}
                title="Edit PE Lots (L) or Quantity (Q) directly between Buy & Sell"
              >
                <button
                  type="button"
                  onClick={() => {
                    setPeCustomQty(null)
                    setPeLotsText(null)
                    setPeQtyText(null)
                    setPeLots((l) => Math.max(1, l - 1))
                  }}
                  className="scalper-step-button"
                  title="Decrease 1 PE lot"
                >
                  −
                </button>

                {/* Direct Editable Lots Input */}
                <div className="flex items-center gap-0.5">
                  <input
                    type="text"
                    inputMode="numeric"
                    aria-label="PE Lots"
                    value={peLotsText ?? String(peLots)}
                    onFocus={(e) => {
                      setPeLotsText(String(peLots))
                      e.currentTarget.select()
                    }}
                    onChange={(e) => {
                      const raw = e.target.value.replace(/[^0-9]/g, '')
                      setPeLotsText(raw)
                      const num = parseInt(raw, 10)
                      if (Number.isFinite(num) && num >= 1) {
                        setPeCustomQty(null)
                        setPeLots(num)
                      }
                    }}
                    onBlur={() => {
                      const num = parseInt(peLotsText ?? '', 10)
                      const safe = Number.isFinite(num) && num >= 1 ? num : Math.max(1, peLots)
                      setPeLots(safe)
                      setPeLotsText(null)
                    }}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') e.currentTarget.blur()
                      else if (e.key === 'ArrowUp') {
                        e.preventDefault()
                        setPeCustomQty(null)
                        setPeLots((l) => {
                          const next = l + 1
                          setPeLotsText(String(next))
                          return next
                        })
                      } else if (e.key === 'ArrowDown') {
                        e.preventDefault()
                        setPeCustomQty(null)
                        setPeLots((l) => {
                          const next = Math.max(1, l - 1)
                          setPeLotsText(String(next))
                          return next
                        })
                      }
                    }}
                    className="scalper-lots-input"
                  />
                  <span className="scalper-quantity-unit">lots</span>
                </div>

                {/* Direct Editable Quantity Input */}
                <div className="scalper-total-quantity">
                  <input
                    type="text"
                    inputMode="numeric"
                    aria-label="PE Quantity"
                    value={peQtyText ?? String(peOrderQty)}
                    onFocus={(e) => {
                      setPeQtyText(String(peOrderQty))
                      e.currentTarget.select()
                    }}
                    onChange={(e) => {
                      const raw = e.target.value.replace(/[^0-9]/g, '')
                      setPeQtyText(raw)
                      const num = parseInt(raw, 10)
                      if (Number.isFinite(num) && num >= 1) {
                        setPeCustomQty(num)
                        setPeLots(Math.max(1, Math.round(num / peLotSize)))
                      }
                    }}
                    onBlur={() => {
                      const num = parseInt(peQtyText ?? '', 10)
                      if (Number.isFinite(num) && num >= 1) {
                        setPeCustomQty(num)
                        setPeLots(Math.max(1, Math.round(num / peLotSize)))
                      }
                      setPeQtyText(null)
                    }}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') e.currentTarget.blur()
                    }}
                    className="scalper-qty-input"
                  />
                  <span>qty</span>
                </div>

                <button
                  type="button"
                  onClick={() => {
                    setPeCustomQty(null)
                    setPeLotsText(null)
                    setPeQtyText(null)
                    setPeLots((l) => l + 1)
                  }}
                  className="scalper-step-button"
                  title="Increase 1 PE lot"
                >
                  +
                </button>
              </div>

              <ScalperOrderButton
                side="PE" action="SELL" apiKey={apiKey}
                scope={`${account}:${broker}:${appMode}`} sandbox={appMode === 'analyzer'}
                contract={peActiveSym} quantity={peOrderQty} product={product}
                disabled={orderBusy['PE-SELL']}
                onClick={() =>
                  void executeQuickOrder('PE', 'SELL', peActiveSym, peLots, peCustomQty)
                }
              />
            </div>
          </footer>
        </div>
      </div>
    </ChartOrderBridgeContext.Provider>
  )
}
