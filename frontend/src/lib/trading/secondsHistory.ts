import type { Bar } from 'openalgo-charts'
import { candleSessionAnchor } from './sessionHours'

// Only genuine seconds history or observed tick candles belong here. Minute
// history cannot reconstruct the trades within a seconds candle.
const streams = new Map<string, Map<number, Bar>>()
const MAX_STREAMS = 24
const MAX_BARS = 30_000
const RETENTION_SEC = 7 * 86400
const dirty = new Map<string, { stream: string; bar: Bar }>()
const hydrated = new Map<string, Promise<void>>()
const hashes = new Map<string, Promise<string>>()
let database: Promise<IDBDatabase | null> | undefined
let flushTimer: ReturnType<typeof setTimeout> | undefined
let lastPrune = 0

function diskKey(key: string): Promise<string> {
  let pending = hashes.get(key)
  if (!pending) {
    // Persist an opaque account/instrument identifier, never the API key.
    pending = crypto.subtle.digest('SHA-256', new TextEncoder().encode(key))
      .then((hash) => Array.from(new Uint8Array(hash), (n) => n.toString(16).padStart(2, '0')).join(''))
    hashes.set(key, pending)
  }
  return pending
}

function openDatabase(): Promise<IDBDatabase | null> {
  if (!database) {
    database = new Promise<IDBDatabase | null>((resolve) => {
      if (typeof indexedDB === 'undefined') return resolve(null)
      const request = indexedDB.open('openalgo-observed-seconds-v1', 1)
      request.onupgradeneeded = () => {
        const store = request.result.createObjectStore('bars', { keyPath: ['stream', 'time'] })
        store.createIndex('time', 'time')
      }
      request.onsuccess = () => {
        request.result.onversionchange = () => request.result.close()
        resolve(request.result)
      }
      request.onerror = () => resolve(null)
      request.onblocked = () => resolve(null)
    })
  }
  return database
}

async function flush(): Promise<void> {
  clearTimeout(flushTimer)
  flushTimer = undefined
  if (!dirty.size) return
  const batch = [...dirty.values()]
  dirty.clear()
  try {
    const db = await openDatabase()
    if (!db) return
    const keys = new Map(await Promise.all(
      [...new Set(batch.map((row) => row.stream))].map(async (key) => [key, await diskKey(key)] as const)
    ))
    await new Promise<void>((resolve, reject) => {
      const transaction = db.transaction('bars', 'readwrite')
      const store = transaction.objectStore('bars')
      for (const row of batch) store.put({ stream: keys.get(row.stream), time: row.bar.time, bar: row.bar })
      // Expire old observations without rewriting large history arrays per tick.
      if (Date.now() - lastPrune > 60_000) {
        lastPrune = Date.now()
        const cursor = store.index('time').openCursor(IDBKeyRange.upperBound(Date.now() / 1000 - RETENTION_SEC))
        cursor.onsuccess = () => {
          if (!cursor.result) return
          cursor.result.delete()
          cursor.result.continue()
        }
      }
      transaction.oncomplete = () => resolve()
      transaction.onerror = () => reject(transaction.error)
      transaction.onabort = () => reject(transaction.error)
    })
  } catch {
    // Storage denial/quota must never block the feed; in-memory history remains.
    console.warn('OpenAlgo could not save seconds history in browser storage')
  }
}

if (typeof document !== 'undefined') {
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) void flush()
  })
  window.addEventListener('pagehide', () => { void flush() })
}

async function hydrate(key: string): Promise<void> {
  let pending = hydrated.get(key)
  if (!pending) {
    pending = (async () => {
      try {
        const db = await openDatabase()
        if (!db) return
        const stream = await diskKey(key)
        const saved = await new Promise<Bar[]>((resolve, reject) => {
          const transaction = db.transaction('bars', 'readonly')
          const range = IDBKeyRange.bound([stream, Date.now() / 1000 - RETENTION_SEC], [stream, Infinity])
          const cursor = transaction.objectStore('bars').openCursor(range, 'prev')
          const rows: Bar[] = []
          cursor.onsuccess = () => {
            if (!cursor.result || rows.length >= MAX_BARS) return
            rows.push(cursor.result.value.bar as Bar)
            cursor.result.continue()
          }
          transaction.oncomplete = () => resolve(rows.reverse())
          transaction.onerror = () => reject(transaction.error)
          transaction.onabort = () => reject(transaction.error)
        })
        const current = streams.get(key)
        // Ticks can arrive during the disk read. They win over the saved copy.
        const rows = new Map(saved.map((bar) => [bar.time, bar]))
        for (const [time, bar] of current ?? []) rows.set(time, bar)
        const newest = [...rows.values()].sort((a, b) => a.time - b.time).slice(-MAX_BARS)
        if (!streams.has(key) && streams.size >= MAX_STREAMS) {
          const oldest = streams.keys().next().value!
          streams.delete(oldest)
          hydrated.delete(oldest)
        }
        streams.set(key, new Map(newest.map((bar) => [bar.time, bar])))
      } catch {
        // A blocked browser database leaves the live chart usable.
      }
    })()
    hydrated.set(key, pending)
  }
  await pending
}

export function rememberSecondsBar(key: string, bar: Bar): void {
  let rows = streams.get(key)
  if (!rows) {
    if (streams.size >= MAX_STREAMS) {
      const oldest = streams.keys().next().value!
      streams.delete(oldest)
      hydrated.delete(oldest)
      hashes.delete(oldest)
    }
    rows = new Map()
    streams.set(key, rows)
  }
  rows.set(bar.time, { ...bar })
  if (rows.size > MAX_BARS) rows.delete(rows.keys().next().value!)
  dirty.set(`${key}:${bar.time}`, { stream: key, bar: { ...bar } })
  if (!flushTimer) flushTimer = setTimeout(() => { void flush() }, 1000)
}

/** One-second OHLC observations allow later aggregation to any seconds interval. */
export function rememberSecondsTick(key: string, timeSec: number, price: number): void {
  const time = Math.floor(timeSec)
  const old = streams.get(key)?.get(time)
  rememberSecondsBar(key, old
    ? { ...old, high: Math.max(old.high, price), low: Math.min(old.low, price), close: price }
    : { time, open: price, high: price, low: price, close: price })
}

export async function loadSecondsHistory(key: string, exchange: string, intervalSec: number, from: number, to: number): Promise<Bar[]> {
  const baseKey = key.replace(/:\d+s$/, ':1s')
  await Promise.all([hydrate(key), hydrate(baseKey)])
  const exact = secondsHistory(key, from, to)
  const buckets = new Map<number, Bar>()
  let day = NaN
  let anchor = 0
  for (const source of secondsHistory(baseKey, from - intervalSec, to + intervalSec - 1)) {
    const nextDay = Math.floor((source.time + 19800) / 86400)
    if (day !== nextDay) {
      day = nextDay
      anchor = candleSessionAnchor(exchange, source.time)
    }
    const time = anchor + Math.floor((source.time - anchor) / intervalSec) * intervalSec
    if (time < from || time > to) continue
    const bar = buckets.get(time)
    if (bar) {
      bar.high = Math.max(bar.high, source.high)
      bar.low = Math.min(bar.low, source.low)
      bar.close = source.close
    } else buckets.set(time, { ...source, time })
  }
  // A directly recorded interval can include volume and older observations.
  // One-second history also covers ticks captured while a different interval was open.
  for (const bar of exact) {
    const observed = buckets.get(bar.time)
    buckets.set(bar.time, observed
      ? { ...bar, ...observed, high: Math.max(bar.high, observed.high), low: Math.min(bar.low, observed.low) }
      : bar)
  }
  return [...buckets.values()].sort((a, b) => a.time - b.time)
}

export function secondsHistory(key: string, from: number, to: number): Bar[] {
  return Array.from(streams.get(key)?.values() ?? [])
    .filter((bar) => bar.time >= from && bar.time <= to)
    .sort((a, b) => a.time - b.time)
    .map((bar) => ({ ...bar }))
}
