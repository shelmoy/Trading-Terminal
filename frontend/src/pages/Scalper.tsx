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
 * Zero-latency architecture:
 *   • Direct WebSocket streaming via TradingTerminal (0-1 ms tick-to-canvas)
 *   • Parallel candle + option-chain prefetching via prefetchSymbolData
 *   • Dedicated per-pane storage namespace (oa-trading-scalper-p0/p1/p2)
 */

import {
  Activity,
  Columns3,
  Eye,
  FileSpreadsheet,
  FolderOpen,
  LayoutGrid,
  Link2 as LinkIcon,
  Maximize2,
  Minimize2,
  RefreshCw,
  TrendingUp,
  Zap,
} from 'lucide-react'
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
import { DrawingRail } from '@/components/trading/DrawingRail'
import {
  type ChartOrderBridgeRef,
  ChartOrderBridgeContext,
} from '@/components/trading/dock/chartOrderBridge'
import { DOCK_ID } from '@/components/trading/dock/DockShell'
import {
  type DockTab,
  escapeTarget,
  writeDockTab,
} from '@/components/trading/dock/dockState'
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
import { useMarketStatus } from '@/hooks/useMarketStatus'
import { useOptionChainLive } from '@/hooks/useOptionChainLive'
import type { AgentChartCommand } from '@/lib/agent/stream'
import type { LayoutPreset } from '@/lib/chart/layouts'
import { clearLog, fetchLog, type LoggedFire } from '@/lib/trading/alertLog'
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
import { needsPreviousClose, previousClose } from '@/lib/trading/previousClose'
import {
  type AlertFire,
  type AlertsView,
  type DrawStats,
  persistFastCache,
  prefetchSymbolData,
  type SearchRow,
  symbolMetadataCache,
  type TradingTerminal,
} from '@/lib/trading/terminal'
import {
  WorkspaceReplayCoordinator,
  type WorkspaceReplaySnapshot,
} from '@/lib/trading/workspaceReplay'
import { cn } from '@/lib/utils'
import { useAuthStore } from '@/stores/authStore'
import { useThemeStore } from '@/stores/themeStore'
import type { OptionChainRow, ScalpingProduct } from '@/types/scalping'
import { showToast } from '@/utils/toast'
import type { MagnetMode } from 'openalgo-charts/draw'

/** Compact OI / Volume formatting in Indian Lakhs / Crores (matches OptionChainPanel.tsx) */
function formatCompactOi(value: number | undefined | null): string {
  if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0) return '-'
  if (value >= 1e7) return `${(value / 1e7).toFixed(2)}Cr`
  if (value >= 1e5) return `${(value / 1e5).toFixed(2)}L`
  if (value >= 1e3) return `${(value / 1e3).toFixed(1)}K`
  return String(Math.round(value))
}

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
      const ceRow = snap.chain.find((r) => String(r.strike) === snap.ceStrike) ?? snap.chain[0]
      const peRow = snap.chain.find((r) => String(r.strike) === snap.peStrike) ?? snap.chain[0]
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
  const { mode: themeMode, appMode, toggleAppMode, isTogglingMode } = useThemeStore()

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
  const chartTradeColors = useMemo(
    () => ({
      buy: '#16a34a',
      buyHover: '#15803d',
      sell: '#dc2626',
      sellHover: '#b91c1c',
      text: '#ffffff',
      border: themeMode === 'light' ? 'rgba(0,0,0,0.14)' : 'rgba(255,255,255,0.14)',
    }),
    [themeMode]
  )
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
  const [ceStrike, setCeStrike] = useState<string>(() => initialSnap?.ceStrike ?? '')
  const [peStrike, setPeStrike] = useState<string>(() => initialSnap?.peStrike ?? '')
  const [ceChainOpen, setCeChainOpen] = useState(false)
  const [peChainOpen, setPeChainOpen] = useState(false)
  const [ceIndexOpen, setCeIndexOpen] = useState(false)
  const [peIndexOpen, setPeIndexOpen] = useState(false)
  const ceListRef = useRef<HTMLDivElement | null>(null)
  const peListRef = useRef<HTMLDivElement | null>(null)
  const ceDidScrollRef = useRef(false)
  const peDidScrollRef = useRef(false)
  const [resolvedCloses, setResolvedCloses] = useState<Record<string, number>>({})
  const [indexHistorySnapshots, setIndexHistorySnapshots] = useState<
    Record<string, { ltp: number; prevClose: number }>
  >({})
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
  const [marginText, setMarginText] = useState<string>('₹1.00Cr')
  const [pnlValue, setPnlValue] = useState<number>(0)
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
        const termInternal = terminal as unknown as {
          tradeBtns?: { setColors(buy?: string, sell?: string): void } | null
          applyTradeColors?: () => void
        }
        const syncScalperTradeBtns = () => {
          termInternal.tradeBtns?.setColors('#16a34a', '#dc2626')
        }
        termInternal.applyTradeColors = syncScalperTradeBtns
        syncScalperTradeBtns()
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
        void terminalsRef.current['scalper-p1']?.loadSymbol(row)
        return
      }
      if (
        (row.exchange === 'NFO' || row.exchange === 'BFO' || row.exchange === 'MCX') &&
        symUpper.endsWith('PE') &&
        terminalsRef.current['scalper-p2']
      ) {
        void terminalsRef.current['scalper-p2']?.loadSymbol(row)
        return
      }
      void panelTarget()?.loadSymbol(row)
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
      foExchOverride?: string
    ) => {
      setChain(rows)
      const atmVal =
        resolvedAtm != null
          ? resolvedAtm
          : rows.length > 0
            ? rows[Math.floor(rows.length / 2)].strike
            : null
      if (atmVal != null) {
        setAtmStrike(atmVal)
      }
      if (rows.length === 0) return

      const atmStr = atmVal != null ? String(atmVal) : String(rows[0].strike)
      const atmRow = rows.find((r) => String(r.strike) === atmStr) ?? rows[0]
      const targetStrikeStr = String(atmRow.strike)
      setCeStrike(targetStrikeStr)
      setPeStrike(targetStrikeStr)

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
        ceStrike: targetStrikeStr,
        peStrike: targetStrikeStr,
        updatedAt: Date.now(),
      })

      if (atmRow.ce?.symbol) {
        seedPaneDefaultStorage('scalper-p1', atmRow.ce.symbol, foExch, true)
        const t1 = terminalsRef.current['scalper-p1']
        if (t1) {
          void t1.loadSymbol({
            symbol: atmRow.ce.symbol,
            exchange: foExch,
            lotsize: atmRow.ce.lotsize ?? preset.defaultLotSize,
            tick_size: atmRow.ce.tick_size ?? 0.05,
          })
        }
      }
      if (atmRow.pe?.symbol) {
        seedPaneDefaultStorage('scalper-p2', atmRow.pe.symbol, foExch, true)
        const t2 = terminalsRef.current['scalper-p2']
        if (t2) {
          void t2.loadSymbol({
            symbol: atmRow.pe.symbol,
            exchange: foExch,
            lotsize: atmRow.pe.lotsize ?? preset.defaultLotSize,
            tick_size: atmRow.pe.tick_size ?? 0.05,
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
      setChain(snap.chain)
      if (snap.atmStrike != null) setAtmStrike(snap.atmStrike)
      if (snap.ceStrike) setCeStrike(snap.ceStrike)
      if (snap.peStrike) setPeStrike(snap.peStrike)

      // Immediately trigger 0ms load on SPOT, CE, PE from warm snapshot
      const ceRowSnap =
        snap.chain.find((r) => String(r.strike) === snap.ceStrike) ?? snap.chain[0]
      const peRowSnap =
        snap.chain.find((r) => String(r.strike) === snap.peStrike) ?? snap.chain[0]
      if (ceRowSnap?.ce?.symbol) {
        seedPaneDefaultStorage('scalper-p1', ceRowSnap.ce.symbol, preset.foExchange, true)
        void terminalsRef.current['scalper-p1']?.loadSymbol({
          symbol: ceRowSnap.ce.symbol,
          exchange: preset.foExchange,
          lotsize: ceRowSnap.ce.lotsize ?? preset.defaultLotSize,
          tick_size: ceRowSnap.ce.tick_size ?? 0.05,
        })
      }
      if (peRowSnap?.pe?.symbol) {
        seedPaneDefaultStorage('scalper-p2', peRowSnap.pe.symbol, preset.foExchange, true)
        void terminalsRef.current['scalper-p2']?.loadSymbol({
          symbol: peRowSnap.pe.symbol,
          exchange: preset.foExchange,
          lotsize: peRowSnap.pe.lotsize ?? preset.defaultLotSize,
          tick_size: peRowSnap.pe.tick_size ?? 0.05,
        })
      }
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
        const strikesRes = await scalpingApi.getStrikes(
          preset.id,
          preset.foExchange,
          targetExp,
          25
        )
        if (!alive) return
        const rows = strikesRes.chain ?? []
        // Only auto-switch strikes if we didn't already load from a warm snapshot for this underlying
        if (!snap || snap.selectedExpiry !== targetExp || snap.chain.length === 0) {
          applyStrikesToPanes(
            preset,
            targetExp,
            list,
            rows,
            strikesRes.atm_strike,
            strikesRes.fo_exchange
          )
        } else if (rows.length > 0) {
          setChain(rows)
          if (strikesRes.atm_strike != null) setAtmStrike(strikesRes.atm_strike)
        }
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

  /* ── Background Pre-Warmer for All 5 Indices (0-1ms Index Switch) ──────── */
  useEffect(() => {
    if (!apiKey) return
    let cancelled = false
    const timer = setTimeout(() => {
      void (async () => {
        // First ensure active underlying's SPOT, CE, PE bars are persisted in fastCache
        const activeSnap = readIndexSnapshot(activeUnderlying.id)
        if (activeSnap && activeSnap.chain.length > 0) {
          const ceR =
            activeSnap.chain.find((r) => String(r.strike) === activeSnap.ceStrike) ??
            activeSnap.chain[0]
          const peR =
            activeSnap.chain.find((r) => String(r.strike) === activeSnap.peStrike) ??
            activeSnap.chain[0]
          void prefetchSymbolData(
            apiKey,
            activeUnderlying.spotSymbol,
            activeUnderlying.spotExchange,
            '1m'
          )
          if (ceR?.ce?.symbol) {
            void prefetchSymbolData(apiKey, ceR.ce.symbol, activeUnderlying.foExchange, '1m')
          }
          if (peR?.pe?.symbol) {
            void prefetchSymbolData(apiKey, peR.pe.symbol, activeUnderlying.foExchange, '1m')
          }
        }

        // Next, quietly pre-warm the other 4 indices in the background so switching
        // from the top header dropdown is an instant 0-1ms memory hit
        for (const preset of UNDERLYINGS) {
          if (cancelled) return
          if (preset.id === activeUnderlying.id) continue
          await new Promise((r) => setTimeout(r, 900))
          if (cancelled) return
          try {
            let snap = readIndexSnapshot(preset.id)
            if (!snap || Date.now() - snap.updatedAt > 5 * 60_000 || snap.chain.length === 0) {
              const expRes = await scalpingApi.getExpiry(preset.id, preset.foExchange, 'options')
              if (cancelled) return
              const list = expRes.data ?? []
              if (list.length === 0) continue
              const exp = list[0]
              const strikesRes = await scalpingApi.getStrikes(
                preset.id,
                preset.foExchange,
                exp,
                25
              )
              if (cancelled) return
              const rows = strikesRes.chain ?? []
              if (rows.length === 0) continue
              const atmVal =
                strikesRes.atm_strike != null
                  ? strikesRes.atm_strike
                  : rows[Math.floor(rows.length / 2)].strike
              const atmRow = rows.find((r) => r.strike === atmVal) ?? rows[0]
              const strikeStr = String(atmRow.strike)
              const foExch = strikesRes.fo_exchange || preset.foExchange
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
              snap = {
                expiries: list,
                selectedExpiry: exp,
                chain: rows,
                atmStrike: atmVal,
                ceStrike: strikeStr,
                peStrike: strikeStr,
                updatedAt: Date.now(),
              }
              writeIndexSnapshot(preset.id, snap)
              persistFastCache()
            }

            // Pre-warm 1m bars for this index's SPOT + ATM CE + ATM PE (burst of 3)
            const ceRow =
              snap.chain.find((r) => String(r.strike) === snap?.ceStrike) ?? snap.chain[0]
            const peRow =
              snap.chain.find((r) => String(r.strike) === snap?.peStrike) ?? snap.chain[0]
            await Promise.all([
              prefetchSymbolData(apiKey, preset.spotSymbol, preset.spotExchange, '1m'),
              ceRow?.ce?.symbol
                ? prefetchSymbolData(apiKey, ceRow.ce.symbol, preset.foExchange, '1m')
                : Promise.resolve(),
              peRow?.pe?.symbol
                ? prefetchSymbolData(apiKey, peRow.pe.symbol, preset.foExchange, '1m')
                : Promise.resolve(),
            ])
          } catch {
            /* ignore background pre-warm errors */
          }
        }
      })()
    }, 1500)
    return () => {
      cancelled = true
      clearTimeout(timer)
    }
  }, [apiKey, activeUnderlying.id, activeUnderlying.spotSymbol, activeUnderlying.spotExchange, activeUnderlying.foExchange])

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

  // Resolve previous closes and fallback daily bars for all 5 indices so Price, ±Pts, and ±%
  // are always populated in both live/pre-market and closed sessions
  useEffect(() => {
    if (!apiKey) return
    let alive = true
    const pad = (n: number) => String(n).padStart(2, '0')
    const fmtDate = (d: Date) =>
      `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
    const startDate = fmtDate(new Date(Date.now() - 20 * 86400_000))
    const endDate = fmtDate(new Date())

    for (const u of UNDERLYINGS) {
      const key = `${u.spotExchange}:${u.spotSymbol}`
      const marketOpenNow = isMarketOpen(u.spotExchange)
      void previousClose(apiKey, u.spotSymbol, u.spotExchange, marketOpenNow).then((val) => {
        if (!alive || !val || val <= 0) return
        setResolvedCloses((prev) => (prev[key] === val ? prev : { ...prev, [key]: val }))
      })

      void (async () => {
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
        } catch {
          /* ignore fallback error */
        }
      })()
    }
    return () => {
      alive = false
    }
  }, [apiKey, isMarketOpen])

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
        liveItem?._dataSource === 'websocket' && typeof liveItem.ltp === 'number' && liveItem.ltp > 0
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

      const prevClose =
        !needsPreviousClose(mqPrev, ltp)
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
  }, [liveOptionChain?.atm_strike, liveOptionChain?.underlying_ltp, liveOptionChain?.chain, atmStrike, chain])

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
      effectiveAtmStrike != null
        ? sorted.findIndex((r) => r.strike === effectiveAtmStrike)
        : -1

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
      return {
        ...r,
        ce: r.ce ? { ...r.ce, moneyness: ceMoney, tag: ceTag } : null,
        pe: r.pe ? { ...r.pe, moneyness: peMoney, tag: peTag } : null,
      }
    })
  }, [
    chain,
    liveOptionChain?.chain,
    activeUnderlying.defaultLotSize,
    activeUnderlying.foExchange,
    effectiveAtmStrike,
    resolvedCloses,
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

  const { peakCeOi, peakPeOi, maxCeOiStrike, maxPeOiStrike, maxPainStrike, pcr } = useMemo(() => {
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

  // One-shot ATM scroll helper: centers ATM strike ONLY when opening the dropdown or clicking ATM
  const scrollCeToAtm = useCallback(() => {
    requestAnimationFrame(() => {
      const el = ceListRef.current?.querySelector('[data-atm="true"]')
      if (el instanceof HTMLElement) {
        el.scrollIntoView({ block: 'center', behavior: 'instant' })
      }
    })
  }, [])

  const scrollPeToAtm = useCallback(() => {
    requestAnimationFrame(() => {
      const el = peListRef.current?.querySelector('[data-atm="true"]')
      if (el instanceof HTMLElement) {
        el.scrollIntoView({ block: 'center', behavior: 'instant' })
      }
    })
  }, [])

  useEffect(() => {
    if (!ceChainOpen) {
      ceDidScrollRef.current = false
      return
    }
    if (!ceDidScrollRef.current && enrichedChain.length > 0) {
      ceDidScrollRef.current = true
      scrollCeToAtm()
    }
  }, [ceChainOpen, enrichedChain.length, scrollCeToAtm])

  useEffect(() => {
    if (!peChainOpen) {
      peDidScrollRef.current = false
      return
    }
    if (!peDidScrollRef.current && enrichedChain.length > 0) {
      peDidScrollRef.current = true
      scrollPeToAtm()
    }
  }, [peChainOpen, enrichedChain.length, scrollPeToAtm])

  // If liveOptionChain resolved before scalpingApi.getStrikes, seed default ATM CE/PE strikes
  useEffect(() => {
    if (!ceStrike && !peStrike && enrichedChain.length > 0 && effectiveAtmStrike != null) {
      const atmStr = String(effectiveAtmStrike)
      setCeStrike(atmStr)
      setPeStrike(atmStr)
    }
  }, [ceStrike, peStrike, enrichedChain.length, effectiveAtmStrike])

  // Switch SPOT, CALL (CE), and PUT (PE) charts in 0ms when user switches underlying from Scalper header
  const handleSelectUnderlying = useCallback(
    (preset: UnderlyingPreset) => {
      setUnderlyingId(preset.id)
      try {
        localStorage.setItem(SCALPER_UNDERLYING_KEY, preset.id)
      } catch {
        /* noop */
      }
      seedPaneDefaultStorage('scalper-p0', preset.spotSymbol, preset.spotExchange, true)
      const t0 = terminalsRef.current['scalper-p0']
      if (t0) {
        void t0.loadSymbol({
          symbol: preset.spotSymbol,
          exchange: preset.spotExchange,
        })
      }

      // 0ms instant CE + PE switch if IndexSnapshot is already in memory
      const snap = readIndexSnapshot(preset.id)
      if (snap && snap.expiries.length > 0 && snap.chain.length > 0) {
        const exp = snap.selectedExpiry || snap.expiries[0]
        loadedUnderlyingKeyRef.current = `${preset.id}:${exp}`
        setExpiries(snap.expiries)
        setSelectedExpiry(exp)
        setChain(snap.chain)
        if (snap.atmStrike != null) setAtmStrike(snap.atmStrike)
        setCeStrike(snap.ceStrike)
        setPeStrike(snap.peStrike)

        const ceR =
          snap.chain.find((r) => String(r.strike) === snap.ceStrike) ?? snap.chain[0]
        const peR =
          snap.chain.find((r) => String(r.strike) === snap.peStrike) ?? snap.chain[0]
        if (ceR?.ce?.symbol) {
          seedPaneDefaultStorage('scalper-p1', ceR.ce.symbol, preset.foExchange, true)
          void terminalsRef.current['scalper-p1']?.loadSymbol({
            symbol: ceR.ce.symbol,
            exchange: preset.foExchange,
            lotsize: ceR.ce.lotsize ?? preset.defaultLotSize,
            tick_size: ceR.ce.tick_size ?? 0.05,
          })
        }
        if (peR?.pe?.symbol) {
          seedPaneDefaultStorage('scalper-p2', peR.pe.symbol, preset.foExchange, true)
          void terminalsRef.current['scalper-p2']?.loadSymbol({
            symbol: peR.pe.symbol,
            exchange: preset.foExchange,
            lotsize: peR.pe.lotsize ?? preset.defaultLotSize,
            tick_size: peR.pe.tick_size ?? 0.05,
          })
        }
      }
    },
    []
  )

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
      void t1.loadSymbol({
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
      void t2.loadSymbol({
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
    () =>
      parsePaneSymbol(
        'scalper-p0',
        activeUnderlying.spotSymbol,
        activeUnderlying.spotExchange
      ),
    [parsePaneSymbol, activeUnderlying]
  )
  const ceActiveSym = useMemo(
    () =>
      parsePaneSymbol(
        'scalper-p1',
        ceRow?.ce?.symbol,
        activeUnderlying.foExchange
      ),
    [parsePaneSymbol, ceRow, activeUnderlying]
  )
  const peActiveSym = useMemo(
    () =>
      parsePaneSymbol(
        'scalper-p2',
        peRow?.pe?.symbol,
        activeUnderlying.foExchange
      ),
    [parsePaneSymbol, peRow, activeUnderlying]
  )

  const ceLotSize = ceRow?.ce?.lotsize || activeUnderlying.defaultLotSize
  const peLotSize = peRow?.pe?.lotsize || activeUnderlying.defaultLotSize
  const ceOrderQty = ceCustomQty ?? ceLots * ceLotSize
  const peOrderQty = peCustomQty ?? peLots * peLotSize

  // Change CE strike from bottom dropdown -> immediately load into CALL pane (scalper-p1)
  const handleSelectCeStrike = useCallback(
    (strikeStr: string) => {
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
        void terminalsRef.current['scalper-p1']?.loadSymbol({
          symbol: leg.symbol,
          exchange: exch,
          lotsize,
          tick_size,
        })
      }
    },
    [enrichedChain, chain, activeUnderlying]
  )

  // Change PE strike from bottom dropdown -> immediately load into PUT pane (scalper-p2)
  const handleSelectPeStrike = useCallback(
    (strikeStr: string) => {
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
        void terminalsRef.current['scalper-p2']?.loadSymbol({
          symbol: leg.symbol,
          exchange: exch,
          lotsize,
          tick_size,
        })
      }
    },
    [enrichedChain, chain, activeUnderlying]
  )

  /* ── Funds & Live P&L Fetch ──────────────────────────────────────────── */
  const refreshFundsAndPnl = useCallback(async () => {
    if (!apiKey) return
    try {
      const [fundsRes, posRes] = await Promise.all([
        tradingApi.getFunds(apiKey),
        tradingApi.getPositions(apiKey),
      ])
      if (fundsRes.status === 'success' && fundsRes.data) {
        const cash = Number(fundsRes.data.availablecash || 0)
        if (cash >= 1_00_00_000) {
          setMarginText(`₹${(cash / 1_00_00_000).toFixed(2)}Cr`)
        } else if (cash >= 1_00_000) {
          setMarginText(`₹${(cash / 1_00_000).toFixed(2)}L`)
        } else {
          setMarginText(`₹${cash.toLocaleString('en-IN', { maximumFractionDigits: 0 })}`)
        }
      }
      if (posRes.status === 'success' && Array.isArray(posRes.data)) {
        const totalPnl = posRes.data.reduce((acc, p) => acc + Number(p.pnl || 0), 0)
        setPnlValue(totalPnl)
      }
    } catch {
      /* ignore */
    }
  }, [apiKey])

  useEffect(() => {
    void refreshFundsAndPnl()
    const timer = setInterval(() => void refreshFundsAndPnl(), 10_000)
    return () => clearInterval(timer)
  }, [refreshFundsAndPnl, appMode])

  /* ── Ultra-Fast Order Placement (CE / PE) ────────────────────────────── */
  const executeQuickOrder = useCallback(
    async (
      leg: 'CE' | 'PE',
      action: 'BUY' | 'SELL',
      target: { symbol: string; exchange: string } | null,
      qty: number
    ) => {
      if (!apiKey) {
        showToast.error('API key not ready')
        return
      }
      if (!target?.symbol) {
        showToast.error(`Select a ${leg} option instrument first`)
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
        showToast.error(err instanceof Error ? err.message : 'Order execution failed')
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
      await Promise.allSettled([
        tradingApi.closeAllPositions(),
        tradingApi.cancelAllOrders(),
      ])
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
      {/* Optional full OpenAlgo Navbar (can be toggled with 1 click) */}
      {showMainNavbar && <Navbar fluid />}

      {/* ═══ SCALPER 915 TOP HEADER BAR (Matches Reference UI) ═══════════ */}
      <header className="flex h-11 shrink-0 items-center justify-between gap-2 border-b border-black/[0.09] bg-[#f8f9fa] px-3 backdrop-blur select-none dark:border-white/[0.09] dark:bg-[#141414]">
        {/* Left: Brand + Quick Tabs + Underlying & Expiry Selector */}
        <div className="flex items-center gap-2 overflow-x-auto no-scrollbar">
          {/* Brand Title — Click to toggle main OpenAlgo navigation bar */}
          <button
            type="button"
            onClick={() => setShowMainNavbar((v) => !v)}
            title={
              showMainNavbar
                ? 'Hide top OpenAlgo navigation bar'
                : 'Show top OpenAlgo navigation bar'
            }
            className={cn(
              'flex items-center gap-1.5 rounded-lg border px-2.5 py-1 text-sm font-bold tracking-tight whitespace-nowrap transition-all duration-150 cursor-pointer select-none',
              showMainNavbar
                ? 'border-black/[0.24] bg-[#dfe3e8] text-[#09090b] shadow-2xs dark:border-white/[0.26] dark:bg-[#2e3036] dark:text-white'
                : 'border-black/[0.11] bg-white text-[#09090b] shadow-2xs hover:border-black/[0.24] hover:bg-[#e8ecf1] dark:border-white/[0.12] dark:bg-[#212121] dark:text-[#ececec] dark:shadow-none dark:hover:border-white/[0.26] dark:hover:bg-[#2d3036] dark:hover:text-white'
            )}
          >
            <span>Scalper 915</span>
          </button>

          {/* Quick view pills: Scalper | Positions | Orders | OI */}
          <div className="flex items-center gap-1 rounded-lg bg-[#eef0f3] p-0.5 border border-black/[0.09] dark:bg-[#1e1e1e] dark:border-white/[0.09]">
            <button
              type="button"
              onClick={() => {
                setShowDockBar(false)
                setDock(null)
              }}
              className={cn(
                'flex items-center gap-1.5 rounded-md px-2.5 py-1 text-xs font-semibold transition-all',
                !showDockBar
                  ? 'bg-indigo-600 hover:bg-indigo-700 text-white shadow-xs'
                  : 'text-[#52525b] hover:bg-[#dfe3e8] hover:text-[#09090b] dark:text-[#a1a1aa] dark:hover:bg-[#2c2e33] dark:hover:text-white'
              )}
            >
              <Zap className="h-3.5 w-3.5" />
              Scalper
            </button>
            <button
              type="button"
              onClick={() => {
                setDock('positions')
                setShowDockBar((v) => (dock === 'positions' ? !v : true))
              }}
              className={cn(
                'flex items-center gap-1 rounded-md px-2.5 py-1 text-xs font-medium transition-all',
                showDockBar && dock === 'positions'
                  ? 'bg-indigo-600 hover:bg-indigo-700 text-white shadow-xs'
                  : 'text-[#52525b] hover:bg-[#dfe3e8] hover:text-[#09090b] dark:text-[#a1a1aa] dark:hover:bg-[#2c2e33] dark:hover:text-white'
              )}
            >
              <TrendingUp className="h-3.5 w-3.5" />
              Positions
            </button>
            <button
              type="button"
              onClick={() => {
                setDock('orders')
                setShowDockBar((v) => (dock === 'orders' ? !v : true))
              }}
              className={cn(
                'flex items-center gap-1 rounded-md px-2.5 py-1 text-xs font-medium transition-all',
                showDockBar && dock === 'orders'
                  ? 'bg-indigo-600 hover:bg-indigo-700 text-white shadow-xs'
                  : 'text-[#52525b] hover:bg-[#dfe3e8] hover:text-[#09090b] dark:text-[#a1a1aa] dark:hover:bg-[#2c2e33] dark:hover:text-white'
              )}
            >
              <FolderOpen className="h-3.5 w-3.5" />
              Orders
            </button>
            <button
              type="button"
              onClick={() => setPanel((p) => (p === 'options' ? null : 'options'))}
              className={cn(
                'flex items-center gap-1 rounded-md px-2.5 py-1 text-xs font-medium transition-all',
                panel === 'options'
                  ? 'bg-indigo-600 hover:bg-indigo-700 text-white shadow-xs'
                  : 'text-[#52525b] hover:bg-[#dfe3e8] hover:text-[#09090b] dark:text-[#a1a1aa] dark:hover:bg-[#2c2e33] dark:hover:text-white'
              )}
            >
              <FileSpreadsheet className="h-3.5 w-3.5" />
              OI
            </button>
          </div>

          <div className="h-4 w-px bg-black/[0.10] dark:bg-white/[0.10]" />

          {/* Underlying Index Dropdown (OpenAI Light & Dark UI Style with 0-1ms Live Price, ±Pts & ±%) */}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button
                type="button"
                className={cn(
                  'flex items-center gap-2 rounded-lg border px-2.5 py-1 text-xs font-medium transition-all duration-150',
                  'border-black/[0.11] bg-white text-[#09090b] shadow-2xs hover:border-black/[0.24] hover:bg-[#e8ecf1]',
                  'dark:border-white/[0.12] dark:bg-[#212121] dark:text-[#ececec] dark:shadow-none dark:hover:border-white/[0.26] dark:hover:bg-[#2d3036] dark:hover:text-white'
                )}
              >
                <span
                  className={cn(
                    'h-1.5 w-1.5 rounded-full shrink-0',
                    activeIndexQuote.change !== null && activeIndexQuote.change < 0
                      ? 'bg-[#dc2626]'
                      : 'bg-[#16a34a]'
                  )}
                />
                <span className="text-[#09090b] dark:text-[#ececec] font-semibold tracking-tight">
                  {activeUnderlying.label}
                </span>
                {activeIndexQuote.ltp > 0 && (
                  <span
                    className={cn(
                      'font-mono text-xs font-bold tabular-nums px-1 py-0.2 rounded transition-colors duration-150',
                      flashes[activeUnderlying.id] === 'up'
                        ? 'bg-[#16a34a]/20 text-[#15803d] dark:bg-[#16a34a]/25 dark:text-[#4ade80]'
                        : flashes[activeUnderlying.id] === 'down'
                          ? 'bg-[#dc2626]/20 text-[#dc2626] dark:bg-[#dc2626]/25 dark:text-[#f87171]'
                          : 'text-[#09090b] dark:text-[#ececec]'
                    )}
                  >
                    {activeIndexQuote.ltp.toLocaleString('en-IN', {
                      minimumFractionDigits: 2,
                      maximumFractionDigits: 2,
                    })}
                  </span>
                )}
                {activeIndexQuote.change !== null && activeIndexQuote.changePct !== null && (
                  <span
                    className={cn(
                      'font-mono text-[11px] font-semibold tabular-nums',
                      activeIndexQuote.change >= 0
                        ? 'text-[#15803d] dark:text-[#4ade80]'
                        : 'text-[#dc2626] dark:text-[#f87171]'
                    )}
                  >
                    {activeIndexQuote.change >= 0 ? '+' : ''}
                    {activeIndexQuote.change.toFixed(2)} (
                    {activeIndexQuote.changePct >= 0 ? '+' : ''}
                    {activeIndexQuote.changePct.toFixed(2)}%)
                  </span>
                )}
                <span className="rounded bg-[#f1f3f5] border border-black/[0.09] px-1.5 py-0.2 text-[10px] text-[#15803d] font-mono dark:bg-[#2f2f2f] dark:border-white/[0.10] dark:text-[#34d399]">
                  {spotActiveSym?.exchange ?? activeUnderlying.spotExchange}
                </span>
                <span className="text-[#52525b] dark:text-[#a1a1aa] text-[10px]">▾</span>
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent
              align="start"
              sideOffset={6}
              className="w-[360px] p-1.5 rounded-xl border border-black/[0.11] bg-white text-[#09090b] shadow-[0_12px_32px_rgba(0,0,0,0.14)] dark:border-white/[0.12] dark:bg-[#171717] dark:text-[#ececec] dark:shadow-[0_16px_40px_rgba(0,0,0,0.75)]"
            >
              {UNDERLYINGS.map((u) => {
                const q = indexQuotesById[u.id]
                const isUp = (q?.change ?? 0) >= 0
                const flash = flashes[u.id]
                return (
                  <DropdownMenuItem
                    key={u.id}
                    onSelect={() => handleSelectUnderlying(u)}
                    className={cn(
                      'flex items-center justify-between gap-3 rounded-lg px-2.5 py-2 text-xs font-medium transition-colors cursor-pointer',
                      u.id === underlyingId
                        ? 'bg-[#e4e8ee] text-[#09090b] font-semibold dark:bg-[#2d3036] dark:text-white'
                        : 'text-[#3f3f46] hover:bg-[#eef1f5] hover:text-[#09090b] dark:text-[#b4b4b4] dark:hover:bg-[#26282d] dark:hover:text-white'
                    )}
                  >
                    <div className="flex items-center gap-2 min-w-0">
                      <span
                        className={cn(
                          'h-1.5 w-1.5 rounded-full shrink-0',
                          q?.change != null && q.change < 0 ? 'bg-[#dc2626]' : 'bg-[#16a34a]'
                        )}
                      />
                      <span className="truncate font-semibold text-[#09090b] dark:text-[#ececec]">
                        {u.label}
                      </span>
                      <span className="rounded bg-[#f4f4f5] border border-black/[0.09] px-1.5 py-0.2 text-[9.5px] font-mono text-[#52525b] dark:bg-[#262626] dark:border-white/[0.10] dark:text-[#a1a1aa] shrink-0">
                        {u.foExchange}
                      </span>
                    </div>
                    <div className="flex items-center gap-2 font-mono tabular-nums shrink-0">
                      <span
                        className={cn(
                          'text-xs font-bold px-1 py-0.2 rounded transition-colors duration-150',
                          flash === 'up'
                            ? 'bg-[#16a34a]/20 text-[#15803d] dark:bg-[#16a34a]/25 dark:text-[#4ade80]'
                            : flash === 'down'
                              ? 'bg-[#dc2626]/20 text-[#dc2626] dark:bg-[#dc2626]/25 dark:text-[#f87171]'
                              : 'text-[#09090b] dark:text-[#ececec]'
                        )}
                      >
                        {q && q.ltp > 0
                          ? q.ltp.toLocaleString('en-IN', {
                              minimumFractionDigits: 2,
                              maximumFractionDigits: 2,
                            })
                          : '—'}
                      </span>
                      {q && q.change !== null && q.changePct !== null ? (
                        <span
                          className={cn(
                            'rounded px-1.5 py-0.5 text-[10.5px] font-semibold',
                            isUp
                              ? 'bg-[#16a34a]/12 text-[#15803d] dark:bg-[#16a34a]/15 dark:text-[#4ade80]'
                              : 'bg-[#dc2626]/12 text-[#dc2626] dark:bg-[#dc2626]/15 dark:text-[#f87171]'
                          )}
                        >
                          {isUp ? '+' : ''}
                          {q.change.toFixed(2)} ({isUp ? '+' : ''}
                          {q.changePct.toFixed(2)}%)
                        </span>
                      ) : (
                        <span className="text-[10.5px] text-[#71717a] dark:text-[#8e8ea0]">—</span>
                      )}
                    </div>
                  </DropdownMenuItem>
                )
              })}
            </DropdownMenuContent>
          </DropdownMenu>

          {/* Expiry Selector (OpenAI Light & Dark UI Style) */}
          {expiries.length > 0 && (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button
                  type="button"
                  className={cn(
                    'flex items-center gap-1.5 rounded-lg border px-2.5 py-1 text-[11px] font-mono transition-all duration-150',
                    'border-black/[0.11] bg-white text-[#3f3f46] shadow-2xs hover:border-black/[0.24] hover:bg-[#e8ecf1] hover:text-[#09090b]',
                    'dark:border-white/[0.12] dark:bg-[#212121] dark:text-[#b4b4b4] dark:shadow-none dark:hover:border-white/[0.26] dark:hover:bg-[#2d3036] dark:hover:text-white'
                  )}
                  title="Options Expiry"
                >
                  <span className="text-[#52525b] dark:text-[#a1a1aa]">Exp:</span>
                  <span className="font-semibold text-[#09090b] dark:text-[#ececec]">
                    {selectedExpiry}
                  </span>
                  <span className="text-[10px] text-[#52525b] dark:text-[#a1a1aa]">▾</span>
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent
                align="start"
                sideOffset={6}
                className="max-h-64 w-44 overflow-y-auto p-1 rounded-xl border border-black/[0.11] bg-white text-[#09090b] shadow-[0_12px_32px_rgba(0,0,0,0.14)] dark:border-white/[0.12] dark:bg-[#171717] dark:text-[#ececec] dark:shadow-[0_16px_40px_rgba(0,0,0,0.75)]"
              >
                {expiries.map((exp) => (
                  <DropdownMenuItem
                    key={exp}
                    onSelect={() => setSelectedExpiry(exp)}
                    className={cn(
                      'rounded-lg px-2.5 py-1.5 font-mono text-xs transition-colors cursor-pointer',
                      exp === selectedExpiry
                        ? 'bg-[#e4e8ee] text-[#09090b] font-semibold dark:bg-[#2d3036] dark:text-white'
                        : 'text-[#3f3f46] hover:bg-[#eef1f5] hover:text-[#09090b] dark:text-[#b4b4b4] dark:hover:bg-[#26282d] dark:hover:text-white'
                    )}
                  >
                    {exp}
                  </DropdownMenuItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>
          )}

          {/* ATM Strike Pill (OpenAI Light & Dark UI Style) */}
          {effectiveAtmStrike != null && (
            <span className="rounded-lg border border-black/[0.10] bg-white px-2.5 py-0.5 text-[11px] font-mono text-[#52525b] shadow-2xs dark:border-white/[0.10] dark:bg-[#212121] dark:text-[#b4b4b4] dark:shadow-none">
              ATM:{' '}
              <strong className="font-semibold text-[#09090b] dark:text-[#ececec]">
                {effectiveAtmStrike}
              </strong>
            </span>
          )}

          {/* Max Pain Pill (OpenAI Light & Dark UI Style) */}
          {maxPainStrike != null && (
            <span
              className="hidden xl:inline-flex items-center gap-1 rounded-lg border border-black/[0.10] bg-white px-2 py-0.5 text-[10px] font-mono text-[#52525b] shadow-2xs dark:border-white/[0.10] dark:bg-[#212121] dark:text-[#b4b4b4] dark:shadow-none"
              title="Option Chain Max Pain Strike"
            >
              MaxPain:{' '}
              <strong className="font-semibold text-[#09090b] dark:text-[#ececec]">
                {maxPainStrike}
              </strong>
            </span>
          )}
        </div>

        {/* Right: SANDBOX/LIVE + SPOT/CE/PE Toggles + Layout + Margin/P&L + EXIT ALL */}
        <div className="flex items-center gap-2 shrink-0">
          {/* Sandbox / Live Mode Switch */}
          <button
            type="button"
            disabled={isTogglingMode}
            onClick={() => void toggleAppMode()}
            className={cn(
              'flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-bold uppercase tracking-wider transition-all',
              appMode === 'analyzer'
                ? 'border-purple-500/45 bg-purple-500/12 text-purple-700 hover:bg-purple-500/22 hover:border-purple-600/60 dark:border-purple-500/50 dark:bg-purple-500/15 dark:text-purple-300 dark:hover:bg-purple-500/28'
                : 'border-[#16a34a]/45 bg-[#16a34a]/12 text-[#15803d] hover:bg-[#16a34a]/22 hover:border-[#16a34a]/65 dark:border-emerald-500/50 dark:bg-emerald-500/15 dark:text-emerald-300 dark:hover:bg-emerald-500/28'
            )}
            title="Click to switch between Sandbox (Analyze) and Live broker execution"
          >
            <span
              className={cn(
                'h-1.5 w-1.5 rounded-full',
                appMode === 'analyzer'
                  ? 'bg-purple-500 dark:bg-purple-400'
                  : 'bg-[#16a34a] dark:bg-emerald-400 animate-pulse'
              )}
            />
            {appMode === 'analyzer' ? 'SANDBOX' : 'LIVE'}
          </button>

          {/* Pane Visibility Pills: SPOT | CE | PE */}
          <div className="flex items-center gap-0.5 rounded-md border border-black/[0.10] bg-[#eef0f3] p-0.5 dark:border-white/[0.10] dark:bg-[#1e1e1e]">
            <button
              type="button"
              onClick={() => togglePaneVisibility('spot')}
              className={cn(
                'rounded px-2 py-0.5 text-[11px] font-bold transition-all',
                visiblePanes.spot
                  ? 'bg-indigo-600 hover:bg-indigo-700 text-white shadow-xs'
                  : 'text-[#52525b] hover:bg-[#dfe3e8] hover:text-[#09090b] dark:text-[#a1a1aa] dark:hover:bg-[#2c2e33] dark:hover:text-white'
              )}
              title="Toggle SPOT chart pane"
            >
              SPOT
            </button>
            <button
              type="button"
              onClick={() => togglePaneVisibility('ce')}
              className={cn(
                'rounded px-2 py-0.5 text-[11px] font-bold transition-all',
                visiblePanes.ce
                  ? 'bg-[#16a34a] hover:bg-[#15803d] text-white shadow-xs'
                  : 'text-[#52525b] hover:bg-[#dfe3e8] hover:text-[#09090b] dark:text-[#a1a1aa] dark:hover:bg-[#2c2e33] dark:hover:text-white'
              )}
              title="Toggle CALL (CE) chart pane"
            >
              CE
            </button>
            <button
              type="button"
              onClick={() => togglePaneVisibility('pe')}
              className={cn(
                'rounded px-2 py-0.5 text-[11px] font-bold transition-all',
                visiblePanes.pe
                  ? 'bg-[#dc2626] hover:bg-[#b91c1c] text-white shadow-xs'
                  : 'text-[#52525b] hover:bg-[#dfe3e8] hover:text-[#09090b] dark:text-[#a1a1aa] dark:hover:bg-[#2c2e33] dark:hover:text-white'
              )}
              title="Toggle PUT (PE) chart pane"
            >
              PE
            </button>
          </div>

          {/* Layout Toggle: 1+2 Split vs 3 Columns */}
          <div className="flex items-center gap-0.5 rounded-md border border-black/[0.10] bg-[#eef0f3] p-0.5 dark:border-white/[0.10] dark:bg-[#1e1e1e]">
            <button
              type="button"
              onClick={() => {
                setMaximizedPane(null)
                setLayoutMode('split')
              }}
              className={cn(
                'rounded p-1 transition-colors',
                layoutMode === 'split'
                  ? 'bg-white text-[#09090b] shadow-2xs dark:bg-[#2d3036] dark:text-white'
                  : 'text-[#52525b] hover:bg-[#dfe3e8] hover:text-[#09090b] dark:text-[#a1a1aa] dark:hover:bg-[#2c2e33] dark:hover:text-white'
              )}
              title="1 + 2 Split Layout (SPOT Left, CE Top-Right, PE Bottom-Right)"
            >
              <LayoutGrid className="h-3.5 w-3.5" />
            </button>
            <button
              type="button"
              onClick={() => {
                setMaximizedPane(null)
                setLayoutMode('cols3')
              }}
              className={cn(
                'rounded p-1 transition-colors',
                layoutMode === 'cols3'
                  ? 'bg-white text-[#09090b] shadow-2xs dark:bg-[#2d3036] dark:text-white'
                  : 'text-[#52525b] hover:bg-[#dfe3e8] hover:text-[#09090b] dark:text-[#a1a1aa] dark:hover:bg-[#2c2e33] dark:hover:text-white'
              )}
              title="3 Columns Layout (SPOT | CE | PE)"
            >
              <Columns3 className="h-3.5 w-3.5" />
            </button>
          </div>

          {/* Margin & P&L Pill */}
          <div className="hidden lg:flex items-center gap-2.5 rounded-md border border-black/[0.10] bg-white px-2.5 py-1 text-xs font-mono shadow-2xs dark:border-white/[0.10] dark:bg-[#212121] dark:shadow-none">
            <span>
              <span className="text-[#52525b] dark:text-[#a1a1aa]">Margin: </span>
              <strong className="text-[#09090b] dark:text-white">{marginText}</strong>
            </span>
            <span className="h-3 w-px bg-black/[0.10] dark:bg-white/[0.10]" />
            <span>
              <span className="text-[#52525b] dark:text-[#a1a1aa]">P&amp;L: </span>
              <strong
                className={cn(
                  pnlValue >= 0
                    ? 'text-[#16a34a] dark:text-[#22c55e]'
                    : 'text-[#dc2626] dark:text-[#f87171]'
                )}
              >
                {pnlValue >= 0 ? '+' : ''}₹{pnlValue.toFixed(2)}
              </strong>
            </span>
          </div>

          {/* EXIT ALL Button */}
          <button
            type="button"
            disabled={orderBusy.exitAll}
            onClick={() => void handleExitAll()}
            className="rounded-md border border-[#dc2626]/40 bg-[#dc2626] hover:bg-[#b91c1c] px-3 py-1 text-xs font-bold uppercase tracking-wider text-white shadow-xs transition-all active:scale-95 disabled:opacity-50"
            title="Close all open positions and cancel all open orders immediately"
          >
            EXIT ALL
          </button>
        </div>
      </header>

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
                    className="grid h-full min-h-0 gap-1.5 p-1.5"
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
                    {visiblePanes.spot &&
                      (!maximizedPane || maximizedPane === 'scalper-p0') && (
                        <div
                          style={{ gridArea: maximizedPane ? 'max' : 'a' }}
                          className={cn(
                            'flex flex-col min-h-0 min-w-0 rounded-lg border bg-card overflow-hidden transition-colors',
                            focusedPane === 'scalper-p0'
                              ? 'border-indigo-500/80 shadow-[0_0_0_1px_rgba(99,102,241,0.25)]'
                              : 'border-border/70'
                          )}
                        >
                          {/* Sleek Pane Header Bar */}
                          <div
                            onClick={() =>
                              focusPane(terminalsRef.current['scalper-p0'] ?? null, 'scalper-p0')
                            }
                            className="flex h-7 shrink-0 cursor-pointer items-center justify-between border-b border-border/60 bg-muted/30 px-2.5 text-[11px]"
                          >
                            <div className="flex items-center gap-2">
                              <span className="font-bold tracking-wide text-indigo-600 dark:text-indigo-400">
                                SPOT: {spotActiveSym?.symbol ?? activeUnderlying.label}
                              </span>
                              <span className="rounded bg-muted px-1.5 py-0.2 text-[10px] font-mono text-muted-foreground">
                                {spotActiveSym?.exchange ?? activeUnderlying.spotExchange}
                              </span>
                              {focusedPane === 'scalper-p0' && (
                                <span className="rounded bg-indigo-500/15 px-1.5 py-0.2 text-[9px] font-bold uppercase tracking-wider text-indigo-700 dark:bg-indigo-500/20 dark:text-indigo-300">
                                  ACTIVE
                                </span>
                              )}
                            </div>
                            <div className="flex items-center gap-2">
                              <span
                                className="h-2 w-2 rounded-full bg-emerald-400 shadow-[0_0_6px_#10b981]"
                                title="Live 0-1ms WebSocket stream active"
                              />
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation()
                                  setMaximizedPane((m) =>
                                    m === 'scalper-p0' ? null : 'scalper-p0'
                                  )
                                }}
                                className="rounded p-0.5 text-muted-foreground hover:bg-muted hover:text-foreground"
                                title={
                                  maximizedPane === 'scalper-p0' ? 'Restore 3-pane view' : 'Maximize SPOT pane'
                                }
                              >
                                {maximizedPane === 'scalper-p0' ? (
                                  <Minimize2 className="h-3 w-3" />
                                ) : (
                                  <Maximize2 className="h-3 w-3" />
                                )}
                              </button>
                            </div>
                          </div>

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
                    {visiblePanes.ce &&
                      (!maximizedPane || maximizedPane === 'scalper-p1') && (
                        <div
                          style={{ gridArea: maximizedPane ? 'max' : 'b' }}
                          className={cn(
                            'flex flex-col min-h-0 min-w-0 rounded-lg border bg-card overflow-hidden transition-colors',
                            focusedPane === 'scalper-p1'
                              ? 'border-indigo-500/80 shadow-[0_0_0_1px_rgba(99,102,241,0.25)]'
                              : 'border-border/70'
                          )}
                        >
                          {/* Sleek Pane Header Bar */}
                          <div
                            onClick={() =>
                              focusPane(terminalsRef.current['scalper-p1'] ?? null, 'scalper-p1')
                            }
                            className="flex h-7 shrink-0 cursor-pointer items-center justify-between border-b border-border/60 bg-muted/30 px-2.5 text-[11px]"
                          >
                            <div className="flex items-center gap-2">
                              <span className="font-bold tracking-wide text-foreground">
                                CALL: {ceActiveSym?.symbol ?? 'Select CE'}
                              </span>
                              <span className="rounded bg-muted px-1.5 py-0.2 text-[10px] font-mono text-muted-foreground">
                                {ceActiveSym?.exchange ?? activeUnderlying.foExchange}
                              </span>
                              {focusedPane === 'scalper-p1' && (
                                <span className="rounded bg-indigo-500/15 px-1.5 py-0.2 text-[9px] font-bold uppercase tracking-wider text-indigo-700 dark:bg-indigo-500/20 dark:text-indigo-300">
                                  ACTIVE
                                </span>
                              )}
                            </div>
                            <div className="flex items-center gap-2">
                              <span
                                className="h-2 w-2 rounded-full bg-emerald-400 shadow-[0_0_6px_#10b981]"
                                title="Live 0-1ms WebSocket stream active"
                              />
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation()
                                  setMaximizedPane((m) =>
                                    m === 'scalper-p1' ? null : 'scalper-p1'
                                  )
                                }}
                                className="rounded p-0.5 text-muted-foreground hover:bg-muted hover:text-foreground"
                                title={
                                  maximizedPane === 'scalper-p1' ? 'Restore 3-pane view' : 'Maximize CALL pane'
                                }
                              >
                                {maximizedPane === 'scalper-p1' ? (
                                  <Minimize2 className="h-3 w-3" />
                                ) : (
                                  <Maximize2 className="h-3 w-3" />
                                )}
                              </button>
                            </div>
                          </div>

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
                            />

                            {/* Editable Middle Lot/Qty Box between On-Chart SELL and BUY buttons */}
                            <div
                              style={{
                                position: 'absolute',
                                left: '68.28px',
                                top: '44px',
                                width: '28.8px',
                                height: '30.24px',
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
                                  ceChartQtyFocused
                                    ? (ceLotsText ?? String(ceLots))
                                    : `${ceLots}L`
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
                            {ceChartQtyFocused && (
                              <div
                                style={{
                                  position: 'absolute',
                                  left: '14px',
                                  top: '77px',
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
                    {visiblePanes.pe &&
                      (!maximizedPane || maximizedPane === 'scalper-p2') && (
                        <div
                          style={{ gridArea: maximizedPane ? 'max' : 'c' }}
                          className={cn(
                            'flex flex-col min-h-0 min-w-0 rounded-lg border bg-card overflow-hidden transition-colors',
                            focusedPane === 'scalper-p2'
                              ? 'border-indigo-500/80 shadow-[0_0_0_1px_rgba(99,102,241,0.25)]'
                              : 'border-border/70'
                          )}
                        >
                          {/* Sleek Pane Header Bar */}
                          <div
                            onClick={() =>
                              focusPane(terminalsRef.current['scalper-p2'] ?? null, 'scalper-p2')
                            }
                            className="flex h-7 shrink-0 cursor-pointer items-center justify-between border-b border-border/60 bg-muted/30 px-2.5 text-[11px]"
                          >
                            <div className="flex items-center gap-2">
                              <span className="font-bold tracking-wide text-foreground">
                                PUT: {peActiveSym?.symbol ?? 'Select PE'}
                              </span>
                              <span className="rounded bg-muted px-1.5 py-0.2 text-[10px] font-mono text-muted-foreground">
                                {peActiveSym?.exchange ?? activeUnderlying.foExchange}
                              </span>
                              {focusedPane === 'scalper-p2' && (
                                <span className="rounded bg-indigo-500/15 px-1.5 py-0.2 text-[9px] font-bold uppercase tracking-wider text-indigo-700 dark:bg-indigo-500/20 dark:text-indigo-300">
                                  ACTIVE
                                </span>
                              )}
                            </div>
                            <div className="flex items-center gap-2">
                              <span
                                className="h-2 w-2 rounded-full bg-emerald-400 shadow-[0_0_6px_#10b981]"
                                title="Live 0-1ms WebSocket stream active"
                              />
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation()
                                  setMaximizedPane((m) =>
                                    m === 'scalper-p2' ? null : 'scalper-p2'
                                  )
                                }}
                                className="rounded p-0.5 text-muted-foreground hover:bg-muted hover:text-foreground"
                                title={
                                  maximizedPane === 'scalper-p2' ? 'Restore 3-pane view' : 'Maximize PUT pane'
                                }
                              >
                                {maximizedPane === 'scalper-p2' ? (
                                  <Minimize2 className="h-3 w-3" />
                                ) : (
                                  <Maximize2 className="h-3 w-3" />
                                )}
                              </button>
                            </div>
                          </div>

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
                            />

                            {/* Editable Middle Lot/Qty Box between On-Chart SELL and BUY buttons */}
                            <div
                              style={{
                                position: 'absolute',
                                left: '68.28px',
                                top: '44px',
                                width: '28.8px',
                                height: '30.24px',
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
                                  peChartQtyFocused
                                    ? (peLotsText ?? String(peLots))
                                    : `${peLots}L`
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
                            {peChartQtyFocused && (
                              <div
                                style={{
                                  position: 'absolute',
                                  left: '14px',
                                  top: '77px',
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
            <ObjectsPanel model={paneObjects[objectsPaneId] ?? null} paneLabel={objectsPaneLabel} />
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

        {/* ═══ SCALPER FAST EXECUTION FOOTER BAR (OpenAI Light & Dark UI Style + Option Chain + In-Between Editable Lots/Qty) ═══ */}
        <footer
          className={cn(
            'flex h-11 shrink-0 items-center justify-between gap-2 px-3 select-none',
            'border-t border-black/[0.09] bg-[#f8f9fa] text-[#09090b]',
            'dark:border-white/[0.09] dark:bg-[#141414] dark:text-[#ececec]'
          )}
        >
          {/* Left: CALL (CE) OpenAI UI Option Chain + [ BUY CE ] [ − Lots/Qty + ] [ SELL CE ] */}
          <div className="flex items-center gap-1.5">
            {/* CE Strike Live Option Chain Selector (OpenAI UI Capsule when Closed & Open) */}
            <DropdownMenu open={ceChainOpen} onOpenChange={setCeChainOpen}>
              <DropdownMenuTrigger asChild>
                <button
                  type="button"
                  className={cn(
                    'flex h-8 items-center gap-2 rounded-lg border px-2.5 text-xs font-mono transition-all duration-150',
                    'border-black/[0.11] bg-white text-[#09090b] shadow-2xs',
                    'hover:border-black/[0.24] hover:bg-[#e8ecf1]',
                    'dark:border-white/[0.12] dark:bg-[#212121] dark:text-[#ececec] dark:shadow-none',
                    'dark:hover:border-white/[0.26] dark:hover:bg-[#2d3036] dark:hover:text-white',
                    ceChainOpen &&
                      'border-black/[0.28] bg-[#e2e6ec] ring-1 ring-black/[0.10] dark:border-white/[0.28] dark:bg-[#2d3036] dark:ring-white/[0.12]'
                  )}
                  title="Open Call (CE) Option Chain · Switch Strike or Expiry"
                >
                  <span className="h-2 w-2 rounded-full bg-[#16a34a] shrink-0" />
                  <span className="font-semibold tracking-tight text-[#09090b] dark:text-[#ececec]">
                    {ceStrike ? `${ceStrike} CE` : (ceActiveSym?.symbol ?? 'CE Strike')}
                  </span>
                  {selectedExpiry && (
                    <span className="rounded border border-black/[0.09] bg-[#f1f3f5] px-1.5 py-0.5 text-[10px] font-medium text-[#3f3f46] dark:border-white/[0.10] dark:bg-[#2f2f2f] dark:text-[#b4b4b4]">
                      {selectedExpiry}
                    </span>
                  )}
                  {ceRow?.ce?.moneyness && (
                    <span
                      className={cn(
                        'rounded border px-1.5 py-0.2 text-[9px] font-semibold',
                        ceRow.ce.moneyness === 'ATM'
                          ? 'border-black/[0.18] bg-[#e2e6ec] text-[#09090b] dark:border-white/[0.18] dark:bg-[#303030] dark:text-[#ececec]'
                          : ceRow.ce.moneyness === 'ITM'
                            ? 'border-[#16a34a]/35 bg-[#16a34a]/14 text-[#15803d] dark:text-[#4ade80]'
                            : 'border-black/[0.09] bg-[#f1f3f5] text-[#52525b] dark:border-white/[0.10] dark:bg-[#262626] dark:text-[#a1a1aa]'
                      )}
                    >
                      {ceRow.ce.moneyness}
                    </span>
                  )}
                  {typeof ceRow?.ce?.ltp === 'number' && ceRow.ce.ltp > 0 && (
                    <span className="font-semibold text-[#09090b] dark:text-[#ececec] tabular-nums">
                      {ceRow.ce.ltp.toFixed(2)}
                    </span>
                  )}
                  {typeof ceRow?.ce?.chgPct === 'number' && (
                    <span
                      className={cn(
                        'hidden xl:inline text-[10px] font-medium tabular-nums',
                        ceRow.ce.chgPct >= 0
                          ? 'text-[#16a34a] dark:text-[#4ade80]'
                          : 'text-[#dc2626] dark:text-[#f87171]'
                      )}
                    >
                      {ceRow.ce.chgPct >= 0 ? '+' : ''}
                      {ceRow.ce.chgPct.toFixed(1)}%
                    </span>
                  )}
                  <span className="text-[10px] text-[#52525b] dark:text-[#a1a1aa]">▾</span>
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent
                align="start"
                side="top"
                sideOffset={8}
                className={cn(
                  'w-[476px] p-0 overflow-hidden rounded-xl',
                  'border border-black/[0.11] bg-white text-[#09090b] shadow-[0_20px_50px_-12px_rgba(0,0,0,0.22)]',
                  'dark:border-white/[0.12] dark:bg-[#171717] dark:text-[#ececec] dark:shadow-[0_24px_60px_-12px_rgba(0,0,0,0.85)]'
                )}
              >
                {/* OpenAI UI Header Bar: CALLS Badge + Index Selector + Expiry Selector + ATM + Refresh */}
                <div className="flex items-center justify-between gap-2 border-b border-black/[0.08] bg-[#f4f5f7] px-3 py-2 dark:border-white/[0.08] dark:bg-[#1e1e1e]">
                  <div className="flex items-center gap-1.5 min-w-0">
                    <span className="inline-flex items-center gap-1.5 rounded-md border border-[#16a34a]/35 bg-[#16a34a]/12 px-2 py-0.5 font-mono text-[10px] font-semibold tracking-wide text-[#15803d] dark:bg-[#16a34a]/15 dark:text-[#4ade80] shrink-0">
                      <span className="h-1.5 w-1.5 rounded-full bg-[#16a34a]" />
                      CALLS (CE)
                    </span>
                    {/* OpenAI UI Underlying Index Selector with Live Price, ±Pts & ±% */}
                    <div className="relative">
                      <button
                        type="button"
                        onClick={(e) => {
                          e.preventDefault()
                          e.stopPropagation()
                          setCeIndexOpen((v) => !v)
                        }}
                        className={cn(
                          'flex h-6.5 cursor-pointer items-center gap-1.5 rounded-md border px-2 font-mono text-[11px] font-semibold transition-colors',
                          'border-black/[0.12] bg-white text-[#09090b] hover:border-black/[0.24] hover:bg-[#e8ecf1] focus:outline-none',
                          'dark:border-white/[0.12] dark:bg-[#262626] dark:text-[#ececec] dark:hover:border-white/[0.26] dark:hover:bg-[#32353c]'
                        )}
                      >
                        <span>{activeUnderlying.id}</span>
                        {activeIndexQuote.ltp > 0 && (
                          <span className="font-bold tabular-nums text-[#09090b] dark:text-[#ececec]">
                            {activeIndexQuote.ltp.toLocaleString('en-IN', {
                              minimumFractionDigits: 2,
                              maximumFractionDigits: 2,
                            })}
                          </span>
                        )}
                        {activeIndexQuote.change !== null && activeIndexQuote.changePct !== null && (
                          <span
                            className={cn(
                              'text-[10px] font-semibold tabular-nums',
                              activeIndexQuote.change >= 0
                                ? 'text-[#15803d] dark:text-[#4ade80]'
                                : 'text-[#dc2626] dark:text-[#f87171]'
                            )}
                          >
                            {activeIndexQuote.change >= 0 ? '+' : ''}
                            {activeIndexQuote.change.toFixed(2)} (
                            {activeIndexQuote.changePct >= 0 ? '+' : ''}
                            {activeIndexQuote.changePct.toFixed(2)}%)
                          </span>
                        )}
                        <span className="text-[9px] text-[#52525b] dark:text-[#a1a1aa]">▾</span>
                      </button>
                      {ceIndexOpen && (
                        <div
                          className="absolute left-0 top-full z-50 mt-1 w-[340px] rounded-xl border border-black/[0.12] bg-white p-1.5 shadow-[0_14px_34px_rgba(0,0,0,0.18)] dark:border-white/[0.14] dark:bg-[#171717] dark:shadow-[0_18px_42px_rgba(0,0,0,0.85)]"
                          onClick={(e) => e.stopPropagation()}
                        >
                          {UNDERLYINGS.map((u) => {
                            const q = indexQuotesById[u.id]
                            const isUp = (q?.change ?? 0) >= 0
                            return (
                              <button
                                key={u.id}
                                type="button"
                                onClick={(e) => {
                                  e.preventDefault()
                                  e.stopPropagation()
                                  ceDidScrollRef.current = false
                                  setCeIndexOpen(false)
                                  handleSelectUnderlying(u)
                                }}
                                className={cn(
                                  'flex w-full items-center justify-between gap-2 rounded-lg px-2.5 py-1.5 text-left font-mono text-[11px] transition-colors cursor-pointer',
                                  u.id === activeUnderlying.id
                                    ? 'bg-[#e4e8ee] text-[#09090b] font-semibold dark:bg-[#2d3036] dark:text-white'
                                    : 'text-[#3f3f46] hover:bg-[#eef1f5] hover:text-[#09090b] dark:text-[#b4b4b4] dark:hover:bg-[#26282d] dark:hover:text-white'
                                )}
                              >
                                <div className="flex items-center gap-1.5 min-w-0">
                                  <span
                                    className={cn(
                                      'h-1.5 w-1.5 rounded-full shrink-0',
                                      q?.change != null && q.change < 0
                                        ? 'bg-[#dc2626]'
                                        : 'bg-[#16a34a]'
                                    )}
                                  />
                                  <span className="font-semibold text-[#09090b] dark:text-[#ececec]">
                                    {u.label}
                                  </span>
                                  <span className="rounded bg-[#f4f4f5] border border-black/[0.09] px-1 py-0.2 text-[9px] text-[#52525b] dark:bg-[#262626] dark:border-white/[0.10] dark:text-[#a1a1aa]">
                                    {u.foExchange}
                                  </span>
                                </div>
                                <div className="flex items-center gap-1.5 tabular-nums shrink-0">
                                  <span className="font-bold text-[#09090b] dark:text-[#ececec]">
                                    {q && q.ltp > 0
                                      ? q.ltp.toLocaleString('en-IN', {
                                          minimumFractionDigits: 2,
                                          maximumFractionDigits: 2,
                                        })
                                      : '—'}
                                  </span>
                                  {q && q.change !== null && q.changePct !== null && (
                                    <span
                                      className={cn(
                                        'rounded px-1.5 py-0.5 text-[10px] font-semibold',
                                        isUp
                                          ? 'bg-[#16a34a]/12 text-[#15803d] dark:bg-[#16a34a]/15 dark:text-[#4ade80]'
                                          : 'bg-[#dc2626]/12 text-[#dc2626] dark:bg-[#dc2626]/15 dark:text-[#f87171]'
                                      )}
                                    >
                                      {isUp ? '+' : ''}
                                      {q.change.toFixed(2)} ({isUp ? '+' : ''}
                                      {q.changePct.toFixed(2)}%)
                                    </span>
                                  )}
                                </div>
                              </button>
                            )
                          })}
                        </div>
                      )}
                    </div>
                    {/* OpenAI UI Expiry Date Selector */}
                    <select
                      aria-label="CE Expiry Date"
                      value={selectedExpiry}
                      onChange={(e) => {
                        ceDidScrollRef.current = false
                        peDidScrollRef.current = false
                        setSelectedExpiry(e.target.value)
                      }}
                      className={cn(
                        'h-6.5 cursor-pointer rounded-md border px-2 font-mono text-[11px] font-medium transition-colors',
                        'border-black/[0.12] bg-white text-[#09090b] hover:border-black/[0.24] hover:bg-[#e8ecf1] focus:outline-none focus:border-black/[0.32]',
                        'dark:border-white/[0.12] dark:bg-[#262626] dark:text-[#ececec] dark:hover:border-white/[0.26] dark:hover:bg-[#32353c] dark:focus:border-white/[0.32]'
                      )}
                    >
                      {expiries.length === 0 ? (
                        <option
                          value=""
                          className="bg-white text-[#09090b] dark:bg-[#1e1e1e] dark:text-[#ececec]"
                        >
                          Loading expiries…
                        </option>
                      ) : (
                        expiries.map((exp) => (
                          <option
                            key={exp}
                            value={exp}
                            className="bg-white text-[#09090b] dark:bg-[#1e1e1e] dark:text-[#ececec]"
                          >
                            {exp}
                          </option>
                        ))
                      )}
                    </select>
                  </div>

                  <div className="flex items-center gap-1.5 shrink-0">
                    {isOptionChainStreaming && (
                      <span
                        className="inline-flex items-center gap-1 rounded-full border border-[#16a34a]/30 bg-[#16a34a]/12 px-1.5 py-0.5 text-[9px] font-mono font-semibold text-[#15803d] dark:text-[#4ade80]"
                        title="Real-time 0–1ms WebSocket stream active"
                      >
                        <span className="h-1.5 w-1.5 rounded-full bg-[#16a34a] animate-pulse" />
                        LIVE
                      </span>
                    )}
                    <button
                      type="button"
                      onClick={(e) => {
                        e.preventDefault()
                        e.stopPropagation()
                        scrollCeToAtm()
                      }}
                      className="h-6.5 rounded-md border border-black/[0.12] bg-white hover:bg-[#e8ecf1] hover:border-black/[0.24] px-2 font-mono text-[10px] font-semibold text-[#09090b] dark:border-white/[0.12] dark:bg-[#262626] dark:hover:bg-[#32353c] dark:hover:border-white/[0.26] dark:text-[#ececec] transition-colors"
                      title="Center scroll on ATM strike"
                    >
                      ATM
                    </button>
                    <button
                      type="button"
                      onClick={(e) => {
                        e.preventDefault()
                        e.stopPropagation()
                        refetchOptionChain()
                      }}
                      className="flex h-6.5 w-6.5 items-center justify-center rounded-md border border-black/[0.12] bg-white text-[#52525b] hover:bg-[#e8ecf1] hover:border-black/[0.24] hover:text-[#09090b] dark:border-white/[0.12] dark:bg-[#262626] dark:text-[#b4b4b4] dark:hover:bg-[#32353c] dark:hover:border-white/[0.26] dark:hover:text-white transition-colors"
                      title="Refresh Option Chain & OI"
                    >
                      <RefreshCw
                        className={cn('h-3 w-3', isOptionChainLoading && 'animate-spin')}
                      />
                    </button>
                  </div>
                </div>

                {/* OpenAI UI Telemetry Strip: SPOT | ATM | MAX PAIN | PCR | S | R */}
                <div className="flex flex-wrap items-center justify-between gap-1.5 border-b border-black/[0.07] bg-[#eef0f3] px-3 py-1.5 text-[10px] font-mono tabular-nums dark:border-white/[0.07] dark:bg-[#1a1a1a]">
                  <div className="flex items-center gap-2">
                    <span className="inline-flex items-center gap-1.5 text-[#52525b] dark:text-[#a1a1aa]">
                      SPOT{' '}
                      <strong className="font-semibold text-[#09090b] dark:text-[#ececec]">
                        {activeIndexQuote.ltp > 0
                          ? activeIndexQuote.ltp.toLocaleString('en-IN', {
                              minimumFractionDigits: 2,
                              maximumFractionDigits: 2,
                            })
                          : '—'}
                      </strong>
                      {activeIndexQuote.change !== null && activeIndexQuote.changePct !== null && (
                        <span
                          className={cn(
                            'font-semibold',
                            activeIndexQuote.change >= 0
                              ? 'text-[#15803d] dark:text-[#4ade80]'
                              : 'text-[#dc2626] dark:text-[#f87171]'
                          )}
                        >
                          {activeIndexQuote.change >= 0 ? '+' : ''}
                          {activeIndexQuote.change.toFixed(2)} (
                          {activeIndexQuote.changePct >= 0 ? '+' : ''}
                          {activeIndexQuote.changePct.toFixed(2)}%)
                        </span>
                      )}
                    </span>
                    {effectiveAtmStrike != null && (
                      <span className="rounded border border-black/[0.10] bg-white px-1.5 py-0.2 text-[#52525b] dark:border-white/[0.10] dark:bg-[#262626] dark:text-[#b4b4b4]">
                        ATM{' '}
                        <strong className="font-semibold text-[#09090b] dark:text-[#ececec]">
                          {effectiveAtmStrike}
                        </strong>
                      </span>
                    )}
                    {maxPainStrike != null && (
                      <span
                        className="rounded border border-black/[0.10] bg-white px-1.5 py-0.2 text-[#3f3f46] font-medium dark:border-white/[0.10] dark:bg-[#262626] dark:text-[#d4d4d4]"
                        title="Option Chain Max Pain Strike"
                      >
                        MP {maxPainStrike}
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-1.5">
                    {pcr > 0 && (
                      <span
                        className={cn(
                          'rounded border px-1.5 py-0.2 font-medium',
                          pcr >= 1
                            ? 'border-[#16a34a]/30 bg-[#16a34a]/12 text-[#15803d] dark:text-[#4ade80]'
                            : pcr <= 0.7
                              ? 'border-[#dc2626]/30 bg-[#dc2626]/12 text-[#dc2626] dark:text-[#f87171]'
                              : 'border-black/[0.10] bg-white text-[#52525b] dark:border-white/[0.10] dark:bg-[#262626] dark:text-[#b4b4b4]'
                        )}
                        title="Put-Call OI Ratio"
                      >
                        PCR {pcr.toFixed(2)}
                      </span>
                    )}
                    {maxPeOiStrike != null && (
                      <span
                        className="rounded border border-[#16a34a]/35 bg-[#16a34a]/12 px-1.5 py-0.2 text-[#15803d] dark:text-[#4ade80] font-semibold"
                        title="Support (S) — Highest Put OI Strike"
                      >
                        S {maxPeOiStrike}
                      </span>
                    )}
                    {maxCeOiStrike != null && (
                      <span
                        className="rounded border border-[#dc2626]/35 bg-[#dc2626]/12 px-1.5 py-0.2 text-[#dc2626] dark:text-[#f87171] font-semibold"
                        title="Resistance (R) — Highest Call OI Strike"
                      >
                        R {maxCeOiStrike}
                      </span>
                    )}
                  </div>
                </div>

                {/* 4-Column OpenAI UI Table Header */}
                <div className="grid grid-cols-[148px_1fr_92px_76px] items-center border-b border-black/[0.08] bg-[#e6e9ef] px-3 py-1.5 text-[10px] font-semibold uppercase tracking-wider text-[#52525b] font-mono dark:border-white/[0.08] dark:bg-[#1c1c1c] dark:text-[#a1a1aa]">
                  <span>Strike · Level</span>
                  <span className="text-right pr-2">OI / Build</span>
                  <span className="text-right">LTP</span>
                  <span className="text-right">Chg%</span>
                </div>

                {/* Scrollable Full Strike Range (51 Strikes — Never jumps on WebSocket tick) */}
                <div
                  ref={ceListRef}
                  className="max-h-[348px] overflow-y-auto overscroll-contain divide-y divide-black/[0.05] bg-white dark:divide-white/[0.04] dark:bg-[#171717]"
                >
                  {enrichedChain.length === 0 ? (
                    <div className="py-10 text-center font-mono text-xs text-[#52525b] dark:text-[#a1a1aa]">
                      Loading option chain strikes…
                    </div>
                  ) : (
                    enrichedChain.map((r) => {
                      const s = String(r.strike)
                      const leg = r.ce
                      if (!leg) return null
                      const isAtm = r.strike === effectiveAtmStrike
                      const isSelected = s === ceStrike
                      const isMaxCeOi =
                        maxCeOiStrike != null && r.strike === maxCeOiStrike && leg.oi > 0
                      const isMaxPeOi =
                        maxPeOiStrike != null && r.strike === maxPeOiStrike && (r.pe?.oi ?? 0) > 0
                      const isMaxPain =
                        maxPainStrike != null && r.strike === maxPainStrike
                      const oiPct =
                        leg.oi > 0 ? Math.min(100, Math.round((leg.oi / peakCeOi) * 100)) : 0
                      const flash = flashes[leg.symbol]

                      return (
                        <div
                          key={s}
                          data-atm={isAtm ? 'true' : undefined}
                          onMouseEnter={() => {
                            if (apiKey && leg.symbol) {
                              void prefetchSymbolData(
                                apiKey,
                                leg.symbol,
                                activeUnderlying.foExchange,
                                terminalsRef.current['scalper-p1']?.currentInterval() || '1m'
                              )
                            }
                          }}
                          onClick={() => {
                            handleSelectCeStrike(s)
                            setCeChainOpen(false)
                          }}
                          className={cn(
                            'group relative grid h-8 w-full cursor-pointer grid-cols-[148px_1fr_92px_76px] items-center px-3 font-mono text-[11px] tabular-nums transition-colors',
                            'hover:bg-[#e8ecf2] dark:hover:bg-[#262930]',
                            leg.moneyness === 'ITM' && 'bg-black/[0.02] dark:bg-white/[0.015]',
                            isAtm &&
                              'bg-[#e2e6ec] border-y border-black/[0.15] font-semibold dark:bg-[#262626] dark:border-white/[0.15]',
                            isSelected &&
                              'bg-[#16a34a]/[0.14] ring-1 ring-inset ring-[#16a34a]/50 dark:bg-[#16a34a]/[0.16]',
                            flash === 'up' && 'bg-[#16a34a]/25',
                            flash === 'down' && 'bg-[#dc2626]/25'
                          )}
                        >
                          {/* Strike + ATM / ITM / OTM Tag + Support (S) / Resistance (R) / MaxPain Badge */}
                          <div className="flex items-center gap-1 min-w-0">
                            <span
                              className={cn(
                                'font-semibold tracking-tight',
                                isAtm
                                  ? 'text-[#09090b] dark:text-white font-bold'
                                  : isSelected
                                    ? 'text-[#15803d] dark:text-[#4ade80] font-bold'
                                    : 'text-[#09090b] dark:text-[#ececec]'
                              )}
                            >
                              {s}
                            </span>
                            {isAtm ? (
                              <span className="rounded border border-black/[0.18] bg-[#d4d8df] px-1 py-0.2 text-[9px] font-bold text-[#09090b] dark:border-white/[0.18] dark:bg-[#333333] dark:text-white">
                                ATM
                              </span>
                            ) : (
                              <span
                                className={cn(
                                  'rounded border px-1 py-0.2 text-[9px] font-medium',
                                  leg.moneyness === 'ITM'
                                    ? 'border-[#16a34a]/30 bg-[#16a34a]/12 text-[#15803d] dark:text-[#4ade80]'
                                    : 'border-black/[0.09] bg-[#f1f3f5] text-[#52525b] dark:border-white/[0.09] dark:bg-[#222222] dark:text-[#a1a1aa]'
                                )}
                              >
                                {leg.moneyness}
                              </span>
                            )}
                            {isMaxCeOi && (
                              <span
                                className="rounded border border-[#dc2626]/40 bg-[#dc2626]/15 px-1.5 py-0.2 text-[8px] font-bold text-[#dc2626] dark:text-[#f87171]"
                                title="Resistance (R) — Highest Call OI"
                              >
                                R
                              </span>
                            )}
                            {isMaxPeOi && !isMaxCeOi && (
                              <span
                                className="rounded border border-[#16a34a]/40 bg-[#16a34a]/15 px-1.5 py-0.2 text-[8px] font-bold text-[#15803d] dark:text-[#4ade80]"
                                title="Support (S) — Highest Put OI"
                              >
                                S
                              </span>
                            )}
                            {isMaxPain && !isAtm && (
                              <span
                                className="rounded border border-black/[0.14] bg-[#e4e7ec] px-1 py-0.2 text-[8px] font-bold text-[#3f3f46] dark:border-white/[0.14] dark:bg-[#2a2a2a] dark:text-[#d4d4d4]"
                                title="Max Pain Strike"
                              >
                                MP
                              </span>
                            )}
                          </div>

                          {/* OI Cell with OpenAI UI Bar */}
                          <div className="relative flex h-full items-center justify-end pr-2 overflow-hidden">
                            {oiPct > 0 && (
                              <div
                                className={cn(
                                  'pointer-events-none absolute inset-y-1.5 right-1 rounded-xs transition-all duration-300',
                                  isMaxCeOi
                                    ? 'bg-[#16a34a]/30 border-r-2 border-[#16a34a] dark:bg-[#16a34a]/35'
                                    : 'bg-[#16a34a]/15 dark:bg-[#16a34a]/18'
                                )}
                                style={{ width: `${oiPct}%` }}
                              />
                            )}
                            <span
                              className={cn(
                                'relative z-10 text-[10px]',
                                isMaxCeOi
                                  ? 'font-bold text-[#09090b] dark:text-[#ececec]'
                                  : 'text-[#52525b] dark:text-[#b4b4b4]'
                              )}
                            >
                              {formatCompactOi(leg.oi)}
                            </span>
                          </div>

                          {/* Live LTP */}
                          <span
                            className={cn(
                              'text-right font-semibold',
                              flash === 'up'
                                ? 'text-[#16a34a] dark:text-[#4ade80]'
                                : flash === 'down'
                                  ? 'text-[#dc2626] dark:text-[#f87171]'
                                  : 'text-[#09090b] dark:text-[#ececec]'
                            )}
                          >
                            {leg.ltp > 0 ? leg.ltp.toFixed(2) : '—'}
                          </span>

                          {/* Live % Change */}
                          <span
                            className={cn(
                              'text-right text-[10px] font-medium',
                              leg.chgPct != null
                                ? leg.chgPct >= 0
                                  ? 'text-[#16a34a] dark:text-[#4ade80]'
                                  : 'text-[#dc2626] dark:text-[#f87171]'
                                : 'text-[#52525b] dark:text-[#a1a1aa]'
                            )}
                          >
                            {leg.chgPct != null
                              ? `${leg.chgPct >= 0 ? '+' : ''}${leg.chgPct.toFixed(1)}%`
                              : '—'}
                          </span>
                        </div>
                      )
                    })
                  )}
                </div>
              </DropdownMenuContent>
            </DropdownMenu>

            {/* BUY CE Button — Solid Green (#16a34a / hover #15803d) in both Light & Dark Mode matching PlaceOrderDialog */}
            <button
              type="button"
              disabled={orderBusy['CE-BUY']}
              onClick={() =>
                void executeQuickOrder('CE', 'BUY', ceActiveSym, ceOrderQty)
              }
              style={{
                borderColor: chartTradeColors.border,
              }}
              className="h-8 rounded-md border bg-[#16a34a] hover:bg-[#15803d] px-3 text-xs font-bold uppercase tracking-wider text-white shadow-xs transition-all active:scale-95 disabled:opacity-50"
            >
              BUY CE
            </button>

            {/* CE Editable Lot & Quantity Control (OpenAI UI — Positioned IN BETWEEN BUY CE and SELL CE) */}
            <div
              className="flex h-8 items-center gap-1 rounded-lg border border-black/[0.11] bg-white px-1.5 text-xs font-mono text-[#09090b] shadow-2xs dark:border-white/[0.12] dark:bg-[#212121] dark:text-[#ececec] dark:shadow-none"
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
                className="flex h-5 w-5 items-center justify-center rounded hover:bg-[#e2e6ec] text-[#52525b] hover:text-[#09090b] dark:hover:bg-[#32353c] dark:text-[#a1a1aa] dark:hover:text-white font-bold transition-colors"
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
                  className="w-8 rounded border border-black/[0.12] bg-[#f1f3f5] hover:bg-[#e8ecf1] px-1 py-0.5 text-center font-bold text-[#09090b] focus:outline-none focus:border-black/[0.30] dark:border-white/[0.12] dark:bg-[#171717] dark:hover:bg-[#262930] dark:text-[#ececec] dark:focus:border-white/[0.30]"
                />
                <span className="text-[11px] font-semibold text-[#52525b] dark:text-[#a1a1aa]">L</span>
              </div>

              {/* Direct Editable Quantity Input */}
              <div className="flex items-center text-[11px] text-[#52525b] dark:text-[#a1a1aa]">
                <span>(</span>
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
                  className="w-11 rounded bg-transparent px-0.5 text-center font-semibold text-[#09090b] hover:bg-[#e8ecf1] focus:bg-[#f1f3f5] focus:outline-none focus:ring-1 focus:ring-black/[0.24] dark:text-[#ececec] dark:hover:bg-[#32353c] dark:focus:bg-[#171717] dark:focus:ring-white/[0.24]"
                />
                <span>Q)</span>
              </div>

              <button
                type="button"
                onClick={() => {
                  setCeCustomQty(null)
                  setCeLotsText(null)
                  setCeQtyText(null)
                  setCeLots((l) => l + 1)
                }}
                className="flex h-5 w-5 items-center justify-center rounded hover:bg-[#e2e6ec] text-[#52525b] hover:text-[#09090b] dark:hover:bg-[#32353c] dark:text-[#a1a1aa] dark:hover:text-white font-bold transition-colors"
                title="Increase 1 CE lot"
              >
                +
              </button>
            </div>

            {/* SELL CE Button — Solid Red (#dc2626 / hover #b91c1c) in both Light & Dark Mode matching PlaceOrderDialog */}
            <button
              type="button"
              disabled={orderBusy['CE-SELL']}
              onClick={() =>
                void executeQuickOrder('CE', 'SELL', ceActiveSym, ceOrderQty)
              }
              style={{
                borderColor: chartTradeColors.border,
              }}
              className="h-8 rounded-md border bg-[#dc2626] hover:bg-[#b91c1c] px-3 text-xs font-bold uppercase tracking-wider text-white shadow-xs transition-all active:scale-95 disabled:opacity-50"
            >
              SELL CE
            </button>
          </div>

          {/* Center: OpenAI UI Product Mode (Defaults to NRML) + Sandbox/Live Pill + Latency + Dock Toggle */}
          <div className="hidden md:flex items-center gap-2 text-xs">
            <button
              type="button"
              onClick={() => setProduct((p) => (p === 'NRML' ? 'MIS' : 'NRML'))}
              className="rounded-lg border border-black/[0.11] bg-white hover:bg-[#e8ecf1] hover:border-black/[0.24] px-2.5 py-1 font-mono text-[11px] font-semibold text-[#09090b] shadow-2xs dark:border-white/[0.12] dark:bg-[#212121] dark:hover:bg-[#2d3036] dark:hover:border-white/[0.26] dark:text-[#ececec] dark:hover:text-white dark:shadow-none transition-all"
              title="Default order product (NRML). Click to toggle NRML / MIS"
            >
              {product} • {armed ? '1-CLICK' : 'TICKET'}
            </button>

            <span
              className={cn(
                'rounded-lg border px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider',
                appMode === 'analyzer'
                  ? 'border-purple-500/35 bg-purple-500/12 text-purple-700 dark:border-purple-400/35 dark:bg-purple-500/15 dark:text-purple-200'
                  : 'border-[#16a34a]/35 bg-[#16a34a]/12 text-[#15803d] dark:bg-[#16a34a]/15 dark:text-[#4ade80]'
              )}
            >
              {appMode === 'analyzer' ? 'SANDBOX' : 'LIVE'}
            </span>

            {lastOrderMs !== null && (
              <span className="flex items-center gap-1 rounded-lg border border-[#16a34a]/30 bg-[#16a34a]/12 px-2 py-0.5 font-mono text-[10px] text-[#15803d] dark:text-[#4ade80]">
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
              className="flex items-center gap-1 rounded-lg border border-black/[0.11] bg-white hover:bg-[#e8ecf1] hover:border-black/[0.24] px-2 py-1 text-[11px] text-[#52525b] hover:text-[#09090b] shadow-2xs dark:border-white/[0.12] dark:bg-[#212121] dark:hover:bg-[#2d3036] dark:hover:border-white/[0.26] dark:text-[#b4b4b4] dark:hover:text-white dark:shadow-none transition-all"
              title="Show or hide the full Positions / Orders / Trades dock"
            >
              <Eye className="h-3 w-3" />
              {showDockBar ? 'Hide Dock ▾' : 'Show Dock ▴'}
            </button>
          </div>

          {/* Right: [ BUY PE ] [ − Lots/Qty + ] [ SELL PE ] + PUT (PE) OpenAI UI Option Chain */}
          <div className="flex items-center gap-1.5">
            {/* BUY PE Button — Solid Green (#16a34a / hover #15803d) in both Light & Dark Mode matching PlaceOrderDialog */}
            <button
              type="button"
              disabled={orderBusy['PE-BUY']}
              onClick={() =>
                void executeQuickOrder('PE', 'BUY', peActiveSym, peOrderQty)
              }
              style={{
                borderColor: chartTradeColors.border,
              }}
              className="h-8 rounded-md border bg-[#16a34a] hover:bg-[#15803d] px-3 text-xs font-bold uppercase tracking-wider text-white shadow-xs transition-all active:scale-95 disabled:opacity-50"
            >
              BUY PE
            </button>

            {/* PE Editable Lot & Quantity Control (OpenAI UI — Positioned IN BETWEEN BUY PE and SELL PE) */}
            <div
              className="flex h-8 items-center gap-1 rounded-lg border border-black/[0.11] bg-white px-1.5 text-xs font-mono text-[#09090b] shadow-2xs dark:border-white/[0.12] dark:bg-[#212121] dark:text-[#ececec] dark:shadow-none"
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
                className="flex h-5 w-5 items-center justify-center rounded hover:bg-[#e2e6ec] text-[#52525b] hover:text-[#09090b] dark:hover:bg-[#32353c] dark:text-[#a1a1aa] dark:hover:text-white font-bold transition-colors"
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
                  className="w-8 rounded border border-black/[0.12] bg-[#f1f3f5] hover:bg-[#e8ecf1] px-1 py-0.5 text-center font-bold text-[#09090b] focus:outline-none focus:border-black/[0.30] dark:border-white/[0.12] dark:bg-[#171717] dark:hover:bg-[#262930] dark:text-[#ececec] dark:focus:border-white/[0.30]"
                />
                <span className="text-[11px] font-semibold text-[#52525b] dark:text-[#a1a1aa]">L</span>
              </div>

              {/* Direct Editable Quantity Input */}
              <div className="flex items-center text-[11px] text-[#52525b] dark:text-[#a1a1aa]">
                <span>(</span>
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
                  className="w-11 rounded bg-transparent px-0.5 text-center font-semibold text-[#09090b] hover:bg-[#e8ecf1] focus:bg-[#f1f3f5] focus:outline-none focus:ring-1 focus:ring-black/[0.24] dark:text-[#ececec] dark:hover:bg-[#32353c] dark:focus:bg-[#171717] dark:focus:ring-white/[0.24]"
                />
                <span>Q)</span>
              </div>

              <button
                type="button"
                onClick={() => {
                  setPeCustomQty(null)
                  setPeLotsText(null)
                  setPeQtyText(null)
                  setPeLots((l) => l + 1)
                }}
                className="flex h-5 w-5 items-center justify-center rounded hover:bg-[#e2e6ec] text-[#52525b] hover:text-[#09090b] dark:hover:bg-[#32353c] dark:text-[#a1a1aa] dark:hover:text-white font-bold transition-colors"
                title="Increase 1 PE lot"
              >
                +
              </button>
            </div>

            {/* SELL PE Button — Solid Red (#dc2626 / hover #b91c1c) in both Light & Dark Mode matching PlaceOrderDialog */}
            <button
              type="button"
              disabled={orderBusy['PE-SELL']}
              onClick={() =>
                void executeQuickOrder('PE', 'SELL', peActiveSym, peOrderQty)
              }
              style={{
                borderColor: chartTradeColors.border,
              }}
              className="h-8 rounded-md border bg-[#dc2626] hover:bg-[#b91c1c] px-3 text-xs font-bold uppercase tracking-wider text-white shadow-xs transition-all active:scale-95 disabled:opacity-50"
            >
              SELL PE
            </button>

            {/* PE Strike Live Option Chain Selector (OpenAI UI Capsule when Closed & Open) */}
            <DropdownMenu open={peChainOpen} onOpenChange={setPeChainOpen}>
              <DropdownMenuTrigger asChild>
                <button
                  type="button"
                  className={cn(
                    'flex h-8 items-center gap-2 rounded-lg border px-2.5 text-xs font-mono transition-all duration-150',
                    'border-black/[0.11] bg-white text-[#09090b] shadow-2xs',
                    'hover:border-black/[0.24] hover:bg-[#e8ecf1]',
                    'dark:border-white/[0.12] dark:bg-[#212121] dark:text-[#ececec] dark:shadow-none',
                    'dark:hover:border-white/[0.26] dark:hover:bg-[#2d3036] dark:hover:text-white',
                    peChainOpen &&
                      'border-black/[0.28] bg-[#e2e6ec] ring-1 ring-black/[0.10] dark:border-white/[0.28] dark:bg-[#2d3036] dark:ring-white/[0.12]'
                  )}
                  title="Open Put (PE) Option Chain · Switch Strike or Expiry"
                >
                  <span className="h-2 w-2 rounded-full bg-[#dc2626] shrink-0" />
                  <span className="font-semibold tracking-tight text-[#09090b] dark:text-[#ececec]">
                    {peStrike ? `${peStrike} PE` : (peActiveSym?.symbol ?? 'PE Strike')}
                  </span>
                  {selectedExpiry && (
                    <span className="rounded border border-black/[0.09] bg-[#f1f3f5] px-1.5 py-0.5 text-[10px] font-medium text-[#3f3f46] dark:border-white/[0.10] dark:bg-[#2f2f2f] dark:text-[#b4b4b4]">
                      {selectedExpiry}
                    </span>
                  )}
                  {peRow?.pe?.moneyness && (
                    <span
                      className={cn(
                        'rounded border px-1.5 py-0.2 text-[9px] font-semibold',
                        peRow.pe.moneyness === 'ATM'
                          ? 'border-black/[0.18] bg-[#e2e6ec] text-[#09090b] dark:border-white/[0.18] dark:bg-[#303030] dark:text-[#ececec]'
                          : peRow.pe.moneyness === 'ITM'
                            ? 'border-[#16a34a]/35 bg-[#16a34a]/14 text-[#15803d] dark:text-[#4ade80]'
                            : 'border-black/[0.09] bg-[#f1f3f5] text-[#52525b] dark:border-white/[0.10] dark:bg-[#262626] dark:text-[#a1a1aa]'
                      )}
                    >
                      {peRow.pe.moneyness}
                    </span>
                  )}
                  {typeof peRow?.pe?.ltp === 'number' && peRow.pe.ltp > 0 && (
                    <span className="font-semibold text-[#09090b] dark:text-[#ececec] tabular-nums">
                      {peRow.pe.ltp.toFixed(2)}
                    </span>
                  )}
                  {typeof peRow?.pe?.chgPct === 'number' && (
                    <span
                      className={cn(
                        'hidden xl:inline text-[10px] font-medium tabular-nums',
                        peRow.pe.chgPct >= 0
                          ? 'text-[#16a34a] dark:text-[#4ade80]'
                          : 'text-[#dc2626] dark:text-[#f87171]'
                      )}
                    >
                      {peRow.pe.chgPct >= 0 ? '+' : ''}
                      {peRow.pe.chgPct.toFixed(1)}%
                    </span>
                  )}
                  <span className="text-[10px] text-[#52525b] dark:text-[#a1a1aa]">▾</span>
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent
                align="end"
                side="top"
                sideOffset={8}
                className={cn(
                  'w-[476px] p-0 overflow-hidden rounded-xl',
                  'border border-black/[0.11] bg-white text-[#09090b] shadow-[0_20px_50px_-12px_rgba(0,0,0,0.22)]',
                  'dark:border-white/[0.12] dark:bg-[#171717] dark:text-[#ececec] dark:shadow-[0_24px_60px_-12px_rgba(0,0,0,0.85)]'
                )}
              >
                {/* OpenAI UI Header Bar: PUTS Badge + Index Selector + Expiry Selector + ATM + Refresh */}
                <div className="flex items-center justify-between gap-2 border-b border-black/[0.08] bg-[#f4f5f7] px-3 py-2 dark:border-white/[0.08] dark:bg-[#1e1e1e]">
                  <div className="flex items-center gap-1.5 min-w-0">
                    <span className="inline-flex items-center gap-1.5 rounded-md border border-[#dc2626]/35 bg-[#dc2626]/12 px-2 py-0.5 font-mono text-[10px] font-semibold tracking-wide text-[#dc2626] dark:bg-[#dc2626]/15 dark:text-[#f87171] shrink-0">
                      <span className="h-1.5 w-1.5 rounded-full bg-[#dc2626]" />
                      PUTS (PE)
                    </span>
                    {/* OpenAI UI Underlying Index Selector with Live Price, ±Pts & ±% */}
                    <div className="relative">
                      <button
                        type="button"
                        onClick={(e) => {
                          e.preventDefault()
                          e.stopPropagation()
                          setPeIndexOpen((v) => !v)
                        }}
                        className={cn(
                          'flex h-6.5 cursor-pointer items-center gap-1.5 rounded-md border px-2 font-mono text-[11px] font-semibold transition-colors',
                          'border-black/[0.12] bg-white text-[#09090b] hover:border-black/[0.24] hover:bg-[#e8ecf1] focus:outline-none',
                          'dark:border-white/[0.12] dark:bg-[#262626] dark:text-[#ececec] dark:hover:border-white/[0.26] dark:hover:bg-[#32353c]'
                        )}
                      >
                        <span>{activeUnderlying.id}</span>
                        {activeIndexQuote.ltp > 0 && (
                          <span className="font-bold tabular-nums text-[#09090b] dark:text-[#ececec]">
                            {activeIndexQuote.ltp.toLocaleString('en-IN', {
                              minimumFractionDigits: 2,
                              maximumFractionDigits: 2,
                            })}
                          </span>
                        )}
                        {activeIndexQuote.change !== null && activeIndexQuote.changePct !== null && (
                          <span
                            className={cn(
                              'text-[10px] font-semibold tabular-nums',
                              activeIndexQuote.change >= 0
                                ? 'text-[#15803d] dark:text-[#4ade80]'
                                : 'text-[#dc2626] dark:text-[#f87171]'
                            )}
                          >
                            {activeIndexQuote.change >= 0 ? '+' : ''}
                            {activeIndexQuote.change.toFixed(2)} (
                            {activeIndexQuote.changePct >= 0 ? '+' : ''}
                            {activeIndexQuote.changePct.toFixed(2)}%)
                          </span>
                        )}
                        <span className="text-[9px] text-[#52525b] dark:text-[#a1a1aa]">▾</span>
                      </button>
                      {peIndexOpen && (
                        <div
                          className="absolute left-0 top-full z-50 mt-1 w-[340px] rounded-xl border border-black/[0.12] bg-white p-1.5 shadow-[0_14px_34px_rgba(0,0,0,0.18)] dark:border-white/[0.14] dark:bg-[#171717] dark:shadow-[0_18px_42px_rgba(0,0,0,0.85)]"
                          onClick={(e) => e.stopPropagation()}
                        >
                          {UNDERLYINGS.map((u) => {
                            const q = indexQuotesById[u.id]
                            const isUp = (q?.change ?? 0) >= 0
                            return (
                              <button
                                key={u.id}
                                type="button"
                                onClick={(e) => {
                                  e.preventDefault()
                                  e.stopPropagation()
                                  peDidScrollRef.current = false
                                  setPeIndexOpen(false)
                                  handleSelectUnderlying(u)
                                }}
                                className={cn(
                                  'flex w-full items-center justify-between gap-2 rounded-lg px-2.5 py-1.5 text-left font-mono text-[11px] transition-colors cursor-pointer',
                                  u.id === activeUnderlying.id
                                    ? 'bg-[#e4e8ee] text-[#09090b] font-semibold dark:bg-[#2d3036] dark:text-white'
                                    : 'text-[#3f3f46] hover:bg-[#eef1f5] hover:text-[#09090b] dark:text-[#b4b4b4] dark:hover:bg-[#26282d] dark:hover:text-white'
                                )}
                              >
                                <div className="flex items-center gap-1.5 min-w-0">
                                  <span
                                    className={cn(
                                      'h-1.5 w-1.5 rounded-full shrink-0',
                                      q?.change != null && q.change < 0
                                        ? 'bg-[#dc2626]'
                                        : 'bg-[#16a34a]'
                                    )}
                                  />
                                  <span className="font-semibold text-[#09090b] dark:text-[#ececec]">
                                    {u.label}
                                  </span>
                                  <span className="rounded bg-[#f4f4f5] border border-black/[0.09] px-1 py-0.2 text-[9px] text-[#52525b] dark:bg-[#262626] dark:border-white/[0.10] dark:text-[#a1a1aa]">
                                    {u.foExchange}
                                  </span>
                                </div>
                                <div className="flex items-center gap-1.5 tabular-nums shrink-0">
                                  <span className="font-bold text-[#09090b] dark:text-[#ececec]">
                                    {q && q.ltp > 0
                                      ? q.ltp.toLocaleString('en-IN', {
                                          minimumFractionDigits: 2,
                                          maximumFractionDigits: 2,
                                        })
                                      : '—'}
                                  </span>
                                  {q && q.change !== null && q.changePct !== null && (
                                    <span
                                      className={cn(
                                        'rounded px-1.5 py-0.5 text-[10px] font-semibold',
                                        isUp
                                          ? 'bg-[#16a34a]/12 text-[#15803d] dark:bg-[#16a34a]/15 dark:text-[#4ade80]'
                                          : 'bg-[#dc2626]/12 text-[#dc2626] dark:bg-[#dc2626]/15 dark:text-[#f87171]'
                                      )}
                                    >
                                      {isUp ? '+' : ''}
                                      {q.change.toFixed(2)} ({isUp ? '+' : ''}
                                      {q.changePct.toFixed(2)}%)
                                    </span>
                                  )}
                                </div>
                              </button>
                            )
                          })}
                        </div>
                      )}
                    </div>
                    {/* OpenAI UI Expiry Date Selector */}
                    <select
                      aria-label="PE Expiry Date"
                      value={selectedExpiry}
                      onChange={(e) => {
                        ceDidScrollRef.current = false
                        peDidScrollRef.current = false
                        setSelectedExpiry(e.target.value)
                      }}
                      className={cn(
                        'h-6.5 cursor-pointer rounded-md border px-2 font-mono text-[11px] font-medium transition-colors',
                        'border-black/[0.12] bg-white text-[#09090b] hover:border-black/[0.24] hover:bg-[#e8ecf1] focus:outline-none focus:border-black/[0.32]',
                        'dark:border-white/[0.12] dark:bg-[#262626] dark:text-[#ececec] dark:hover:border-white/[0.26] dark:hover:bg-[#32353c] dark:focus:border-white/[0.32]'
                      )}
                    >
                      {expiries.length === 0 ? (
                        <option
                          value=""
                          className="bg-white text-[#09090b] dark:bg-[#1e1e1e] dark:text-[#ececec]"
                        >
                          Loading expiries…
                        </option>
                      ) : (
                        expiries.map((exp) => (
                          <option
                            key={exp}
                            value={exp}
                            className="bg-white text-[#09090b] dark:bg-[#1e1e1e] dark:text-[#ececec]"
                          >
                            {exp}
                          </option>
                        ))
                      )}
                    </select>
                  </div>

                  <div className="flex items-center gap-1.5 shrink-0">
                    {isOptionChainStreaming && (
                      <span
                        className="inline-flex items-center gap-1 rounded-full border border-[#16a34a]/30 bg-[#16a34a]/12 px-1.5 py-0.5 text-[9px] font-mono font-semibold text-[#15803d] dark:text-[#4ade80]"
                        title="Real-time 0–1ms WebSocket stream active"
                      >
                        <span className="h-1.5 w-1.5 rounded-full bg-[#16a34a] animate-pulse" />
                        LIVE
                      </span>
                    )}
                    <button
                      type="button"
                      onClick={(e) => {
                        e.preventDefault()
                        e.stopPropagation()
                        scrollPeToAtm()
                      }}
                      className="h-6.5 rounded-md border border-black/[0.12] bg-white hover:bg-[#e8ecf1] hover:border-black/[0.24] px-2 font-mono text-[10px] font-semibold text-[#09090b] dark:border-white/[0.12] dark:bg-[#262626] dark:hover:bg-[#32353c] dark:hover:border-white/[0.26] dark:text-[#ececec] transition-colors"
                      title="Center scroll on ATM strike"
                    >
                      ATM
                    </button>
                    <button
                      type="button"
                      onClick={(e) => {
                        e.preventDefault()
                        e.stopPropagation()
                        refetchOptionChain()
                      }}
                      className="flex h-6.5 w-6.5 items-center justify-center rounded-md border border-black/[0.12] bg-white text-[#52525b] hover:bg-[#e8ecf1] hover:border-black/[0.24] hover:text-[#09090b] dark:border-white/[0.12] dark:bg-[#262626] dark:text-[#b4b4b4] dark:hover:bg-[#32353c] dark:hover:border-white/[0.26] dark:hover:text-white transition-colors"
                      title="Refresh Option Chain & OI"
                    >
                      <RefreshCw
                        className={cn('h-3 w-3', isOptionChainLoading && 'animate-spin')}
                      />
                    </button>
                  </div>
                </div>

                {/* OpenAI UI Telemetry Strip: SPOT | ATM | MAX PAIN | PCR | S | R */}
                <div className="flex flex-wrap items-center justify-between gap-1.5 border-b border-black/[0.07] bg-[#eef0f3] px-3 py-1.5 text-[10px] font-mono tabular-nums dark:border-white/[0.07] dark:bg-[#1a1a1a]">
                  <div className="flex items-center gap-2">
                    <span className="inline-flex items-center gap-1.5 text-[#52525b] dark:text-[#a1a1aa]">
                      SPOT{' '}
                      <strong className="font-semibold text-[#09090b] dark:text-[#ececec]">
                        {activeIndexQuote.ltp > 0
                          ? activeIndexQuote.ltp.toLocaleString('en-IN', {
                              minimumFractionDigits: 2,
                              maximumFractionDigits: 2,
                            })
                          : '—'}
                      </strong>
                      {activeIndexQuote.change !== null && activeIndexQuote.changePct !== null && (
                        <span
                          className={cn(
                            'font-semibold',
                            activeIndexQuote.change >= 0
                              ? 'text-[#15803d] dark:text-[#4ade80]'
                              : 'text-[#dc2626] dark:text-[#f87171]'
                          )}
                        >
                          {activeIndexQuote.change >= 0 ? '+' : ''}
                          {activeIndexQuote.change.toFixed(2)} (
                          {activeIndexQuote.changePct >= 0 ? '+' : ''}
                          {activeIndexQuote.changePct.toFixed(2)}%)
                        </span>
                      )}
                    </span>
                    {effectiveAtmStrike != null && (
                      <span className="rounded border border-black/[0.10] bg-white px-1.5 py-0.2 text-[#52525b] dark:border-white/[0.10] dark:bg-[#262626] dark:text-[#b4b4b4]">
                        ATM{' '}
                        <strong className="font-semibold text-[#09090b] dark:text-[#ececec]">
                          {effectiveAtmStrike}
                        </strong>
                      </span>
                    )}
                    {maxPainStrike != null && (
                      <span
                        className="rounded border border-black/[0.10] bg-white px-1.5 py-0.2 text-[#3f3f46] font-medium dark:border-white/[0.10] dark:bg-[#262626] dark:text-[#d4d4d4]"
                        title="Option Chain Max Pain Strike"
                      >
                        MP {maxPainStrike}
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-1.5">
                    {pcr > 0 && (
                      <span
                        className={cn(
                          'rounded border px-1.5 py-0.2 font-medium',
                          pcr >= 1
                            ? 'border-[#16a34a]/30 bg-[#16a34a]/12 text-[#15803d] dark:text-[#4ade80]'
                            : pcr <= 0.7
                              ? 'border-[#dc2626]/30 bg-[#dc2626]/12 text-[#dc2626] dark:text-[#f87171]'
                              : 'border-black/[0.10] bg-white text-[#52525b] dark:border-white/[0.10] dark:bg-[#262626] dark:text-[#b4b4b4]'
                        )}
                        title="Put-Call OI Ratio"
                      >
                        PCR {pcr.toFixed(2)}
                      </span>
                    )}
                    {maxPeOiStrike != null && (
                      <span
                        className="rounded border border-[#16a34a]/35 bg-[#16a34a]/12 px-1.5 py-0.2 text-[#15803d] dark:text-[#4ade80] font-semibold"
                        title="Support (S) — Highest Put OI Strike"
                      >
                        S {maxPeOiStrike}
                      </span>
                    )}
                    {maxCeOiStrike != null && (
                      <span
                        className="rounded border border-[#dc2626]/35 bg-[#dc2626]/12 px-1.5 py-0.2 text-[#dc2626] dark:text-[#f87171] font-semibold"
                        title="Resistance (R) — Highest Call OI Strike"
                      >
                        R {maxCeOiStrike}
                      </span>
                    )}
                  </div>
                </div>

                {/* 4-Column OpenAI UI Table Header */}
                <div className="grid grid-cols-[148px_1fr_92px_76px] items-center border-b border-black/[0.08] bg-[#e6e9ef] px-3 py-1.5 text-[10px] font-semibold uppercase tracking-wider text-[#52525b] font-mono dark:border-white/[0.08] dark:bg-[#1c1c1c] dark:text-[#a1a1aa]">
                  <span>Strike · Level</span>
                  <span className="text-right pr-2">OI / Build</span>
                  <span className="text-right">LTP</span>
                  <span className="text-right">Chg%</span>
                </div>

                {/* Scrollable Full Strike Range (51 Strikes — Never jumps on WebSocket tick) */}
                <div
                  ref={peListRef}
                  className="max-h-[348px] overflow-y-auto overscroll-contain divide-y divide-black/[0.05] bg-white dark:divide-white/[0.04] dark:bg-[#171717]"
                >
                  {enrichedChain.length === 0 ? (
                    <div className="py-10 text-center font-mono text-xs text-[#52525b] dark:text-[#a1a1aa]">
                      Loading option chain strikes…
                    </div>
                  ) : (
                    enrichedChain.map((r) => {
                      const s = String(r.strike)
                      const leg = r.pe
                      if (!leg) return null
                      const isAtm = r.strike === effectiveAtmStrike
                      const isSelected = s === peStrike
                      const isMaxPeOi =
                        maxPeOiStrike != null && r.strike === maxPeOiStrike && leg.oi > 0
                      const isMaxCeOi =
                        maxCeOiStrike != null && r.strike === maxCeOiStrike && (r.ce?.oi ?? 0) > 0
                      const isMaxPain =
                        maxPainStrike != null && r.strike === maxPainStrike
                      const oiPct =
                        leg.oi > 0 ? Math.min(100, Math.round((leg.oi / peakPeOi) * 100)) : 0
                      const flash = flashes[leg.symbol]

                      return (
                        <div
                          key={s}
                          data-atm={isAtm ? 'true' : undefined}
                          onMouseEnter={() => {
                            if (apiKey && leg.symbol) {
                              void prefetchSymbolData(
                                apiKey,
                                leg.symbol,
                                activeUnderlying.foExchange,
                                terminalsRef.current['scalper-p2']?.currentInterval() || '1m'
                              )
                            }
                          }}
                          onClick={() => {
                            handleSelectPeStrike(s)
                            setPeChainOpen(false)
                          }}
                          className={cn(
                            'group relative grid h-8 w-full cursor-pointer grid-cols-[148px_1fr_92px_76px] items-center px-3 font-mono text-[11px] tabular-nums transition-colors',
                            'hover:bg-[#e8ecf2] dark:hover:bg-[#262930]',
                            leg.moneyness === 'ITM' && 'bg-black/[0.02] dark:bg-white/[0.015]',
                            isAtm &&
                              'bg-[#e2e6ec] border-y border-black/[0.15] font-semibold dark:bg-[#262626] dark:border-white/[0.15]',
                            isSelected &&
                              'bg-[#dc2626]/[0.14] ring-1 ring-inset ring-[#dc2626]/50 dark:bg-[#dc2626]/[0.16]',
                            flash === 'up' && 'bg-[#16a34a]/25',
                            flash === 'down' && 'bg-[#dc2626]/25'
                          )}
                        >
                          {/* Strike + ATM / ITM / OTM Tag + Support (S) / Resistance (R) / MaxPain Badge */}
                          <div className="flex items-center gap-1 min-w-0">
                            <span
                              className={cn(
                                'font-semibold tracking-tight',
                                isAtm
                                  ? 'text-[#09090b] dark:text-white font-bold'
                                  : isSelected
                                    ? 'text-[#dc2626] dark:text-[#f87171] font-bold'
                                    : 'text-[#09090b] dark:text-[#ececec]'
                              )}
                            >
                              {s}
                            </span>
                            {isAtm ? (
                              <span className="rounded border border-black/[0.18] bg-[#d4d8df] px-1 py-0.2 text-[9px] font-bold text-[#09090b] dark:border-white/[0.18] dark:bg-[#333333] dark:text-white">
                                ATM
                              </span>
                            ) : (
                              <span
                                className={cn(
                                  'rounded border px-1 py-0.2 text-[9px] font-medium',
                                  leg.moneyness === 'ITM'
                                    ? 'border-[#16a34a]/30 bg-[#16a34a]/12 text-[#15803d] dark:text-[#4ade80]'
                                    : 'border-black/[0.09] bg-[#f1f3f5] text-[#52525b] dark:border-white/[0.09] dark:bg-[#222222] dark:text-[#a1a1aa]'
                                )}
                              >
                                {leg.moneyness}
                              </span>
                            )}
                            {isMaxPeOi && (
                              <span
                                className="rounded border border-[#16a34a]/40 bg-[#16a34a]/15 px-1.5 py-0.2 text-[8px] font-bold text-[#15803d] dark:text-[#4ade80]"
                                title="Support (S) — Highest Put OI"
                              >
                                S
                              </span>
                            )}
                            {isMaxCeOi && !isMaxPeOi && (
                              <span
                                className="rounded border border-[#dc2626]/40 bg-[#dc2626]/15 px-1.5 py-0.2 text-[8px] font-bold text-[#dc2626] dark:text-[#f87171]"
                                title="Resistance (R) — Highest Call OI"
                              >
                                R
                              </span>
                            )}
                            {isMaxPain && !isAtm && (
                              <span
                                className="rounded border border-black/[0.14] bg-[#e4e7ec] px-1 py-0.2 text-[8px] font-bold text-[#3f3f46] dark:border-white/[0.14] dark:bg-[#2a2a2a] dark:text-[#d4d4d4]"
                                title="Max Pain Strike"
                              >
                                MP
                              </span>
                            )}
                          </div>

                          {/* OI Cell with OpenAI UI Bar */}
                          <div className="relative flex h-full items-center justify-end pr-2 overflow-hidden">
                            {oiPct > 0 && (
                              <div
                                className={cn(
                                  'pointer-events-none absolute inset-y-1.5 right-1 rounded-xs transition-all duration-300',
                                  isMaxPeOi
                                    ? 'bg-[#dc2626]/30 border-r-2 border-[#dc2626] dark:bg-[#dc2626]/35'
                                    : 'bg-[#dc2626]/15 dark:bg-[#dc2626]/18'
                                )}
                                style={{ width: `${oiPct}%` }}
                              />
                            )}
                            <span
                              className={cn(
                                'relative z-10 text-[10px]',
                                isMaxPeOi
                                  ? 'font-bold text-[#09090b] dark:text-[#ececec]'
                                  : 'text-[#52525b] dark:text-[#b4b4b4]'
                              )}
                            >
                              {formatCompactOi(leg.oi)}
                            </span>
                          </div>

                          {/* Live LTP */}
                          <span
                            className={cn(
                              'text-right font-semibold',
                              flash === 'up'
                                ? 'text-[#16a34a] dark:text-[#4ade80]'
                                : flash === 'down'
                                  ? 'text-[#dc2626] dark:text-[#f87171]'
                                  : 'text-[#09090b] dark:text-[#ececec]'
                            )}
                          >
                            {leg.ltp > 0 ? leg.ltp.toFixed(2) : '—'}
                          </span>

                          {/* Live % Change */}
                          <span
                            className={cn(
                              'text-right text-[10px] font-medium',
                              leg.chgPct != null
                                ? leg.chgPct >= 0
                                  ? 'text-[#16a34a] dark:text-[#4ade80]'
                                  : 'text-[#dc2626] dark:text-[#f87171]'
                                : 'text-[#52525b] dark:text-[#a1a1aa]'
                            )}
                          >
                            {leg.chgPct != null
                              ? `${leg.chgPct >= 0 ? '+' : ''}${leg.chgPct.toFixed(1)}%`
                              : '—'}
                          </span>
                        </div>
                      )
                    })
                  )}
                </div>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </footer>
      </div>
    </ChartOrderBridgeContext.Provider>
  )
}
