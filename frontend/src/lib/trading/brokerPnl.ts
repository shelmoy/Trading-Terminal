import type { Position } from '@/types/trading'
import { type DayPnlSummary, pnlInstrumentKey } from './dayPnl'

/** Preserve each adapter's ledger; only the current mark changes between polls. */
export function calculateBrokerPnl(
  positions: Position[],
  marks: Map<string, number>
): DayPnlSummary {
  let closed = 0
  let open = 0
  const unavailable = (message: string): DayPnlSummary => ({
    total: null,
    realized: null,
    open: null,
    message,
  })
  for (const position of positions) {
    const quantity = Number(position.quantity)
    const inputs = position.day_pnl_inputs
    const multiplier = Number(inputs?.multiplier ?? position.lot_size ?? 1)
    const snapshotMark = Number(position.ltp)
    const mark = marks.get(pnlInstrumentKey(position)) ?? snapshotMark
    if (!Number.isFinite(quantity) || !Number.isFinite(multiplier) || multiplier <= 0)
      return unavailable('Waiting for valid broker position data')
    let pnl: number
    if (inputs) {
      if (
        !Object.values(inputs).every(Number.isFinite) ||
        Math.abs(inputs.opening_quantity + inputs.buy_quantity - inputs.sell_quantity - quantity) >
          0.000001
      )
        return unavailable('Refreshing the broker position ledger')
      if (quantity !== 0 && (!Number.isFinite(mark) || mark <= 0))
        return unavailable('Waiting for a broker quote for open positions')
      // Kotak: total sell amounts - total buy amounts + net quantity × LTP × factor.
      // Carried amounts come directly from Kotak; no other broker's close policy.
      pnl =
        inputs.sell_value -
        inputs.buy_value -
        inputs.opening_value +
        (quantity === 0 ? 0 : quantity * mark * multiplier)
    } else {
      pnl = Number(position.pnl)
      if (!Number.isFinite(pnl)) return unavailable('Broker P&L is unavailable')
      if (quantity !== 0) {
        if (!(snapshotMark > 0) || !Number.isFinite(mark) || mark <= 0)
          return unavailable('Waiting for the broker position valuation')
        // Keep any realized portion already included in the broker total.
        pnl += quantity * (mark - snapshotMark) * multiplier
      }
    }
    if (quantity === 0) closed += pnl
    else open += pnl
  }
  const round = (value: number) => Math.round(value * 100) / 100 || 0
  return {
    total: round(closed + open),
    realized: null,
    open: null,
    positionTotals: { closed: round(closed), open: round(open) },
  }
}
