/**
 * Type definitions and underlying asset registry for the 915-style Scalper Terminal.
 */

export type ScalperCategory = 'INDICES' | 'COMMODITIES'

export interface ScalperUnderlying {
  symbol: string
  name: string
  category: ScalperCategory
  exchange: string       // Spot / Index exchange (e.g. NSE_INDEX, BSE_INDEX, MCX)
  foExchange: string     // Derivatives exchange (e.g. NFO, BFO, MCX)
  strikeStep: number     // Increment between strikes
  lotSize: number        // Standard lot size
  decimals: number       // Price decimal places
  quoteSymbol?: string   // Active contract symbol for live quotes/charting (e.g. CRUDEOIL21SEP26FUT)
  quoteExchange?: string // Quote exchange (e.g. MCX, NSE_INDEX)
}

/** Fallback near-month future contract mapping for MCX commodities */
export const MCX_FUTURE_MAP: Record<string, string> = {
  CRUDEOIL: 'CRUDEOIL21SEP26FUT',
  CRUDEOILM: 'CRUDEOILM21SEP26FUT',
  NATURALGAS: 'NATURALGAS25SEP26FUT',
  GOLD: 'GOLD05OCT26FUT',
  GOLDM: 'GOLDM05OCT26FUT',
  SILVER: 'SILVER04DEC26FUT',
  SILVERM: 'SILVERM30NOV26FUT',
}

export function getUnderlyingQuoteSymbol(u: ScalperUnderlying): string {
  if (u.quoteSymbol) return u.quoteSymbol
  if (u.category === 'COMMODITIES' && MCX_FUTURE_MAP[u.symbol]) {
    return MCX_FUTURE_MAP[u.symbol]
  }
  return u.symbol
}

export function getUnderlyingQuoteExchange(u: ScalperUnderlying): string {
  if (u.quoteExchange) return u.quoteExchange
  return u.exchange
}

export const SCALPER_UNDERLYINGS: ScalperUnderlying[] = [
  // --- Indian Main Indices ---
  {
    symbol: 'NIFTY',
    name: 'NIFTY 50',
    category: 'INDICES',
    exchange: 'NSE_INDEX',
    foExchange: 'NFO',
    strikeStep: 50,
    lotSize: 65,
    decimals: 2,
    quoteSymbol: 'NIFTY',
    quoteExchange: 'NSE_INDEX',
  },
  {
    symbol: 'SENSEX',
    name: 'SENSEX',
    category: 'INDICES',
    exchange: 'BSE_INDEX',
    foExchange: 'BFO',
    strikeStep: 100,
    lotSize: 20,
    decimals: 2,
    quoteSymbol: 'SENSEX',
    quoteExchange: 'BSE_INDEX',
  },
  {
    symbol: 'BANKNIFTY',
    name: 'BANK NIFTY',
    category: 'INDICES',
    exchange: 'NSE_INDEX',
    foExchange: 'NFO',
    strikeStep: 100,
    lotSize: 30,
    decimals: 2,
    quoteSymbol: 'BANKNIFTY',
    quoteExchange: 'NSE_INDEX',
  },
  {
    symbol: 'MIDCPNIFTY',
    name: 'NIFTY MID SELECT',
    category: 'INDICES',
    exchange: 'NSE_INDEX',
    foExchange: 'NFO',
    strikeStep: 25,
    lotSize: 120,
    decimals: 2,
    quoteSymbol: 'MIDCPNIFTY',
    quoteExchange: 'NSE_INDEX',
  },
  {
    symbol: 'FINNIFTY',
    name: 'NIFTY FIN SERVICE',
    category: 'INDICES',
    exchange: 'NSE_INDEX',
    foExchange: 'NFO',
    strikeStep: 50,
    lotSize: 65,
    decimals: 2,
    quoteSymbol: 'FINNIFTY',
    quoteExchange: 'NSE_INDEX',
  },
  {
    symbol: 'BANKEX',
    name: 'BANKEX',
    category: 'INDICES',
    exchange: 'BSE_INDEX',
    foExchange: 'BFO',
    strikeStep: 100,
    lotSize: 30,
    decimals: 2,
    quoteSymbol: 'BANKEX',
    quoteExchange: 'BSE_INDEX',
  },

  // --- Commodities (MCX) ---
  {
    symbol: 'CRUDEOIL',
    name: 'CRUDE OIL',
    category: 'COMMODITIES',
    exchange: 'MCX',
    foExchange: 'MCX',
    strikeStep: 50,
    lotSize: 100,
    decimals: 2,
    quoteSymbol: 'CRUDEOIL21SEP26FUT',
    quoteExchange: 'MCX',
  },
  {
    symbol: 'CRUDEOILM',
    name: 'CRUDE OIL MINI',
    category: 'COMMODITIES',
    exchange: 'MCX',
    foExchange: 'MCX',
    strikeStep: 50,
    lotSize: 10,
    decimals: 2,
    quoteSymbol: 'CRUDEOILM21SEP26FUT',
    quoteExchange: 'MCX',
  },
  {
    symbol: 'NATURALGAS',
    name: 'NATURAL GAS',
    category: 'COMMODITIES',
    exchange: 'MCX',
    foExchange: 'MCX',
    strikeStep: 5,
    lotSize: 1250,
    decimals: 2,
    quoteSymbol: 'NATURALGAS25SEP26FUT',
    quoteExchange: 'MCX',
  },
  {
    symbol: 'GOLD',
    name: 'GOLD',
    category: 'COMMODITIES',
    exchange: 'MCX',
    foExchange: 'MCX',
    strikeStep: 100,
    lotSize: 1,
    decimals: 2,
    quoteSymbol: 'GOLD05OCT26FUT',
    quoteExchange: 'MCX',
  },
  {
    symbol: 'GOLDM',
    name: 'GOLD MINI',
    category: 'COMMODITIES',
    exchange: 'MCX',
    foExchange: 'MCX',
    strikeStep: 100,
    lotSize: 100,
    decimals: 2,
    quoteSymbol: 'GOLDM05OCT26FUT',
    quoteExchange: 'MCX',
  },
  {
    symbol: 'SILVER',
    name: 'SILVER',
    category: 'COMMODITIES',
    exchange: 'MCX',
    foExchange: 'MCX',
    strikeStep: 500,
    lotSize: 30,
    decimals: 2,
    quoteSymbol: 'SILVER04DEC26FUT',
    quoteExchange: 'MCX',
  },
  {
    symbol: 'SILVERM',
    name: 'SILVER MINI',
    category: 'COMMODITIES',
    exchange: 'MCX',
    foExchange: 'MCX',
    strikeStep: 500,
    lotSize: 5,
    decimals: 2,
    quoteSymbol: 'SILVERM30NOV26FUT',
    quoteExchange: 'MCX',
  },
]

export type StrikeOffset = 'ITM 2' | 'ITM 1' | 'ATM' | 'OTM 1' | 'OTM 2'

export interface StrikeOptionItem {
  offset: StrikeOffset
  strike: number
  symbol: string
  exchange: string
  ltp: number | null
  change: number | null
}

export type ScalperViewMode = 'ALL_3' | 'CALL' | 'SPOT' | 'PUT'
export type ScalperOrderMode = 'INSTANT' | 'CONFIRM'
export type ScalperProduct = 'MIS' | 'NRML' | 'CNC'
