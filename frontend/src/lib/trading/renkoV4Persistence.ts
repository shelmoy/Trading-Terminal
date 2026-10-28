import type { RenkoV4Run } from './renkoV4Transform'

export function restoreRenkoV4(run: RenkoV4Run, key: string, fallbackKey?: string): boolean {
  const candidates = fallbackKey ? [key, fallbackKey] : [key]
  // Workspace JSON may reorder option keys. Match values, not the serializer's
  // property order, while retaining the exact Scalper/instrument namespace.
  if (fallbackKey) {
    try {
      const start = fallbackKey.indexOf('{')
      if (start >= 0) {
        const prefix = fallbackKey.slice(0, start)
        const signature = (value: unknown) => {
          if (!value || typeof value !== 'object' || Array.isArray(value)) return ''
          return JSON.stringify(Object.entries(value).sort(([a], [b]) => a.localeCompare(b)))
        }
        const wanted = signature(JSON.parse(fallbackKey.slice(start)))
        for (const candidate of Object.keys(localStorage)
          .filter((k) => k.startsWith(prefix))
          .slice(-8)) {
          try {
            if (signature(JSON.parse(candidate.slice(start))) === wanted) candidates.push(candidate)
          } catch {
            /* Not a matching transform configuration. */
          }
        }
      }
    } catch {
      /* Storage can be unavailable. */
    }
  }
  for (const candidate of new Set(candidates)) {
    try {
      const text = localStorage.getItem(candidate)
      if (text && text.length < 3_000_000 && run.restoreSnapshot(JSON.parse(text))) return true
    } catch {
      /* Storage may be disabled or a cache may be corrupt. */
    }
  }
  return false
}

/** At most eight configurations per pane; writes happen outside tick ingestion. */
export function saveRenkoV4(run: RenkoV4Run, key: string, prefix: string): void {
  try {
    const snapshot = run.snapshot()
    if (!snapshot) return
    const keys = Object.keys(localStorage).filter((k) => k.startsWith(prefix) && k !== key)
    while (keys.length >= 8) localStorage.removeItem(keys.shift()!)
    localStorage.setItem(key, JSON.stringify(snapshot))
  } catch {
    /* Committed state remains available in memory if storage is full. */
  }
}
