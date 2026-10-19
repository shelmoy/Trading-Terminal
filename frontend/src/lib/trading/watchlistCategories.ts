import type { BrokerInstrument } from '@/api/watchlist'

const CATEGORIES = [
  { name: 'Energy', border: 'border-l-amber-500/70' },
  { name: 'Bullion', border: 'border-l-violet-500/70' },
  { name: 'Base metals', border: 'border-l-cyan-500/70' },
  { name: 'Electricity', border: 'border-l-emerald-500/70' },
  { name: 'Agriculture', border: 'border-l-lime-500/70' },
  { name: 'Ferrous metals', border: 'border-l-slate-500/70' },
  { name: 'Commodity indices', border: 'border-l-blue-500/70' },
  { name: 'Other commodities', border: 'border-l-muted-foreground/50' },
  { name: 'NSE indices', border: 'border-l-blue-500/70' },
  { name: 'BSE indices', border: 'border-l-violet-500/70' },
] as const

export function watchlistCategory(group: BrokerInstrument) {
  const name = group.name.toUpperCase()
  const category =
    group.kind === 'index'
      ? group.id.startsWith('NSE_INDEX:')
        ? 8
        : 9
      : group.kind === 'commodity_index'
        ? 6
        : /^(CRUDEOIL|NATURALGAS|NATGASMINI)/.test(name)
          ? 0
          : /^(GOLD|SILVER)/.test(name)
            ? 1
            : /^(ALUMIN|COPPER|LEAD|NICKEL|ZINC)/.test(name)
              ? 2
              : name === 'ELECDMBL'
                ? 3
                : /^(CARDAMOM|COTTON|KAPAS|MENTHAOIL|SUNOIL)/.test(name)
                  ? 4
                  : name === 'STEELREBAR'
                    ? 5
                    : 7
  return { ...CATEGORIES[category], order: category }
}
