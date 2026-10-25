/** Bounded, opt-in market-data diagnostics. Never stores prices or account data. */
const samples = new Map<string, number[]>()
const counters = new Map<string, number>()
const enabled = () => typeof location !== 'undefined' &&
  new URLSearchParams(location.search).has('marketDiagnostics')

export function marketSample(name: string, milliseconds: number): void {
  if (!enabled() || !Number.isFinite(milliseconds) || milliseconds < 0) return
  const values = samples.get(name) ?? []
  values.push(milliseconds)
  if (values.length > 1024) values.shift()
  samples.set(name, values)
}

export function marketCount(name: string, amount = 1): void {
  if (enabled()) counters.set(name, (counters.get(name) ?? 0) + amount)
}

export function marketGauge(name: string, value: number): void {
  if (enabled()) counters.set(name, value)
}

export function marketDataPerformance() {
  return {
    counters: Object.fromEntries(counters),
    timings: Object.fromEntries([...samples].map(([name, values]) => {
      const sorted = [...values].sort((a, b) => a - b)
      return [name, { count: sorted.length, p50_ms: sorted[Math.floor((sorted.length - 1) * .5)],
        p95_ms: sorted[Math.floor((sorted.length - 1) * .95)] }]
    })),
  }
}

if (typeof window !== 'undefined' && enabled()) {
  Object.assign(window, { openalgoMarketDataPerformance: marketDataPerformance })
}
