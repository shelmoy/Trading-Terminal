import { act, renderHook } from '@testing-library/react'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { useAuthStore } from '@/stores/authStore'
import { useThemeStore } from '@/stores/themeStore'
import { tradingApi } from '@/api/trading'
import { webClient } from '@/api/client'
import { showToast } from '@/utils/toast'
import { useScalperExitAll } from './useScalperExitAll'

vi.mock('@/api/trading', () => ({ tradingApi: {
  cancelAllOrders: vi.fn(), closeAllPositions: vi.fn(), getOrders: vi.fn(), getPositions: vi.fn(),
} }))
vi.mock('@/api/client', () => ({ webClient: { get: vi.fn() } }))
vi.mock('@/utils/toast', () => ({ showToast: { success: vi.fn(), warning: vi.fn(), error: vi.fn() } }))

beforeEach(() => {
  vi.clearAllMocks()
  useAuthStore.setState({ isAuthenticated: true, apiKey: 'offline-key',
    user: { username: 'offline', broker: 'fyers', loginTime: 'fixture' } as never })
  useThemeStore.setState({ appMode: 'live', isTogglingMode: false })
  vi.mocked(webClient.get).mockResolvedValue({ data: { status: 'success', data: { mode: 'live' } } })
  vi.mocked(tradingApi.cancelAllOrders).mockResolvedValue({ status: 'success' })
  vi.mocked(tradingApi.closeAllPositions).mockResolvedValue({ status: 'success' })
  vi.mocked(tradingApi.getOrders).mockResolvedValue({ status: 'success', data: { orders: [], statistics: {} as never } })
  vi.mocked(tradingApi.getPositions).mockResolvedValue({ status: 'success', data: [] })
})
afterEach(() => vi.useRealTimers())

it('coalesces rapid double clicks before the button rerenders', async () => {
  let finish!: () => void
  vi.mocked(tradingApi.cancelAllOrders).mockImplementation(() => new Promise((resolve) => {
    finish = () => resolve({ status: 'success' })
  }))
  const refresh = vi.fn(async () => {})
  const { result } = renderHook(() => useScalperExitAll(refresh))
  let first!: Promise<void>
  await act(async () => {
    first = result.current.exitAll()
    await result.current.exitAll()
  })
  expect(tradingApi.cancelAllOrders).toHaveBeenCalledTimes(1)
  expect(result.current.isExiting()).toBe(true)
  await act(async () => { finish(); await first })
  expect(result.current.exiting).toBe(false)
  expect(showToast.success).toHaveBeenCalledTimes(1)
  expect(refresh).toHaveBeenCalledTimes(1)
})
it('stops after a broker/account switch and does not toast against the new account', async () => {
  vi.mocked(tradingApi.cancelAllOrders).mockImplementation(async () => {
    useAuthStore.setState({ apiKey: 'other-account' })
    return { status: 'success' }
  })
  const { result } = renderHook(() => useScalperExitAll(vi.fn()))
  await act(async () => { await result.current.exitAll() })
  expect(tradingApi.closeAllPositions).not.toHaveBeenCalled()
  expect(showToast.success).not.toHaveBeenCalled()
  expect(showToast.error).not.toHaveBeenCalled()
})
it('cleans up verification reads and suppresses toasts on unmount', async () => {
  let finish!: () => void
  vi.mocked(tradingApi.getOrders).mockImplementation((_key, signal) => new Promise((resolve) => {
    finish = () => resolve({ status: 'success', data: { orders: [], statistics: {} as never } })
    expect(signal).toBeInstanceOf(AbortSignal)
  }))
  const { result, unmount } = renderHook(() => useScalperExitAll(vi.fn()))
  let pending!: Promise<void>
  await act(async () => { pending = result.current.exitAll() })
  const signal = vi.mocked(tradingApi.getOrders).mock.calls[0][1]!
  unmount()
  expect(signal.aborted).toBe(true)
  await act(async () => { finish(); await pending })
  expect(showToast.success).not.toHaveBeenCalled()
  expect(tradingApi.closeAllPositions).not.toHaveBeenCalled()
})
it('labels Analyze confirmation explicitly and preserves mode', async () => {
  useThemeStore.setState({ appMode: 'analyzer' })
  vi.mocked(webClient.get).mockResolvedValue({ data: { status: 'success', data: { mode: 'analyze' } } })
  vi.mocked(tradingApi.cancelAllOrders).mockResolvedValue({ status: 'success', mode: 'analyze' })
  vi.mocked(tradingApi.getOrders).mockResolvedValue({ status: 'success', mode: 'analyze', data: { orders: [], statistics: {} as never } } as never)
  vi.mocked(tradingApi.getPositions).mockResolvedValue({ status: 'success', mode: 'analyze', data: [] } as never)
  const { result } = renderHook(() => useScalperExitAll(vi.fn()))
  await act(async () => { await result.current.exitAll() })
  expect(showToast.success).toHaveBeenCalledWith(expect.stringContaining('Analyze: Exit confirmed'))
  expect(useThemeStore.getState().appMode).toBe('analyzer')
})
it('removes the paced verification timer when unmounted', async () => {
  vi.useFakeTimers()
  vi.mocked(tradingApi.getOrders).mockResolvedValue({ status: 'success',
    data: { orders: [{ order_status: 'open' } as never], statistics: {} as never } })
  const { result, unmount } = renderHook(() => useScalperExitAll(vi.fn()))
  let pending!: Promise<void>
  await act(async () => { pending = result.current.exitAll() })
  expect(vi.getTimerCount()).toBe(1)
  unmount()
  await act(async () => { await pending })
  expect(vi.getTimerCount()).toBe(0)
  expect(tradingApi.closeAllPositions).not.toHaveBeenCalled()
})
