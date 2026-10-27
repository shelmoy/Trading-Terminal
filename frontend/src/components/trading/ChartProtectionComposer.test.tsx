import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { ChartProtectionComposer } from './ChartProtectionComposer'
import type { CleanChartTrading } from '@/lib/trading/cleanChartTrading'

const position = {
  symbol: 'S',
  exchange: 'NFO',
  product: 'NRML',
  quantity: 75,
  average_price: 100,
  version: 'p1',
}
const binding = {
  brokerId: 'G1',
  kind: 'gtt',
  identity: { symbol: 'S', exchange: 'NFO', product: 'NRML' },
  positionQuantity: 75,
  positionVersion: 'p1',
  roles: { stop: { trigger: 90, limit: 90 } },
  confirmedRoles: { stop: { trigger: 90, limit: 90 } },
  nativeVersion: 'g1',
  state: 'active',
  review: '',
}
function fixture(oco = true, protections: unknown[] = []) {
  const snapshot = {
    scope: 'account',
    mode: 'live',
    positions: [position],
    orders: [
      { ...position, orderid: 'CHILD', action: 'SELL', version: 'o1', order_status: 'open' },
    ],
    protections,
  }
  const controller = {
    coordinator: {
      currentScope: () => 'account',
      snapshot: vi.fn().mockResolvedValue(snapshot),
      capabilities: vi
        .fn()
        .mockResolvedValue({
          enabled: true,
          individualExits: true,
          brokerHeldOco: oco,
          protectionReason: oco ? 'Native FYERS' : 'Kotak individual exit',
        }),
      linkTriggerChild: vi.fn().mockResolvedValue({}),
    },
    manageProtection: vi.fn().mockResolvedValue({ state: 'accepted' }),
    refresh: vi.fn().mockResolvedValue(undefined),
  }
  const close = vi.fn()
  render(
    <ChartProtectionComposer
      position={position}
      controller={controller as unknown as CleanChartTrading}
      onClose={close}
    />
  )
  return { controller, close }
}

describe('position protection composer', () => {
  it('requires explicit prices and an explicit attach action for native OCO', async () => {
    const { controller } = fixture()
    await screen.findByText('Native FYERS')
    expect(controller.manageProtection).not.toHaveBeenCalled()
    fireEvent.change(screen.getByLabelText('Exit type'), { target: { value: 'both' } })
    for (const [role, value] of [
      ['stop', '90'],
      ['target', '110'],
    ]) {
      fireEvent.change(screen.getByLabelText(`${role} trigger`), { target: { value } })
      fireEvent.change(screen.getByLabelText(`${role} limit`), { target: { value } })
    }
    fireEvent.click(screen.getByRole('button', { name: 'Attach exit' }))
    await waitFor(() => expect(controller.manageProtection).toHaveBeenCalledTimes(1))
    expect(controller.manageProtection).toHaveBeenCalledWith(
      'protect',
      position,
      { stopTrigger: 90, stopLimit: 90, targetTrigger: 110, targetLimit: 110 },
      undefined
    )
  })
  it('never offers fake OCO for Kotak', async () => {
    const { controller } = fixture(false)
    await screen.findByText('Kotak individual exit')
    expect(screen.queryByRole('option', { name: 'SL + TP · broker OCO' })).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'Attach exit' }))
    await screen.findByRole('alert')
    expect(controller.manageProtection).not.toHaveBeenCalled()
  })
  it('cancels only the selected binding and suppresses a double click', async () => {
    const { controller } = fixture(true, [binding])
    await screen.findByText(/Broker trigger G1/)
    let finish!: () => void
    controller.manageProtection.mockImplementation(
      () =>
        new Promise<void>((resolve) => {
          finish = resolve
        })
    )
    const button = screen.getByRole('button', { name: 'Cancel exit' })
    fireEvent.click(button)
    fireEvent.click(button)
    expect(controller.manageProtection).toHaveBeenCalledTimes(1)
    expect(controller.manageProtection).toHaveBeenCalledWith(
      'cancelProtection',
      position,
      {},
      binding
    )
    await act(async () => finish())
  })
  it('requires a human-selected child ID after a trigger fires', async () => {
    const { controller } = fixture(true, [
      { ...binding, state: 'triggered', review: 'Child reconciliation required' },
    ])
    await screen.findByLabelText('Broker verified child order')
    const button = screen.getByRole('button', { name: 'Link verified child · no trade sent' })
    expect(button).toBeDisabled()
    fireEvent.change(screen.getByLabelText('Broker verified child order'), {
      target: { value: 'CHILD' },
    })
    fireEvent.click(button)
    await waitFor(() => expect(controller.coordinator.linkTriggerChild).toHaveBeenCalledTimes(1))
    expect(controller.manageProtection).not.toHaveBeenCalled()
  })
})
