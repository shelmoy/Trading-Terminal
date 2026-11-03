import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router'
import NativeChartSurface from './NativeChartSurface'

const fixture = vi.hoisted(() => ({
  terminal: { ensureSymbol: vi.fn(), setInterval: vi.fn(), setChartType: vi.fn() },
  props: {} as Record<string, unknown>,
  failInit: false,
  native: vi.fn(),
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

beforeEach(() => {
  fixture.terminal.ensureSymbol.mockReset().mockResolvedValue(true)
  fixture.terminal.setInterval.mockReset()
  fixture.terminal.setChartType.mockReset()
  fixture.failInit = false
  fixture.native.mockClear()
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
})
