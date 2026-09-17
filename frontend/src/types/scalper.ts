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
  },

  // --- Commodities ---
  {
    symbol: 'CRUDEOIL',
    name: 'CRUDE OIL',
    category: 'COMMODITIES',
    exchange: 'MCX',
    foExchange: 'MCX',
    strikeStep: 50,
    lotSize: 100,
    decimals: 2,
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
