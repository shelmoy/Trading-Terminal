import { useCallback, useEffect, useRef, useState } from 'react'
import { webClient } from '@/api/client'
import { tradingApi } from '@/api/trading'
import { runExitAll } from '@/lib/trading/exitAll'
import { useAuthStore } from '@/stores/authStore'
import { useThemeStore } from '@/stores/themeStore'
import { showToast } from '@/utils/toast'

function scope() {
  const auth = useAuthStore.getState()
  const theme = useThemeStore.getState()
  return JSON.stringify([auth.isAuthenticated, auth.apiKey, auth.user?.username,
    auth.user?.broker, auth.user?.loginTime, theme.appMode, theme.isTogglingMode])
}

/** A synchronous lock covers double clicks before React can disable the button. */
export function useScalperExitAll(refresh: () => Promise<void>) {
  const [exiting, setExiting] = useState(false)
  const lock = useRef(false)
  const alive = useRef(true)
  const controller = useRef<AbortController | null>(null)
  useEffect(() => {
    alive.current = true
    return () => { alive.current = false; controller.current?.abort() }
  }, [])

  const exitAll = useCallback(async () => {
    const auth = useAuthStore.getState()
    const theme = useThemeStore.getState()
    if (lock.current) return
    if (!auth.isAuthenticated || !auth.apiKey || theme.isTogglingMode) {
      showToast.error('Wait for account login and trading mode to be ready')
      return
    }
    const key = auth.apiKey
    const initialScope = scope()
    const current = () => alive.current && initialScope === scope()
    const abort = new AbortController()
    controller.current = abort
    lock.current = true
    setExiting(true)
    // Scope changes stop future stages; never resend a mutation whose outcome
    // is uncertain. Diagnostic read requests and waits are abortable on unmount.
    try {
      const result = await runExitAll({
        mode: theme.appMode === 'analyzer' ? 'analyze' : 'live',
        current,
        checkMode: async () => {
          const { data } = await webClient.get('/auth/analyzer-mode', { signal: abort.signal, timeout: 8000 })
          const mode = theme.appMode === 'analyzer' ? 'analyze' : 'live'
          if (data.status !== 'success' || data.data?.mode !== mode) return false
          const capabilities = await webClient.get('/chart-trading/capabilities', {signal:abort.signal, timeout:8000})
          if (capabilities.data.data?.enabled) {
            const check = await webClient.get('/chart-trading/exit-preflight', {params:{mode}, signal:abort.signal, timeout:15000})
            if (check.data.status !== 'success') throw new Error(check.data.message || 'Broker exits need review')
          }
          return true
        },
        cancel: () => tradingApi.cancelAllOrders(),
        close: () => tradingApi.closeAllPositions(),
        orders: () => tradingApi.getOrders(key, abort.signal),
        positions: () => tradingApi.getPositions(key, abort.signal),
        wait: () => new Promise<void>((resolve, reject) => {
          const stop = () => {
            clearTimeout(timer)
            abort.signal.removeEventListener('abort', stop)
            reject(new Error('Exit verification stopped'))
          }
          const timer = setTimeout(() => { abort.signal.removeEventListener('abort', stop); resolve() }, 1000)
          abort.signal.addEventListener('abort', stop, { once: true })
          if (abort.signal.aborted) stop()
        }),
      })
      if (current() && result.status !== 'aborted') {
        const message = `${theme.appMode === 'analyzer' ? 'Analyze' : auth.user?.broker?.toUpperCase() || 'Broker'}: ${result.message}`
        if (result.status === 'confirmed') showToast.success(message)
        else if (result.status === 'pending') showToast.warning(message)
        else showToast.error(message)
      }
    } finally {
      abort.abort()
      controller.current = null
      lock.current = false
      if (alive.current) setExiting(false)
      if (current()) void refresh()
    }
  }, [refresh])
  const isExiting = useCallback(() => lock.current, [])
  return { exiting, exitAll, isExiting }
}
