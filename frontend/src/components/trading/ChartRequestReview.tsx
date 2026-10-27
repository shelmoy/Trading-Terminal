import { useCallback, useEffect, useRef, useState } from 'react'
import { webClient } from '@/api/client'
import { Button } from '@/components/ui/button'
import { useThemeStore } from '@/stores/themeStore'
import { useAuthStore } from '@/stores/authStore'
import type { ChartAccountState } from '@/lib/trading/chartCommands'

/** Local journal reconciliation only. Selecting a broker ID never sends a trade. */
export function ChartRequestReview({ symbol, exchange }: { symbol: string; exchange: string }) {
  const { appMode } = useThemeStore(),
    { user } = useAuthStore()
  const mode = appMode === 'live' ? 'live' : 'analyze'
  const [snapshot, setSnapshot] = useState<ChartAccountState | null>(null)
  const [requestId, setRequestId] = useState(''),
    [orderId, setOrderId] = useState('')
  const [error, setError] = useState(''),
    [busy, setBusy] = useState(false)
  const generation = useRef(0),
    active = useRef<AbortController | null>(null),
    posting = useRef(false)
  const load = useCallback(async () => {
    active.current?.abort()
    const controller = new AbortController()
    active.current = controller
    const current = ++generation.current
    try {
      const response = await webClient.get('/chart-trading/state', {
        params: { mode },
        timeout: 15000,
        signal: controller.signal,
      })
      if (current === generation.current && !controller.signal.aborted)
        setSnapshot(response.data.data)
    } catch (e) {
      if (current === generation.current && !controller.signal.aborted)
        setError((e as Error).message)
    }
  }, [mode, user?.broker, user?.username, user?.loginTime])
  useEffect(() => {
    setSnapshot(null)
    setRequestId('')
    setOrderId('')
    setError('')
    void load()
    return () => {
      generation.current++
      active.current?.abort()
    }
  }, [load, symbol, exchange])
  const requests = (snapshot?.pendingCommands ?? []).filter(
    (item) =>
      item.symbol === symbol &&
      item.exchange === exchange &&
      ['uncertain', 'submitting'].includes(item.state)
  )
  if (!requests.length)
    return error ? (
      <p role="status" className="text-xs text-muted-foreground">
        Request status unavailable. Refresh broker books before retrying.
      </p>
    ) : null
  const selected = requests.find((item) => item.commandId === requestId)
  const regular = (snapshot?.orders ?? []).filter(
    (row) => row.symbol === symbol && row.exchange === exchange && row.product === selected?.product
  )
  const nativeRequest =
    user?.broker === 'fyers' &&
    ['protect', 'modifyProtection', 'cancelProtection'].includes(selected?.operation || '')
  const orders = nativeRequest
    ? (snapshot?.nativeExits ?? [])
        .filter(
          (row) =>
            row.symbol === symbol &&
            row.exchange === exchange &&
            row.legs.every((leg) => leg.product === selected?.product)
        )
        .map((row) => ({
          orderid: row.trigger_id,
          version: row.version,
          action: row.legs[0]?.action,
          quantity: row.legs[0]?.quantity,
          order_status: row.status,
        }))
    : regular
  const chosen = orders.find((row) => row.orderid === orderId)
  const reconcile = async () => {
    if (posting.current || !snapshot || !selected || !chosen || selected.state !== 'uncertain')
      return
    posting.current = true
    setBusy(true)
    setError('')
    const current = generation.current
    try {
      await webClient.post(
        `/chart-trading/commands/${encodeURIComponent(selected.commandId)}/resolve`,
        {
          scope: snapshot.scope,
          mode,
          orderId: chosen.orderid,
          expectedVersion: chosen.version,
        },
        { timeout: 15000 }
      )
      if (current === generation.current) {
        setOrderId('')
        setRequestId('')
        await load()
      }
    } catch (e) {
      if (current === generation.current)
        setError(
          (e as { response?: { data?: { message?: string } } }).response?.data?.message ||
            (e as Error).message
        )
    } finally {
      posting.current = false
      setBusy(false)
    }
  }
  return (
    <section
      aria-label="Uncertain broker request"
      className="grid gap-2 rounded-md border border-amber-500/50 p-3 text-xs"
    >
      <strong className="text-amber-700 dark:text-amber-300">Broker request needs review</strong>
      <p>
        Delivery is uncertain. Nothing will be resent. Verify the order ID in your broker's books
        before linking it here.
      </p>
      <select
        aria-label="Unresolved chart request"
        className="h-9 min-w-0 rounded border bg-background px-2"
        value={requestId}
        disabled={busy}
        onChange={(e) => {
          setRequestId(e.target.value)
          setOrderId('')
        }}
      >
        <option value="">Select the earlier request</option>
        {requests.map((item) => (
          <option key={item.commandId} value={item.commandId}>
            {item.operation} · {item.product} · {item.commandId.slice(0, 8)} · {item.state}
          </option>
        ))}
      </select>
      {selected && (
        <p className="text-muted-foreground">
          {String(selected.request?.action || selected.operation || 'Request')}{' '}
          {String(selected.request?.quantity ?? '—')} units ·{' '}
          {String(selected.request?.pricetype || selected.product)}
          {selected.request?.price != null ? ` · Limit ${selected.request.price}` : ''}
          {selected.request?.trigger_price != null
            ? ` · Trigger ${selected.request.trigger_price}`
            : ''}
          {selected.issuedAt
            ? ` · ${new Date(selected.issuedAt * 1000).toLocaleString('en-IN')}`
            : ''}
        </p>
      )}
      {selected?.state === 'submitting' ? (
        <p>
          The original request may still be running. Refresh its status; it cannot be linked while
          submitting.
        </p>
      ) : (
        selected && (
          <>
            <select
              aria-label="Verified broker order ID"
              className="h-9 min-w-0 rounded border bg-background px-2"
              value={orderId}
              disabled={busy}
              onChange={(e) => setOrderId(e.target.value)}
            >
              <option value="">Choose the exact broker order ID</option>
              {orders.map((row) => (
                <option key={row.orderid} value={row.orderid}>
                  {row.orderid} · {row.action} {row.quantity} · {row.order_status}
                </option>
              ))}
            </select>
            <Button
              variant="outline"
              size="sm"
              disabled={busy || !chosen}
              onClick={() => void reconcile()}
            >
              {busy ? 'Verifying…' : 'Link verified order · no trade sent'}
            </Button>
            {!orders.length && (
              <p>
                No matching broker orders are visible. This does not prove non-delivery; keep the
                request blocked and check with the broker.
              </p>
            )}
          </>
        )
      )}
      <Button size="sm" variant="ghost" disabled={busy} onClick={() => void load()}>
        Refresh broker books
      </Button>
      {error && (
        <p role="alert" className="text-destructive">
          {error}
        </p>
      )}
    </section>
  )
}
