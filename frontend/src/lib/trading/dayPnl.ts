import type { Position, Trade } from '@/types/trading'

const ist = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'Asia/Kolkata',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
})
export const pnlDay = (at = Date.now()) => {
  const parts = ist.formatToParts(new Date(at))
  const part = (name: string) => parts.find((entry) => entry.type === name)?.value ?? ''
  return `${part('year')}-${part('month')}-${part('day')}`
}
export const pnlInstrumentKey = (row: { symbol: string; exchange: string }) =>
  `${row.exchange}:${row.symbol}`
const positionKey = (row: { symbol: string; exchange: string; product: string }) =>
  `${pnlInstrumentKey(row)}:${row.product}`

/** Broker wall-clock timestamps without a zone are IST, never browser-local time. */
function fillTime(value: string, day: string): number | null {
  const raw = String(value ?? '').trim()
  if (/^\d{10,13}$/.test(raw)) {
    const n = Number(raw)
    return raw.length === 10 ? n * 1000 : n
  }
  if (/^\d{1,2}:\d{2}:\d{2}(\.\d+)?$/.test(raw)) {
    const at = Date.parse(`${day}T${raw.padStart(8, '0')}+05:30`)
    return Number.isFinite(at) ? at : null
  }
  if (/(Z|[+-]\d{2}:?\d{2})$/i.test(raw)) {
    const at = Date.parse(raw)
    return Number.isFinite(at) ? at : null
  }
  const iso = raw.match(/^(\d{4})[-/](\d{1,2})[-/](\d{1,2})[ T](\d{1,2}:\d{2}:\d{2}(?:\.\d+)?)/)
  const dmy = raw.match(/^(\d{1,2})[-/](\d{1,2})[-/](\d{4})[ T](\d{1,2}:\d{2}:\d{2}(?:\.\d+)?)/)
  const months = [
    'jan',
    'feb',
    'mar',
    'apr',
    'may',
    'jun',
    'jul',
    'aug',
    'sep',
    'oct',
    'nov',
    'dec',
  ]
  const named = raw.match(
    /^(\d{1,2})[- ]([A-Za-z]{3})[- ](\d{4})[ T](\d{1,2}:\d{2}:\d{2}(?:\.\d+)?)/
  )
  let parts: string[] | undefined
  if (iso) parts = [iso[1], iso[2], iso[3], iso[4]]
  else if (dmy) parts = [dmy[3], dmy[2], dmy[1], dmy[4]]
  else if (named && months.includes(named[2].toLowerCase())) {
    parts = [named[3], String(months.indexOf(named[2].toLowerCase()) + 1), named[1], named[4]]
  }
  if (!parts) return null
  const [year, month, date, time] = parts
  const at = Date.parse(
    `${year}-${month.padStart(2, '0')}-${date.padStart(2, '0')}T${time.padStart(8, '0')}+05:30`
  )
  return Number.isFinite(at) ? at : null
}

export interface DayPnlBook {
  rows: Array<{
    position: Position
    fills: Array<{ quantity: number; price: number; at: number }>
    opening: number
  }>
  error?: string
}

/** Reconstruct overnight quantity from today's fills and the current position book. */
export function buildDayPnlBook(positions: Position[], trades: Trade[], day: string): DayPnlBook {
  const groups = new Map<string, DayPnlBook['rows'][number]>()
  for (const position of positions) {
    groups.set(positionKey(position), { position, fills: [], opening: Number(position.quantity) })
  }
  const seen = new Set<string>()
  for (const trade of trades) {
    const at = fillTime(trade.timestamp, day)
    if (at == null) return { rows: [], error: 'Waiting for dated trade fills' }
    if (pnlDay(at) !== day) continue
    const action = String(trade.action).toUpperCase()
    const quantity = Number(trade.quantity)
    const price = Number(trade.average_price)
    if (
      !['BUY', 'SELL'].includes(action) ||
      !Number.isFinite(quantity) ||
      quantity <= 0 ||
      !Number.isFinite(price) ||
      price <= 0
    ) {
      return { rows: [], error: 'Waiting for complete trade fills' }
    }
    const key = positionKey(trade)
    const id = (trade as Trade & { tradeid?: string }).tradeid
    if (id) {
      const identity = `${key}:${id}`
      if (seen.has(identity)) continue
      seen.add(identity)
    }
    let group = groups.get(key)
    if (!group) {
      group = {
        position: {
          symbol: trade.symbol,
          exchange: trade.exchange,
          product: trade.product as Position['product'],
          quantity: 0,
          average_price: 0,
          ltp: 0,
          pnl: 0,
          pnlpercent: 0,
        },
        fills: [],
        opening: 0,
      }
      groups.set(key, group)
    }
    const signed = action === 'BUY' ? quantity : -quantity
    group.fills.push({ quantity: signed, price, at })
    group.opening -= signed
  }
  return {
    rows: [...groups.values()].map((row) => ({
      ...row,
      fills: row.fills.sort((a, b) => a.at - b.at),
    })),
  }
}

export interface DayPnlSummary {
  total: number | null
  realized: number | null
  open: number | null
  message?: string
  // Broker totals split by position status, not inferred realized/unrealized legs.
  positionTotals?: { closed: number; open: number }
}

/** Reference from the position ledger, already valued by the broker at prior close. */
export function brokerPreviousClose(position: Position): number | undefined {
  const inputs = position.day_pnl_inputs
  if (!inputs || !Number.isFinite(inputs.opening_quantity) || inputs.opening_quantity === 0)
    return undefined
  const price = inputs.opening_value / (inputs.opening_quantity * inputs.multiplier)
  return Number.isFinite(price) && price > 0 ? price : undefined
}

/** Daily realized + open MTM. Overnight inventory is valued at the prior close. */
export function calculateDayPnl(
  book: DayPnlBook,
  marks: Map<string, number>,
  closes: Record<string, number>
): DayPnlSummary {
  const unavailable = (message: string): DayPnlSummary => ({
    total: null,
    realized: null,
    open: null,
    message,
  })
  if (book.error) return unavailable(book.error)
  let realized = 0
  let open = 0
  let total = 0
  for (const { position, fills, opening } of book.rows) {
    const key = pnlInstrumentKey(position)
    const inputs = position.day_pnl_inputs
    const previousClose = brokerPreviousClose(position) ?? closes[key]
    if (opening !== 0 && !(previousClose > 0))
      return unavailable('Loading previous closing prices for carried positions')
    let quantity = opening
    let basis = opening !== 0 ? previousClose : 0
    const multiplier = Number(inputs?.multiplier ?? position.lot_size ?? 1)
    if (!Number.isFinite(multiplier) || multiplier <= 0 || !Number.isFinite(quantity))
      return unavailable('Position data unavailable')
    if (inputs) {
      const buys = fills.filter((fill) => fill.quantity > 0)
      const sells = fills.filter((fill) => fill.quantity < 0)
      const sum = (list: typeof fills, money: boolean) =>
        list.reduce(
          (value, fill) => value + Math.abs(fill.quantity) * (money ? fill.price * multiplier : 1),
          0
        )
      // Position and tradebook calls can straddle a fill. Never combine mismatched ledgers.
      if (
        !Object.values(inputs).every(Number.isFinite) ||
        Math.abs(inputs.opening_quantity - opening) > 0.000001 ||
        Math.abs(inputs.buy_quantity - sum(buys, false)) > 0.000001 ||
        Math.abs(inputs.sell_quantity - sum(sells, false)) > 0.000001 ||
        Math.abs(inputs.buy_value - sum(buys, true)) > 0.02 ||
        Math.abs(inputs.sell_value - sum(sells, true)) > 0.02
      )
        return unavailable('Reconciling today’s executions with the broker position book')
    }
    const realizedBefore = realized
    for (const fill of fills) {
      const delta = fill.quantity
      if (quantity === 0 || Math.sign(quantity) === Math.sign(delta)) {
        basis =
          (Math.abs(quantity) * basis + Math.abs(delta) * fill.price) /
          (Math.abs(quantity) + Math.abs(delta))
      } else {
        realized +=
          Math.min(Math.abs(quantity), Math.abs(delta)) *
          (fill.price - basis) *
          Math.sign(quantity) *
          multiplier
        if (Math.abs(delta) > Math.abs(quantity)) basis = fill.price
      }
      quantity += delta
      if (quantity === 0) basis = 0
    }
    if (Math.abs(quantity - Number(position.quantity)) > 0.000001)
      return unavailable('Refreshing position quantities')
    if (quantity !== 0) {
      const mark = marks.get(key)
      if (mark == null || !Number.isFinite(mark) || mark <= 0)
        return unavailable('Waiting for position prices')
      const rowOpen = quantity * (mark - basis) * multiplier
      open += rowOpen
      total += inputs
        ? inputs.sell_value - inputs.buy_value - inputs.opening_value + quantity * mark * multiplier
        : realized - realizedBefore + rowOpen
    } else {
      total += inputs
        ? inputs.sell_value - inputs.buy_value - inputs.opening_value
        : realized - realizedBefore
    }
  }
  const round = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100
  return { total: round(total), realized: round(total - open), open: round(open) }
}
