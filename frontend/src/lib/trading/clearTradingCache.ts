/**
 * Clears all cached chart data, layout configurations, drawings, indicator
 * templates, and indexedDB chart databases, then reloads the trading terminal.
 */
export function clearTradingCache(): void {
  try {
    const keys: string[] = []
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i)
      if (
        k &&
        (k.startsWith('oa-trading') ||
          k.startsWith('openalgo-chart') ||
          k.startsWith('oa-chart') ||
          k.includes('trading'))
      ) {
        keys.push(k)
      }
    }
    keys.forEach((k) => localStorage.removeItem(k))
  } catch {
    /* ignore localStorage errors */
  }

  try {
    const sKeys: string[] = []
    for (let i = 0; i < sessionStorage.length; i++) {
      const k = sessionStorage.key(i)
      if (
        k &&
        (k.startsWith('oa-trading') ||
          k.startsWith('openalgo-chart') ||
          k.startsWith('oa-chart') ||
          k.includes('trading'))
      ) {
        sKeys.push(k)
      }
    }
    sKeys.forEach((k) => sessionStorage.removeItem(k))
  } catch {
    /* ignore sessionStorage errors */
  }

  try {
    window.indexedDB?.deleteDatabase('openalgo-chart-workspaces')
    window.indexedDB?.deleteDatabase('openalgo-chart-drawing-templates')
    window.indexedDB?.deleteDatabase('openalgo-chart-watchlists')
  } catch {
    /* ignore indexedDB errors */
  }

  // Reload window to reset cleanly to defaults
  window.location.reload()
}

if (typeof window !== 'undefined') {
  ;(window as unknown as { clearTradingCache?: () => void }).clearTradingCache = clearTradingCache
}
