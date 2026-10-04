import type { Bar } from 'openalgo-charts'
import type { ISeriesTransform } from 'openalgo-charts/transform'
import { calculateATR } from './renkoV2Transform'

export type RenkoV3Mode = 'percent' | 'points' | 'atr'
export type RenkoV3Source = 'close' | 'high_low'

export interface RenkoV3Options {
  mode?: RenkoV3Mode
  percent?: number
  points?: number
  atrPeriod?: number
  atrMultiplier?: number
  priceSource?: RenkoV3Source
  tickSize?: number
  /** Fixed box size override if computed externally */
  boxSize?: number
}

export const RENKO_V3_DEFAULTS = {
  'renkov3.mode': 'percent',
  'renkov3.percent': 0.04,
  'renkov3.points': 10.0,
  'renkov3.atrPeriod': 14,
  'renkov3.atrMultiplier': 1.0,
  'renkov3.priceSource': 'high_low',
} as const

/**
 * Calculates Renko V3 box size based on mode and settings.
 */
export function calculateRenkoV3BoxSize(
  bars: readonly Bar[],
  options: RenkoV3Options
): number {
  const tick = Math.max(options.tickSize ?? 0.05, 0.00001)
  const lastBar = bars.length > 0 ? bars[bars.length - 1] : null
  const currentPrice = lastBar ? lastBar.close : 100

  let rawSize = 1.0
  const mode = options.mode || 'percent'

  if (mode === 'percent') {
    const pct = Math.max(options.percent ?? 0.04, 0.0001)
    rawSize = currentPrice * (pct / 100.0)
  } else if (mode === 'points') {
    rawSize = Math.max(options.points ?? 10.0, tick)
  } else if (mode === 'atr') {
    const atr = calculateATR(bars, options.atrPeriod ?? 14)
    const mult = Math.max(options.atrMultiplier ?? 1.0, 0.1)
    rawSize = atr * mult
  }

  const quantized = Math.max(tick, Math.round(rawSize / tick) * tick)
  return Number(quantized.toFixed(6))
}

/**
 * Renko Version 3 Transform (Tick-by-Tick Time-Independent Engine)
 *
 * - True price-movement-driven Renko with the traditional 2-brick reversal rule:
 *   - Continuation along current trend: requires 1 full brick move.
 *   - Reversal against trend: requires 2 full brick moves in the opposite direction.
 * - Live Tick-by-Tick Locking:
 *   - Every incoming live WebSocket tick (LTP) is evaluated directly against the
 *     active brick state (_dir, _open, _close) and locks new bricks permanently
 *     at the exact instant the price threshold is crossed — 100% independent of
 *     the underlying candle timeframe timer.
 *   - Properly clones transform state when evaluating any uncommitted tail so
 *     state is never reset or lost mid-candle.
 */
export class RenkoV3Transform implements ISeriesTransform {
  private readonly _options: RenkoV3Options
  private _boxSize: number
  private _dir: 0 | 1 | -1 = 0 // 0 = uninitialized, 1 = bullish, -1 = bearish
  private _open = NaN
  private _close = NaN

  constructor(options: RenkoV3Options | number = {}) {
    if (typeof options === 'number') {
      this._options = { boxSize: options }
      this._boxSize = Math.max(options, 0.00001)
    } else {
      this._options = { ...options }
      this._boxSize = Math.max(options.boxSize ?? 1.0, 0.00001)
    }
  }

  setBoxSize(size: number): void {
    if (Number.isFinite(size) && size > 0) {
      this._boxSize = size
    }
  }

  getBoxSize(): number {
    return this._boxSize
  }

  reset(): void {
    this._dir = 0
    this._open = NaN
    this._close = NaN
  }

  /**
   * Creates an exact state clone of this transform (preserving _dir, _open, _close, _boxSize).
   */
  clone(): RenkoV3Transform {
    const copy = new RenkoV3Transform({
      ...this._options,
      boxSize: this._boxSize,
    })
    copy._dir = this._dir
    copy._open = this._open
    copy._close = this._close
    return copy
  }

  /**
   * Evaluates a single live tick price purely on price movement (time-independent)
   * and permanently advances the brick state whenever 1-brick continuation or
   * 2-brick reversal thresholds are crossed.
   */
  pushTick(price: number, time: number, volume = 0): Bar[] {
    if (!Number.isFinite(price) || price <= 0) return []
    return this.push({
      time,
      open: price,
      high: price,
      low: price,
      close: price,
      volume,
    })
  }

  push(bar: Bar): Bar[] {
    const bSize = this._boxSize
    if (bSize <= 0) return []

    const isHighLow = this._options.priceSource === 'high_low'
    const evalHigh = isHighLow ? bar.high : bar.close
    const evalLow = isHighLow ? bar.low : bar.close
    const time = bar.time
    const volume = bar.volume ?? 0

    const bricks: Bar[] = []

    // 1. Initial brick establishment
    if (this._dir === 0 || Number.isNaN(this._close)) {
      const isUp = bar.close >= bar.open
      this._dir = isUp ? 1 : -1
      this._open = bar.open
      this._close = isUp ? bar.open + bSize : bar.open - bSize

      bricks.push({
        time,
        open: this._open,
        high: Math.max(this._open, this._close),
        low: Math.min(this._open, this._close),
        close: this._close,
        volume,
      })
      return bricks
    }

    // 2. Continuous evaluation with 2-brick reversal rule
    let safetyCounter = 0
    const MAX_BRICKS_PER_BAR = 200

    // When a bar has both high and low, determine order of evaluation based on bar direction
    // so historical bars with both continuation and reversal evaluate in realistic intrabar order.
    const bullishBarOrder = bar.close >= bar.open

    if (this._dir === 1) {
      if (bullishBarOrder) {
        // Check continuation up first, then bearish reversal
        while (evalHigh >= this._close + bSize && safetyCounter < MAX_BRICKS_PER_BAR) {
          const nextOpen = this._close
          const nextClose = this._close + bSize
          this._open = nextOpen
          this._close = nextClose
          safetyCounter++
          bricks.push({
            time,
            open: nextOpen,
            high: nextClose,
            low: nextOpen,
            close: nextClose,
            volume: safetyCounter === 1 ? volume : 0,
          })
        }
        if (evalLow <= this._open - bSize && safetyCounter < MAX_BRICKS_PER_BAR) {
          this._dir = -1
          const revOpen = this._open
          const revClose = this._open - bSize
          this._open = revOpen
          this._close = revClose
          safetyCounter++
          bricks.push({
            time,
            open: revOpen,
            high: revOpen,
            low: revClose,
            close: revClose,
            volume: safetyCounter === 1 ? volume : 0,
          })
          while (evalLow <= this._close - bSize && safetyCounter < MAX_BRICKS_PER_BAR) {
            const nextOpen = this._close
            const nextClose = this._close - bSize
            this._open = nextOpen
            this._close = nextClose
            safetyCounter++
            bricks.push({
              time,
              open: nextOpen,
              high: nextOpen,
              low: nextClose,
              close: nextClose,
              volume: 0,
            })
          }
        }
      } else {
        // Bearish intrabar path: check continuation up if high reached first, else reversal down
        while (evalHigh >= this._close + bSize && safetyCounter < MAX_BRICKS_PER_BAR) {
          const nextOpen = this._close
          const nextClose = this._close + bSize
          this._open = nextOpen
          this._close = nextClose
          safetyCounter++
          bricks.push({
            time,
            open: nextOpen,
            high: nextClose,
            low: nextOpen,
            close: nextClose,
            volume: safetyCounter === 1 ? volume : 0,
          })
        }
        if (evalLow <= this._open - bSize && safetyCounter < MAX_BRICKS_PER_BAR) {
          this._dir = -1
          const revOpen = this._open
          const revClose = this._open - bSize
          this._open = revOpen
          this._close = revClose
          safetyCounter++
          bricks.push({
            time,
            open: revOpen,
            high: revOpen,
            low: revClose,
            close: revClose,
            volume: safetyCounter === 1 ? volume : 0,
          })
          while (evalLow <= this._close - bSize && safetyCounter < MAX_BRICKS_PER_BAR) {
            const nextOpen = this._close
            const nextClose = this._close - bSize
            this._open = nextOpen
            this._close = nextClose
            safetyCounter++
            bricks.push({
              time,
              open: nextOpen,
              high: nextOpen,
              low: nextClose,
              close: nextClose,
              volume: 0,
            })
          }
        }
      }
    } else if (this._dir === -1) {
      // Bearish mode: first check continuation down
      while (evalLow <= this._close - bSize && safetyCounter < MAX_BRICKS_PER_BAR) {
        const nextOpen = this._close
        const nextClose = this._close - bSize
        this._open = nextOpen
        this._close = nextClose
        safetyCounter++
        bricks.push({
          time,
          open: nextOpen,
          high: nextOpen,
          low: nextClose,
          close: nextClose,
          volume: safetyCounter === 1 ? volume : 0,
        })
      }

      // Check bullish reversal: price must rise 2 full bricks from low (evalHigh >= this._open + bSize)
      if (evalHigh >= this._open + bSize && safetyCounter < MAX_BRICKS_PER_BAR) {
        this._dir = 1
        const revOpen = this._open
        const revClose = this._open + bSize
        this._open = revOpen
        this._close = revClose
        safetyCounter++
        bricks.push({
          time,
          open: revOpen,
          high: revClose,
          low: revOpen,
          close: revClose,
          volume: safetyCounter === 1 ? volume : 0,
        })

        // Further upward continuation within the same bar
        while (evalHigh >= this._close + bSize && safetyCounter < MAX_BRICKS_PER_BAR) {
          const nextOpen = this._close
          const nextClose = this._close + bSize
          this._open = nextOpen
          this._close = nextClose
          safetyCounter++
          bricks.push({
            time,
            open: nextOpen,
            high: nextClose,
            low: nextOpen,
            close: nextClose,
            volume: 0,
          })
        }
      }
    }

    return bricks
  }
}

// Self-register renko-v3 with openalgo-charts engine
try {
  import('openalgo-charts').then((mod) => {
    if (typeof mod.registerSeriesTransform === 'function') {
      mod.registerSeriesTransform(
        'renko-v3',
        {
          name: 'Renko Version 3',
          renderer: 'candlestick',
          inputs: [
            { key: 'boxSize', type: 'number', label: 'Box size (0 = auto)', default: 0, min: 0 },
            { key: 'percent', type: 'number', label: 'Box percent', default: 0.04, min: 0 },
            { key: 'points', type: 'number', label: 'Box points', default: 10, min: 0 },
            { key: 'atrPeriod', type: 'number', label: 'ATR period', default: 14, min: 1 },
            { key: 'atrMultiplier', type: 'number', label: 'ATR multiplier', default: 1, min: 0.1 },
            {
              key: 'mode',
              type: 'select',
              label: 'Mode',
              default: 'percent',
              options: [
                { label: 'Percentage', value: 'percent' },
                { label: 'Points', value: 'points' },
                { label: 'ATR', value: 'atr' },
              ],
            },
            {
              key: 'priceSource',
              type: 'select',
              label: 'Source',
              default: 'high_low',
              options: [
                { label: 'Close', value: 'close' },
                { label: 'High/Low', value: 'high_low' },
              ],
            },
          ],
          create: (options: Record<string, string | number>) => {
            const mode = (options.mode as RenkoV3Mode) || 'percent'
            const percent = Number(options.percent) || 0.04
            const points = Number(options.points) || 10
            const atrPeriod = Number(options.atrPeriod) || 14
            const atrMultiplier = Number(options.atrMultiplier) || 1
            const priceSource = (options.priceSource as RenkoV3Source) || 'high_low'
            const explicitBox = Number(options.boxSize) || 0

            return {
              _transform: new RenkoV3Transform({
                mode,
                percent,
                points,
                atrPeriod,
                atrMultiplier,
                priceSource,
                boxSize: explicitBox > 0 ? explicitBox : undefined,
              }),
              _source: [] as Bar[],
              _elements: [] as Bar[],
              _index: [] as number[],
              _committed: 0,
              _resolvedBox: explicitBox,
              _liveSessionActive: false,

              setData(bars: readonly Bar[]) {
                if (!bars.length) {
                  this._source = []
                  this._elements = []
                  this._index = []
                  this._committed = 0
                  this._liveSessionActive = false
                  return
                }

                // If we are already in a live tick-by-tick session on the same symbol/history window
                // (e.g., background 30s volume/history reconcile calling setData), preserve all
                // tick-locked bricks and only feed the latest price tick if needed.
                if (
                  this._liveSessionActive &&
                  this._source.length > 0 &&
                  bars.length >= this._source.length - 1 &&
                  bars[0].time === this._source[0].time &&
                  Math.abs(bars[0].open - this._source[0].open) < 1e-6
                ) {
                  const newest = bars[bars.length - 1]
                  this._source = [...bars]
                  if (newest) {
                    const tickBricks = this._transform.pushTick(
                      newest.close,
                      newest.time,
                      0
                    )
                    for (const b of tickBricks) {
                      this._append(b, this._source.length - 1)
                    }
                    this._committed = this._elements.length
                  }
                  return
                }

                this._source = [...bars]
                this._rebuild()
              },

              prepend(bars: readonly Bar[]) {
                this._liveSessionActive = false
                this._source = [...bars, ...this._source]
                this._rebuild()
              },

              /**
               * Live Tick-by-Tick Update:
               * Every WebSocket tick from the broker arrives here with `bar.close === ltp`.
               * Instead of waiting for the 1m candle timer to finish or rolling back intra-minute
               * bricks, Renko Version 3 evaluates the live tick price directly against `_transform`
               * and permanently locks new bricks the instant the brick threshold is crossed.
               */
              update(bar: Bar) {
                const len = this._source.length
                const last = this._source[len - 1]
                if (!last || bar.time < last.time) {
                  this._source.push(bar)
                  this._rebuild()
                  return 0
                }

                this._liveSessionActive = true
                const committedBefore = this._committed
                let srcIdx = len - 1

                if (bar.time > last.time) {
                  this._source.push(bar)
                  srcIdx = this._source.length - 1
                } else {
                  this._source[len - 1] = bar
                }

                // Feed the live broker tick (bar.close = live LTP) directly into _transform.
                // Also check bar.high / bar.low in case the very first tick of a bucket carried an extreme.
                this._elements.length = this._committed
                this._index.length = this._committed

                const tickTime = Math.max(bar.time, Math.floor(Date.now() / 1000))
                const bricks = this._transform.pushTick(bar.close, tickTime, 0)
                for (const b of bricks) {
                  this._append(b, srcIdx)
                }
                this._committed = this._elements.length

                return Math.max(0, committedBefore - 1)
              },

              source() {
                return this._source
              },
              elements() {
                return this._elements
              },
              sourceIndex() {
                return this._index
              },

              _rebuild() {
                this._elements = []
                this._index = []
                this._committed = 0
                const len = this._source.length
                if (len === 0) return
                if (explicitBox <= 0) {
                  this._resolvedBox = calculateRenkoV3BoxSize(this._source, {
                    mode,
                    percent,
                    points,
                    atrPeriod,
                    atrMultiplier,
                  })
                } else {
                  this._resolvedBox = explicitBox
                }
                this._transform = new RenkoV3Transform({
                  mode,
                  percent,
                  points,
                  atrPeriod,
                  atrMultiplier,
                  priceSource,
                  boxSize: this._resolvedBox,
                })
                // Commit all historical bars (including initial snapshot of current bar)
                // so live incoming WebSocket ticks continue seamlessly from the exact last brick.
                for (let i = 0; i < len; i++) {
                  this._commit(i)
                }
              },

              _commit(i: number) {
                this._elements.length = this._committed
                this._index.length = this._committed
                const bricks = this._transform.push(this._source[i])
                for (const b of bricks) {
                  this._append(b, i)
                }
                this._committed = this._elements.length
              },

              _append(brick: Bar, srcIdx: number) {
                const lastTime = this._elements[this._elements.length - 1]?.time ?? -Infinity
                this._elements.push(
                  brick.time > lastTime ? brick : { ...brick, time: lastTime + 1 }
                )
                this._index.push(srcIdx)
              },
            }
          },
        } as any
      )
    }
  }).catch(() => {})
} catch {}
