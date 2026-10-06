/**
 * Human readable label for broker option symbols while keeping the raw symbol
 * available for all API and websocket requests.
 *
 * Example: SENSEX08OCT2673000CE → SENSEX 08 OCT 26 73000 CE
 */
export function formatTradingSymbol(symbol: string | null | undefined): string {
  const raw = String(symbol ?? '').trim()
  if (!raw) return ''
  const match = /^([A-Z][A-Z0-9]*?)(\d{2})([A-Z]{3})(\d{2})(\d+)(CE|PE)$/i.exec(raw)
  if (!match) return raw
  const [, underlying, day, month, year, strike, side] = match
  return `${underlying.toUpperCase()} ${day} ${month.toUpperCase()} ${year} ${Number(strike)} ${side.toUpperCase()}`
}
