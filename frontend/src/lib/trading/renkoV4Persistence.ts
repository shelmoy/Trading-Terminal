import type { RenkoV4Run } from './renkoV4Transform'

export function restoreRenkoV4(run: RenkoV4Run, key: string): void {
  try {
    const text = localStorage.getItem(key)
    if (text && text.length < 3_000_000) run.restoreSnapshot(JSON.parse(text))
  } catch {
    /* Storage may be disabled or a cache may be corrupt. */
  }
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
