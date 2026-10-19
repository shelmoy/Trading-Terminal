/** Match exact broker-listed roots, preserving digits in names such as NIFTYNXT50. */
export function optionChainTarget<T extends { name: string; exchange: string }>(
  activeSymbol: string,
  available: readonly T[]
): T | null {
  const colon = activeSymbol.indexOf(':')
  const exchange = colon >= 0 ? activeSymbol.slice(0, colon).toUpperCase() : ''
  const symbol = (colon >= 0 ? activeSymbol.slice(colon + 1) : activeSymbol).toUpperCase()
  const derivative = /^(.+?)\d{2}[A-Z]{3}\d{2}(?:FUT|\d+(?:\.\d+)?(?:CE|PE))$/.exec(symbol)
  const root = derivative?.[1] ?? symbol
  const segment =
    ({ NSE: 'NFO', NSE_INDEX: 'NFO', BSE: 'BFO', BSE_INDEX: 'BFO' } as Record<string, string>)[
      exchange
    ] ?? exchange
  return (
    available.find(
      (item) => item.name.toUpperCase() === root && (!segment || item.exchange === segment)
    ) ?? null
  )
}
