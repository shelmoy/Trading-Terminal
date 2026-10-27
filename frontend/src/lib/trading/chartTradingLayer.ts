import type {
  IPrimitive,
  PrimitiveHost,
  PrimitiveRenderContext,
  PriceLineOptions,
  PrimitiveHit,
} from 'openalgo-charts'

export interface AxisItem {
  id: string
  y: number
}
/** Displace labels, never their prices. Reserve the native LTP tag/countdown. */
export function allocateTradeLabels(
  items: AxisItem[],
  height: number,
  markY?: number,
  minimumY = 12,
  reservedYs: number[] = []
): Map<string, number> {
  const slots: number[] = []
  for (let y = minimumY; y <= height - 12; y += 22) {
    if ([markY, ...reservedYs].every((reserved) => reserved == null || Math.abs(y - reserved) > 26))
      slots.push(y)
  }
  const result = new Map<string, number>()
  const rows = [...items].sort((a, b) => a.y - b.y).slice(0, slots.length)
  let previous = -1
  for (let row = 0; row < rows.length; row++) {
    // Keep vertical price order. Greedy "nearest free slot" can put the next
    // lower price above the previous higher one and cross their leaders.
    const last = slots.length - (rows.length - row)
    let best = previous + 1
    for (let slot = best + 1; slot <= last; slot++)
      if (Math.abs(slots[slot] - rows[row].y) < Math.abs(slots[best] - rows[row].y)) best = slot
    result.set(rows[row].id, slots[best])
    previous = best
  }
  return result
}

export class CleanTradingLines {
  readonly lines = new Set<CleanTradingLine>()
  mark: number | null = null
  readonly format: (n: number) => string
  private revision = 0
  private cachedKey = ''
  private cachedLayout = new Map<string, number>()
  overflowCount = 0
  firstVisibleId: string | null = null
  constructor(format: (n: number) => string) {
    this.format = format
  }
  invalidate() {
    this.revision++
  }
  layout(rc: PrimitiveRenderContext): Map<string, number> {
    const scale = rc.readoutPriceScale ?? rc.priceScale
    const bars = rc.bars?.(),
      lastClose = bars?.[bars.length - 1]?.close
    const key = [
      this.revision,
      rc.plotWidth,
      rc.plotHeight,
      scale.options.mode,
      scale.options.inverted,
      scale.priceToY(1),
      scale.priceToY(2),
      this.mark,
      lastClose,
    ].join(':')
    if (key === this.cachedKey) return this.cachedLayout
    const rows = [...this.lines]
      .map((line) => ({ id: line.options().id, y: scale.priceToY(line.price) }))
      .filter((row) => Number.isFinite(row.y) && row.y >= 0 && row.y <= rc.plotHeight)
    const layout = allocateTradeLabels(
      rows,
      rc.plotHeight - 24,
      this.mark == null ? undefined : scale.priceToY(this.mark),
      96,
      lastClose == null ? [] : [scale.priceToY(lastClose)]
    )
    this.firstVisibleId = rows[0]?.id ?? null
    this.overflowCount = rows.length - layout.size
    this.cachedKey = key
    this.cachedLayout = layout
    return layout
  }
}

/** Small original OpenAlgo order chip; no vendor segmented LONG/SHORT pill. */
export class CleanTradingLine implements IPrimitive {
  private host: PrimitiveHost | null = null
  private ghost: number | null = null
  private box: { x: number; y: number; width: number; height: number } | null = null
  private opts: PriceLineOptions & { managePosition?: boolean }
  private owner: CleanTradingLines
  constructor(opts: PriceLineOptions & { managePosition?: boolean }, owner: CleanTradingLines) {
    this.opts = opts
    this.owner = owner
  }
  get price() {
    return this.opts.price
  }
  options() {
    return this.opts
  }
  setPrice(price: number) {
    if (price !== this.opts.price) this.owner.invalidate()
    this.opts = { ...this.opts, price }
    this.host?.requestUpdate()
  }
  setLeftLabel(leftLabel: string) {
    this.setOptions({ leftLabel })
  }
  setOptions(patch: Partial<Omit<PriceLineOptions, 'id'>>) {
    if (patch.price != null && patch.price !== this.opts.price) this.owner.invalidate()
    this.opts = { ...this.opts, ...patch }
    this.host?.requestUpdate()
  }
  setDragGhost(price: number | null) {
    this.ghost = price
    this.host?.requestUpdate()
  }
  attached(host: PrimitiveHost) {
    this.host = host
    this.owner.lines.add(this)
    this.owner.invalidate()
  }
  detached() {
    this.owner.lines.delete(this)
    this.owner.invalidate()
    this.host = null
    this.box = null
  }
  zOrder() {
    return 'top' as const
  }
  autoscaleInfo() {
    return null
  }
  draw(ctx: CanvasRenderingContext2D, rc: PrimitiveRenderContext) {
    const o = this.opts
    const scale = rc.readoutPriceScale ?? rc.priceScale
    const y = scale.priceToY(o.price)
    this.box = null
    if (!Number.isFinite(y) || y < 0 || y > rc.plotHeight) return
    const active = rc.hoverId?.startsWith(o.id) || rc.dragId === o.id
    const labelY = this.owner.layout(rc).get(o.id)
    const isPosition = o.id.startsWith('ct:position:')
    const text = [o.badge, o.qty, ...(active || isPosition ? [o.leftLabel] : [])]
      .filter((value) => value != null && value !== '')
      .join(' · ')
    ctx.save()
    ctx.font = '11px "Segoe UI", sans-serif'
    ctx.textBaseline = 'middle'
    const width = Math.min(
      Math.max(80, ctx.measureText(text).width + (active ? (o.managePosition ? 82 : 34) : 16)),
      Math.max(90, rc.plotWidth * 0.5)
    )
    const x = Math.max(6, rc.plotWidth - width - 10)
    ctx.strokeStyle = o.color
    ctx.lineWidth = active ? 1.5 : 1
    ctx.setLineDash(isPosition ? [] : [4, 4])
    ctx.beginPath()
    ctx.moveTo(Math.max(0, x - 55), y)
    ctx.lineTo(rc.plotWidth, y)
    ctx.stroke()
    if (this.ghost != null) {
      const oldY = scale.priceToY(this.ghost)
      ctx.globalAlpha = 0.35
      ctx.beginPath()
      ctx.moveTo(x - 25, oldY)
      ctx.lineTo(rc.plotWidth, oldY)
      ctx.stroke()
      ctx.globalAlpha = 1
    }
    ctx.setLineDash([])
    if (labelY != null) {
      // Plot chip and axis tag share a collision-managed row. The fine leader
      // continues to the true level, so no numeric price is visually invented.
      ctx.fillStyle = rc.theme.background
      ctx.fillRect(x, labelY - 10, width, 20)
      ctx.strokeStyle = o.color
      ctx.strokeRect(x + 0.5, labelY - 9.5, width - 1, 19)
      ctx.fillStyle = rc.theme.axisText
      ctx.save()
      ctx.beginPath()
      ctx.rect(x + 6, labelY - 10, width - (active ? (o.managePosition ? 80 : 28) : 12), 20)
      ctx.clip()
      ctx.fillText(text, x + 7, labelY)
      ctx.restore()
      if (active && o.closeButton) {
        ctx.fillStyle = o.color
        ctx.fillText('×', x + width - 17, labelY)
      }
      if (active && o.managePosition) {
        ctx.fillStyle = rc.theme.axisText
        ctx.fillText('SL/TP', x + width - 73, labelY)
      }
      this.box = { x, y: labelY - 10, width, height: 20 }
      if (rc.priceAxisSide !== 'hidden' && rc.priceAxisWidth > 0) {
        const axisX = rc.priceAxisOffset ?? rc.plotWidth
        const left = rc.priceAxisSide === 'left' ? axisX - rc.priceAxisWidth : axisX
        const edge = rc.priceAxisSide === 'left' ? 0 : rc.plotWidth
        ctx.strokeStyle = o.color
        ctx.beginPath()
        ctx.moveTo(edge + (rc.priceAxisSide === 'left' ? 5 : -5), y)
        ctx.lineTo(edge, labelY)
        ctx.stroke()
        ctx.fillStyle = o.color
        ctx.fillRect(left, labelY - 10, rc.priceAxisWidth, 20)
        ctx.fillStyle = '#fff'
        ctx.textAlign = 'center'
        ctx.fillText(this.owner.format(o.price), left + rc.priceAxisWidth / 2, labelY)
      }
    }
    if (this.owner.firstVisibleId === o.id && this.owner.overflowCount > 0) {
      ctx.textAlign = 'left'
      ctx.font = '10px "Segoe UI", sans-serif'
      ctx.fillStyle = rc.theme.background
      ctx.fillRect(4, rc.plotHeight - 23, Math.min(150, rc.plotWidth - 8), 21)
      ctx.fillStyle = rc.theme.axisText
      ctx.fillText(
        `+${this.owner.overflowCount} more levels · Orders`,
        8,
        rc.plotHeight - 12,
        Math.max(40, rc.plotWidth - 16)
      )
    }
    ctx.restore()
  }
  hitTest(x: number, y: number, _rc: PrimitiveRenderContext): PrimitiveHit | null {
    const b = this.box
    if (!b || x < b.x || x > b.x + b.width || y < b.y || y > b.y + b.height) return null
    const close = this.opts.closeButton && x > b.x + b.width - 25
    const manage = !close && this.opts.managePosition && x > b.x + b.width - 80
    return {
      externalId: close
        ? `${this.opts.id}::close`
        : manage
          ? `${this.opts.id}::protect`
          : this.opts.id,
      zOrder: 'top',
      distance: 0,
      cursor: close || manage ? 'pointer' : (this.opts.cursor ?? 'default'),
      cancelOnEscape: true,
    }
  }
}

/** Bid/ask stay distinct from LTP. A mark never fills in missing depth. */
export class CleanTradeButtons implements IPrimitive {
  private host: PrimitiveHost | null = null
  private bid: number | null = null
  private ask: number | null = null
  private buyColor = '#15803d'
  private sellColor = '#dc2626'
  private qty: string
  private format: (n: number) => string
  constructor(qty: string, format: (n: number) => string) {
    this.qty = qty
    this.format = format
  }
  attached(host: PrimitiveHost) {
    this.host = host
  }
  detached() {
    this.host = null
  }
  zOrder() {
    return 'top' as const
  }
  autoscaleInfo() {
    return null
  }
  setMark(_mark: number) {
    /* a candle/LTP is not a bid/ask quote */
  }
  setPrices(bid: number, ask: number) {
    this.bid = bid > 0 ? bid : null
    this.ask = ask > 0 ? ask : null
    this.host?.requestUpdate()
  }
  setQty(qty: string) {
    this.qty = qty
    this.host?.requestUpdate()
  }
  setColors(buy?: string, sell?: string) {
    this.buyColor = buy ?? '#15803d'
    this.sellColor = sell ?? '#dc2626'
    this.host?.requestUpdate()
  }
  draw(ctx: CanvasRenderingContext2D, rc: PrimitiveRenderContext) {
    if (rc.plotWidth < 220) return
    ctx.save()
    ctx.font = '11px "Segoe UI", sans-serif'
    ctx.textBaseline = 'middle'
    ctx.textAlign = 'center'
    for (const [x, color, label, price] of [
      [12, this.sellColor, 'SELL', this.bid],
      [126, this.buyColor, 'BUY', this.ask],
    ] as const) {
      ctx.fillStyle = color
      ctx.beginPath()
      ctx.roundRect(x, 52, 76, 32, 5)
      ctx.fill()
      ctx.fillStyle = '#fff'
      ctx.fillText(label, x + 38, 61)
      ctx.fillText(price == null ? '—' : this.format(price), x + 38, 75)
    }
    ctx.fillStyle = rc.theme.background
    ctx.fillRect(88, 52, 38, 32)
    ctx.fillStyle = rc.theme.axisText
    ctx.fillText(this.qty, 107, 68)
    ctx.restore()
  }
  hitTest(x: number, y: number, rc: PrimitiveRenderContext): PrimitiveHit | null {
    if (rc.plotWidth < 220 || y < 52 || y > 84 || x < 12 || x > 202) return null
    return {
      externalId: x < 88 ? 'trade:sell' : x < 126 ? 'trade:qty' : 'trade:buy',
      zOrder: 'top',
      distance: 0,
      cursor: 'pointer',
    }
  }
}
