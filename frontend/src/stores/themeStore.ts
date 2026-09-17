import { create } from 'zustand'
import { persist } from 'zustand/middleware'

export type ThemeMode = 'light' | 'dark'
export type AppMode = 'live' | 'analyzer'
export type ThemeColor =
  | 'zinc'
  | 'slate'
  | 'stone'
  | 'gray'
  | 'neutral'
  | 'red'
  | 'rose'
  | 'orange'
  | 'green'
  | 'blue'
  | 'yellow'
  | 'violet'

// Event emitter for mode changes (in-tab)
type ModeChangeCallback = (newMode: AppMode) => void
const modeChangeListeners: Set<ModeChangeCallback> = new Set()

export const onModeChange = (callback: ModeChangeCallback): (() => void) => {
  modeChangeListeners.add(callback)
  return () => {
    modeChangeListeners.delete(callback)
  }
}

const notifyModeChange = (newMode: AppMode) => {
  modeChangeListeners.forEach((cb) => cb(newMode))
}

// ── UNIVERSAL CROSS-TAB BUSES (0-1ms INTER-TAB LATENCY) ─────────────────
const MODE_CHANNEL_NAME = 'oa-mode-sync-channel'
const EVENTS_CHANNEL_NAME = 'oa-events-sync-channel'

let modeChannel: BroadcastChannel | null = null
let eventsChannel: BroadcastChannel | null = null

if (typeof window !== 'undefined' && 'BroadcastChannel' in window) {
  try {
    modeChannel = new BroadcastChannel(MODE_CHANNEL_NAME)
    eventsChannel = new BroadcastChannel(EVENTS_CHANNEL_NAME)
  } catch {
    modeChannel = null
    eventsChannel = null
  }
}

/** Broadcast an action event (e.g. order placed, position closed) to all other open tabs in 0ms */
export const broadcastCrossTabEvent = (eventName: string, payload?: unknown) => {
  if (eventsChannel) {
    try {
      eventsChannel.postMessage({ event: eventName, payload, timestamp: Date.now() })
    } catch {
      // ignore
    }
  }
}

/** Listen for action events broadcast from other tabs */
export const onCrossTabEvent = (callback: (eventName: string, payload?: unknown) => void): (() => void) => {
  if (typeof window === 'undefined' || !('BroadcastChannel' in window)) {
    return () => {}
  }
  let localChannel: BroadcastChannel | null = null
  try {
    localChannel = new BroadcastChannel(EVENTS_CHANNEL_NAME)
    localChannel.onmessage = (e) => {
      if (e.data?.event) {
        callback(e.data.event, e.data.payload)
      }
    }
  } catch {
    return () => {}
  }
  return () => {
    try {
      localChannel?.close()
    } catch {
      // ignore
    }
  }
}

interface ThemeStore {
  mode: ThemeMode
  color: ThemeColor
  appMode: AppMode
  isTogglingMode: boolean

  setMode: (mode: ThemeMode) => void
  setColor: (color: ThemeColor) => void
  setAppMode: (appMode: AppMode, broadcast?: boolean) => void
  toggleMode: () => void
  toggleAppMode: () => Promise<{ success: boolean; message?: string }>
  syncAppMode: () => Promise<void>
}

export const useThemeStore = create<ThemeStore>()(
  persist(
    (set, get) => ({
      mode: 'light',
      color: 'zinc',
      appMode: 'live',
      isTogglingMode: false,

      setMode: (mode) => {
        // Only allow theme change in live mode
        if (get().appMode !== 'live') return

        set({ mode })
        if (typeof document !== 'undefined') {
          document.documentElement.classList.toggle('dark', mode === 'dark')
        }
      },

      setColor: (color) => {
        // Only allow color change in live mode
        if (get().appMode !== 'live') return

        set({ color })
        if (typeof document !== 'undefined') {
          document.documentElement.setAttribute('data-theme', color)
        }
      },

      setAppMode: (appMode, broadcast = true) => {
        const previousMode = get().appMode
        set({ appMode })
        if (typeof document !== 'undefined') {
          // Remove all mode classes first
          document.documentElement.classList.remove('analyzer', 'sandbox', 'dark')

          if (appMode === 'live') {
            // Restore the saved light/dark mode when returning to live
            const savedMode = get().mode
            document.documentElement.classList.toggle('dark', savedMode === 'dark')
          } else {
            // Analyzer mode uses its own dark purple theme (like dracula)
            document.documentElement.classList.add('analyzer')
          }
        }

        // Broadcast to other open windows and tabs in 0ms
        if (broadcast && modeChannel) {
          try {
            modeChannel.postMessage({ type: 'MODE_CHANGE', appMode, timestamp: Date.now() })
          } catch {
            // ignore
          }
        }

        // Notify in-tab listeners if mode changed
        if (previousMode !== appMode) {
          notifyModeChange(appMode)
        }
      },

      toggleMode: () => {
        // Only allow toggle in live mode
        if (get().appMode !== 'live') return

        const newMode = get().mode === 'light' ? 'dark' : 'light'
        set({ mode: newMode })
        if (typeof document !== 'undefined') {
          document.documentElement.classList.toggle('dark', newMode === 'dark')
        }
      },

      // Toggle app mode via backend API
      toggleAppMode: async (): Promise<{ success: boolean; message?: string }> => {
        if (get().isTogglingMode) return { success: false, message: 'Already toggling' }

        set({ isTogglingMode: true })
        try {
          // First fetch CSRF token
          const csrfResponse = await fetch('/auth/csrf-token', {
            credentials: 'include',
          })
          const csrfData = await csrfResponse.json()

          const response = await fetch('/auth/analyzer-toggle', {
            method: 'POST',
            credentials: 'include',
            headers: {
              'Content-Type': 'application/json',
              'X-CSRFToken': csrfData.csrf_token,
            },
          })

          const data = await response.json()

          if (response.ok && data.status === 'success') {
            const newMode: AppMode = data.data.analyze_mode ? 'analyzer' : 'live'
            get().setAppMode(newMode)
            return { success: true, message: data.data.message }
          } else {
            return { success: false, message: data.message || 'Failed to toggle mode' }
          }
        } catch (_error) {
          return { success: false, message: 'Network error' }
        } finally {
          set({ isTogglingMode: false })
        }
      },

      // Sync app mode from backend
      syncAppMode: async () => {
        try {
          const response = await fetch('/auth/analyzer-mode', {
            credentials: 'include',
          })

          if (response.ok) {
            const data = await response.json()
            if (data.status === 'success') {
              const backendMode: AppMode = data.data.analyze_mode ? 'analyzer' : 'live'
              const currentMode = get().appMode
              if (currentMode !== backendMode) {
                get().setAppMode(backendMode)
              }
            }
            // If backend returns error status but response.ok, keep current appMode
          }
          // If request fails (401, etc.) - user is logged out, keep current appMode
          // This preserves the theme across logout for visual continuity
        } catch (_error) {
          // On error, keep current appMode - preserves theme across logout
        }
      },
    }),
    {
      name: 'openalgo-theme',
      partialize: (state) => ({
        mode: state.mode,
        color: state.color,
        appMode: state.appMode, // Persist appMode for visual continuity across logout
      }),
      onRehydrateStorage: () => (state) => {
        // Apply theme on rehydration
        if (state && typeof document !== 'undefined') {
          document.documentElement.classList.remove('analyzer', 'sandbox', 'dark')

          // Apply persisted appMode for visual continuity
          if (state.appMode === 'analyzer') {
            document.documentElement.classList.add('analyzer')
          } else {
            // Live mode - apply light/dark preference
            document.documentElement.classList.toggle('dark', state.mode === 'dark')
          }
          document.documentElement.setAttribute('data-theme', state.color)
        }
      },
    }
  )
)

// ── SETUP CROSS-TAB LISTENERS (0ms LATENCY) ──────────────────────────────
if (typeof window !== 'undefined') {
  // 1. Listen for instant BroadcastChannel events from other open tabs/windows
  if (modeChannel) {
    modeChannel.onmessage = (event) => {
      if (event.data?.type === 'MODE_CHANGE' && event.data?.appMode) {
        const incoming = event.data.appMode as AppMode
        if (useThemeStore.getState().appMode !== incoming) {
          useThemeStore.getState().setAppMode(incoming, false)
        }
      }
    }
  }

  // 2. Listen for storage event as backup cross-tab synchronization
  window.addEventListener('storage', (e) => {
    if (e.key === 'openalgo-theme' && e.newValue) {
      try {
        const parsed = JSON.parse(e.newValue)
        const storedMode = parsed?.state?.appMode as AppMode
        if (storedMode && storedMode !== useThemeStore.getState().appMode) {
          useThemeStore.getState().setAppMode(storedMode, false)
        }
      } catch {
        // ignore
      }
    }
  })
}
