import type { createChart } from 'openalgo-charts'
import {
  ChartCommandCoordinator,
  type ChartPositionRow,
  type ChartOrderRow,
  type ChartProtection,
} from './chartCommands'
import { CleanTradingLine, CleanTradingLines } from './chartTradingLayer'
import type { ConfirmedOrder } from './terminal'

type Chart = ReturnType<typeof createChart>
export interface CleanTradingHost {
  element(): HTMLElement
  instrument(): {
    symbol: string
    exchange: string
    tick: number
    quoteOnly: boolean
    synthetic?: boolean
  } | null
  locked(): boolean
  mode(): 'live' | 'analyze'
  mark(): number | null
  format(price: number): string
  toast(message: string, error?: boolean): void
  openPriceMenu?(point: { x: number; y: number }): void
  openProtection?(position: ChartPositionRow): void
}

/** Shared, chart-independent owner of broker state and pending gestures. */
export class CleanChartTrading {
  readonly coordinator: ChartCommandCoordinator
  private chart: Chart | null = null
  private layer: CleanTradingLines
  private lines: CleanTradingLine[] = []
  private orders: ChartOrderRow[] = []
  private positions: ChartPositionRow[] = []
  private protections: ChartProtection[] = []
  private protectionDrag: {
    binding: ChartProtection
    position: ChartPositionRow
    role: 'stop' | 'target'
    scope: string | null
    mode: 'live' | 'analyze'
  } | null = null
  private flight: Promise<void> | null = null
  private generation = 0
  private revision = 0
  private trailing: ReturnType<typeof setTimeout> | null = null
  private offs: (() => void)[] = []
  private draft: {
    order: ConfirmedOrder
    line: CleanTradingLine
    moved: boolean
    scope: string
    mode: 'live' | 'analyze'
  } | null = null
  private activeDrag: {
    row: ChartOrderRow
    scope: string | null
    mode: 'live' | 'analyze'
  } | null = null
  private gestureCancelled = false
  private host: CleanTradingHost
  constructor(host: CleanTradingHost) {
    this.host = host
    this.layer = new CleanTradingLines(host.format)
    this.coordinator = new ChartCommandCoordinator(host.mode)
  }
  attach(chart: Chart) {
    this.detach()
    this.chart = chart
    this.layer = new CleanTradingLines(this.host.format)
    this.offs.push(
      chart.subscribeDrag(
        (id, price) => {
          if (id.startsWith('ct:protection:') && !id.endsWith('::close')) {
            if (this.host.locked() || this.gestureCancelled) return
            if (!this.protectionDrag) {
              for (const binding of this.protections)
                for (const role of ['stop', 'target'] as const) {
                  const position = this.positions.find(
                    (row) => row.product === binding.identity.product
                  )
                  if (
                    id === `ct:protection:${binding.brokerId}:${role}` &&
                    position &&
                    this.canEditProtection(binding)
                  )
                    this.protectionDrag = {
                      binding,
                      position: { ...position },
                      role,
                      scope: this.coordinator.currentScope(),
                      mode: this.host.mode(),
                    }
                }
            }
            const drag = this.protectionDrag
            if (!drag) return
            const line = this.lines.find((value) => value.options().id === id)
            line?.setDragGhost(drag.binding.confirmedRoles[drag.role]?.trigger ?? null)
            line?.setPrice(this.snap(price))
            return
          }
          if (!(id.startsWith('ct:order:') || id === 'ct:draft') || id.endsWith('::close')) return
          if (this.host.locked()) return this.disarm()
          if (this.gestureCancelled) return
          if (id.startsWith('ct:order:') && !this.activeDrag) {
            const row = this.orders.find((value) => id === `ct:order:${value.orderid}`)
            if (!row) return
            this.activeDrag = {
              row: { ...row },
              scope: this.coordinator.currentScope(),
              mode: this.host.mode(),
            }
          }
          const line = this.lines.find((value) => value.options().id === id)
          if (line) {
            line.setDragGhost(
              this.activeDrag?.row.trigger_price || this.activeDrag?.row.price || null
            )
            line.setPrice(this.snap(price))
          }
          if (id === 'ct:draft' && this.draft) {
            this.draft.moved = true
            this.draft.line.setPrice(this.snap(price))
          }
        },
        (id, price) => {
          if (!id.startsWith('ct:') || id.endsWith('::close')) return
          const px = this.snap(price)
          if (id === 'ct:draft') {
            const draft = this.draft
            this.disarm()
            if (
              !draft?.moved ||
              this.host.locked() ||
              this.gestureCancelled ||
              draft.mode !== this.host.mode() ||
              draft.scope !== this.coordinator.currentScope()
            )
              return
            const stop = draft.order.pricetype === 'SL' || draft.order.pricetype === 'SL-M'
            const delta =
              (draft.order.price ?? px) - (draft.order.trigger_price ?? draft.order.price ?? px)
            void this.place({
              ...draft.order,
              price: draft.order.pricetype === 'SL' ? this.snap(px + delta) : px,
              trigger_price: stop ? px : undefined,
            }).catch((error) => this.host.toast(String(error.message), true))
          } else if (id.startsWith('ct:protection:')) {
            const drag = this.protectionDrag
            this.protectionDrag = null
            if (
              !drag ||
              this.host.locked() ||
              this.gestureCancelled ||
              drag.mode !== this.host.mode() ||
              drag.scope !== this.coordinator.currentScope()
            )
              return void this.refresh().catch(() => {})
            const leg = drag.binding.confirmedRoles[drag.role]
            if (!leg || px === leg.trigger) return void this.refresh().catch(() => {})
            const values = this.protectionValues(drag.binding)
            values[`${drag.role}Trigger`] = px
            values[`${drag.role}Limit`] = this.snap(px + leg.limit - leg.trigger)
            void this.manageProtection(
              'modifyProtection',
              drag.position,
              values,
              drag.binding
            ).catch((error) => this.host.toast(error.message, true))
          } else if (id.startsWith('ct:order:')) {
            const drag = this.activeDrag
            this.activeDrag = null
            const row = drag?.row
            if (
              !row ||
              this.host.locked() ||
              this.gestureCancelled ||
              drag.mode !== this.host.mode() ||
              drag.scope !== this.coordinator.currentScope()
            )
              return void this.refresh().catch(() => {})
            if (px === (row.trigger_price || row.price)) return void this.refresh().catch(() => {})
            const stop = row.pricetype === 'SL' || row.pricetype === 'SL-M'
            const patch = stop
              ? {
                  trigger_price: px,
                  ...(row.pricetype === 'SL'
                    ? { price: this.snap(px + (row.price - (row.trigger_price || row.price))) }
                    : {}),
                }
              : { price: px }
            void this.run('modify', { ...row, ...patch }, row.version)
          }
        }
      )
    )
    this.offs.push(
      chart.subscribeClick((id) => {
        if (id === 'ct:draft::close') return this.disarm()
        if (this.host.locked()) return
        const manage = this.positions.find((row) => `ct:position:${row.product}::protect` === id)
        if (manage) return this.host.openProtection?.(manage)
        const binding = this.protections.find((row) =>
          ['stop', 'target'].some((role) => `ct:protection:${row.brokerId}:${role}::close` === id)
        )
        if (binding) {
          const position = this.positions.find((row) => row.product === binding.identity.product)
          return void this.manageProtection(
            'cancelProtection',
            position ?? { ...binding.identity, quantity: 0, average_price: 0, version: '' },
            {},
            binding
          ).catch((error) => this.host.toast(error.message, true))
        }
        const order = this.orders.find((row) => `ct:order:${row.orderid}::close` === id)
        if (order) return void this.run('cancel', { ...order }, order.version)
        const position = this.positions.find((row) => `ct:position:${row.product}::close` === id)
        if (position) return void this.run('close', { ...position }, position.version)
      })
    )
    this.offs.push(chart.on('drag:cancel', () => this.cancelGesture()))
    const element = this.host.element()
    const down = () => {
      this.gestureCancelled = false
      this.activeDrag = null
      this.protectionDrag = null
    }
    const cancel = (event: Event) => {
      if (event.type === 'pointercancel' || (event as KeyboardEvent).key === 'Escape')
        this.cancelGesture()
    }
    element.addEventListener('pointerdown', down)
    const document = element.ownerDocument
    document.addEventListener('keydown', cancel, true)
    element.addEventListener('pointercancel', cancel)
    this.offs.push(() => {
      element.removeEventListener('pointerdown', down)
      document.removeEventListener('keydown', cancel, true)
      element.removeEventListener('pointercancel', cancel)
    })
    if (this.host.openPriceMenu) this.attachAxisAction(chart, element)
    void this.refresh().catch((error) => this.host.toast((error as Error).message, true))
  }
  private attachAxisAction(chart: Chart, element: HTMLElement) {
    const button = document.createElement('button')
    button.type = 'button'
    button.textContent = '+'
    button.className =
      'absolute z-20 flex h-6 w-6 items-center justify-center rounded border bg-popover text-popover-foreground shadow-sm hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring'
    button.style.display = 'none'
    let point: { x: number; y: number } | null = null
    const hide = () => {
      button.style.display = 'none'
      point = null
    }
    const press = (event: PointerEvent) => {
      event.stopPropagation()
      event.preventDefault()
    }
    const click = (event: MouseEvent) => {
      event.stopPropagation()
      if (!point || this.host.locked()) return hide()
      this.host.openPriceMenu?.(point)
      hide()
    }
    button.addEventListener('pointerdown', press)
    button.addEventListener('click', click)
    element.addEventListener('pointerleave', hide)
    element.append(button)
    this.offs.push(
      chart.subscribeCrosshairMove((event) => {
        const sym = this.host.instrument()
        if (this.host.locked() || !sym || sym.quoteOnly || sym.synthetic || event.pressed)
          return hide()
        if (
          event.source === 'linked' ||
          !event.point ||
          event.paneIndex !== chart.primaryPaneIndex()
        )
          return
        const slot = chart
          .priceAxisLayout(chart.primaryPaneIndex())
          .find((slot) => slot.side === 'right')
        if (!slot || event.price == null || !Number.isFinite(event.price) || event.price <= 0)
          return hide()
        point = { x: slot.x, y: event.point.y }
        button.style.left = `${Math.round(slot.x - 25)}px`
        button.style.top = `${Math.round(event.point.y - 12)}px`
        button.style.display = 'flex'
        button.setAttribute(
          'aria-label',
          `Order actions at ${this.host.format(this.snap(event.price))}`
        )
      })
    )
    this.offs.push(() => {
      button.removeEventListener('pointerdown', press)
      button.removeEventListener('click', click)
      element.removeEventListener('pointerleave', hide)
      button.remove()
    })
  }
  private snap(price: number) {
    const tick = this.host.instrument()?.tick || 0.05
    return Number((Math.round(price / tick) * tick).toFixed(8))
  }
  disarm() {
    if (this.draft && this.chart) this.chart.removePrimitive(this.draft.line)
    this.draft = null
  }
  cancelGesture() {
    this.gestureCancelled = true
    this.activeDrag = null
    this.protectionDrag = null
    this.disarm()
    for (const line of this.lines) {
      line.setDragGhost(null)
      const row = this.orders.find((row) => line.options().id === `ct:order:${row.orderid}`)
      if (row) line.setPrice(row.trigger_price || row.price)
      for (const binding of this.protections)
        for (const role of ['stop', 'target', 'exit'] as const) {
          if (
            line.options().id === `ct:protection:${binding.brokerId}:${role}` &&
            binding.confirmedRoles[role]
          )
            line.setPrice(binding.confirmedRoles[role]!.trigger)
        }
    }
  }
  /** An event invalidates older in-flight books; coalesce its trailing refresh. */
  notifyBrokerChange() {
    this.revision++
    void this.refresh().catch((error) => this.host.toast((error as Error).message, true))
  }
  arm(order: ConfirmedOrder) {
    if (this.host.locked() || !this.chart) throw new Error('Chart is not available for trading')
    const sym = this.host.instrument()
    if (
      !sym ||
      sym.quoteOnly ||
      sym.synthetic ||
      order.symbol !== sym.symbol ||
      order.exchange !== sym.exchange
    )
      throw new Error('Instrument changed or is quote-only')
    if (order.pricetype === 'MARKET') throw new Error('Use the Buy/Sell action for a market order')
    this.disarm()
    this.gestureCancelled = false
    const price = order.trigger_price ?? order.price
    if (!price || !Number.isFinite(price)) throw new Error('Choose a valid draft price')
    const line = new CleanTradingLine(
      {
        id: 'ct:draft',
        price,
        color: '#3b82f6',
        badge: order.action,
        qty: order.quantity,
        leftLabel: 'Drag · release to place',
        cursor: 'ns-resize',
        closeButton: true,
      },
      this.layer
    )
    const scope = this.coordinator.currentScope()
    if (!scope) throw new Error('Broker books are loading; wait before arming a draft')
    this.draft = { order: { ...order }, line, moved: false, scope, mode: this.host.mode() }
    this.chart.addPrimitive(line)
    this.host.toast('Draft armed. Drag and release to submit; Escape cancels.')
  }
  async place(order: ConfirmedOrder): Promise<{ orderId: string }> {
    const sym = this.host.instrument()
    if (
      this.host.locked() ||
      !sym ||
      sym.quoteOnly ||
      sym.synthetic ||
      order.symbol !== sym.symbol ||
      order.exchange !== sym.exchange
    )
      throw new Error('Trading context changed')
    const scope = this.coordinator.currentScope(),
      mode = this.host.mode()
    await this.refresh()
    if (
      this.host.locked() ||
      mode !== this.host.mode() ||
      (scope && scope !== this.coordinator.currentScope())
    )
      throw new Error('Trading account or mode changed')
    const result = await this.coordinator.send('place', { ...order })
    this.host.toast('Order accepted; awaiting broker confirmation.')
    void this.refresh().catch((error) => this.host.toast((error as Error).message, true))
    return { orderId: result.orderId! }
  }
  private async run(operation: string, payload: Record<string, unknown>, expectedVersion: string) {
    try {
      await this.coordinator.send(operation, payload, expectedVersion)
      this.host.toast('Request accepted; awaiting broker confirmation.')
    } catch (error) {
      this.host.toast((error as Error).message, true)
    } finally {
      void this.refresh().catch((error) => this.host.toast((error as Error).message, true))
    }
  }
  private canEditProtection(binding: ChartProtection) {
    return (
      binding.nativeVersion &&
      (binding.kind === 'gtt'
        ? binding.state === 'active'
        : ['open', 'pending', 'trigger pending', 'partially filled'].includes(binding.state))
    )
  }
  async bookAction(
    operation: 'cancel' | 'close' | 'reduce',
    product: string,
    amount?: number,
    orderId?: string,
    expected?: { quantity: number; average_price: number }
  ) {
    const scope = this.coordinator.currentScope(),
      mode = this.host.mode(),
      sym = this.host.instrument()
    if (!sym || sym.quoteOnly || sym.synthetic || this.host.locked())
      throw new Error('Trading context is unavailable')
    this.cancelGesture()
    await this.refresh()
    if (
      this.host.locked() ||
      mode !== this.host.mode() ||
      scope !== this.coordinator.currentScope() ||
      sym.symbol !== this.host.instrument()?.symbol ||
      sym.exchange !== this.host.instrument()?.exchange
    )
      throw new Error('Trading context changed')
    if (operation === 'cancel') {
      const row = this.orders.find((row) => row.orderid === orderId && row.product === product)
      if (!row) throw new Error('Order changed; refresh broker books')
      const binding = this.protections.find(
        (row) => row.kind === 'regular' && row.brokerId === orderId
      )
      if (binding) {
        const position = this.positions.find((row) => row.product === product) ?? {
          ...binding.identity,
          quantity: 0,
          average_price: 0,
          version: '',
        }
        await this.manageProtection('cancelProtection', position, {}, binding)
      } else await this.coordinator.send('cancel', { ...row }, row.version)
    } else {
      const position = this.positions.find((row) => row.product === product)
      if (!position) throw new Error('Position is flat or changed; refresh broker books')
      if (
        expected &&
        (position.quantity !== expected.quantity ||
          position.average_price !== expected.average_price)
      )
        throw new Error('Position changed since the menu opened; no exit was sent')
      await this.coordinator.send(
        operation,
        {
          ...position,
          ...(operation === 'reduce'
            ? { quantity: amount, action: position.quantity > 0 ? 'SELL' : 'BUY' }
            : {}),
        },
        position.version
      )
    }
    this.host.toast('Request accepted; awaiting broker confirmation.')
    await this.refresh()
    return { flat: !this.positions.some((row) => row.product === product && row.quantity !== 0) }
  }
  private protectionValues(binding: ChartProtection): Record<string, unknown> {
    return Object.fromEntries(
      Object.entries(binding.confirmedRoles).flatMap(([role, leg]) => [
        [`${role}Trigger`, leg!.trigger],
        [`${role}Limit`, leg!.limit],
      ])
    )
  }
  async manageProtection(
    operation: 'protect' | 'modifyProtection' | 'cancelProtection',
    position: ChartPositionRow,
    values: Record<string, unknown>,
    binding?: ChartProtection
  ) {
    const sym = this.host.instrument()
    if (
      this.host.locked() ||
      !sym ||
      sym.quoteOnly ||
      sym.synthetic ||
      position.symbol !== sym.symbol ||
      position.exchange !== sym.exchange
    )
      throw new Error('Trading context changed or instrument is quote-only')
    this.cancelGesture()
    try {
      const result = await this.coordinator.send(
        operation,
        {
          ...values,
          symbol: position.symbol,
          exchange: position.exchange,
          product: position.product,
          ...(binding
            ? { protectionId: binding.brokerId, protectionVersion: binding.nativeVersion }
            : {}),
        },
        position.version
      )
      this.host.toast(result.message)
      return result
    } finally {
      void this.refresh().catch((error) => this.host.toast(error.message, true))
    }
  }
  async refresh(): Promise<void> {
    if (this.flight) return this.flight
    const chart = this.chart,
      sym = this.host.instrument(),
      generation = this.generation,
      revision = this.revision
    if (!chart || !sym) return
    const work = async () => {
      const state = await this.coordinator.snapshot()
      if (
        generation !== this.generation ||
        revision !== this.revision ||
        chart !== this.chart ||
        sym.symbol !== this.host.instrument()?.symbol ||
        sym.exchange !== this.host.instrument()?.exchange
      )
        return
      this.orders = state.orders.filter(
        (row) => row.symbol === sym.symbol && row.exchange === sym.exchange
      )
      this.positions = state.positions.filter(
        (row) => row.symbol === sym.symbol && row.exchange === sym.exchange && row.quantity !== 0
      )
      this.protections = (state.protections ?? []).filter(
        (row) => row.identity.symbol === sym.symbol && row.identity.exchange === sym.exchange
      )
      if (
        this.protectionDrag &&
        (!this.protections.some(
          (row) =>
            row.brokerId === this.protectionDrag!.binding.brokerId &&
            row.nativeVersion === this.protectionDrag!.binding.nativeVersion
        ) ||
          !this.positions.some(
            (row) =>
              row.product === this.protectionDrag!.position.product &&
              row.version === this.protectionDrag!.position.version
          ))
      )
        this.gestureCancelled = true
      if (
        this.activeDrag &&
        !this.orders.some(
          (row) =>
            row.orderid === this.activeDrag!.row.orderid &&
            row.version === this.activeDrag!.row.version
        )
      )
        this.gestureCancelled = true
      const previous = new Map(this.lines.map((line) => [line.options().id, line]))
      this.lines = []
      const keep = (options: ConstructorParameters<typeof CleanTradingLine>[0]) => {
        const line = previous.get(options.id)
        previous.delete(options.id)
        if (!line) return this.add(options)
        // Preserve the preview while its frozen broker version is unchanged.
        const dragging =
          (!this.gestureCancelled &&
            this.activeDrag &&
            options.id === `ct:order:${this.activeDrag.row.orderid}`) ||
          (!this.gestureCancelled &&
            this.protectionDrag &&
            options.id ===
              `ct:protection:${this.protectionDrag.binding.brokerId}:${this.protectionDrag.role}`)
        if (dragging) {
          const { price: _, ...rest } = options
          line.setOptions(rest)
        } else {
          line.setOptions(options)
          line.setDragGhost(null)
        }
        this.lines.push(line)
      }
      for (const row of this.orders.filter(
        (row) =>
          ['open', 'pending', 'trigger pending', 'partially filled'].includes(row.order_status) &&
          !this.protections.some(
            (binding) => binding.kind === 'regular' && binding.brokerId === row.orderid
          )
      )) {
        keep({
          id: `ct:order:${row.orderid}`,
          price: row.trigger_price || row.price,
          color: '#3b82f6',
          badge: row.action,
          qty: Math.max(0, row.quantity - (row.filled_quantity ?? 0)),
          leftLabel: `${row.pricetype} · ${row.product}${row.filled_quantity ? ` · Filled ${row.filled_quantity}/${row.quantity}` : ''}`,
          cursor: 'ns-resize',
          closeButton: true,
        })
      }
      for (const binding of this.protections)
        for (const role of ['stop', 'target', 'exit'] as const) {
          const leg = binding.confirmedRoles[role]
          if (!leg || ['cancelled', 'rejected', 'expired', 'complete'].includes(binding.state))
            continue
          keep({
            id: `ct:protection:${binding.brokerId}:${role}`,
            price: leg.trigger,
            color: role === 'stop' ? '#dc2626' : role === 'target' ? '#15803d' : '#3b82f6',
            badge: role === 'stop' ? 'SL' : role === 'target' ? 'TP' : 'EXIT',
            qty: binding.confirmedQuantities?.[role] ?? Math.abs(binding.positionQuantity),
            leftLabel: `${binding.identity.product} · ${binding.state}${binding.review ? ' · Review' : ''} · Limit ${this.host.format(leg.limit)}`,
            cursor: role !== 'exit' && this.canEditProtection(binding) ? 'ns-resize' : 'default',
            closeButton: !!this.canEditProtection(binding),
          })
        }
      for (const row of this.positions)
        keep({
          id: `ct:position:${row.product}`,
          price: row.average_price,
          color: '#3b82f6',
          badge: row.product,
          qty: Math.abs(row.quantity),
          leftLabel: this.pnl(row),
          closeButton: true,
          managePosition: true,
        })
      for (const line of previous.values()) chart.removePrimitive(line)
      await this.coordinator.reconcile()
    }
    const flight = work().finally(() => {
      if (this.flight !== flight) return
      this.flight = null
      if (revision !== this.revision && generation === this.generation && !this.trailing)
        this.trailing = setTimeout(() => {
          this.trailing = null
          void this.refresh().catch((error) => this.host.toast((error as Error).message, true))
        }, 150)
    })
    this.flight = flight
    return flight
  }
  private add(options: ConstructorParameters<typeof CleanTradingLine>[0]) {
    const line = new CleanTradingLine(options, this.layer)
    this.chart!.addPrimitive(line)
    this.lines.push(line)
  }
  private pnl(row: ChartPositionRow) {
    const mark = this.host.mark()
    if (mark == null) return 'P&L —'
    const pnl = (mark - row.average_price) * row.quantity
    return `${pnl >= 0 ? '+' : '−'}₹${Math.abs(pnl).toLocaleString('en-IN', { maximumFractionDigits: 2 })}`
  }
  mark(price: number) {
    this.layer.mark = price
    for (const row of this.positions)
      this.lines
        .find((line) => line.options().id === `ct:position:${row.product}`)
        ?.setLeftLabel(this.pnl(row))
  }
  detach() {
    this.disarm()
    this.generation++
    this.coordinator.invalidate()
    if (this.trailing) clearTimeout(this.trailing)
    this.trailing = null
    for (const off of this.offs) off()
    this.offs = []
    if (this.chart) for (const line of this.lines) this.chart.removePrimitive(line)
    this.lines = []
    this.orders = []
    this.positions = []
    this.protections = []
    this.protectionDrag = null
    this.chart = null
    this.activeDrag = null
    this.gestureCancelled = true
    this.flight = null
  }
}
