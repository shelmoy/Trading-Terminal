import { afterEach, describe, expect, it, vi } from 'vitest'
import { chartDataFetch } from './chartDataFetch'

afterEach(() => vi.unstubAllGlobals())

describe('chart data error transport', () => {
  it('preserves the broker explanation through the public SDK fetch extension', async () => {
    const fetch = vi.fn().mockResolvedValue(new Response(JSON.stringify({message:'Kotak does not provide historical candles for MCX'}), {status:500}))
    vi.stubGlobal('fetch',fetch)
    await expect(chartDataFetch('/api/v1/history', {method:'POST'})).rejects.toThrow('Kotak does not provide historical candles for MCX')
    expect(fetch).toHaveBeenCalledTimes(1)
  })
  it('returns successful responses unchanged and forwards cancellation options', async () => {
    const response = new Response(JSON.stringify({status:'success', data:[]}))
    const fetch = vi.fn().mockResolvedValue(response)
    vi.stubGlobal('fetch',fetch)
    const init = {signal:new AbortController().signal}
    expect(await chartDataFetch('/api/v1/history',init)).toBe(response)
    expect(fetch).toHaveBeenCalledWith('/api/v1/history',init)
    expect(await response.json()).toEqual({status:'success',data:[]})
  })
  it('leaves a non-JSON failure to the SDK without consuming its response', async () => {
    const response = new Response('offline', {status:503})
    vi.stubGlobal('fetch',vi.fn().mockResolvedValue(response))
    expect(await chartDataFetch('/api/v1/history')).toBe(response)
    expect(await response.text()).toBe('offline')
  })
})
