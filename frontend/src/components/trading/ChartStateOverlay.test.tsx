import { describe, expect, it, vi } from 'vitest'
import { chartLoadFailed, chartNoData } from '@/lib/trading/chartState'
import { fireEvent, render, screen } from '@/test/test-utils'
import { ChartStateOverlay } from './ChartStateOverlay'

describe('chart state overlay', () => {
  it('explains an unsupported history feed without inviting repeated retries', () => {
    render(<ChartStateOverlay view={chartLoadFailed('CRUDEOILM19NOV26FUT','1m',
      'Kotak does not provide historical candles for MCX. Live quotes and supported trading remain available')}
      onRetry={vi.fn()} onDismiss={vi.fn()} />)
    expect(screen.getByRole('alert')).toHaveTextContent('Live quotes and supported trading remain available')
    expect(screen.queryByRole('button', {name:'Try again'})).toBeNull()
    expect(screen.getByRole('button', {name:'Dismiss'})).toBeInTheDocument()
  })
  it('draws nothing for a chart that is showing bars', () => {
    const view = render(<ChartStateOverlay view={null} onRetry={vi.fn()} onDismiss={vi.fn()} />)
    expect(view.container).toBeEmptyDOMElement()
  })

  it('shows loading dots that take no pointer and offer no buttons', () => {
    const view = render(
      <ChartStateOverlay
        view={{ kind: 'loading', symbol: 'NIFTY', interval: '5m' }}
        onRetry={vi.fn()}
        onDismiss={vi.fn()}
      />
    )
    expect(screen.getByRole('status')).toHaveTextContent('Loading NIFTY 5m')
    expect(screen.queryByRole('button')).toBeNull()
    expect(view.container.querySelector('.pointer-events-auto')).toBeNull()
  })

  it('says a failed load in plain words and offers Try again and Dismiss', () => {
    const onRetry = vi.fn()
    const onDismiss = vi.fn()
    render(
      <ChartStateOverlay
        view={chartLoadFailed('SBIN', '15m', 'history failed (502): Broker session expired')}
        onRetry={onRetry}
        onDismiss={onDismiss}
      />
    )
    const card = screen.getByRole('alert')
    expect(card).toHaveTextContent('Could not load SBIN on 15m')
    expect(card).toHaveTextContent('Broker session expired. Try again in a moment.')
    expect(card.textContent).not.toMatch(/502|failed \(/)
    fireEvent.click(screen.getByRole('button', { name: 'Try again' }))
    fireEvent.click(screen.getByRole('button', { name: 'Dismiss' }))
    expect(onRetry).toHaveBeenCalledOnce()
    expect(onDismiss).toHaveBeenCalledOnce()
  })

  it('names the symbol and interval that had no data', () => {
    render(
      <ChartStateOverlay
        view={chartNoData('RELIANCE', '1m')}
        onRetry={vi.fn()}
        onDismiss={vi.fn()}
      />
    )
    expect(screen.getByRole('status')).toHaveTextContent('No data for RELIANCE on 1m')
  })
})
