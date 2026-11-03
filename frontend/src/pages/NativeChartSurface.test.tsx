import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router'
import NativeChartSurface from './NativeChartSurface'

const fixture = vi.hoisted(() => ({
  terminal: { ensureSymbol: vi.fn(), setInterval: vi.fn(), setChartType: vi.fn(), currentInstrument: vi.fn(), replayState: vi.fn(), placeTicket: vi.fn() },
  props: {} as Record<string, unknown>,
  failInit: false,
  native: vi.fn(),
  ticket: {} as Record<string, unknown>,
  chain: {} as Record<string, unknown>,
}))
vi.mock('@/components/trading/ChartPane', async () => {
  const React = await import('react')
  return { ChartPane: (props: { onInitialized: (id: string, value: unknown) => void; onInitializationError: () => void }) => {
    fixture.props = props
    React.useEffect(() => { if (fixture.failInit) props.onInitializationError(); else props.onInitialized('native', fixture.terminal) }, [])
    return <div data-testid="sdk-canvas" />
  } }
})
vi.mock('@/lib/trading/chartTypes', () => ({ CHART_TYPE_GROUPS: [[{ value: 'candlestick' }, { value: 'renko-v4' }]] }))
vi.mock('@/stores/themeStore', () => ({ useThemeStore: { getState: () => ({ syncAppMode: vi.fn() }) } }))
vi.mock('@/lib/mobileTerminal', () => ({ sendNative: fixture.native }))
vi.mock('@/components/trading/dock/TradingDock', () => ({ TradingDock: () => <div data-testid="books" /> }))
vi.mock('@/components/trading/PlaceOrderDialog', () => ({ PlaceOrderDialog: (props: Record<string, unknown>) => { fixture.ticket = props; return <div data-testid="ticket" /> } }))
vi.mock('@/components/trading/OptionChainPanel', () => ({ OptionChainPanel: (props: Record<string, unknown>) => { fixture.chain = props; return <div data-testid="chain" /> } }))

beforeEach(() => {
  fixture.terminal.ensureSymbol.mockReset().mockResolvedValue(true)
  fixture.terminal.setInterval.mockReset()
  fixture.terminal.setChartType.mockReset()
  fixture.terminal.currentInstrument.mockReset().mockReturnValue(null)
  fixture.terminal.replayState.mockReset().mockReturnValue(null)
  fixture.failInit = false
  fixture.native.mockClear()
  fixture.ticket = {}; fixture.chain = {}
  fixture.terminal.placeTicket.mockReset().mockResolvedValue({ orderId: 'fake-order-only' })
  vi.stubGlobal('fetch', vi.fn((url: string) => Promise.resolve({ ok: true, json: async () =>
    url.includes('apikey') ? { status: 'success', api_key: 'fake-test-only' }
      : { websocket_url: `wss://${location.host}/ws` } })))
})
afterEach(() => { cleanup(); vi.unstubAllGlobals() })

function page(query = '?symbol=TEST&exchange=NFO&chartType=renko-v4') {
  render(<MemoryRouter initialEntries={['/trading' + query]}><NativeChartSurface /></MemoryRouter>)
}

describe('native-only SDK surface', () => {
  it('keeps Renko4, exact exchange identity and disarmed controls without website chrome', async () => {
    page()
    await screen.findByTestId('sdk-canvas')
    await waitFor(() => expect(fixture.terminal.ensureSymbol).toHaveBeenCalledWith({ symbol: 'TEST', exchange: 'NFO' }))
    expect(fixture.terminal.setChartType).toHaveBeenCalledWith('renko-v4')
    expect(fixture.props.armed).toBe(false)
    expect(fixture.props.toolbarHost).toBeNull()
  })

  it('rejects a WebSocket configuration outside this private origin', async () => {
    vi.stubGlobal('fetch', vi.fn((url: string) => Promise.resolve({ ok: true, json: async () =>
      url.includes('apikey') ? { status: 'success', api_key: 'fake' }
        : { websocket_url: 'wss://unapproved.invalid/ws' } })))
    page()
    expect(await screen.findByRole('alert')).toHaveTextContent('Private chart connection is not configured')
    expect(screen.queryByTestId('sdk-canvas')).toBeNull()
  })

  it('does not leave the default instrument available after a failed switch', async () => {
    fixture.terminal.ensureSymbol.mockResolvedValue(false)
    page()
    expect(await screen.findByRole('alert')).toHaveTextContent('Could not load this instrument')
    expect(screen.queryByTestId('sdk-canvas')).toBeNull()
  })

  it('accepts only declared chart presentation controls', async () => {
    page()
    await waitFor(() => expect(fixture.terminal.ensureSymbol).toHaveBeenCalled())
    fixture.terminal.setChartType.mockClear()
    act(() => window.dispatchEvent(new CustomEvent('terminal-native-chart', { detail: { chartType: 'unknown', interval: 'bad' } })))
    expect(fixture.terminal.setChartType).not.toHaveBeenCalled()
    act(() => window.dispatchEvent(new CustomEvent('terminal-native-chart', { detail: { chartType: 'renko-v4', interval: '5m' } })))
    expect(fixture.terminal.setChartType).toHaveBeenCalledWith('renko-v4')
    expect(fixture.terminal.setInterval).toHaveBeenCalledWith('5m')
    act(() => window.dispatchEvent(new CustomEvent('terminal-native-chart', { detail: { tools: true } })))
    expect(fixture.props.toolbarHost).toBeUndefined()
  })

  it('shows an initialization failure and can retry instead of leaving a blank canvas', async () => {
    fixture.failInit = true
    page('?symbol=SENSEX&exchange=BSE_INDEX&native_request=42')
    expect(await screen.findByRole('alert')).toHaveTextContent('Chart could not initialize')
    expect(fixture.native).toHaveBeenCalledWith(expect.objectContaining({ request: '42', state: 'error' }))
    fixture.failInit = false
    fireEvent.click(screen.getByRole('button', { name: 'Retry chart' }))
    await screen.findByTestId('sdk-canvas')
    await waitFor(() => expect(fixture.native).toHaveBeenCalledWith(expect.objectContaining({ request: '42', state: 'ready' })))
  })

  it('refuses an expired session before constructing a chart', async () => {
    vi.stubGlobal('fetch', vi.fn(() => Promise.resolve({ ok: false, status: 401 })))
    page()
    expect(await screen.findByRole('alert')).toHaveTextContent('broker')
    expect(screen.queryByTestId('sdk-canvas')).toBeNull()
    expect(fixture.terminal.ensureSymbol).not.toHaveBeenCalled()
  })

  it('exposes indicators and books directly in the chart workspace', async () => {
    page()
    await screen.findByTestId('sdk-canvas')
    fireEvent.click(screen.getByRole('button', { name: 'Indicators' }))
    expect(fixture.props.indicatorRequest).toBe(1)
    expect(screen.getByRole('button', { name: 'Option chain' })).toBeVisible()
    expect(screen.getByRole('button', { name: 'Positions' })).toBeVisible()
  })

  it('opens an explicit lot-sized ticket and refuses confirmation during replay', async () => {
    fixture.terminal.currentInstrument.mockReturnValue({ symbol: 'TESTCE', exchange: 'NFO', lots: true, lotsize: 65, tick: .05, product: 'NRML' })
    page('?symbol=TESTCE&exchange=NFO')
    const buy = await screen.findByRole('button', { name: 'Buy', exact: true })
    await waitFor(() => expect(buy).toBeEnabled())
    fireEvent.change(screen.getByLabelText('Order lots or quantity'), { target: { value: '2' } })
    fireEvent.click(buy)
    expect(fixture.ticket.quantity).toBe(130)
    expect(fixture.ticket.symbol).toBe('TESTCE')
    expect(fixture.terminal.placeTicket).not.toHaveBeenCalled()
    fixture.terminal.replayState.mockReturnValue('paused')
    const submit = fixture.ticket.place as (value: never) => Promise<unknown>
    await expect(submit({} as never)).rejects.toThrow('replaying')
    expect(fixture.terminal.placeTicket).not.toHaveBeenCalled()
  })

  it('routes chain confirmation through the same guarded chart feed', async () => {
    page()
    await waitFor(() => expect(fixture.terminal.ensureSymbol).toHaveBeenCalled())
    fireEvent.click(screen.getByRole('button', { name: 'Option chain' }))
    await screen.findByTestId('chain')
    const submit = fixture.chain.place as (value: never) => Promise<unknown>
    fixture.terminal.replayState.mockReturnValue('paused')
    await expect(submit({} as never)).rejects.toThrow('replaying')
    fixture.terminal.replayState.mockReturnValue(null)
    await expect(submit({} as never)).resolves.toEqual({ orderId: 'fake-order-only' })
    expect(fixture.terminal.placeTicket).toHaveBeenCalledTimes(1)
  })
})
