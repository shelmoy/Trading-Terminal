import { useCallback, useEffect, useRef, useState } from 'react'
import { fetchRefusalSentence } from '@/lib/serverSentence'
import type { OptionChainDataIdentity, OptionChainResponse } from '@/types/option-chain'
import { usePageVisibility } from './usePageVisibility'

interface UseOptionChainPollingOptions {
  enabled: boolean
  refreshInterval?: number
  pauseWhenHidden?: boolean
  derivativeExchange?: string
}

interface UseOptionChainPollingState {
  data: OptionChainResponse | null
  isLoading: boolean
  isConnected: boolean
  isPaused: boolean
  error: string | null
  lastUpdate: Date | null
  dataIdentity: OptionChainDataIdentity | null
}

/** In-memory cache for instant 0-1ms retrieval across tab/panel clicks */
export const optionChainCache = new Map<string, { data: OptionChainResponse; timestamp: number }>()

export function clearOptionChainCache(): void {
  optionChainCache.clear()
}

function getCacheKey(
  underlying: string,
  exchange: string,
  derivativeExchange: string,
  expiryDate: string,
  strikeCount: number
): string {
  return `${underlying}:${exchange}:${derivativeExchange}:${expiryDate}:${strikeCount}`
}

/**
 * Hook for polling option chain data from REST API.
 * Supports page visibility to pause polling when tab is hidden.
 *
 * @param apiKey - OpenAlgo API key
 * @param underlying - Underlying symbol (NIFTY, BANKNIFTY, etc.)
 * @param exchange - Exchange code (NSE_INDEX, BSE_INDEX)
 * @param expiryDate - Expiry date in DDMMMYY format
 * @param strikeCount - Number of strikes to fetch
 * @param options - Polling options
 */
export function useOptionChainPolling(
  apiKey: string | null,
  underlying: string,
  exchange: string,
  expiryDate: string,
  strikeCount: number,
  options: UseOptionChainPollingOptions = {
    enabled: true,
    refreshInterval: 30000,
    pauseWhenHidden: true,
  }
) {
  const {
    enabled,
    refreshInterval = 30000,
    pauseWhenHidden = true,
    derivativeExchange = exchange,
  } = options
  const { isVisible } = usePageVisibility()

  const cacheKey = getCacheKey(underlying, exchange, derivativeExchange, expiryDate, strikeCount)
  const cachedEntry = optionChainCache.get(cacheKey)

  const [state, setState] = useState<UseOptionChainPollingState>(() => ({
    data: cachedEntry ? cachedEntry.data : null,
    isLoading: false,
    isConnected: !!cachedEntry,
    isPaused: false,
    error: null,
    lastUpdate: cachedEntry ? new Date(cachedEntry.timestamp) : null,
    dataIdentity: cachedEntry
      ? {
          exchange: derivativeExchange,
          underlying,
          expiry: expiryDate,
        }
      : null,
  }))

  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const abortControllerRef = useRef<AbortController | null>(null)
  const requestGenerationRef = useRef(0)

  // Drop the previous chain whenever the request identity changes or serve cached immediately.
  // biome-ignore lint/correctness/useExhaustiveDependencies: these deps are intentional reset triggers
  useEffect(() => {
    requestGenerationRef.current += 1
    const key = getCacheKey(underlying, exchange, derivativeExchange, expiryDate, strikeCount)
    const cached = optionChainCache.get(key)
    setState((prev) => ({
      ...prev,
      data: cached ? cached.data : null,
      isLoading: false,
      isConnected: !!cached,
      error: null,
      lastUpdate: cached ? new Date(cached.timestamp) : null,
      dataIdentity: cached
        ? {
            exchange: derivativeExchange,
            underlying,
            expiry: expiryDate,
          }
        : null,
    }))
  }, [apiKey, underlying, exchange, derivativeExchange, expiryDate, strikeCount])

  // Determine if polling should be active
  const shouldPoll = enabled && (!pauseWhenHidden || isVisible)

  const fetchData = useCallback(async () => {
    if (!apiKey || !underlying || !exchange || !expiryDate) {
      return
    }

    // Skip if already fetching
    if (abortControllerRef.current) {
      return
    }

    setState((prev) => ({ ...prev, isLoading: true }))

    const generation = requestGenerationRef.current
    const dataIdentity: OptionChainDataIdentity = {
      exchange: derivativeExchange,
      underlying,
      expiry: expiryDate,
    }
    const controller = new AbortController()
    try {
      abortControllerRef.current = controller

      const response = await fetch('/api/v1/optionchain', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          apikey: apiKey,
          underlying,
          exchange,
          expiry_date: expiryDate,
          strike_count: strikeCount,
          with_greeks: true,
        }),
        signal: controller.signal,
      })

      if (!response.ok) {
        // A busy or conflicting refusal (429, 409) carries a sentence written
        // for the trader, such as the broker pacing message; show that. Every
        // other failure keeps the text it always had.
        const sentence = await fetchRefusalSentence(response)
        throw new Error(sentence ?? `HTTP error! status: ${response.status}`)
      }

      const data: OptionChainResponse = await response.json()

      if (generation !== requestGenerationRef.current) return

      if (data.status === 'success') {
        const now = Date.now()
        optionChainCache.set(cacheKey, { data, timestamp: now })
        setState((prev) => ({
          ...prev,
          data,
          isLoading: false,
          isConnected: true,
          error: null,
          lastUpdate: new Date(now),
          dataIdentity,
        }))
      } else {
        setState((prev) => ({
          ...prev,
          isLoading: false,
          error: data.message || 'Failed to fetch option chain',
        }))
      }
    } catch (error) {
      if (generation !== requestGenerationRef.current) return
      if (error instanceof Error) {
        if (error.name === 'AbortError') {
          if (abortControllerRef.current === null) {
            setState((prev) => ({ ...prev, isLoading: false }))
          }
        } else {
          setState((prev) => ({
            ...prev,
            isLoading: false,
            error: error.message || 'Connection error',
            isConnected: false,
          }))
        }
      }
    } finally {
      if (abortControllerRef.current === controller) abortControllerRef.current = null
    }
  }, [apiKey, underlying, exchange, derivativeExchange, expiryDate, strikeCount])

  // Handle polling start/stop based on visibility
  useEffect(() => {
    if (!shouldPoll) {
      // Pause polling
      if (intervalRef.current) {
        clearInterval(intervalRef.current)
        intervalRef.current = null
      }
      setState((prev) => ({ ...prev, isPaused: !!enabled }))
      return
    }

    // Resume/start polling
    setState((prev) => ({ ...prev, isConnected: true, isPaused: false }))

    // Fetch immediately when becoming visible
    fetchData()

    // Set up interval
    intervalRef.current = setInterval(fetchData, refreshInterval)

    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current)
        intervalRef.current = null
      }
      if (abortControllerRef.current) {
        abortControllerRef.current.abort()
        abortControllerRef.current = null
      }
    }
  }, [shouldPoll, fetchData, refreshInterval, enabled])

  const refetch = useCallback(() => {
    fetchData()
  }, [fetchData])

  return {
    ...state,
    refetch,
  }
}
