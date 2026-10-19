import { ChevronLeft, ChevronRight, RefreshCw } from 'lucide-react'
import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  type BrokerContract,
  type BrokerWatchlistCatalog as Catalog,
  watchlistApi,
  watchlistError,
} from '@/api/watchlist'
import { Button } from '@/components/ui/button'
import { type PriceableItem, useLivePrice } from '@/hooks/useLivePrice'
import { prefetchSymbolData, type SearchRow } from '@/lib/trading/terminal'
import { cn } from '@/lib/utils'

const PAGE_SIZE = 40
const SELECTION_KEY = 'oa-broker-watchlist-expiries'

function readSelections(): Record<string, string> {
  try {
    const value: unknown = JSON.parse(localStorage.getItem(SELECTION_KEY) || '{}')
    if (!value || typeof value !== 'object' || Array.isArray(value)) return {}
    return Object.fromEntries(
      Object.entries(value).filter(([, symbol]) => typeof symbol === 'string')
    )
  } catch {
    return {}
  }
}

function contractLabel(contract: BrokerContract): string {
  if (!contract.expiry) return 'Spot index'
  return new Date(`${contract.expiry}T00:00:00Z`).toLocaleDateString('en-GB', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    timeZone: 'UTC',
  })
}

function priceLabel(value: number | undefined): string {
  return value && Number.isFinite(value)
    ? value.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
    : '—'
}

export function BrokerWatchlistCatalog({
  mode,
  apiKey,
  onPick,
  activeSymbol,
}: {
  mode: 'commodities' | 'indices'
  apiKey: string
  onPick(row: SearchRow): void
  activeSymbol?: string | null
}) {
  const [catalog, setCatalog] = useState<Catalog | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [page, setPage] = useState(0)
  const [indexOnly, setIndexOnly] = useState(false)
  const [selections, setSelections] = useState(readSelections)

  useEffect(() => {
    try {
      localStorage.setItem(SELECTION_KEY, JSON.stringify(selections))
    } catch {
      /* Private browsing may disallow storage. */
    }
  }, [selections])

  const reload = useCallback(async () => {
    setLoading(true)
    try {
      const loaded = await watchlistApi.brokerCatalog()
      setCatalog((current) =>
        JSON.stringify(current) === JSON.stringify(loaded) ? current : loaded
      )
      setError(null)
    } catch (failure) {
      setError(watchlistError(failure, 'Could not load broker contracts. Please refresh.'))
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void reload()
    // Refresh listings after a master download and across the IST expiry date.
    // This is a local metadata read, not another broker API polling loop.
    const timer = window.setInterval(() => {
      if (document.visibilityState === 'visible') void reload()
    }, 300_000)
    const onVisible = () => {
      if (document.visibilityState === 'visible') void reload()
    }
    document.addEventListener('visibilitychange', onVisible)
    return () => {
      window.clearInterval(timer)
      document.removeEventListener('visibilitychange', onVisible)
    }
  }, [reload])

  // biome-ignore lint/correctness/useExhaustiveDependencies: category changes intentionally reset pagination.
  useEffect(() => {
    setPage(0)
  }, [mode, indexOnly])

  const groups = useMemo(() => {
    const all = catalog?.[mode] ?? []
    return mode === 'commodities' && indexOnly
      ? all.filter((group) => group.kind === 'commodity_index')
      : all
  }, [catalog, mode, indexOnly])
  const pages = Math.max(1, Math.ceil(groups.length / PAGE_SIZE))
  const currentPage = Math.min(page, pages - 1)
  const rows = useMemo(
    () =>
      groups
        .slice(currentPage * PAGE_SIZE, (currentPage + 1) * PAGE_SIZE)
        .map((group) => ({
          group,
          contract:
            group.contracts.find(
              (item) => item.symbol === selections[`${catalog?.broker}:${group.id}`]
            ) ?? group.contracts[0],
        }))
        .filter((row) => row.contract),
    [groups, currentPage, selections, catalog?.broker]
  )
  const contracts = useMemo<Array<BrokerContract & PriceableItem>>(
    () => rows.map((row) => row.contract),
    [rows]
  )
  const {
    data: prices,
    isLive,
    isAnyMarketOpen,
    multiQuotesFetchedAt,
  } = useLivePrice(contracts, {
    enabled: contracts.length > 0,
    multiQuotesRefreshInterval: 60_000,
    pauseWhenHidden: true,
  })
  const quoteMap = useMemo(
    () => new Map(prices.map((item) => [`${item.exchange}:${item.symbol}`, item])),
    [prices]
  )

  const pick = (contract: BrokerContract) => onPick({ ...contract })

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex shrink-0 items-center justify-between gap-2 border-b px-3 py-2">
        <div className="min-w-0">
          <p className="text-xs font-semibold">
            {mode === 'commodities' ? 'Commodities & indices' : 'Index spot & futures'}
          </p>
          <p className="text-[10px] text-muted-foreground">
            {catalog?.broker.toUpperCase() ?? 'Broker'} symbol master · {groups.length} instruments
          </p>
        </div>
        <Button
          variant="ghost"
          size="icon"
          className="h-7 w-7 shrink-0"
          disabled={loading}
          onClick={() => void reload()}
          aria-label="Refresh broker contracts"
          title="Refresh from the downloaded broker symbol master"
        >
          <RefreshCw className={cn('h-3.5 w-3.5', loading && 'animate-spin')} />
        </Button>
      </div>
      {mode === 'commodities' && (
        <div className="flex shrink-0 gap-1 border-b px-2 py-1.5">
          {([false, true] as const).map((only) => (
            <button
              key={String(only)}
              type="button"
              aria-pressed={indexOnly === only}
              onClick={() => setIndexOnly(only)}
              className={cn(
                'rounded-md px-2 py-1 text-[11px] transition-colors',
                indexOnly === only
                  ? 'bg-accent font-medium text-accent-foreground'
                  : 'text-muted-foreground hover:bg-accent/50'
              )}
            >
              {only ? 'Commodity indices' : 'All commodities'}
            </button>
          ))}
        </div>
      )}
      {error && (
        <div role="alert" className="border-b px-3 py-2 text-xs text-destructive">
          {error}
        </div>
      )}
      <div className="flex shrink-0 justify-between border-b px-3 py-1 text-[10px] uppercase tracking-wider text-muted-foreground">
        <span>Instrument / expiry</span>
        <span>Last price</span>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto">
        {!catalog && loading ? (
          <p className="p-3 text-xs text-muted-foreground">Loading broker contracts…</p>
        ) : !groups.length ? (
          <p className="p-3 text-xs text-muted-foreground">
            {error
              ? 'Use refresh to retry.'
              : 'No instruments in the current broker master. Download the broker master, then refresh here.'}
          </p>
        ) : (
          rows.map(({ group, contract }) => {
            const key = `${contract.exchange}:${contract.symbol}`
            const quote = quoteMap.get(key)
            return (
              <div
                key={group.id}
                className={cn(
                  'border-b border-border/50 px-3 py-2 transition-colors hover:bg-accent/40',
                  activeSymbol === key && 'bg-accent shadow-[inset_2px_0_0_0_var(--color-primary)]'
                )}
              >
                <button
                  type="button"
                  onClick={() => pick(contract)}
                  onMouseEnter={() => {
                    if (apiKey) void prefetchSymbolData(apiKey, contract.symbol, contract.exchange)
                  }}
                  className="flex w-full items-center justify-between gap-2 rounded-sm text-left focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                  aria-label={`Chart ${contract.symbol} on ${contract.exchange}`}
                  aria-current={activeSymbol === key ? true : undefined}
                  title={contract.symbol}
                >
                  <span className="min-w-0 truncate text-xs font-semibold">{group.name}</span>
                  <span className="shrink-0 text-xs tabular-nums">{priceLabel(quote?.ltp)}</span>
                </button>
                <div className="mt-1 flex items-center gap-2">
                  <span className="text-[9px] font-medium text-muted-foreground">
                    {contract.exchange}
                  </span>
                  {group.contracts.length > 1 || contract.expiry ? (
                    <select
                      aria-label={`${group.name} contract expiry`}
                      value={contract.symbol}
                      onChange={(event) => {
                        const chosen = group.contracts.find(
                          (item) => item.symbol === event.target.value
                        )
                        if (!chosen) return
                        setSelections((saved) => ({
                          ...saved,
                          [`${catalog?.broker}:${group.id}`]: chosen.symbol,
                        }))
                        pick(chosen)
                      }}
                      className="h-6 min-w-0 flex-1 rounded border border-border bg-background px-1 text-[11px] text-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                    >
                      {group.contracts.map((item) => (
                        <option key={item.symbol} value={item.symbol}>
                          {item.expiry ? `${contractLabel(item)} · FUT` : 'Spot index · No expiry'}
                        </option>
                      ))}
                    </select>
                  ) : (
                    <span className="text-[10px] text-muted-foreground">
                      Spot index · No expiry
                    </span>
                  )}
                  {group.kind === 'commodity_index' && (
                    <span className="text-[9px] text-muted-foreground">INDEX</span>
                  )}
                </div>
              </div>
            )
          })
        )}
      </div>
      {pages > 1 && (
        <div className="flex shrink-0 items-center justify-between border-t px-2 py-1">
          <Button
            size="icon"
            variant="ghost"
            className="h-6 w-6"
            aria-label="Previous instruments"
            disabled={currentPage === 0}
            onClick={() => setPage(currentPage - 1)}
          >
            <ChevronLeft className="h-3.5 w-3.5" />
          </Button>
          <span className="text-[10px] text-muted-foreground">
            {currentPage + 1} / {pages}
          </span>
          <Button
            size="icon"
            variant="ghost"
            className="h-6 w-6"
            aria-label="Next instruments"
            disabled={currentPage === pages - 1}
            onClick={() => setPage(currentPage + 1)}
          >
            <ChevronRight className="h-3.5 w-3.5" />
          </Button>
        </div>
      )}
      <p className="shrink-0 border-t px-3 py-1.5 text-[10px] text-muted-foreground">
        Select a name or expiry to open its chart.{' '}
        {isLive
          ? 'Feed connected.'
          : !isAnyMarketOpen
            ? 'Market closed · last traded prices.'
            : multiQuotesFetchedAt
              ? 'Quote snapshots · refresh every 60s.'
              : 'Waiting for broker prices.'}{' '}
        — means no price received.
      </p>
    </div>
  )
}
