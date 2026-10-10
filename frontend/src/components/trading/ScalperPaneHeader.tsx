import { Maximize2, Minimize2 } from 'lucide-react'
import type { ChartStateView } from '@/lib/trading/chartState'

interface Props {
  side: 'spot' | 'ce' | 'pe'
  symbol: string
  exchange: string
  focused: boolean
  maximized: boolean
  state?: ChartStateView['kind']
  onFocus(): void
  onMaximize(): void
}

/** A shared, keyboard-accessible title strip for all three Scalper charts. */
export function ScalperPaneHeader({
  side,
  symbol,
  exchange,
  focused,
  maximized,
  state,
  onFocus,
  onMaximize,
}: Props) {
  const label = side === 'spot' ? 'Spot' : side === 'ce' ? 'Call' : 'Put'
  const status =
    !state || state === 'loading' ? 'loading' : state === 'ready' ? 'ready' : 'unavailable'
  return (
    <div className="scalper-pane-header" data-side={side}>
      <button
        type="button"
        className="scalper-pane-select"
        onClick={onFocus}
        aria-pressed={focused}
        aria-label={`Focus ${label} chart: ${symbol}`}
        title={symbol}
      >
        <span className="scalper-pane-kind">{label}</span>
        <span className="scalper-pane-symbol">{symbol}</span>
        <span className="scalper-pane-exchange">{exchange}</span>
      </button>
      <span
        className="scalper-pane-status"
        data-status={status}
        role="img"
        aria-label={
          status === 'ready'
            ? 'Chart loaded'
            : status === 'loading'
              ? 'Loading chart'
              : 'Chart unavailable'
        }
        title={
          status === 'ready'
            ? 'Chart loaded'
            : status === 'loading'
              ? 'Loading chart'
              : 'Chart unavailable'
        }
      />
      <button
        type="button"
        className="scalper-pane-expand"
        onClick={onMaximize}
        aria-label={maximized ? 'Restore chart layout' : `Maximize ${label} chart`}
        title={maximized ? 'Restore chart layout' : `Maximize ${label} chart`}
      >
        {maximized ? <Minimize2 size={13} /> : <Maximize2 size={13} />}
      </button>
    </div>
  )
}
