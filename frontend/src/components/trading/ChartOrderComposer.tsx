import { useRef, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { useLiveQuote } from '@/hooks/useLiveQuote'
import type { PlaceOrderDialogProps, TicketOrder } from './PlaceOrderDialog'
import { formatTradingExchange, formatTradingSymbol } from '@/lib/trading/displaySymbol'
import { ChartRequestReview } from './ChartRequestReview'

interface Props extends PlaceOrderDialogProps {
  arm(order: TicketOrder): void
}

/** Chart-only compact ticket. Other application order dialogs stay unchanged. */
export function ChartOrderComposer(props: Props) {
  const lot = props.lotSize || 1,
    tick = props.tickSize || 0.05
  const derivatives = ['NFO', 'BFO', 'MCX', 'CDS', 'BCD', 'NCO', 'NCDEX'].includes(
    props.exchange || ''
  )
  const digits = Math.max(0, Math.min(8, (tick.toString().split('.')[1] || '').length))
  const format = (value: number) => value.toFixed(digits)
  const [side, setSide] = useState<'BUY' | 'SELL'>(props.action || 'BUY')
  const [quantity, setQuantity] = useState(props.quantity || lot)
  const [product, setProduct] = useState(props.product || (derivatives ? 'NRML' : 'CNC'))
  const [type, setType] = useState(props.priceType || 'MARKET')
  const [price, setPrice] = useState(props.price?.toString() || '')
  const [trigger, setTrigger] = useState(props.triggerPrice?.toString() || '')
  const [busy, setBusy] = useState(false)
  const submitting = useRef(false)
  const [error, setError] = useState('')
  const quote = useLiveQuote(props.symbol || '', props.exchange || '', { enabled: props.open })
  const bid = quote.data.bidPrice,
    ask = quote.data.askPrice
  const send = async () => {
    if (submitting.current) return
    setError('')
    if (!Number.isInteger(quantity) || quantity <= 0 || quantity % lot) {
      setError('Enter a positive whole number of lots/units')
      return
    }
    const order: TicketOrder = {
      symbol: props.symbol || '',
      exchange: props.exchange || '',
      action: side,
      quantity,
      product,
      pricetype: type,
    }
    if (type === 'LIMIT' || type === 'SL') order.price = Number(price)
    if (type === 'SL' || type === 'SL-M') order.trigger_price = Number(trigger)
    if (
      (order.price != null && (!Number.isFinite(order.price) || order.price <= 0)) ||
      (order.trigger_price != null &&
        (!Number.isFinite(order.trigger_price) || order.trigger_price <= 0))
    ) {
      setError('Enter valid positive prices')
      return
    }
    submitting.current = true
    setBusy(true)
    try {
      if (type === 'MARKET') {
        if (!props.place) throw new Error('Chart execution unavailable')
        const result = await props.place(order)
        props.onSuccess?.(result.orderId)
      } else props.arm(order)
      props.onOpenChange(false)
    } catch (e) {
      setError((e as Error).message)
    } finally {
      submitting.current = false
      setBusy(false)
    }
  }
  return (
    <Dialog
      open={props.open}
      onOpenChange={(next) => {
        if (!busy) props.onOpenChange(next)
      }}
    >
      <DialogContent container={props.container} className="sm:max-w-[380px] p-4 gap-3">
        <DialogHeader>
          <DialogTitle className="text-sm pr-6">
            {formatTradingSymbol(props.symbol || '')}{' '}
            <span className="text-muted-foreground">
              {formatTradingExchange(props.exchange || '')}
            </span>
          </DialogTitle>
        </DialogHeader>
        <div className="grid grid-cols-2 gap-2">
          <Button
            variant={side === 'SELL' ? 'destructive' : 'outline'}
            size="sm"
            onClick={() => setSide('SELL')}
          >
            Sell · {bid != null && bid > 0 ? format(bid) : '—'}
          </Button>
          <Button
            variant={side === 'BUY' ? 'default' : 'outline'}
            size="sm"
            onClick={() => setSide('BUY')}
          >
            Buy · {ask != null && ask > 0 ? format(ask) : '—'}
          </Button>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <Label className="grid gap-1 text-xs">
            {lot > 1 ? 'Lots' : 'Quantity'}
            <Input
              aria-label={lot > 1 ? 'Order lots' : 'Order quantity'}
              type="number"
              min="1"
              step="1"
              value={quantity / lot}
              onChange={(e) => setQuantity(Number(e.target.value) * lot)}
            />
          </Label>
          <Label className="grid gap-1 text-xs">
            Product
            <select
              className="h-9 rounded-md border bg-background px-2"
              aria-label="Order product"
              value={product}
              onChange={(e) => setProduct(e.target.value as typeof product)}
            >
              {(derivatives ? ['NRML', 'MIS'] : ['CNC', 'MIS']).map((p) => (
                <option key={p}>{p}</option>
              ))}
            </select>
          </Label>
        </div>
        <Label className="grid gap-1 text-xs">
          Order type
          <select
            className="h-9 rounded-md border bg-background px-2"
            aria-label="Order type"
            value={type}
            onChange={(e) => setType(e.target.value as typeof type)}
          >
            {['MARKET', 'LIMIT', 'SL', 'SL-M'].map((t) => (
              <option key={t}>{t}</option>
            ))}
          </select>
        </Label>
        {(type === 'LIMIT' || type === 'SL') && (
          <Label className="grid gap-1 text-xs">
            Limit price
            <Input
              aria-label="Limit price"
              type="number"
              min={tick}
              step={tick}
              value={price}
              onChange={(e) => setPrice(e.target.value)}
            />
          </Label>
        )}
        {(type === 'SL' || type === 'SL-M') && (
          <Label className="grid gap-1 text-xs">
            Stop trigger
            <Input
              aria-label="Stop trigger"
              type="number"
              min={tick}
              step={tick}
              value={trigger}
              onChange={(e) => setTrigger(e.target.value)}
            />
          </Label>
        )}
        <div className="text-xs text-muted-foreground">
          {quantity.toLocaleString('en-IN')} units ·{' '}
          {type === 'MARKET'
            ? 'Executes at available broker prices.'
            : 'Drag mode: release the armed line to submit once.'}
        </div>
        {error && (
          <p role="alert" className="text-xs text-destructive">
            {error}
          </p>
        )}
        <ChartRequestReview symbol={props.symbol || ''} exchange={props.exchange || ''} />
        <Button
          disabled={busy}
          variant={side === 'SELL' ? 'destructive' : 'default'}
          onClick={() => void send()}
        >
          {busy
            ? 'Submitting…'
            : type === 'MARKET'
              ? `${side === 'BUY' ? 'Buy' : 'Sell'} at market`
              : `Arm ${side === 'BUY' ? 'Buy' : 'Sell'} · drag to place`}
        </Button>
      </DialogContent>
    </Dialog>
  )
}
