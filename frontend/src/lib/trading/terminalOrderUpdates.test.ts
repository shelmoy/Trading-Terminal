import { expect, it, vi } from 'vitest'
import { sameOrderInstrument, TradingTerminal } from './terminal'

function harness() {
  return {
    sym: { symbol: 'RELIANCE', exchange: 'NSE' },
    chart: { removePrimitive: vi.fn() },
    trade: { getOrders: vi.fn(async (): Promise<unknown[]> => []) },
    api: vi.fn(async () => ({ data: [] })),
    renderPosition: vi.fn(), makeOrderLine: vi.fn(() => ({ setPrice: vi.fn() })),
    orderLines: new Map(), bookRequest: 0, destroyed: false,
    toast: vi.fn(), fmt: String, pollBook: vi.fn(),
    tradeMode: () => 'live',
  }
}
type Harness = ReturnType<typeof harness>
const methods = TradingTerminal.prototype as unknown as {
  handleOrderUpdate(this: Harness, event: unknown): void
  pollBook(this: Harness): Promise<void>
}
const event = (exchange = 'NSE', status = 'open') => ({
  orderId: 'ORDER-1', symbol: 'RELIANCE', exchange, status, action: 'BUY',
  pricetype: 'LIMIT', quantity: 1, price: 100, averagePrice: 100, mode: 'live',
})

it('requires the same symbol and exchange, including a missing exchange', () => {
  expect(sameOrderInstrument(event('NSE'), event('NSE'))).toBe(true)
  expect(sameOrderInstrument(event('BSE'), event('NSE'))).toBe(false)
  expect(sameOrderInstrument({ symbol: 'RELIANCE' }, event('NSE'))).toBe(false)
})

it('ignores other-exchange updates without lines, toasts or reconciliation', () => {
  const pane = harness()
  methods.handleOrderUpdate.call(pane, event('BSE', 'complete'))
  expect(pane.orderLines.size).toBe(0)
  expect(pane.toast).not.toHaveBeenCalled()
  expect(pane.pollBook).not.toHaveBeenCalled()
})

it('shows the matching exchange and removes the order on a fill', () => {
  const pane = harness()
  methods.handleOrderUpdate.call(pane, event())
  expect(pane.orderLines.has('ORDER-1')).toBe(true)
  methods.handleOrderUpdate.call(pane, event('NSE', 'complete'))
  expect(pane.orderLines.size).toBe(0)
  expect(pane.chart.removePrimitive).toHaveBeenCalledTimes(1)
  expect(pane.pollBook).toHaveBeenCalledTimes(1)
})

it('does not mix sandbox order events into a live pane', () => {
  const pane = harness()
  methods.handleOrderUpdate.call(pane, { ...event(), mode: 'analyze' })
  expect(pane.orderLines.size).toBe(0)
  expect(pane.toast).not.toHaveBeenCalled()
})

it('does not mix real broker order events into an analyzer pane', () => {
  const pane = harness()
  pane.tradeMode = () => 'analyzer'
  methods.handleOrderUpdate.call(pane, event())
  expect(pane.orderLines.size).toBe(0)
  methods.handleOrderUpdate.call(pane, { ...event(), mode: 'analyze' })
  expect(pane.orderLines.size).toBe(1)
})

it('filters polled orders by exchange as well as symbol', async () => {
  const pane = harness()
  pane.trade.getOrders.mockResolvedValue([
    { id: 'OTHER', symbol: 'RELIANCE', exchange: 'BSE', status: 'working', price: 100 },
    { id: 'MATCH', symbol: 'RELIANCE', exchange: 'NSE', status: 'working', price: 101 },
  ])
  await methods.pollBook.call(pane)
  expect([...pane.orderLines.keys()]).toEqual(['MATCH'])
})

it('does not apply an old book after changing the pane exchange', async () => {
  const pane = harness()
  let finish!: (orders: unknown[]) => void
  pane.trade.getOrders.mockImplementation(() => new Promise(resolve => { finish = resolve }))
  const pending = methods.pollBook.call(pane)
  pane.sym = { symbol: 'RELIANCE', exchange: 'BSE' }
  finish([{ id: 'OLD', symbol: 'RELIANCE', exchange: 'NSE', status: 'working', price: 100 }])
  await pending
  expect(pane.orderLines.size).toBe(0)
  expect(pane.api).not.toHaveBeenCalled()
})

it('does not resurrect a working order from REST after its broker fill event', async () => {
  const pane = harness()
  let finish!: (orders: unknown[]) => void
  pane.trade.getOrders.mockImplementation(() => new Promise(resolve => { finish = resolve }))
  const pending = methods.pollBook.call(pane)
  methods.handleOrderUpdate.call(pane, event('NSE', 'complete'))
  finish([{ id: 'ORDER-1', symbol: 'RELIANCE', exchange: 'NSE', status: 'working', price: 100 }])
  await pending
  expect(pane.orderLines.size).toBe(0)
  expect(pane.api).not.toHaveBeenCalled()
})
