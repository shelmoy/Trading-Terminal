import type { ThemeMode } from '@/stores/themeStore'

/** Order button palette. Candles use the OpenAlgo SDK's native theme. */
export function marketPalette(_mode: ThemeMode) {
  return {
    buy: '#0d3501',
    sell: '#880005',
    buyText: '#ffffff',
    sellText: '#ffffff',
  }
}
