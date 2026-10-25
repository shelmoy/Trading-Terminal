/**
 * MarketDataContext - React Context for shared WebSocket market data
 *
 * Provides:
 * - Single MarketDataManager instance to all children
 * - Centralized visibility handling (pause after 5s hidden)
 * - Connection state management
 */

import { createContext, type ReactNode, useContext, useEffect, useRef, useState } from 'react'
import { usePageVisibility } from '@/hooks/usePageVisibility'
import { useAuthStore } from '@/stores/authStore'
import { MarketDataDiagnostics } from '@/components/trading/MarketDataDiagnostics'
import {
  type ConnectionState,
  type DataCallback,
  MarketDataManager,
  type SubscriptionMode,
  type SymbolData,
} from '@/lib/MarketDataManager'

export interface MarketDataContextValue {
  manager: MarketDataManager
  connectionState: ConnectionState
  isConnected: boolean
  isAuthenticated: boolean
  isPaused: boolean
  isFallbackMode: boolean
  connectionEpoch: number
  error: string | null
  subscribe: (
    symbol: string,
    exchange: string,
    mode: SubscriptionMode,
    callback: DataCallback
  ) => () => void
  getCachedData: (symbol: string, exchange: string) => SymbolData | undefined
  connect: () => Promise<void>
  disconnect: () => void
}

const MarketDataContext = createContext<MarketDataContextValue | null>(null)

export interface MarketDataProviderProps {
  children: ReactNode
  /** Pause WebSocket connection when tab is hidden (default: true) */
  pauseWhenHidden?: boolean
  /** Time in ms to wait before disconnecting when hidden (default: 5000) */
  pauseDelay?: number
}

export function MarketDataProvider({
  children,
  pauseWhenHidden = false,
  pauseDelay = 5000,
}: MarketDataProviderProps) {
  const managerRef = useRef<MarketDataManager>(MarketDataManager.getInstance())
  const { isVisible } = usePageVisibility()

  // Initialize state from manager's current state
  const initialState = managerRef.current.getState()
  const [connectionState, setConnectionState] = useState<ConnectionState>(
    initialState.connectionState
  )
  const [isConnected, setIsConnected] = useState(initialState.isConnected)
  const [isAuthenticated, setIsAuthenticated] = useState(initialState.isAuthenticated)
  const [isPaused, setIsPaused] = useState(initialState.isPaused)
  const [isFallbackMode, setIsFallbackMode] = useState(initialState.isFallbackMode)
  const [connectionEpoch, setConnectionEpoch] = useState(initialState.connectionEpoch)
  const [error, setError] = useState<string | null>(initialState.error)

  const pauseTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const wasConnectedRef = useRef(false)
  useEffect(() => {
    let previous = useAuthStore.getState()
    return useAuthStore.subscribe((next) => {
      if (previous.apiKey !== next.apiKey || previous.user?.broker !== next.user?.broker ||
          previous.user?.username !== next.user?.username || previous.user?.loginTime !== next.user?.loginTime) {
        managerRef.current.disconnect(true)
      }
      previous = next
    })
  }, [])

  // Subscribe to state changes from the manager
  useEffect(() => {
    const manager = managerRef.current
    const unsubscribe = manager.addStateListener((state) => {
      setConnectionState(state.connectionState)
      setIsConnected(state.isConnected)
      setIsAuthenticated(state.isAuthenticated)
      setIsPaused(state.isPaused)
      setIsFallbackMode(state.isFallbackMode)
      setConnectionEpoch(state.connectionEpoch)
      setError(state.error)
    })

    return unsubscribe
  }, [])

  // Handle page visibility changes - pause when hidden, resume when visible
  useEffect(() => {
    if (!pauseWhenHidden) return

    const manager = managerRef.current

    if (!isVisible && (isConnected || isAuthenticated)) {
      // Page became hidden - schedule pause after delay
      wasConnectedRef.current = true
      pauseTimeoutRef.current = setTimeout(() => {
        manager.pauseConnection()
      }, pauseDelay)
    } else if (isVisible) {
      // Page became visible - clear any pending pause
      if (pauseTimeoutRef.current) {
        clearTimeout(pauseTimeoutRef.current)
        pauseTimeoutRef.current = null
      }

      // Resume if we were paused
      if (isPaused && wasConnectedRef.current) {
        manager.resumeConnection()
      }
    }

    return () => {
      if (pauseTimeoutRef.current) {
        clearTimeout(pauseTimeoutRef.current)
        pauseTimeoutRef.current = null
      }
    }
  }, [isVisible, isConnected, isAuthenticated, isPaused, pauseWhenHidden, pauseDelay])

  const value: MarketDataContextValue = {
    manager: managerRef.current,
    connectionState,
    isConnected,
    isAuthenticated,
    isPaused,
    isFallbackMode,
    connectionEpoch,
    error,
    subscribe: (symbol, exchange, mode, callback) =>
      managerRef.current.subscribe(symbol, exchange, mode, callback),
    getCachedData: (symbol, exchange) => managerRef.current.getCachedData(symbol, exchange),
    connect: () => managerRef.current.connect(),
    disconnect: () => managerRef.current.disconnect(),
  }

  return <MarketDataContext.Provider value={value}>{children}<MarketDataDiagnostics /></MarketDataContext.Provider>
}

/**
 * Hook to access the MarketDataContext
 * Throws if used outside of MarketDataProvider
 */
export function useMarketDataContext(): MarketDataContextValue {
  const context = useContext(MarketDataContext)
  if (!context) {
    throw new Error('useMarketDataContext must be used within a MarketDataProvider')
  }
  return context
}

/**
 * Hook to access the MarketDataContext (optional version)
 * Returns null if used outside of MarketDataProvider
 */
export function useMarketDataContextOptional(): MarketDataContextValue | null {
  return useContext(MarketDataContext)
}

export default MarketDataContext
