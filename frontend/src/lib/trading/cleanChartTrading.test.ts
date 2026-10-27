import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { webClient } from '@/api/client'
import { CleanChartTrading } from './cleanChartTrading'
import type { CleanTradingLine } from './chartTradingLayer'
import type { ChartOrderRow, ChartAccountState } from './chartCommands'
vi.mock('@/api/client', () => ({ webClient: { get: vi.fn(), post: vi.fn() } }))

const order: ChartOrderRow = {
  orderid: 'B1',
  symbol: 'S',
  exchange: 'NFO',
  product: 'NRML',
  action: 'BUY',
  pricetype: 'LIMIT',
  quantity: 75,
  price: 100,
  order_status: 'open',
  version: 'v1',
}
const state: ChartAccountState = {
  scope: 'account',
  mode: 'analyze',
  orders: [order],
  positions: [],
}
const draft = {
  symbol: 'S',
  exchange: 'NFO',
  product: 'NRML' as const,
  action: 'BUY' as const,
  quantity: 75,
  pricetype: 'LIMIT' as const,
  price: 100,
}
const settle = async () => {
  for (let i = 0; i < 12; i++) await Promise.resolve()
}
function fixture(axis = false) {
  let drag!: (id: string, price: number) => void, release!: (id: string, price: number) => void
  let hover!: (event: Record<string, unknown>) => void
  let click!: (id: string) => void
  const events = new Map<string, () => void>(),
    primitives = new Set<CleanTradingLine>()
  const element = document.createElement('div')
  let locked = false,
    mode: 'live' | 'analyze' = 'analyze'
  const host = {
    element: () => element,
    instrument: () => ({ symbol: 'S', exchange: 'NFO', tick: 0.05, quoteOnly: false }),
    locked: () => locked,
    mode: () => mode,
    mark: () => 101,
    format: String,
    toast: vi.fn(),
    openPriceMenu: axis ? vi.fn() : undefined,
    openProtection: vi.fn(),
  }
  const chart = {
    subscribeDrag: vi.fn((move: typeof drag, end: typeof release) => {
      drag = move
      release = end
      return vi.fn()
    }),
    subscribeClick: vi.fn((cb: typeof click) => {
      click = cb
      return vi.fn()
    }),
    on: vi.fn((key: string, cb: () => void) => {
      events.set(key, cb)
      return () => events.delete(key)
    }),
    subscribeCrosshairMove: vi.fn((cb: typeof hover) => {
      hover = cb
      return vi.fn()
    }),
    primaryPaneIndex: () => 0,
    priceAxisLayout: () => [{ side: 'right', x: 300, width: 60 }],
    addPrimitive: vi.fn((line: CleanTradingLine) => {
      primitives.add(line)
      line.attached({ requestUpdate: vi.fn() })
    }),
    removePrimitive: vi.fn((line: CleanTradingLine) => {
      primitives.delete(line)
      line.detached()
    }),
  }
  const layer = new CleanChartTrading(host)
  layer.attach(chart as never)
  const down = () => element.dispatchEvent(new Event('pointerdown'))
  return {
    layer,
    host,
    chart,
    element,
    events,
    primitives,
    drag: (id: string, price: number) => drag(id, price),
    release: (id: string, price: number) => release(id, price),
    hover: (event: Record<string, unknown>) => hover(event),
    down,
    click: (id: string) => click(id),
    lock: () => {
      locked = true
    },
    mode: () => {
      mode = 'live'
    },
  }
}
let active: ReturnType<typeof fixture> | undefined
beforeEach(() => {
  vi.resetAllMocks()
  vi.mocked(webClient.get).mockResolvedValue({ data: { data: state } })
  vi.mocked(webClient.post).mockResolvedValue({ data: { state: 'accepted', orderId: 'NEW' } })
})
afterEach(() => {
  active?.layer.detach()
  active = undefined
  vi.useRealTimers()
})

describe('chart gesture ownership', () => {
  function protectedBook() {
    return {
      ...state,
      orders: [],
      positions: [
        {
          symbol: 'S',
          exchange: 'NFO',
          product: 'NRML',
          quantity: 75,
          average_price: 100,
          version: 'p1',
        },
      ],
      protections: [
        {
          brokerId: 'G1',
          kind: 'gtt' as const,
          identity: { symbol: 'S', exchange: 'NFO', product: 'NRML' },
          positionQuantity: 75,
          positionVersion: 'p1',
          nativeVersion: 'g1',
          state: 'active',
          review: '',
          roles: { stop: { trigger: 99, limit: 98.95 }, target: { trigger: 103, limit: 103 } },
          confirmedRoles: {
            stop: { trigger: 99, limit: 98.95 },
            target: { trigger: 103, limit: 103 },
          },
        },
      ],
    }
  }
  it('position SL/TP action opens management without sending a trade', async () => {
    vi.mocked(webClient.get).mockResolvedValue({ data: { data: protectedBook() } })
    active = fixture()
    await settle()
    active.click('ct:position:NRML::protect')
    expect(active.host.openProtection).toHaveBeenCalledWith(
      expect.objectContaining({ product: 'NRML', version: 'p1' })
    )
    expect(webClient.post).not.toHaveBeenCalled()
  })
  it('partial exit uses the shared coordinator and rejects a changed menu position', async () => {
    const book = { ...protectedBook(), protections: [] }
    vi.mocked(webClient.get).mockResolvedValue({ data: { data: book } })
    active = fixture()
    await settle()
    await expect(
      active.layer.bookAction('reduce', 'NRML', 75, undefined, {
        quantity: 150,
        average_price: 100,
      })
    ).rejects.toThrow('Position changed')
    expect(webClient.post).not.toHaveBeenCalled()
    await active.layer.bookAction('reduce', 'NRML', 75, undefined, {
      quantity: 75,
      average_price: 100,
    })
    expect(webClient.post).toHaveBeenCalledTimes(1)
    expect(vi.mocked(webClient.post).mock.calls[0][1]).toMatchObject({
      operation: 'reduce',
      expectedVersion: 'p1',
      payload: { quantity: 75, action: 'SELL', product: 'NRML' },
    })
  })
  it('modifies the native stop once, preserving limit offset and the other OCO leg', async () => {
    vi.mocked(webClient.get).mockResolvedValue({ data: { data: protectedBook() } })
    active = fixture()
    await settle()
    active.down()
    active.drag('ct:protection:G1:stop', 98)
    active.release('ct:protection:G1:stop', 98)
    active.release('ct:protection:G1:stop', 98)
    await settle()
    expect(webClient.post).toHaveBeenCalledTimes(1)
    expect(vi.mocked(webClient.post).mock.calls[0][1]).toMatchObject({
      operation: 'modifyProtection',
      expectedVersion: 'p1',
      payload: {
        protectionId: 'G1',
        protectionVersion: 'g1',
        stopTrigger: 98,
        stopLimit: 97.95,
        targetTrigger: 103,
        targetLimit: 103,
      },
    })
  })
  it.each([
    'Escape',
    'pointercancel',
    'account',
    'fill',
    'mode',
  ])('cancels a protection drag on %s', async (reason) => {
    const book = protectedBook()
    vi.mocked(webClient.get).mockResolvedValue({ data: { data: book } })
    active = fixture()
    await settle()
    active.down()
    active.drag('ct:protection:G1:stop', 98)
    if (reason === 'Escape') document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }))
    if (reason === 'pointercancel') active.element.dispatchEvent(new Event('pointercancel'))
    if (reason === 'mode') active.mode()
    if (reason === 'account' || reason === 'fill') {
      vi.mocked(webClient.get).mockResolvedValue({
        data: {
          data:
            reason === 'account'
              ? { ...book, scope: 'other' }
              : { ...book, positions: [{ ...book.positions[0], version: 'p2', quantity: 150 }] },
        },
      })
      await active.layer.refresh()
    }
    active.release('ct:protection:G1:stop', 98)
    await settle()
    expect(webClient.post).not.toHaveBeenCalled()
  })
  it('renders confirmed exit prices while an accepted modification is still pending', async () => {
    const book = protectedBook()
    book.protections[0].roles.stop.trigger = 98
    vi.mocked(webClient.get).mockResolvedValue({ data: { data: book } })
    active = fixture()
    await settle()
    expect(
      [...active.primitives].find((line) => line.options().id === 'ct:protection:G1:stop')?.price
    ).toBe(99)
  })
  it('submits an explicitly armed dragged draft exactly once on release', async () => {
    active = fixture()
    await settle()
    active.layer.arm(draft)
    active.down()
    active.drag('ct:draft', 102)
    active.release('ct:draft', 102)
    active.release('ct:draft', 102)
    await settle()
    expect(webClient.post).toHaveBeenCalledTimes(1)
    expect(vi.mocked(webClient.post).mock.calls[0][1]).toMatchObject({
      operation: 'place',
      payload: { price: 102 },
    })
  })
  it.each([
    'Escape',
    'pointercancel',
    'drag:cancel',
  ])('does not submit after %s', async (reason) => {
    active = fixture()
    await settle()
    active.layer.arm(draft)
    active.down()
    active.drag('ct:draft', 102)
    // Physical key events reach the document even when focus is on a toolbar;
    // this fixture's detached div is deliberately not an event-path ancestor.
    if (reason === 'Escape')
      active.element.ownerDocument.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }))
    else if (reason === 'pointercancel') active.element.dispatchEvent(new Event('pointercancel'))
    else active.events.get('drag:cancel')?.()
    active.release('ct:draft', 102)
    await settle()
    expect(webClient.post).not.toHaveBeenCalled()
  })
  it('ordinary panning and an unmoved draft never place orders', async () => {
    active = fixture()
    await settle()
    active.down()
    active.drag('drawing:1', 101)
    active.release('drawing:1', 101)
    active.layer.arm(draft)
    active.release('ct:draft', 100)
    await settle()
    expect(webClient.post).not.toHaveBeenCalled()
  })
  it.each(['lock', 'mode'])('disarms a released order when %s changes', async (kind) => {
    active = fixture()
    await settle()
    active.down()
    active.drag('ct:order:B1', 102)
    active[kind]()
    active.release('ct:order:B1', 102)
    await settle()
    expect(webClient.post).not.toHaveBeenCalled()
  })
  it('retains a drag preview through an unchanged book refresh', async () => {
    active = fixture()
    await settle()
    active.down()
    active.drag('ct:order:B1', 102)
    const line = [...active.primitives][0]
    await active.layer.refresh()
    expect([...active.primitives][0]).toBe(line)
    expect(line.price).toBe(102)
    active.release('ct:order:B1', 102)
    await settle()
    expect(vi.mocked(webClient.post).mock.calls[0][1]).toMatchObject({
      operation: 'modify',
      expectedVersion: 'v1',
      payload: { price: 102 },
    })
  })
  it('refuses release after a partial fill changed the frozen order version', async () => {
    active = fixture()
    await settle()
    active.down()
    active.drag('ct:order:B1', 102)
    vi.mocked(webClient.get).mockResolvedValue({
      data: {
        data: { ...state, orders: [{ ...order, version: 'v2', order_status: 'partially filled' }] },
      },
    })
    await active.layer.refresh()
    active.release('ct:order:B1', 102)
    await settle()
    expect(webClient.post).not.toHaveBeenCalled()
  })
  it('discards a book response invalidated by a newer order event', async () => {
    vi.useFakeTimers()
    active = fixture()
    await settle()
    let resolve!: (value: unknown) => void
    vi.mocked(webClient.get).mockReturnValueOnce(
      new Promise((r) => {
        resolve = r
      }) as never
    )
    const pending = active.layer.refresh()
    active.layer.notifyBrokerChange()
    resolve({ data: { data: { ...state, orders: [{ ...order, price: 90 }] } } })
    await pending
    expect([...active.primitives][0].price).toBe(100)
    await vi.advanceTimersByTimeAsync(150)
    expect([...active.primitives][0].price).toBe(100)
    expect(webClient.get).toHaveBeenCalledTimes(3)
  })
  it('detaching removes primitives and every subscription', async () => {
    active = fixture()
    await settle()
    active.layer.arm(draft)
    active.layer.detach()
    expect(active.primitives.size).toBe(0)
    expect(active.events.size).toBe(0)
    active.release('ct:draft', 102)
    await settle()
    expect(webClient.post).not.toHaveBeenCalled()
  })
  it('the axis plus opens actions without submitting an order', async () => {
    active = fixture(true)
    await settle()
    active.hover({ point: { x: 290, y: 120 }, paneIndex: 0, price: 101 })
    const button = active.element.querySelector('button')!
    expect(button.style.display).toBe('flex')
    button.click()
    expect(active.host.openPriceMenu).toHaveBeenCalledWith({ x: 300, y: 120 })
    expect(webClient.post).not.toHaveBeenCalled()
    active.lock()
    active.hover({ point: { x: 290, y: 120 }, paneIndex: 0, price: 101 })
    expect(button.style.display).toBe('none')
    active.layer.detach()
    expect(active.element.childElementCount).toBe(0)
  })
  it('repeated attach/detach leaves no retained primitive or DOM action', async () => {
    for (let i = 0; i < 100; i++) {
      active = fixture(true)
      await settle()
      active.layer.detach()
      expect(active.primitives.size).toBe(0)
      expect(active.events.size).toBe(0)
      expect(active.element.childElementCount).toBe(0)
    }
    expect(webClient.post).not.toHaveBeenCalled()
  })
})
