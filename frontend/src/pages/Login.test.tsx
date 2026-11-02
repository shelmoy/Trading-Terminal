import { afterEach, describe, expect, it, vi } from 'vitest'
import { renderWithQuery } from '@/test/queryRender'
import { waitFor } from '@/test/test-utils'
import Login from './Login'

const realLocation = window.location

afterEach(() => {
  Object.defineProperty(window, 'location', { configurable: true, value: realLocation })
  vi.unstubAllGlobals()
})

describe('linked broker login return', () => {
  it('uses routing metadata after primary sign-in without receiving a broker key', async () => {
    const replace = vi.fn()
    Object.defineProperty(window, 'location', {
      configurable: true,
      value: { ...realLocation, search: '?broker=fyers', replace },
    })
    const requested: string[] = []
    vi.stubGlobal('fetch', vi.fn(async (url: string) => {
      requested.push(url)
      const body = url === '/auth/check-setup' ? { status: 'success', needs_setup: false }
        : url === '/auth/session-status' ? { status: 'success', authenticated: true, logged_in: false }
          : url === '/api/broker/list' ? { status: 'success', data: { brokers: [
            { id: 'fyers', instance_url: 'http://127.0.0.1:5001/auth/instance-login' },
          ] } } : {}
      return new Response(JSON.stringify(body), { status: 200 })
    }))
    renderWithQuery(<Login />)
    await waitFor(() => expect(replace).toHaveBeenCalledWith('http://127.0.0.1:5001/auth/instance-login'))
    expect(requested).toContain('/api/broker/list')
    expect(requested).not.toContain('/auth/broker-config')
  })
})
