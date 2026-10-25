import { describe, expect, it, vi } from 'vitest'
import { runExitAll, type ExitResponse } from './exitAll'

const orders = (states: string[] = []) => ({
  status: 'success' as const, data: { orders: states.map((order_status) => ({ order_status })) },
})
const positions = (quantities: (number | string)[] = []) => ({
  status: 'success' as const, data: quantities.map((quantity) => ({ quantity })),
})
function setup() {
  return {
    mode: 'live' as const,
    cancel: vi.fn(async (): Promise<ExitResponse> => ({ status: 'success' })),
    close: vi.fn(async (): Promise<ExitResponse> => ({ status: 'success' })),
    orders: vi.fn(async () => orders()),
    positions: vi.fn(async () => positions()),
    checkMode: vi.fn(async () => true),
    current: vi.fn(() => true),
    wait: vi.fn(async () => {}),
  }
}

describe('broker-backed Exit all', () => {
  it('cancels first, waits for cancellation, closes once and confirms fills from both books', async () => {
    const d = setup()
    d.orders.mockResolvedValueOnce(orders(['trigger pending'])).mockResolvedValueOnce(orders())
    d.positions.mockResolvedValueOnce(positions([10, -20]))
      .mockResolvedValueOnce(positions([10])).mockResolvedValueOnce(positions([0, '0']))
    expect((await runExitAll(d)).status).toBe('confirmed')
    expect(d.cancel).toHaveBeenCalledTimes(1)
    expect(d.close).toHaveBeenCalledTimes(1)
    expect(d.cancel.mock.invocationCallOrder[0]).toBeLessThan(d.orders.mock.invocationCallOrder[0])
    expect(d.orders.mock.invocationCallOrder[1]).toBeLessThan(d.close.mock.invocationCallOrder[0])
    expect(d.wait).toHaveBeenCalledTimes(2)
  })
  it.each<ExitResponse>([
    { status: 'error', message: 'RMS rejected cancellation' },
    { status: 'success', failed_cancellations: ['ORD-1'] },
    { status: 'success', failed_count: 1 },
  ])('does not close when cancellation failed: %j', async (reply) => {
    const d = setup()
    d.cancel.mockResolvedValue(reply)
    expect((await runExitAll(d)).status).toBe('error')
    expect(d.close).not.toHaveBeenCalled()
  })
  it('does not retry a cancellation timeout or send exits', async () => {
    const d = setup()
    d.cancel.mockRejectedValue(new Error('Timeout'))
    expect((await runExitAll(d)).message).toContain('Cancellation unconfirmed: Timeout')
    expect(d.cancel).toHaveBeenCalledTimes(1)
    expect(d.close).not.toHaveBeenCalled()
  })
  it.each(['open', 'pending', 'trigger pending', 'put order req received', 'unknown'])(
    'does not close before outstanding %s orders settle', async (state) => {
      const d = setup()
      d.orders.mockResolvedValue(orders([state]))
      expect((await runExitAll(d)).status).toBe('pending')
      expect(d.orders).toHaveBeenCalledTimes(5)
      expect(d.close).not.toHaveBeenCalled()
    }
  )
  it('does not place closing orders when already flat', async () => {
    const d = setup()
    d.cancel.mockResolvedValue({ status: 'info', message: 'No open orders' })
    d.orders.mockResolvedValue(orders(['complete', 'cancelled', 'rejected']))
    expect((await runExitAll(d)).status).toBe('confirmed')
    expect(d.close).not.toHaveBeenCalled()
  })
  it.each<ExitResponse>([
    { status: 'error', message: 'Exchange closed' },
    { status: 'success', failed_positions: [{ symbol: 'SAMPLE' }] },
    { status: 'success', failed_closures: 1 },
  ])('preserves partial/failed close result: %j', async (reply) => {
    const d = setup()
    d.positions.mockResolvedValue(positions([10]))
    d.close.mockResolvedValue(reply)
    expect((await runExitAll(d)).status).toBe('error')
    expect(d.close).toHaveBeenCalledTimes(1)
    expect(d.cancel).toHaveBeenCalledTimes(1)
  })
  it('reports pending rather than flat when exit is accepted but position remains', async () => {
    const d = setup()
    d.positions.mockResolvedValue(positions([10]))
    expect((await runExitAll(d)).status).toBe('pending')
    expect(d.close).toHaveBeenCalledTimes(1)
  })
  it('does not cancel a newly placed exit if it remains working', async () => {
    const d = setup()
    d.positions.mockResolvedValueOnce(positions([10]))
    d.orders.mockResolvedValueOnce(orders()).mockResolvedValue(orders(['open']))
    expect((await runExitAll(d)).status).toBe('pending')
    expect(d.cancel).toHaveBeenCalledTimes(1)
    expect(d.close).toHaveBeenCalledTimes(1)
  })
  it('does not retry a timed out closing request', async () => {
    const d = setup()
    d.positions.mockResolvedValue(positions([10]))
    d.close.mockRejectedValue(new Error('Read timed out'))
    expect((await runExitAll(d)).message).toContain('Position exit unconfirmed')
    expect(d.close).toHaveBeenCalledTimes(1)
  })
  it('refuses malformed or failed books instead of interpreting them as flat', async () => {
    for (const bad of [{ status: 'error', message: 'Token expired' }, { status: 'success' }]) {
      const d = setup()
      d.orders.mockResolvedValue(bad as ReturnType<typeof orders>)
      expect((await runExitAll(d)).status).toBe('error')
      expect(d.close).not.toHaveBeenCalled()
    }
    for (const quantity of ['NaN', '', 'Infinity']) {
      const d = setup()
      d.positions.mockResolvedValue(positions([quantity]))
      expect((await runExitAll(d)).status).toBe('error')
      expect(d.close).not.toHaveBeenCalled()
    }
  })
  it('stops before writing when server mode does not match', async () => {
    const d = setup()
    d.checkMode.mockResolvedValue(false)
    expect((await runExitAll(d)).status).toBe('error')
    expect(d.cancel).not.toHaveBeenCalled()
  })
  it('rechecks mode after cancellation before closing', async () => {
    const d = setup()
    d.positions.mockResolvedValue(positions([10]))
    d.checkMode.mockResolvedValueOnce(true).mockResolvedValueOnce(false)
    expect((await runExitAll(d)).status).toBe('error')
    expect(d.close).not.toHaveBeenCalled()
  })
  it('does not cross accounts after a scope change', async () => {
    const d = setup()
    d.cancel.mockImplementation(async () => {
      d.current.mockReturnValue(false)
      return { status: 'success' }
    })
    expect((await runExitAll(d)).status).toBe('aborted')
    expect(d.orders).not.toHaveBeenCalled()
    expect(d.close).not.toHaveBeenCalled()
  })
  it('keeps success unavailable when final verification fails', async () => {
    const d = setup()
    d.orders.mockResolvedValueOnce(orders()).mockRejectedValue(new Error('Disconnected'))
    expect((await runExitAll(d)).message).toContain('Exit verification unconfirmed')
  })
  it('cannot use an Analyze book to confirm a Live account is flat', async () => {
    const d = setup()
    d.orders.mockResolvedValue({ ...orders(), mode: 'analyze' } as ReturnType<typeof orders>)
    const result = await runExitAll(d)
    expect(result.status).toBe('error')
    expect(result.message).toContain('trading mode changed')
    expect(d.close).not.toHaveBeenCalled()
  })
})
