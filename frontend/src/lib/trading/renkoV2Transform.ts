import type { Bar } from 'openalgo-charts'
import type { ISeriesTransform } from 'openalgo-charts/transform'

export type RenkoV2Mode = 'percent' | 'points' | 'atr'
export type RenkoV2Source = 'close' | 'high_low'

export interface RenkoV2Options {
  mode?: RenkoV2Mode
  percent?: number
  points?: number
  atrPeriod?: number
  atrMultiplier?: number
  priceSource?: RenkoV2Source
  tickSize?: number
  /** Fixed box size override if computed externally */
  boxSize?: number
}

export const RENKO_V2_DEFAULTS = {
  'renkov2.mode': 'percent',
  'renkov2.percent': 0.04,
  'renkov2.points': 10.0,
  'renkov2.atrPeriod': 14,
  'renkov2.atrMultiplier': 1.0,
  'renkov2.priceSource': 'close',
} as const

/**
 * Calculates Wilder's ATR across an array of bars.
 */
export function calculateATR(bars: readonly Bar[], period = 14): number {
  if (!bars || bars.length < 2) return 1.0
  const p = Math.max(1, Math.min(period, bars.length - 1))
  const trs: number[] = []

  for (let i = 1; i < bars.length; i++) {
    const curr = bars[i]
    const prev = bars[i - 1]
    const tr = Math.max(
      curr.high - curr.low,
      Math.abs(curr.high - prev.close),
      Math.abs(curr.low - prev.close)
    )
    trs.push(tr)
  }

  if (trs.length === 0) return 1.0

  // Seed ATR with simple average of first p values
  let atr = 0
  const seedLen = Math.min(p, trs.length)
  for (let i = 0; i < seedLen; i++) {
    atr += trs[i]
  }
  atr /= seedLen

  // Smooth rest with Wilder RMA
  for (let i = seedLen; i < trs.length; i++) {
    atr = (atr * (p - 1) + trs[i]) / p
  }

  return Number.isFinite(atr) && atr > 0 ? atr : 1.0
}

/**
 * Calculates Renko V2 box size based on mode and settings.
 */
export function calculateRenkoV2BoxSize(
  bars: readonly Bar[],
  options: RenkoV2Options
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

  // Quantize to tick size
  const quantized = Math.max(tick, Math.round(rawSize / tick) * tick)
  return Number(quantized.toFixed(6))
}

/**
 * Renko Version 2 Transform
 * 
 * True movement-driven Renko with the traditional 2-brick reversal rule:
 * - Continuation along current trend: requires 1 full brick move.
 * - Reversal against trend: requires 2 full brick moves in the opposite direction.
 * - Prevents whipsaws and fake reversals.
 * - Pure movement-driven, zero repainting/ghosting in live market and history.
 */
export class RenkoV2Transform implements ISeriesTransform {
  private readonly _options: RenkoV2Options
  private _boxSize: number
  private _dir: 0 | 1 | -1 = 0 // 0 = uninitialized, 1 = bullish, -1 = bearish
  private _open = NaN
  private _close = NaN

  constructor(options: RenkoV2Options | number = {}) {
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

    if (this._dir === 1) {
      // Bullish mode
      // First check continuation up
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

      // Check bearish reversal: price must drop 2 full bricks from high,
      // which is at least 1 brick below the previous brick's OPEN (evalLow <= this._open - bSize)
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

        // Further downward continuation within the same bar
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
    } else if (this._dir === -1) {
      // Bearish mode
      // First check continuation down
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

      // Check bullish reversal: price must rise 2 full bricks from low,
      // which is at least 1 brick above the previous brick's OPEN (evalHigh >= this._open + bSize)
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

// Self-register renko-v2 with openalgo-charts engine if registerSeriesTransform is available
try {
  import('openalgo-charts').then((mod) => {
    if (typeof mod.registerSeriesTransform === 'function') {
      mod.registerSeriesTransform(
        'renko-v2',
        {
          name: 'Renko Version 2',
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
              default: 'close',
              options: [
                { label: 'Close', value: 'close' },
                { label: 'High/Low', value: 'high_low' },
              ],
            },
          ],
          create: (options: Record<string, string | number>) => {
            const mode = (options.mode as RenkoV2Mode) || 'percent'
            const percent = Number(options.percent) || 0.04
            const points = Number(options.points) || 10
            const atrPeriod = Number(options.atrPeriod) || 14
            const atrMultiplier = Number(options.atrMultiplier) || 1
            const priceSource = (options.priceSource as RenkoV2Source) || 'close'
            const explicitBox = Number(options.boxSize) || 0

            return {
              _transform: new RenkoV2Transform({
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

              setData(bars: readonly Bar[]) {
                this._source = [...bars]
                this._rebuild()
              },
              prepend(bars: readonly Bar[]) {
                this._source = [...bars, ...this._source]
                this._rebuild()
              },
              update(bar: Bar) {
                const len = this._source.length
                const last = this._source[len - 1]
                if (!last || bar.time < last.time) {
                  this._source.push(bar)
                  this._rebuild()
                  return 0
                }
                const committed = this._committed
                if (bar.time > last.time) {
                  this._commit(len - 1)
                  this._source.push(bar)
                } else {
                  this._source[len - 1] = bar
                }
                this._formTail()
                return committed
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
                if (this._resolvedBox <= 0) {
                  this._resolvedBox = calculateRenkoV2BoxSize(this._source, {
                    mode,
                    percent,
                    points,
                    atrPeriod,
                    atrMultiplier,
                  })
                }
                this._transform = new RenkoV2Transform({
                  mode,
                  percent,
                  points,
                  atrPeriod,
                  atrMultiplier,
                  priceSource,
                  boxSize: this._resolvedBox,
                })
                for (let i = 0; i < len - 1; i++) {
                  this._commit(i)
                }
                this._formTail()
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
              _formTail() {
                this._elements.length = this._committed
                this._index.length = this._committed
                const len = this._source.length
                if (len === 0) return
                const tailTransform = new RenkoV2Transform({
                  mode,
                  percent,
                  points,
                  atrPeriod,
                  atrMultiplier,
                  priceSource,
                  boxSize: this._resolvedBox,
                })
                // Clone state from current committed transform
                const bricks = tailTransform.push(this._source[len - 1])
                for (const b of bricks) {
                  this._append(b, len - 1)
                }
              },
              _append(brick: Bar, srcIdx: number) {
                const lastTime = this._elements[this._elements.length - 1]?.time ?? -Infinity
                this._elements.push(brick.time > lastTime ? brick : { ...brick, time: lastTime + 1 })
                this._index.push(srcIdx)
              },
            }
          },
        } as any
      )
    }
  }).catch(() => {})
} catch {}
