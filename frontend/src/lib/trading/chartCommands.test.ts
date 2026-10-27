import { describe, it, expect, vi, beforeEach } from 'vitest'
import { webClient } from '@/api/client'
import { ChartCommandCoordinator } from './chartCommands'
vi.mock('@/api/client', () => ({ webClient: { get: vi.fn(), post: vi.fn() } }))
const snapshot = { scope: 'account', mode: 'analyze', orders: [], positions: [] }
const payload = { symbol: 'S', exchange: 'NSE', product: 'MIS' }
beforeEach(() => vi.resetAllMocks())
async function ready() {
  vi.mocked(webClient.get).mockResolvedValue({ data: { data: snapshot } })
  const c = new ChartCommandCoordinator(() => 'analyze')
  await c.snapshot()
  return c
}
describe('chart command coordinator', () => {
  it('never resends an ambiguous POST', async () => {
    const c = await ready()
    vi.mocked(webClient.post).mockRejectedValue(new Error('timeout'))
    await expect(c.send('place', payload)).rejects.toThrow('uncertain')
    await expect(c.send('place', payload)).rejects.toThrow('uncertain')
    expect(webClient.post).toHaveBeenCalledTimes(1)
  })
  it('does not call an acceptance without an order id success', async () => {
    const c = await ready()
    vi.mocked(webClient.post).mockResolvedValue({
      data: { state: 'accepted', message: 'missing ID' },
    })
    await expect(c.send('place', payload)).rejects.toThrow('missing ID')
    await expect(c.send('place', payload)).rejects.toThrow('uncertain')
    expect(webClient.post).toHaveBeenCalledTimes(1)
  })
  it('refuses a mode switch before submitting', async () => {
    let mode: 'live' | 'analyze' = 'analyze'
    vi.mocked(webClient.get).mockResolvedValue({ data: { data: snapshot } })
    const c = new ChartCommandCoordinator(() => mode)
    await c.snapshot()
    mode = 'live'
    await expect(c.send('place', payload)).rejects.toThrow('Refresh')
    expect(webClient.post).not.toHaveBeenCalled()
  })
  it('rejects late snapshots after invalidate', async () => {
    let resolve!: (v: unknown) => void
    vi.mocked(webClient.get).mockReturnValue(
      new Promise((r) => {
        resolve = r
      }) as never
    )
    const c = new ChartCommandCoordinator(() => 'analyze')
    const pending = c.snapshot()
    c.invalidate()
    resolve({ data: { data: snapshot } })
    await expect(pending).rejects.toThrow('context changed')
  })
  it('allows only one overlapping command per instrument', async () => {
    const c = await ready()
    let resolve!: (v: unknown) => void
    vi.mocked(webClient.post).mockReturnValue(
      new Promise((r) => {
        resolve = r
      }) as never
    )
    const first = c.send('place', payload)
    await expect(c.send('place', payload)).rejects.toThrow('pending')
    resolve({ data: { state: 'accepted', orderId: '1' } })
    await first
    expect(webClient.post).toHaveBeenCalledTimes(1)
  })
  it('rehydrates unresolved broker requests after a page reload', async () => {
    vi.mocked(webClient.get).mockResolvedValue({
      data: {
        data: {
          ...snapshot,
          pendingCommands: [{ ...payload, commandId: 'old-command', state: 'uncertain' }],
        },
      },
    })
    const c = new ChartCommandCoordinator(() => 'analyze')
    await c.snapshot()
    await expect(c.send('place', payload)).rejects.toThrow('uncertain')
    expect(webClient.post).not.toHaveBeenCalled()
  })
  it('does not send legacy auth or book metadata in a chart command', async () => {
    const c = await ready()
    vi.mocked(webClient.post).mockResolvedValue({ data: { state: 'accepted', orderId: '1' } })
    await c.send('place', { ...payload, apikey: 'fake-secret', order_status: 'open', price: 100 })
    expect(vi.mocked(webClient.post).mock.calls[0][1]).toMatchObject({
      payload: { ...payload, price: 100 },
    })
    expect(JSON.stringify(vi.mocked(webClient.post).mock.calls[0][1])).not.toContain('fake-secret')
  })
})
