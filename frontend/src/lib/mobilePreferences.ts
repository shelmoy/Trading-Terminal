/** Explicit chart-only interchange. Never export storage wholesale. */
const CHART_KEY = /^oa-trading-(?:p\d+|scalper-p[012])-(?:ctype|interval|chartsettings|indicators|draw)$/
const MAX_BYTES = 2_000_000
export function exportChartPreferences(storage: Storage): string {
  const entries: Record<string, string> = {}
  for (let i = 0; i < storage.length; i++) {
    const key = storage.key(i)
    if (key && CHART_KEY.test(key)) entries[key] = storage.getItem(key) ?? ''
  }
  const result = JSON.stringify({ version: 1, entries }, null, 2)
  if (result.length > MAX_BYTES) throw new Error('Chart settings exceed the 2 MB transfer limit.')
  return result
}
export function importChartPreferences(raw: string, storage: Storage): number {
  if (raw.length > MAX_BYTES) throw new Error('Chart settings exceed the 2 MB transfer limit.')
  const data: unknown = JSON.parse(raw)
  if (!data || typeof data !== 'object' || !('version' in data) || data.version !== 1 || !('entries' in data)) throw new Error('Unsupported chart settings file.')
  const entries = data.entries
  if (!entries || typeof entries !== 'object' || Array.isArray(entries)) throw new Error('Invalid chart settings.')
  const pairs = Object.entries(entries)
  if (pairs.length > 200) throw new Error('Too many chart settings.')
  // Validate the whole document before making any writes.
  for (const [key, value] of pairs) {
    if (!CHART_KEY.test(key) || typeof value !== 'string' || value.length > 500_000) throw new Error('The file contains an unsupported setting.')
    if (key.endsWith('-ctype') || key.endsWith('-interval')) {
      if (!/^[a-zA-Z0-9_.-]{1,80}$/.test(value)) throw new Error('Invalid chart type or interval.')
    } else JSON.parse(value)
  }
  const previous = pairs.map(([key]) => [key, storage.getItem(key)] as const)
  try { for (const [key, value] of pairs) storage.setItem(key, value as string) }
  catch (error) {
    for (const [key, value] of previous) { if (value === null) storage.removeItem(key); else storage.setItem(key, value) }
    throw error
  }
  return pairs.length
}
