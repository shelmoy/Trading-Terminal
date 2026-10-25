import { type QuotesData, tradingApi } from '@/api/trading'
import { useAuthStore } from '@/stores/authStore'
import { marketCount, marketSample } from './marketDataPerformance'

type Instrument = { symbol: string; exchange: string }
export type Snapshot = { data: QuotesData; receivedAt: number; requestedAt: number }
const entries = new Map<string, Snapshot>()
const pending = new Map<string, Promise<void>>()
const STORAGE_KEY = 'oa-watchlist-snapshots-v1'
const MAX_ENTRIES = 2000
let identity = ''
let credential: string | null = null
let generation = 0
let persistTimer: ReturnType<typeof setTimeout> | null = null

export function quoteSessionScope(): string {
  const { user } = useAuthStore.getState()
  return JSON.stringify([user?.broker, user?.username, user?.loginTime])
}

function session(): number {
  const next = quoteSessionScope()
  const apiKey = useAuthStore.getState().apiKey
  if (next !== identity || apiKey !== credential) {
    identity = next
    credential = apiKey
    generation++
    entries.clear()
    pending.clear()
    if (persistTimer) clearTimeout(persistTimer)
    persistTimer = null
    try {
      const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? 'null')
      if (apiKey && saved?.identity === next && Array.isArray(saved.entries)) {
        for (const [key, value] of saved.entries.slice(-MAX_ENTRIES)) {
          if (typeof key === 'string' && value?.data?.ltp > 0 &&
            Number.isFinite(value.receivedAt) && Date.now() - value.receivedAt < 6 * 3600_000) {
            entries.set(key, value)
          }
        }
      } else localStorage.removeItem(STORAGE_KEY)
    } catch { /* Storage is an optional warm-start cache. */ }
  }
  return generation
}

const keyOf = (row: Instrument) => `${row.exchange.toUpperCase()}:${row.symbol.toUpperCase()}`

export function cachedQuoteSnapshots(rows: Instrument[]): Map<string, Snapshot> {
  session()
  const result = new Map<string, Snapshot>()
  for (const row of rows) {
    const key = keyOf(row)
    const value = entries.get(key)
    if (value) result.set(key, value)
  }
  return result
}

export function rememberQuoteSnapshot(row: Instrument, snapshot: Snapshot): void {
  session()
  const key = keyOf(row)
  const previous = entries.get(key)
  if (previous && previous.requestedAt > snapshot.requestedAt) return
  entries.delete(key)
  entries.set(key, snapshot)
  if (entries.size > MAX_ENTRIES) entries.delete(entries.keys().next().value!)
  if (persistTimer) return
  persistTimer = setTimeout(() => {
    persistTimer = null
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify({ identity, entries: [...entries] })) }
    catch { /* Quota/private mode must not affect live prices. */ }
  }, 2000)
}

/** Share overlapping snapshot requests per instrument; never fetch OI for a watchlist. */
export async function fetchQuoteSnapshots(apiKey: string, rows: Instrument[]) {
  const epoch = session()
  const unique = [...new Map(rows.map(row => [keyOf(row), row])).values()]
  const missing = unique.filter(row => !pending.has(keyOf(row)) &&
    Date.now() - (entries.get(keyOf(row))?.receivedAt ?? 0) > 5000).slice(0, Math.max(0, 256 - pending.size))
  const waits = new Set<Promise<void>>()
  for (let start = 0; start < missing.length; start += 50) {
    const batch = missing.slice(start, start + 50)
    const requestedAt = Date.now()
    const began = performance.now()
    const request = (async () => {
      marketCount('snapshotRequests')
      const response = await tradingApi.getMultiQuotes(apiKey, batch, false)
      if (epoch !== generation || apiKey !== useAuthStore.getState().apiKey) return
      if (response.status === 'success') {
        for (const row of response.results ?? []) {
          if (row.data?.ltp > 0) rememberQuoteSnapshot(row, {
            data: row.data, requestedAt, receivedAt: Date.now(),
          })
        }
      }
      marketSample('snapshotRequest', performance.now() - began)
    })().catch(() => { marketCount('snapshotFailures') })
    for (const row of batch) pending.set(keyOf(row), request)
    waits.add(request)
    void request.finally(() => {
      for (const row of batch) if (pending.get(keyOf(row)) === request) pending.delete(keyOf(row))
    })
  }
  for (const row of unique) {
    const request = pending.get(keyOf(row))
    if (request) waits.add(request)
  }
  await Promise.all(waits)
  return epoch === generation ? cachedQuoteSnapshots(rows) : new Map<string, Snapshot>()
}

useAuthStore.subscribe(() => { session() })
