import { expect, it, vi } from 'vitest'
import { apiClient } from './client'
import { tradingApi } from './trading'

vi.mock('./client', () => ({ apiClient: { post: vi.fn() }, webClient: {} }))

it('sends quantity units as the string required by MarginPositionSchema', async () => {
  vi.mocked(apiClient.post).mockResolvedValueOnce({
    data: { status: 'success', data: { total_margin_required: 29360 } },
  })
  await tradingApi.getRequiredMargin('test-key', {
    symbol: 'EXAMPLECE',
    exchange: 'BFO',
    action: 'BUY',
    quantity: 100,
    product: 'NRML',
  })
  const [path, body] = vi.mocked(apiClient.post).mock.calls[0]
  expect(path).toBe('/margin')
  expect(body.positions).toEqual([
    {
      symbol: 'EXAMPLECE',
      exchange: 'BFO',
      action: 'BUY',
      quantity: '100',
      product: 'NRML',
      pricetype: 'MARKET',
    },
  ])
})
