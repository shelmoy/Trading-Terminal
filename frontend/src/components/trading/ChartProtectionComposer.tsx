import { useEffect, useRef, useState } from 'react'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import type {
  ChartAccountState,
  ChartCapabilities,
  ChartPositionRow,
} from '@/lib/trading/chartCommands'
import type { CleanChartTrading } from '@/lib/trading/cleanChartTrading'

interface Props {
  position: ChartPositionRow
  controller: CleanChartTrading
  container?: HTMLElement | null
  onClose(): void
}

/** Established positions only. Native FYERS Single/OCO or one Kotak exit. */
export function ChartProtectionComposer({ position, controller, container, onClose }: Props) {
  const [state, setState] = useState<ChartAccountState | null>(null)
  const [capabilities, setCapabilities] = useState<ChartCapabilities | null>(null)
  const [kind, setKind] = useState('stop')
  const [values, setValues] = useState<Record<string, string>>({})
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [childId, setChildId] = useState('')
  const lock = useRef(false)
  const scope = useRef<string | null>(controller.coordinator.currentScope())
  const identity = (row: { symbol: string; exchange: string; product: string }) =>
    row.symbol === position.symbol &&
    row.exchange === position.exchange &&
    row.product === position.product
  const binding = state?.protections?.find(
    (row) =>
      identity(row.identity) &&
      !['cancelled', 'rejected', 'expired', 'complete'].includes(row.state)
  )
  const current = state?.positions.find((row) => identity(row) && row.quantity !== 0)
  useEffect(() => {
    let alive = true
    void Promise.all([
      controller.coordinator.snapshot(),
      controller.coordinator.capabilities({
        exchange: position.exchange,
        product: position.product,
      }),
    ])
      .then(([next, caps]) => {
        if (!alive) return
        if (scope.current && scope.current !== next.scope)
          throw new Error('Broker account changed; reopen protection')
        scope.current = next.scope
        setState(next)
        setCapabilities(caps)
        const bound = next.protections?.find(
          (row) =>
            identity(row.identity) &&
            !['cancelled', 'rejected', 'expired', 'complete'].includes(row.state)
        )
        if (bound) {
          const roles = bound.confirmedRoles
          setKind(
            roles.exit
              ? 'exit'
              : roles.stop && roles.target
                ? 'both'
                : roles.target
                  ? 'target'
                  : 'stop'
          )
          setValues(
            Object.fromEntries(
              Object.entries(roles).flatMap(([role, leg]) => [
                [`${role}Trigger`, String(leg!.trigger)],
                [`${role}Limit`, String(leg!.limit)],
              ])
            )
          )
        }
      })
      .catch((error) => {
        if (alive) setError(error.message)
      })
    return () => {
      alive = false
    }
  }, [controller, position.symbol, position.exchange, position.product])
  const send = async (cancel = false) => {
    if (lock.current || !state) return
    lock.current = true
    setBusy(true)
    setError('')
    try {
      if (controller.coordinator.currentScope() !== scope.current)
        throw new Error('Broker context changed; reopen protection')
      if (!cancel && (!current || !capabilities?.individualExits))
        throw new Error(capabilities?.protectionReason || 'Position is no longer open')
      const payload: Record<string, unknown> = {}
      if (!cancel)
        for (const role of kind === 'both' ? ['stop', 'target'] : [kind]) {
          for (const field of ['Trigger', 'Limit']) {
            const value = Number(values[`${role}${field}`])
            if (!Number.isFinite(value) || value <= 0)
              throw new Error('Enter explicit positive trigger and limit prices')
            payload[`${role}${field}`] = value
          }
        }
      await controller.manageProtection(
        cancel ? 'cancelProtection' : binding ? 'modifyProtection' : 'protect',
        current ?? position,
        payload,
        binding
      )
      onClose()
    } catch (error) {
      setError((error as Error).message)
    } finally {
      lock.current = false
      setBusy(false)
    }
  }
  const canManage =
    binding?.nativeVersion &&
    (binding.kind === 'gtt'
      ? binding.state === 'active'
      : ['open', 'pending', 'trigger pending', 'partially filled'].includes(binding.state))
  const candidates = (state?.orders ?? []).filter((row) => identity(row))
  const linkChild = async () => {
    const child = candidates.find((row) => row.orderid === childId)
    if (!child || !binding || lock.current) return
    lock.current = true
    setBusy(true)
    setError('')
    try {
      if (controller.coordinator.currentScope() !== scope.current)
        throw new Error('Broker account changed')
      await controller.coordinator.linkTriggerChild(binding, child)
      await controller.refresh()
      onClose()
    } catch (error) {
      setError(
        (error as { response?: { data?: { message?: string } } }).response?.data?.message ||
          (error as Error).message
      )
    } finally {
      lock.current = false
      setBusy(false)
    }
  }
  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open && !busy) onClose()
      }}
    >
      <DialogContent container={container} className="sm:max-w-[390px] p-4 gap-3">
        <DialogHeader>
          <DialogTitle className="text-sm">Position exits · {position.symbol}</DialogTitle>
          <DialogDescription className="text-xs">
            Manage broker-held exits for this product position.
          </DialogDescription>
        </DialogHeader>
        <p className="text-xs text-muted-foreground">
          {position.product} ·{' '}
          {current
            ? `${Math.abs(current.quantity)} units · ${current.quantity > 0 ? 'Long' : 'Short'}`
            : 'Position flat or loading'}
        </p>
        <p className="text-xs text-muted-foreground">
          {capabilities?.protectionReason || 'Loading broker capabilities…'}
        </p>
        {binding && (
          <p className="text-xs">
            {binding.kind === 'gtt' ? 'Broker trigger' : 'Individual exit'} {binding.brokerId} ·{' '}
            {binding.state}
          </p>
        )}
        {binding?.review && (
          <p role="status" className="text-xs text-amber-600 dark:text-amber-400">
            {binding.review}
          </p>
        )}
        <Label className="grid gap-1 text-xs">
          Exit type
          <select
            aria-label="Exit type"
            className="h-8 rounded-md border bg-background px-2"
            value={kind}
            disabled={!!binding || busy}
            onChange={(event) => setKind(event.target.value)}
          >
            <option value="stop">Stop loss</option>
            <option value="target">Take profit</option>
            {kind === 'exit' && <option value="exit">Triggered regular exit</option>}
            {capabilities?.brokerHeldOco && <option value="both">SL + TP · broker OCO</option>}
          </select>
        </Label>
        {(kind === 'exit' ? [] : kind === 'both' ? ['stop', 'target'] : [kind]).map((role) => (
          <div key={role} className="grid grid-cols-2 gap-2">
            {['Trigger', 'Limit'].map((field) => (
              <Label
                key={field}
                className={`grid gap-1 text-xs ${role === 'stop' ? 'text-red-600 dark:text-red-400' : 'text-green-700 dark:text-green-400'}`}
              >
                {role === 'stop' ? 'SL' : 'TP'} {field.toLowerCase()}
                <Input
                  aria-label={`${role} ${field.toLowerCase()}`}
                  type="number"
                  step="any"
                  min="0"
                  value={values[`${role}${field}`] ?? ''}
                  disabled={busy || (!!binding && !canManage)}
                  onChange={(event) =>
                    setValues((old) => ({ ...old, [`${role}${field}`]: event.target.value }))
                  }
                />
              </Label>
            ))}
          </div>
        ))}
        <p className="text-xs text-muted-foreground">
          Existing levels modify on drag release. Broker acceptance is not a fill. Cancel and
          confirm exits before closing the position.
        </p>
        <p className="text-xs text-muted-foreground">
          Broker GTTs remain active after external position changes. Review their quantities or
          cancel them after trading on the broker website.
        </p>
        {binding?.state === 'triggered' && (
          <div className="grid gap-2 rounded border p-2 text-xs">
            <p>
              Verify the child order ID on the broker website, then explicitly select it. The app
              does not infer this link from prices.
            </p>
            <select
              aria-label="Broker verified child order"
              value={childId}
              disabled={busy}
              onChange={(event) => setChildId(event.target.value)}
              className="h-8 rounded border bg-background px-2"
            >
              <option value="">Select broker-verified child ID</option>
              {candidates.map((row) => (
                <option key={row.orderid} value={row.orderid}>
                  {row.orderid} · {row.action} {row.quantity} · {row.order_status}
                </option>
              ))}
            </select>
            <Button
              size="sm"
              variant="outline"
              disabled={!childId || busy}
              onClick={() => void linkChild()}
            >
              Link verified child · no trade sent
            </Button>
          </div>
        )}
        {error && (
          <p role="alert" className="text-xs text-destructive">
            {error}
          </p>
        )}
        <div className="flex gap-2">
          <Button
            className="flex-1"
            size="sm"
            disabled={
              busy ||
              kind === 'exit' ||
              !current ||
              !capabilities?.individualExits ||
              (!!binding && !canManage)
            }
            onClick={() => void send()}
          >
            {busy ? 'Submitting…' : binding ? 'Update exit' : 'Attach exit'}
          </Button>
          {binding && (
            <Button
              variant="destructive"
              size="sm"
              disabled={busy || !canManage}
              onClick={() => void send(true)}
            >
              Cancel exit
            </Button>
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}
