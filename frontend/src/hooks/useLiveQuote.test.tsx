import { act, renderHook, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { tradingApi } from '@/api/trading'
import { useLiveQuote } from './useLiveQuote'

let feed = new Map()
let connected = true
let apiKey = 'offline-only'
vi.mock('@/api/trading', () => ({ tradingApi: { getQuotes: vi.fn(), getDepth: vi.fn() } }))
vi.mock('@/hooks/useMarketData', () => ({ useMarketData: () => ({ data: feed, isConnected: connected, isPaused: false, isFallbackMode: false }) }))
vi.mock('@/hooks/useMarketStatus', () => ({ useMarketStatus: () => ({ isMarketOpen: () => true }) }))
vi.mock('@/stores/authStore', () => ({ useAuthStore: () => ({ apiKey }) }))
const quotes = vi.mocked(tradingApi.getQuotes)
const quote = (ltp: number) => ({ status: 'success', data: { ltp } }) as never
const options = { mode: 'Quote' as const, useDepthFallback: false }

beforeEach(() => {
  feed = new Map()
  connected = true
  apiKey = 'offline-only'
  quotes.mockReset()
})
afterEach(() => vi.useRealTimers())

it('uses fresh REST when the WebSocket price is stale', async () => {
  feed.set('NSE:TEST', { data: { ltp: 100 }, lastUpdate: Date.now() - 20_000 })
  quotes.mockResolvedValue(quote(200))
  const { result } = renderHook(() => useLiveQuote('TEST', 'NSE', options))
  await waitFor(() => expect(result.current.data.ltp).toBe(200))
  expect(result.current.dataSource).toBe('rest')
  expect(result.current.isLive).toBe(false)
})

it('discards late previous-symbol responses and cancels their requests', async () => {
  let finish!: (value: never) => void
  const previous = new Promise<never>(resolve => { finish = resolve })
  quotes.mockImplementation((_key, symbol) => symbol === 'OLD' ? previous : Promise.resolve(quote(200)))
  const { result, rerender } = renderHook(({ symbol }) => useLiveQuote(symbol, 'NSE', options), { initialProps: { symbol: 'OLD' } })
  const oldSignal = quotes.mock.calls[0][3]
  rerender({ symbol: 'NEW' })
  expect(oldSignal?.aborted).toBe(true)
  await waitFor(() => expect(result.current.data.ltp).toBe(200))
  await act(async () => finish(quote(100)))
  expect(result.current.data.ltp).toBe(200)
})

it('keeps a tick received after the REST request began', async () => {
  let finish!: (value: never) => void
  quotes.mockImplementation(() => new Promise(resolve => { finish = resolve }))
  const { result, rerender } = renderHook(() => useLiveQuote('TEST', 'NSE', options))
  feed = new Map([['NSE:TEST', { data: { ltp: 300 }, lastUpdate: Date.now() + 1 }]])
  rerender()
  await act(async () => finish(quote(100)))
  expect(result.current.data.ltp).toBe(300)
  expect(result.current.dataSource).toBe('websocket')
})

it('does not overlap refreshes and releases the request on unmount', async () => {
  quotes.mockImplementation(() => new Promise(() => {}))
  const { result, unmount } = renderHook(() => useLiveQuote('TEST', 'NSE', options))
  act(() => { void result.current.refresh(); void result.current.refresh() })
  expect(quotes).toHaveBeenCalledTimes(1)
  const signal = quotes.mock.calls[0][3]
  unmount()
  expect(signal?.aborted).toBe(true)
})

it('clears old-account REST and WS prices immediately on an API-key change', async () => {
  quotes.mockResolvedValueOnce(quote(100)).mockImplementation(() => new Promise(() => {}))
  const { result, rerender } = renderHook(() => useLiveQuote('TEST', 'NSE', options))
  await waitFor(() => expect(result.current.data.ltp).toBe(100))
  apiKey = 'other-offline-account'
  rerender()
  expect(result.current.data.ltp).toBeUndefined()
  expect(quotes).toHaveBeenCalledTimes(2)
})

it('expires a WS quote without requiring a new feed message', async () => {
  vi.useFakeTimers()
  const started = Date.now()
  feed.set('NSE:TEST', { data: { ltp: 300 }, lastUpdate: started })
  quotes.mockResolvedValue(quote(200))
  const { result } = renderHook(() => useLiveQuote('TEST', 'NSE', { ...options, staleThreshold: 50 }))
  await act(async () => {})
  expect(result.current.data.ltp).toBe(300)
  await act(async () => vi.advanceTimersByTime(60))
  expect(result.current.data.ltp).toBe(200)
  expect(result.current.isLive).toBe(false)
})

it('blocks a prior-account WS map until the new subscription supplies a map', () => {
  feed.set('NSE:TEST', { data: { ltp: 300 }, lastUpdate: Date.now() })
  const { result, rerender } = renderHook(() => useLiveQuote('TEST', 'NSE', { ...options, useQuotesFallback: false }))
  expect(result.current.data.ltp).toBe(300)
  apiKey = 'other-offline-account'
  rerender()
  expect(result.current.data.ltp).toBeUndefined()
  feed = new Map([['NSE:TEST', { data: { ltp: 500 }, lastUpdate: Date.now() }]])
  rerender()
  expect(result.current.data.ltp).toBe(500)
})

it('falls back immediately when the connection drops', async () => {
  feed.set('NSE:TEST', { data: { ltp: 300 }, lastUpdate: Date.now() })
  quotes.mockResolvedValue(quote(200))
  const { result, rerender } = renderHook(() => useLiveQuote('TEST', 'NSE', options))
  await waitFor(() => expect(result.current.isLoading).toBe(false))
  connected = false
  rerender()
  expect(result.current.data.ltp).toBe(200)
  expect(result.current.dataSource).toBe('rest')
})
