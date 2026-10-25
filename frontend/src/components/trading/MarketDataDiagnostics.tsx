import { useEffect, useState } from 'react'
import { marketDataPerformance } from '@/lib/marketDataPerformance'

/** Explicitly enabled with ?marketDiagnostics=1; does not alter native Logs. */
export function MarketDataDiagnostics() {
  const enabled = new URLSearchParams(location.search).has('marketDiagnostics')
  const [metrics, setMetrics] = useState(marketDataPerformance)
  useEffect(() => {
    if (!enabled) return
    const timer = setInterval(() => setMetrics(marketDataPerformance()), 1000)
    return () => clearInterval(timer)
  }, [enabled])
  if (!enabled) return null
  return <details className="fixed bottom-12 left-14 z-50 max-h-96 overflow-auto rounded border bg-background p-2 text-xs shadow">
    <summary>Market data diagnostics (local milliseconds)</summary>
    <p>Frame commit is not exchange latency or guaranteed paint time. Broker transit is unmeasured.</p>
    <pre>{JSON.stringify(metrics, null, 2)}</pre>
  </details>
}
