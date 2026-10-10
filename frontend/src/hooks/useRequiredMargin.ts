import { useEffect, useRef, useState } from 'react'
import { type BasketOrderItem, tradingApi } from '@/api/trading'
import { useOrderEventRefresh } from '@/hooks/useOrderEventRefresh'

interface Parameters {
  apiKey: string | null
  scope: string
  symbol: string
  exchange: string
  action: 'BUY' | 'SELL'
  quantity: number
  product: BasketOrderItem['product']
  enabled: boolean
}

interface Estimate {
  amount: number | null
  status: 'loading' | 'ready' | 'unavailable'
  message: string
  updatedAt: number | null
}

const loading: Estimate = {
  amount: null,
  status: 'loading',
  message: 'Requesting required margin from the broker',
  updatedAt: null,
}

/** Debounced broker estimates; never on the chart-load or order-placement path. */
export function useRequiredMargin({
  apiKey,
  scope,
  symbol,
  exchange,
  action,
  quantity,
  product,
  enabled,
}: Parameters): Estimate {
  const key = JSON.stringify([scope, symbol, exchange, action, quantity, product])
  const [result, setResult] = useState<{
    key: string
    credential: string
    estimate: Estimate
  } | null>(null)
  const refresh = useRef<(() => void) | null>(null)
  useOrderEventRefresh(() => refresh.current?.(), {
    enabled: enabled && Boolean(apiKey),
    delay: 600,
    events: ['order_event', 'analyzer_update', 'close_position_event'],
  })

  useEffect(() => {
    if (
      !apiKey ||
      !symbol ||
      !exchange ||
      !enabled ||
      !Number.isSafeInteger(quantity) ||
      quantity <= 0
    )
      return
    let active = true
    let controller: AbortController | null = null
    let queued = false
    const load = async (afterOrder = false) => {
      if (!active || document.hidden) return
      if (controller) {
        if (afterOrder) queued = true
        return
      }
      const request = new AbortController()
      controller = request
      try {
        const response = await tradingApi.getRequiredMargin(
          apiKey,
          { symbol, exchange, action, quantity, product },
          request.signal
        )
        if (!active) return
        const raw = response.data?.total_margin_required
        const amount = raw == null ? Number.NaN : Number(raw)
        if (response.status !== 'success' || !Number.isFinite(amount) || amount < 0) {
          throw new Error(response.message || 'The broker did not return a valid margin estimate')
        }
        setResult({
          key,
          credential: apiKey,
          estimate: {
            amount,
            status: 'ready',
            message: 'Broker estimate for this market order',
            updatedAt: Date.now(),
          },
        })
      } catch (error) {
        if (!active || request.signal.aborted) return
        setResult({
          key,
          credential: apiKey,
          estimate: {
            amount: null,
            status: 'unavailable',
            updatedAt: null,
            message:
              isAxiosError(error) && typeof error.response?.data?.message === 'string'
                ? error.response.data.message
                : error instanceof Error
                  ? error.message
                  : 'Required margin is unavailable',
          },
        })
      } finally {
        controller = null
        if (active && queued) {
          queued = false
          void load()
        }
      }
    }
    const schedule = () => {
      void load()
    }
    const afterOrder = () => {
      void load(true)
    }
    // Typing a size or selecting another strike cancels the obsolete request.
    const debounce = window.setTimeout(schedule, 400)
    const timer = window.setInterval(schedule, 30000)
    refresh.current = afterOrder
    window.addEventListener('focus', schedule)
    document.addEventListener('visibilitychange', schedule)
    return () => {
      active = false
      controller?.abort()
      clearTimeout(debounce)
      clearInterval(timer)
      if (refresh.current === afterOrder) refresh.current = null
      window.removeEventListener('focus', schedule)
      document.removeEventListener('visibilitychange', schedule)
    }
  }, [apiKey, key, symbol, exchange, action, quantity, product, enabled])

  if (
    !enabled ||
    !apiKey ||
    !symbol ||
    !exchange ||
    !Number.isSafeInteger(quantity) ||
    quantity <= 0
  ) {
    return {
      amount: null,
      status: 'unavailable',
      message: 'Select a contract and valid quantity',
      updatedAt: null,
    }
  }
  return result?.key === key && result.credential === apiKey ? result.estimate : loading
}

import { isAxiosError } from 'axios'
