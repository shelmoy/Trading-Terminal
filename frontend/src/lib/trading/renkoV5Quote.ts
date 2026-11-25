import type { IPrimitive, PrimitiveHost, PrimitiveRenderContext } from 'openalgo-charts'

export interface RenkoQuote {
  price: number
  rising: boolean
  countdown: number | null
  showLine: boolean
  showLabel: boolean
}

/** A quote-only layer. It never writes to a price series or the Renko transform. */
export class RenkoV5Quote implements IPrimitive {
  private host: PrimitiveHost | null = null
  private timer: ReturnType<typeof setInterval> | null = null
  private drawnCountdown: number | null = null
  private readonly read: () => RenkoQuote | null

  constructor(read: () => RenkoQuote | null) {
    this.read = read
  }

  attached(host: PrimitiveHost): void {
    this.detached()
    this.host = host
    this.timer = setInterval(() => {
      const quote = this.read()
      const countdown = quote?.showLabel ? quote.countdown : null
      if (countdown !== this.drawnCountdown) this.refresh()
    }, 1000)
  }

  detached(): void {
    if (this.timer !== null) clearInterval(this.timer)
    this.timer = null
    this.drawnCountdown = null
    this.host = null
  }

  refresh(): void {
    this.host?.requestUpdate()
  }

  zOrder(): 'normal' {
    return 'normal'
  }

  draw(ctx: CanvasRenderingContext2D, rc: PrimitiveRenderContext): void {
    const quote = this.read()
    this.drawnCountdown = quote?.showLabel ? quote.countdown : null
    if (!quote || (!quote.showLine && !quote.showLabel)) return
    const dpr = rc.dpr
    const scale = rc.readoutPriceScale ?? rc.priceScale
    const y = Math.round(scale.priceToY(quote.price) * dpr)
    const height = rc.plotHeight * dpr
    if (!Number.isFinite(y)) return
    const color = quote.rising ? rc.theme.lastPriceUp : rc.theme.lastPriceDown

    ctx.save()
    if (quote.showLine && y >= 0 && y <= height) {
      ctx.strokeStyle = color
      ctx.lineWidth = Math.max(1, dpr)
      ctx.setLineDash([3 * dpr, 3 * dpr])
      ctx.beginPath()
      ctx.moveTo(0, y)
      ctx.lineTo(rc.plotWidth * dpr, y)
      ctx.stroke()
    }

    if (quote.showLabel && rc.priceAxisWidth > 0 && rc.priceAxisSide !== 'hidden') {
      const left = rc.priceAxisSide === 'left'
      const x = (rc.priceAxisOffset ?? (left ? 0 : rc.plotWidth)) * dpr
      const width = rc.priceAxisWidth * dpr
      const price = scale.format(quote.price)
      const seconds = quote.countdown
      const time = seconds === null ? null
        : `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`
      const tagHeight = Math.min(height, (time ? 32 : 18) * dpr)
      const top = Math.max(0, Math.min(y - 9 * dpr, height - tagHeight))
      const start = left ? x - width : x
      ctx.fillStyle = color
      ctx.fillRect(start, top, width, tagHeight)
      ctx.fillStyle = rc.theme.lastPriceText
      ctx.textAlign = left ? 'right' : 'left'
      ctx.textBaseline = 'middle'
      ctx.font = `${11 * dpr}px system-ui, sans-serif`
      const textX = x + (left ? -5 : 5) * dpr
      ctx.fillText(price, textX, top + 9 * dpr, Math.max(1, width - 9 * dpr))
      if (time) ctx.fillText(time, textX, top + 23 * dpr, Math.max(1, width - 9 * dpr))
    }
    ctx.restore()
  }
}
