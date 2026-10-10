import {
  Check,
  ChevronDown,
  Columns3,
  FileSpreadsheet,
  FolderOpen,
  LayoutGrid,
  LogOut,
  PanelsTopLeft,
  SlidersHorizontal,
  TrendingUp,
  Zap,
} from 'lucide-react'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuCheckboxItem,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
} from '@/components/ui/dropdown-menu'
import type { DayPnlSummary } from '@/lib/trading/dayPnl'

interface IndexChoice {
  id: string
  label: string
  spotExchange: string
}

interface IndexQuote {
  ltp: number
  change: number | null
  changePct: number | null
}

interface Props {
  underlying: IndexChoice
  underlyings: IndexChoice[]
  exchange: string
  quote: IndexQuote
  quotes: Record<string, IndexQuote>
  flashes: Record<string, 'up' | 'down'>
  expiries: string[]
  expiry: string
  atmStrike: number | null
  maxPainStrike: number | null
  activeView: 'scalper' | 'positions' | 'orders'
  optionChainOpen: boolean
  navigationVisible: boolean
  sandbox: boolean
  switchingMode: boolean
  visiblePanes: { spot: boolean; ce: boolean; pe: boolean }
  layout: 'split' | 'cols3'
  margin: string
  broker: string
  pnl: number | null
  dayPnl: DayPnlSummary
  pnlDate: string
  pnlValuationNote: string
  exiting: boolean
  onNavigationToggle(): void
  onUnderlyingSelect(id: string): void
  onExpirySelect(expiry: string): void
  onViewSelect(view: 'scalper' | 'positions' | 'orders'): void
  onOptionChainToggle(): void
  onModeToggle(): void
  onPaneToggle(pane: 'spot' | 'ce' | 'pe'): void
  onLayoutSelect(layout: 'split' | 'cols3'): void
  onExitAll(): void
}

const price = (value: number) =>
  Number.isFinite(value) && value > 0
    ? value.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
    : '—'
const signed = (value: number) => `${value >= 0 ? '+' : '−'}${Math.abs(value).toFixed(2)}`
const moneyPnl = (value: number | null) =>
  value == null
    ? '—'
    : `${value >= 0 ? '+' : '−'}₹${Math.abs(value).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`

const views = [
  { id: 'scalper', label: 'Scalper', Icon: Zap },
  { id: 'positions', label: 'Positions', Icon: TrendingUp },
  { id: 'orders', label: 'Orders', Icon: FolderOpen },
] as const
const panes = [
  { id: 'spot', label: 'Spot' },
  { id: 'ce', label: 'Call' },
  { id: 'pe', label: 'Put' },
] as const

export function ScalperHeader(props: Props) {
  const {
    underlying,
    underlyings,
    exchange,
    quote,
    quotes,
    flashes,
    expiries,
    expiry,
    atmStrike,
    maxPainStrike,
    activeView,
    optionChainOpen,
    navigationVisible,
    sandbox,
    switchingMode,
    visiblePanes,
    layout,
    margin,
    pnl,
    exiting,
  } = props
  const changeTone = quote.change == null ? undefined : quote.change >= 0 ? 'up' : 'down'
  const pnlText = moneyPnl(pnl)
  const pnlTone = pnl == null ? undefined : pnl >= 0 ? 'up' : 'down'
  const changeText =
    quote.change != null && quote.changePct != null
      ? `${signed(quote.change)} (${signed(quote.changePct)}%)`
      : 'Change unavailable'

  return (
    <header className="scalper-terminal-header">
      <button
        type="button"
        className="scalper-wordmark"
        onClick={props.onNavigationToggle}
        aria-pressed={navigationVisible}
        aria-label={navigationVisible ? 'Hide OpenAlgo navigation' : 'Show OpenAlgo navigation'}
        title="OpenAlgo navigation"
      >
        <span className="scalper-brand-mark">
          <Zap size={14} strokeWidth={1.8} />
        </span>
        <span className="scalper-brand-name">
          Scalper <span>915</span>
        </span>
      </button>

      <nav className="scalper-workspace-nav" aria-label="Scalper workspace">
        {views.map(({ id, label, Icon }) => (
          <button
            key={id}
            type="button"
            aria-pressed={activeView === id}
            aria-label={label}
            title={label}
            onClick={() => props.onViewSelect(id)}
          >
            <Icon size={13} strokeWidth={1.8} />
            <span>{label}</span>
          </button>
        ))}
        <button
          type="button"
          aria-pressed={optionChainOpen}
          aria-label="Option chain"
          title="Option chain"
          onClick={props.onOptionChainToggle}
        >
          <FileSpreadsheet size={13} strokeWidth={1.8} />
          <span>Option chain</span>
        </button>
      </nav>
      <div className="scalper-mobile-workspace">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              type="button"
              className="scalper-glass-icon"
              aria-label="Workspace panels"
              title="Workspace panels"
            >
              <PanelsTopLeft size={15} />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent
            align="start"
            sideOffset={8}
            className="scalper-header-menu scalper-settings-menu"
          >
            <div className="scalper-menu-caption">Workspace</div>
            {views.map(({ id, label, Icon }) => (
              <DropdownMenuItem
                key={id}
                className="scalper-compact-menu-item"
                onSelect={() => props.onViewSelect(id)}
                data-selected={activeView === id ? 'true' : undefined}
              >
                <Icon size={13} />
                {label}
                {activeView === id && <Check className="ml-auto" size={13} />}
              </DropdownMenuItem>
            ))}
            <DropdownMenuItem
              className="scalper-compact-menu-item"
              onSelect={props.onOptionChainToggle}
            >
              <FileSpreadsheet size={13} />
              Option chain{optionChainOpen && <Check className="ml-auto" size={13} />}
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      <div className="scalper-market-group">
        <div className="scalper-header-instrument">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button
                type="button"
                className="scalper-index-select"
                aria-label={`Change underlying index, ${underlying.label}, ${exchange}`}
                title={`${underlying.label} · ${exchange}`}
              >
                <strong>{underlying.label}</strong>
                <ChevronDown size={11} />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent
              align="start"
              sideOffset={8}
              collisionPadding={12}
              className="scalper-header-menu scalper-index-menu"
            >
              <div className="scalper-menu-caption">Choose underlying</div>
              {underlyings.map((item) => {
                const q = quotes[item.id]
                return (
                  <DropdownMenuItem
                    key={item.id}
                    onSelect={() => props.onUnderlyingSelect(item.id)}
                    className="scalper-index-menu-row"
                    data-selected={item.id === underlying.id ? 'true' : undefined}
                  >
                    <span className="scalper-index-menu-name">
                      <strong>{item.label}</strong>
                      <small>{item.spotExchange}</small>
                    </span>
                    <span className="scalper-index-menu-quote">
                      <strong data-flash={flashes[item.id]}>{price(q?.ltp ?? 0)}</strong>
                      <small
                        data-tone={
                          q?.changePct == null ? undefined : q.changePct >= 0 ? 'up' : 'down'
                        }
                      >
                        {q?.changePct != null ? `${signed(q.changePct)}%` : '—'}
                      </small>
                    </span>
                    <span className="scalper-menu-check">
                      {item.id === underlying.id && <Check size={13} />}
                    </span>
                  </DropdownMenuItem>
                )
              })}
            </DropdownMenuContent>
          </DropdownMenu>
          <strong className="scalper-index-value" data-flash={flashes[underlying.id]}>
            {price(quote.ltp)}
          </strong>
          <span
            className="scalper-index-change"
            data-tone={changeTone}
            title={changeText}
            aria-label={changeText}
          >
            {quote.changePct != null ? (
              <>
                <span className="scalper-change-points">
                  {quote.change != null ? `${signed(quote.change)} ` : ''}
                </span>
                {signed(quote.changePct)}%
              </>
            ) : (
              '—'
            )}
          </span>
        </div>

        <div className="scalper-contract-context">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button
                type="button"
                className="scalper-expiry-select"
                aria-label={`Options expiry ${expiry || 'unavailable'} and strike details`}
              >
                <span>Exp</span>
                <strong>{expiry || '—'}</strong>
                <ChevronDown size={10} />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent
              align="start"
              sideOffset={8}
              className="scalper-header-menu scalper-expiry-menu"
            >
              <div className="scalper-expiry-details">
                <span>
                  ATM <strong>{atmStrike ?? '—'}</strong>
                </span>
                <span>
                  Max pain <strong>{maxPainStrike ?? '—'}</strong>
                </span>
              </div>
              <DropdownMenuSeparator />
              <div className="scalper-menu-caption">Options expiry</div>
              {expiries.length ? (
                expiries.map((value) => (
                  <DropdownMenuItem
                    key={value}
                    onSelect={() => props.onExpirySelect(value)}
                    className="scalper-expiry-menu-row"
                    data-selected={value === expiry ? 'true' : undefined}
                  >
                    {value}
                    {value === expiry && <Check size={13} />}
                  </DropdownMenuItem>
                ))
              ) : (
                <div className="scalper-menu-caption">No expiries available</div>
              )}
            </DropdownMenuContent>
          </DropdownMenu>
          <span className="scalper-context-stat">
            ATM <strong>{atmStrike ?? '—'}</strong>
          </span>
          <span className="scalper-context-stat" title="Option chain max pain strike">
            Pain <strong>{maxPainStrike ?? '—'}</strong>
          </span>
        </div>
      </div>

      <div className="scalper-header-view-controls">
        <div className="scalper-pane-switches" role="group" aria-label="Visible charts">
          {panes.map(({ id, label }) => (
            <button
              key={id}
              type="button"
              aria-pressed={visiblePanes[id]}
              data-pane={id}
              onClick={() => props.onPaneToggle(id)}
              title={`Toggle ${label.toLowerCase()} chart`}
            >
              <span />
              {label}
            </button>
          ))}
        </div>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              type="button"
              className="scalper-glass-icon"
              aria-label="Chart visibility and layout"
              title="Chart visibility and layout"
            >
              <SlidersHorizontal size={14} strokeWidth={1.8} />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent
            align="end"
            sideOffset={8}
            className="scalper-header-menu scalper-settings-menu"
          >
            <div className="scalper-menu-caption">Visible charts</div>
            {panes.map(({ id, label }) => (
              <DropdownMenuCheckboxItem
                key={id}
                className="scalper-check-menu-item"
                checked={visiblePanes[id]}
                onCheckedChange={() => props.onPaneToggle(id)}
                onSelect={(event) => event.preventDefault()}
              >
                {label}
              </DropdownMenuCheckboxItem>
            ))}
            <DropdownMenuSeparator />
            <div className="scalper-menu-caption">Layout</div>
            <DropdownMenuRadioGroup
              value={layout}
              onValueChange={(value) => {
                if (value === 'split' || value === 'cols3') props.onLayoutSelect(value)
              }}
            >
              <DropdownMenuRadioItem value="split" className="scalper-check-menu-item">
                <LayoutGrid size={13} />
                Split view
              </DropdownMenuRadioItem>
              <DropdownMenuRadioItem value="cols3" className="scalper-check-menu-item">
                <Columns3 size={13} />
                Three columns
              </DropdownMenuRadioItem>
            </DropdownMenuRadioGroup>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      <div className="scalper-header-account">
        <button
          type="button"
          className="scalper-execution-mode"
          data-sandbox={sandbox ? 'true' : undefined}
          disabled={switchingMode}
          onClick={props.onModeToggle}
          title="Switch between Sandbox (Analyze) and live broker execution"
          aria-label={`Execution mode: ${sandbox ? 'Sandbox' : 'Live'}. Click to switch.`}
        >
          <span />
          {switchingMode ? 'Switching…' : sandbox ? 'Sandbox' : 'Live'}
        </button>
        <span className="scalper-inline-margin" title="Available margin">
          <small>Margin</small>
          <strong>{margin}</strong>
        </span>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              type="button"
              className="scalper-pnl-summary"
              aria-label={`${sandbox ? 'Day' : props.broker} P&L ${pnlText}. ${props.dayPnl.message ?? props.pnlValuationNote}`}
              title={
                props.dayPnl.message ??
                props.pnlValuationNote
              }
            >
              <small>{sandbox ? 'Day' : props.broker || 'Broker'} P&amp;L</small>
              <strong data-tone={pnlTone}>{pnlText}</strong>
              <ChevronDown size={10} />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent
            align="end"
            sideOffset={8}
            className="scalper-header-menu scalper-account-menu"
          >
            <div className="scalper-menu-caption">
              {sandbox ? 'Sandbox' : `${props.broker.toUpperCase()} · Live`} · {props.pnlDate} · IST
            </div>
            <div className="scalper-account-detail">
              <span>Available margin</span>
              <strong>{margin}</strong>
            </div>
            <div className="scalper-account-detail">
              <span>{sandbox ? 'Realized today' : 'Closed positions'}</span>
              <strong>{moneyPnl(sandbox ? props.dayPnl.realized : props.dayPnl.positionTotals?.closed ?? null)}</strong>
            </div>
            <div className="scalper-account-detail">
              <span>{sandbox ? 'Open positions today' : 'Open positions incl. exits'}</span>
              <strong>{moneyPnl(sandbox ? props.dayPnl.open : props.dayPnl.positionTotals?.open ?? null)}</strong>
            </div>
            <DropdownMenuSeparator />
            <div className="scalper-account-detail">
              <span>{sandbox ? 'Day total' : 'Broker position total'}</span>
              <strong data-tone={pnlTone}>{pnlText}</strong>
            </div>
            <div className="scalper-menu-caption">
              {props.dayPnl.message ?? props.pnlValuationNote}
            </div>
          </DropdownMenuContent>
        </DropdownMenu>
        <button
          type="button"
          className="scalper-header-exit"
          disabled={exiting}
          onClick={props.onExitAll}
          title="Close all open positions and cancel all open orders immediately"
        >
          <LogOut size={12} strokeWidth={1.8} />
          {exiting ? 'Exiting…' : 'Exit all'}
        </button>
      </div>
    </header>
  )
}
