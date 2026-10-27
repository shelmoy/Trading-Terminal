import { webClient } from '@/api/client'

export type ChartMode = 'live' | 'analyze'
export interface ChartOrderRow {
  orderid: string
  symbol: string
  exchange: string
  product: string
  action: 'BUY' | 'SELL'
  pricetype: 'MARKET' | 'LIMIT' | 'SL' | 'SL-M'
  quantity: number
  price: number
  trigger_price?: number
  order_status: string
  version: string
  filled_quantity?: number
}
export interface ChartPositionRow {
  symbol: string
  exchange: string
  product: string
  quantity: number
  average_price: number
  version: string
}
export interface PendingChartCommand {
  commandId: string
  state: string
  symbol: string
  exchange: string
  product: string
  operation?: string
  request?: Record<string, unknown>
  issuedAt?: number
}
export interface ChartAccountState {
  scope: string
  mode: ChartMode
  orders: ChartOrderRow[]
  positions: ChartPositionRow[]
  pendingCommands?: PendingChartCommand[]
  protections?: ChartProtection[]
  nativeExits?: {
    trigger_id: string
    symbol: string
    exchange: string
    status: string
    version: string
    legs: { action: string; product: string; quantity: number }[]
  }[]
}
export interface ChartProtection {
  brokerId: string
  kind: 'gtt' | 'regular'
  identity: { symbol: string; exchange: string; product: string }
  roles: Partial<Record<'stop' | 'target' | 'exit', { trigger: number; limit: number }>>
  confirmedRoles: Partial<Record<'stop' | 'target' | 'exit', { trigger: number; limit: number }>>
  confirmedQuantities?: Partial<Record<'stop' | 'target' | 'exit', number>>
  positionQuantity: number
  positionVersion: string
  nativeVersion: string | null
  state: string
  review: string
  parentTriggerId?: string
}
export interface ChartCapabilities {
  enabled: boolean
  brokerHeldOco: boolean
  entryBrackets: boolean
  protectionReason: string
  individualExits?: boolean
}
export interface CommandResult {
  state: 'accepted' | 'rejected' | 'uncertain' | 'resolved'
  orderId?: string
  commandId: string
  message: string
}

/** One in-flight mutation per scoped instrument/product; uncertain writes block it. */
export class ChartCommandCoordinator {
  private state: ChartAccountState | null = null
  private busy = new Set<string>()
  private uncertain = new Map<string, string>()
  private epoch = 0
  private mode: () => ChartMode
  constructor(mode: () => ChartMode) {
    this.mode = mode
  }
  invalidate() {
    this.epoch++
    this.state = null
  }
  async capabilities(instrument?: {
    exchange: string
    product: string
  }): Promise<ChartCapabilities> {
    return (
      await webClient.get('/chart-trading/capabilities', { params: instrument, timeout: 10000 })
    ).data.data
  }
  async snapshot(): Promise<ChartAccountState> {
    const epoch = this.epoch
    const mode = this.mode()
    const response = await webClient.get('/chart-trading/state', {
      params: { mode },
      timeout: 15000,
    })
    const next = response.data.data as ChartAccountState
    if (epoch !== this.epoch || mode !== this.mode() || next.mode !== mode)
      throw new Error('Trading context changed')
    if (this.state && this.state.scope !== next.scope) this.epoch++
    this.state = next
    for (const command of next.pendingCommands ?? []) {
      if (command.state === 'uncertain' || command.state === 'submitting') {
        const key = `${next.scope}:${command.exchange}:${command.symbol}:${command.product}`
        if (this.uncertain.size < 128) this.uncertain.set(key, command.commandId)
      }
    }
    return next
  }
  async send(
    operation: string,
    payload: Record<string, unknown>,
    expectedVersion?: string
  ): Promise<CommandResult> {
    const state = this.state
    if (!state || state.mode !== this.mode()) throw new Error('Refresh broker state before trading')
    const key = `${state.scope}:${payload.exchange}:${payload.symbol}:${payload.product}`
    if (this.busy.has(key))
      throw new Error('A broker request is already pending for this instrument')
    if (this.uncertain.has(key)) await this.reconcile()
    if (state !== this.state || state.mode !== this.mode())
      throw new Error('Trading context changed; refresh before trading')
    if (this.busy.has(key))
      throw new Error('A broker request is already pending for this instrument')
    if (this.uncertain.has(key))
      throw new Error(
        'Previous delivery is uncertain; review the earlier request in the order ticket'
      )
    if (this.uncertain.size >= 128)
      throw new Error('Too many unresolved requests; reconcile broker books first')
    this.busy.add(key)
    const commandId = crypto.randomUUID()
    // A book row can contain metadata and a legacy caller can carry auth fields.
    // Persist only the command contract, never either whole object.
    const fields = new Set([
      'symbol',
      'exchange',
      'product',
      'action',
      'quantity',
      'pricetype',
      'price',
      'trigger_price',
      'orderid',
      'disclosed_quantity',
      'protectionId',
      'protectionVersion',
      'stopTrigger',
      'stopLimit',
      'targetTrigger',
      'targetLimit',
    ])
    const executable = Object.fromEntries(
      Object.entries(payload).filter(([key]) => fields.has(key))
    )
    try {
      let result: CommandResult
      try {
        const response = await webClient.post(
          '/chart-trading/command',
          {
            commandId,
            issuedAt: Date.now() / 1000,
            scope: state.scope,
            mode: state.mode,
            operation,
            payload: executable,
            expectedVersion,
          },
          { timeout: 20000 }
        )
        result = response.data
      } catch (error) {
        const response = (error as { response?: { data?: CommandResult } }).response
        if (response?.data?.state === 'rejected') throw new Error(response.data.message)
        // Read status only. Never retry a POST after unknown delivery.
        this.uncertain.set(key, commandId)
        throw new Error('Delivery uncertain. Check broker books; this action will not be resent.')
      }
      if (result.state === 'uncertain' || (result.state === 'accepted' && !result.orderId))
        this.uncertain.set(key, commandId)
      if (result.state !== 'accepted' || !result.orderId) throw new Error(result.message)
      return result
    } finally {
      this.busy.delete(key)
    }
  }
  async reconcile(): Promise<void> {
    const scope = this.state?.scope
    for (const [key, id] of this.uncertain) {
      if (!scope || !key.startsWith(`${scope}:`)) continue
      const response = await webClient.get(`/chart-trading/commands/${encodeURIComponent(id)}`, {
        timeout: 10000,
      })
      if (['accepted', 'rejected', 'resolved'].includes(response.data.state))
        this.uncertain.delete(key)
    }
  }
  currentScope(): string | null {
    return this.state?.scope ?? null
  }
  async linkTriggerChild(binding: ChartProtection, child: ChartOrderRow) {
    const state = this.state
    if (!state || state.mode !== this.mode()) throw new Error('Trading context changed')
    await webClient.post(
      `/chart-trading/protections/${encodeURIComponent(binding.brokerId)}/child`,
      {
        scope: state.scope,
        mode: state.mode,
        orderId: child.orderid,
        triggerVersion: binding.nativeVersion,
        expectedVersion: child.version,
      },
      { timeout: 15000 }
    )
  }
}
