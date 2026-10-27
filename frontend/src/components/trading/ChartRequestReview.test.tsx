import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { webClient } from '@/api/client'
import { ChartRequestReview } from './ChartRequestReview'
vi.mock('@/api/client', () => ({ webClient: { get: vi.fn(), post: vi.fn() } }))
vi.mock('@/stores/themeStore', () => ({ useThemeStore: () => ({ appMode: 'analyzer' }) }))
vi.mock('@/stores/authStore', () => ({
  useAuthStore: () => ({ user: { broker: 'fyers', username: 'fixture', loginTime: 'today' } }),
}))
const order = {
  orderid: 'VERIFIED-ID',
  symbol: 'S',
  exchange: 'NFO',
  product: 'NRML',
  quantity: 75,
  action: 'BUY',
  order_status: 'open',
  version: 'v1',
}
const snapshot = {
  scope: 'account',
  mode: 'analyze',
  orders: [order],
  positions: [],
  pendingCommands: [
    {
      commandId: 'request-1',
      state: 'uncertain',
      operation: 'place',
      symbol: 'S',
      exchange: 'NFO',
      product: 'NRML',
    },
  ],
}
beforeEach(() => {
  vi.resetAllMocks()
  vi.mocked(webClient.get).mockResolvedValue({ data: { data: snapshot } })
})
describe('uncertain chart request review', () => {
  it('links a user-selected native protection ID without resending a trigger', async () => {
    vi.mocked(webClient.get).mockResolvedValue({
      data: {
        data: {
          ...snapshot,
          pendingCommands: [{ ...snapshot.pendingCommands[0], operation: 'protect' }],
          nativeExits: [
            {
              trigger_id: 'NATIVE-ID',
              symbol: 'S',
              exchange: 'NFO',
              status: 'active',
              version: 'g1',
              legs: [{ product: 'NRML', action: 'SELL', quantity: 75 }],
            },
          ],
        },
      },
    })
    render(<ChartRequestReview symbol="S" exchange="NFO" />)
    await screen.findByLabelText('Unresolved chart request')
    fireEvent.change(screen.getByLabelText('Unresolved chart request'), {
      target: { value: 'request-1' },
    })
    fireEvent.change(screen.getByLabelText('Verified broker order ID'), {
      target: { value: 'NATIVE-ID' },
    })
    fireEvent.click(screen.getByText('Link verified order · no trade sent'))
    await waitFor(() => expect(webClient.post).toHaveBeenCalledTimes(1))
    expect(webClient.post).toHaveBeenCalledWith(
      '/chart-trading/commands/request-1/resolve',
      expect.objectContaining({ orderId: 'NATIVE-ID', expectedVersion: 'g1' }),
      expect.anything()
    )
  })
  it('requires an explicit broker ID selection and only calls reconciliation', async () => {
    render(<ChartRequestReview symbol="S" exchange="NFO" />)
    await screen.findByLabelText('Unresolved chart request')
    fireEvent.change(screen.getByLabelText('Unresolved chart request'), {
      target: { value: 'request-1' },
    })
    expect(screen.getByText('Link verified order · no trade sent')).toBeDisabled()
    fireEvent.change(screen.getByLabelText('Verified broker order ID'), {
      target: { value: 'VERIFIED-ID' },
    })
    vi.mocked(webClient.post).mockResolvedValue({ data: { state: 'resolved' } })
    fireEvent.click(screen.getByText('Link verified order · no trade sent'))
    await waitFor(() => expect(webClient.post).toHaveBeenCalledTimes(1))
    expect(vi.mocked(webClient.post).mock.calls[0]).toEqual([
      '/chart-trading/commands/request-1/resolve',
      { scope: 'account', mode: 'analyze', orderId: 'VERIFIED-ID', expectedVersion: 'v1' },
      { timeout: 15000 },
    ])
  })
  it('does not offer resolution while the original handler may be submitting', async () => {
    vi.mocked(webClient.get).mockResolvedValue({
      data: {
        data: {
          ...snapshot,
          pendingCommands: [{ ...snapshot.pendingCommands[0], state: 'submitting' }],
        },
      },
    })
    render(<ChartRequestReview symbol="S" exchange="NFO" />)
    fireEvent.change(await screen.findByLabelText('Unresolved chart request'), {
      target: { value: 'request-1' },
    })
    expect(screen.getByText(/cannot be linked while submitting/)).toBeInTheDocument()
    expect(screen.queryByLabelText('Verified broker order ID')).toBeNull()
    expect(webClient.post).not.toHaveBeenCalled()
  })
  it('does not select an order by matching price or on another exchange', async () => {
    vi.mocked(webClient.get).mockResolvedValue({
      data: { data: { ...snapshot, orders: [{ ...order, exchange: 'BFO' }] } },
    })
    render(<ChartRequestReview symbol="S" exchange="NFO" />)
    fireEvent.change(await screen.findByLabelText('Unresolved chart request'), {
      target: { value: 'request-1' },
    })
    expect(screen.getByText(/does not prove non-delivery/)).toBeInTheDocument()
    expect(screen.getByLabelText('Verified broker order ID')).toHaveValue('')
    expect(webClient.post).not.toHaveBeenCalled()
  })
})
