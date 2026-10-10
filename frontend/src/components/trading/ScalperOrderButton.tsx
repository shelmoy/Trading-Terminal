import { useRequiredMargin } from '@/hooks/useRequiredMargin'
import type { ScalpingProduct } from '@/types/scalping'
import { Tip } from './Tip'

interface Props {
  side: 'CE' | 'PE'
  action: 'BUY' | 'SELL'
  apiKey: string | null
  scope: string
  sandbox: boolean
  contract: { symbol: string; exchange: string } | null
  quantity: number
  product: ScalpingProduct
  disabled: boolean
  onClick: () => void
}

const money = (amount: number) => `₹${amount.toLocaleString('en-IN', { maximumFractionDigits: 2 })}`
const compact = (amount: number) =>
  amount >= 100000
    ? `₹${(amount / 100000).toFixed(2)}L`
    : amount >= 1000
      ? `₹${(amount / 1000).toFixed(1)}k`
      : money(amount)

/** One compact action; the full broker estimate remains available on focus/hover. */
export function ScalperOrderButton({
  side,
  action,
  apiKey,
  scope,
  sandbox,
  contract,
  quantity,
  product,
  disabled,
  onClick,
}: Props) {
  const margin = useRequiredMargin({
    apiKey,
    scope,
    symbol: contract?.symbol ?? '',
    exchange: contract?.exchange ?? '',
    action,
    quantity,
    product,
    enabled: Boolean(contract),
  })
  const detail =
    margin.amount == null
      ? margin.message
      : `${money(margin.amount)} · ${quantity.toLocaleString('en-IN')} qty · ${product} · updated ${new Date(margin.updatedAt!).toLocaleTimeString('en-IN')}`
  return (
    <Tip
      side="top"
      tip={{
        title: `${action} ${side} · required margin estimate`,
        sub: `${detail}${sandbox ? ' · Broker estimate; Sandbox margin rules may differ.' : ' · Final requirement is determined by the broker.'}`,
      }}
    >
      <button
        type="button"
        className="scalper-action-button"
        data-action={action.toLowerCase()}
        disabled={disabled}
        onClick={onClick}
        aria-label={`${action} ${side}, ${margin.amount == null ? 'required margin unavailable' : `estimated required margin ${money(margin.amount)}`}`}
      >
        <span>
          {action} {side}
        </span>
        <small className="scalper-action-margin" data-status={margin.status}>
          Req{' '}
          {margin.amount == null
            ? margin.status === 'loading'
              ? '…'
              : '—'
            : compact(margin.amount)}
        </small>
      </button>
    </Tip>
  )
}
