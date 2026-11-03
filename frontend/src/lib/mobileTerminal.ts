import { csrfToken } from '@/api/broker-config'
import { useThemeStore } from '@/stores/themeStore'

declare global {
  interface Window { TerminalNative?: { postMessage(message: string): void } }
}

/** Presentation hint only. The server still authenticates and authorizes every request. */
export function isMobileTerminal(): boolean {
  return typeof navigator !== 'undefined' && navigator.userAgent.includes('TradingTerminalAndroid/1')
}

export function mobilePreferenceKey(key: string): string {
  return isMobileTerminal() ? `mobile-v1:${key}` : key
}

export function sendNative(message: object): void {
  if (isMobileTerminal()) window.TerminalNative?.postMessage(JSON.stringify(message))
}

/** Finish a locally started desktop login after the HTTPS broker return relay. */
export async function finishDesktopFyers(ticket: string): Promise<string> {
  if (!/^[A-Za-z0-9_-]{32,128}$/.test(ticket)) throw new Error('Invalid login return')
  const csrf = await csrfToken()
  const response = await fetch('/mobile/fyers/complete', {
    method: 'POST', credentials: 'include',
    headers: { 'Content-Type': 'application/json', 'X-CSRFToken': csrf },
    body: JSON.stringify({ ticket }),
  })
  if (!response.ok) throw new Error('Login did not complete. Start FYERS login again.')
  if (response.redirected) {
    const destination = new URL(response.url)
    if (destination.origin !== window.location.origin) throw new Error('Unapproved login destination')
    return destination.pathname + destination.search
  }
  const body = await response.json().catch(() => null)
  if (body?.status !== 'success') throw new Error('Login did not complete. Start FYERS login again.')
  return '/trading'
}

export function nativeFyersFlow(): boolean {
  return isMobileTerminal() && window.location.protocol === 'https:' &&
    window.location.port === '8443' && window.location.hostname.endsWith('.ts.net')
}

export async function cancelMobileLogin(): Promise<void> {
  const csrf = await csrfToken()
  await fetch('/mobile/fyers/cancel', { method: 'POST', credentials: 'include', headers: { 'X-CSRFToken': csrf } })
  sendNative({ type: 'fyers-cancel' })
  window.location.replace('/broker')
}

export function installMobileTerminal(): () => void {
  if (!isMobileTerminal()) return () => {}
  document.documentElement.dataset.mobileTerminal = 'true'
  const systemTheme = window.matchMedia('(prefers-color-scheme: dark)')
  const syncTheme = () => useThemeStore.getState().setMode(systemTheme.matches ? 'dark' : 'light')
  syncTheme()
  systemTheme.addEventListener('change', syncTheme)
  // Do not restore a previously armed gesture/action on process relaunch.
  for (const key of ['oa-trading-armed', 'oa-scalper-armed']) localStorage.setItem(mobilePreferenceKey(key), '0')
  let stopped = false
  let pending = false
  let completing = false
  const status = async () => {
    if (pending || stopped) return
    pending = true
    try {
      const response = await fetch('/mobile/bootstrap', { credentials: 'include', headers: { Accept: 'application/json' } })
      if (stopped) return
      const body = await response.json().catch(() => null)
      sendNative({ type: 'status', status: response.ok && body?.protocol === 1
        ? body.connected ? 'connected' : 'signed-in' : response.status === 401 || response.redirected ? 'signed-out' : 'offline' })
    } catch { if (!stopped) sendNative({ type: 'status', status: 'offline' }) }
    finally { pending = false }
  }
  const complete = async (event: Event) => {
    const ticket: unknown = (event as CustomEvent).detail
    if (completing || !nativeFyersFlow() || typeof ticket !== 'string' || !/^[A-Za-z0-9_-]{32,128}$/.test(ticket)) return
    completing = true
    try {
      const csrf = await csrfToken()
      const response = await fetch('/mobile/fyers/complete', {
        method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json', 'X-CSRFToken': csrf },
        body: JSON.stringify({ ticket }),
      })
      // A failed or uncertain completion is never retried automatically.
      if (!response.ok) throw new Error('Login did not complete')
      const destination = new URL(response.url)
      if (response.redirected && destination.origin === location.origin) {
        location.replace(destination.pathname + destination.search)
      } else {
        const body = await response.json().catch(() => null)
        location.replace(body?.status === 'success' ? '/trading' : '/broker?error=login_not_started&broker=fyers')
      }
    } catch { location.replace('/broker?error=login_not_started&broker=fyers') }
  }
  window.addEventListener('terminal-status-refresh', status)
  window.addEventListener('terminal-auth-return', complete)
  const timer = window.setInterval(status, 30_000)
  void status()
  return () => {
    stopped = true; clearInterval(timer)
    window.removeEventListener('terminal-status-refresh', status)
    window.removeEventListener('terminal-auth-return', complete)
    systemTheme.removeEventListener('change', syncTheme)
  }
}

/** A server-supplied SSO destination is additionally constrained to this tailnet host. */
export function isLinkedLoginDestination(url: URL, current: URL): boolean {
  if (url.username || url.password || url.pathname !== '/auth/instance-login' || url.search || url.hash) return false
  if (['127.0.0.1', 'localhost'].includes(current.hostname)) return url.hostname === '127.0.0.1' && Boolean(url.port) && ['http:', 'https:'].includes(url.protocol)
  return current.protocol === 'https:' && current.hostname.endsWith('.ts.net') && url.protocol === 'https:' &&
    url.hostname === current.hostname && ['', '443', '8443'].includes(url.port)
}
