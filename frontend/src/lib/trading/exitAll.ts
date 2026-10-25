import type { ApiResponse } from '@/types/trading'

export interface ExitResponse extends ApiResponse<unknown> {
  mode?: string
  failed_cancellations?: unknown[]
  failed_count?: number
  failed_closures?: number
  failed_positions?: unknown[]
}
type Orders = ApiResponse<{ orders: { order_status: string }[] }> & { mode?: string }
type Positions = ApiResponse<{ quantity: number | string }[]> & { mode?: string }
export type ExitResult = { status: 'confirmed' | 'pending' | 'error' | 'aborted'; message: string }
export interface ExitAllDependencies {
  mode: 'live' | 'analyze'
  cancel(): Promise<ExitResponse>
  close(): Promise<ExitResponse>
  orders(): Promise<Orders>
  positions(): Promise<Positions>
  checkMode(): Promise<boolean>
  current(): boolean
  wait(): Promise<void>
}

const terminalStates = new Set(['complete', 'completed', 'filled', 'traded', 'cancelled', 'canceled', 'rejected'])
function checkBookMode(response: { mode?: string }, mode: ExitAllDependencies['mode']) {
  if ((response.mode ?? 'live') !== mode) throw new Error('Account book trading mode changed')
}
function workingOrders(response: Orders, mode: ExitAllDependencies['mode']): number {
  checkBookMode(response, mode)
  if (response.status !== 'success' || !Array.isArray(response.data?.orders))
    throw new Error(response.message || 'Order book unavailable')
  return response.data.orders.filter((order) =>
    !terminalStates.has(String(order.order_status).toLowerCase().replace(/[\s_-]/g, ''))
  ).length
}
function openPositions(response: Positions, mode: ExitAllDependencies['mode']): number {
  checkBookMode(response, mode)
  if (response.status !== 'success' || !Array.isArray(response.data))
    throw new Error(response.message || 'Position book unavailable')
  return response.data.filter((position) => {
    if (position.quantity === null || String(position.quantity).trim() === '' ||
        !Number.isFinite(Number(position.quantity))) throw new Error('Invalid position quantity')
    return Number(position.quantity) !== 0
  }).length
}
function accepted(response: ExitResponse): boolean {
  return (response.status === 'success' || response.status === 'info') &&
    !(response.failed_cancellations?.length || response.failed_positions?.length ||
      response.failed_count || response.failed_closures)
}
function failureMessage(error: unknown): string {
  const failure = error as { response?: { data?: { message?: string } }; message?: string }
  return failure?.response?.data?.message || failure?.message || 'Broker response unavailable'
}

/**
 * One cancellation request, then at most one close request. Only read-only
 * books are polled. Never cancel concurrently with a new exit or retry exits
 * after a timeout: an unacknowledged order may already be at the broker.
 */
export async function runExitAll(deps: ExitAllDependencies): Promise<ExitResult> {
  const aborted: ExitResult = { status: 'aborted', message: 'Account or trading mode changed' }
  let stage = 'Preflight'
  try {
    if (!deps.current()) return aborted
    if (!await deps.checkMode()) throw new Error('Trading mode changed; refresh before exiting')
    if (!deps.current()) return aborted
    stage = 'Cancellation'
    const cancellation = await deps.cancel()
    if (!deps.current()) return aborted
    checkBookMode(cancellation, deps.mode)
    if (!accepted(cancellation))
      return { status: 'error', message: `Exit stopped: ${cancellation.message || 'Some cancellations failed'}. No close request sent. Check the order book.` }
    // A cancellation acknowledgement does not mean it has reached a terminal
    // state. Do not create exits while entry/protective orders can still fill.
    let working = 0
    for (let attempt = 0; attempt < 5; attempt++) {
      if (attempt) await deps.wait()
      if (!deps.current()) return aborted
      working = workingOrders(await deps.orders(), deps.mode)
      if (!deps.current()) return aborted
      if (!working) break
    }
    if (working) return {
      status: 'pending',
      message: `Exit waiting: ${working} order(s) still working. No close request sent. Check the broker order book.`,
    }
    stage = 'Position read'
    const positions = openPositions(await deps.positions(), deps.mode)
    if (!deps.current()) return aborted
    if (positions) {
      stage = 'Position exit'
      if (!await deps.checkMode()) throw new Error('Trading mode changed; no close request sent')
      if (!deps.current()) return aborted
      const closing = await deps.close()
      if (!deps.current()) return aborted
      checkBookMode(closing, deps.mode)
      if (!accepted(closing)) return {
        status: 'error',
        message: `Exit incomplete: ${closing.message || 'Some position exits failed'}. Check positions and orders before retrying.`,
      }
    }
    stage = 'Exit verification'
    let remaining = 0
    for (let attempt = 0; attempt < 5; attempt++) {
      if (attempt) await deps.wait()
      if (!deps.current()) return aborted
      const [orders, positions] = await Promise.all([deps.orders(), deps.positions()])
      if (!deps.current()) return aborted
      working = workingOrders(orders, deps.mode)
      remaining = openPositions(positions, deps.mode)
      if (!working && !remaining) return {
        status: 'confirmed',
        message: 'Exit confirmed: no open positions or working orders in the account book.',
      }
    }
    return {
      status: 'pending',
      message: `Exit not yet confirmed: ${remaining} position(s), ${working} working order(s). Check broker books before retrying; no automatic resubmission.`,
    }
  } catch (error) {
    if (!deps.current()) return aborted
    return {
      status: 'error',
      message: `${stage} unconfirmed: ${failureMessage(error)}. Check broker positions and orders before retrying.`,
    }
  }
}
