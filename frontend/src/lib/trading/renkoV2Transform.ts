import { registerSeriesTransform, type Bar, type SeriesTransformRun } from 'openalgo-charts'
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
  /** Intraday ATR price paths start at the first candle of each exchange date. */
  sessionClock?: 'continuous' | 'ist' | 'utc'
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

function trueRange(bar: Bar, previousClose: number): number {
  return Math.max(bar.high - bar.low, Math.abs(bar.high - previousClose), Math.abs(bar.low - previousClose))
}

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
    trs.push(trueRange(curr, prev.close))
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

  return Number(quantizeBox(rawSize, tick).toFixed(6))
}

function quantizeBox(size: number, tick: number): number {
  return Number(Math.max(tick, Math.round(size / tick) * tick).toFixed(8))
}

/**
 * Renko Version 2 Transform
 * 
 * True movement-driven Renko with the traditional 2-brick reversal rule:
 * - Continuation along current trend: requires 1 full brick move.
 * - Reversal against trend: requires 2 full brick moves in the opposite direction.
 * - Prevents whipsaws and fake reversals.
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

  anchor(open: number): void {
    this._close = open
  }

  clone(): RenkoV2Transform {
    const copy = new RenkoV2Transform(this._options)
    copy._boxSize = this._boxSize
    copy._dir = this._dir
    copy._open = this._open
    copy._close = this._close
    return copy
  }

  push(bar: Bar): Bar[] {
    const bSize = this._boxSize
    if (bSize <= 0) return []

    const isHighLow = this._options.priceSource === 'high_low'
    const evalHigh = isHighLow ? bar.high : bar.close
    const evalLow = isHighLow ? bar.low : bar.close
    const time = bar.time
    const volume = bar.volume ?? 0
    const round = (price: number) => this._options.mode === 'atr' ? Math.round(price * 1e8) / 1e8 : price

    const bricks: Bar[] = []

    if (this._dir === 0) {
      // Adaptive ATR waits for an actual move from the opening anchor.
      // Retain the historical seed behavior for fixed and percentage sizes.
      if (this._options.mode === 'atr') {
        if (!Number.isFinite(this._close)) this._close = bar.open
        if (evalHigh < round(this._close + bSize) && evalLow > round(this._close - bSize)) return []
        const up = evalHigh >= round(this._close + bSize) && (evalLow > round(this._close - bSize) || bar.close >= this._close)
        this._dir = up ? 1 : -1
        this._open = this._close
        // The continuation loop forms the first brick and any further moves.
      } else {
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
    }

    // 2. Continuous evaluation with 2-brick reversal rule
    let safetyCounter = 0
    const MAX_BRICKS_PER_BAR = 200

    if (this._dir === 1) {
      // Bullish mode
      // First check continuation up
      while (evalHigh >= round(this._close + bSize) && safetyCounter < MAX_BRICKS_PER_BAR) {
        const nextOpen = this._close
        const nextClose = round(this._close + bSize)
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
      // which is at least 1 brick below the previous brick's OPEN (evalLow <= round(this._open - bSize))
      if (evalLow <= round(this._open - bSize) && safetyCounter < MAX_BRICKS_PER_BAR) {
        this._dir = -1
        const revOpen = this._open
        const revClose = round(this._open - bSize)
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
        while (evalLow <= round(this._close - bSize) && safetyCounter < MAX_BRICKS_PER_BAR) {
          const nextOpen = this._close
          const nextClose = round(this._close - bSize)
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
      while (evalLow <= round(this._close - bSize) && safetyCounter < MAX_BRICKS_PER_BAR) {
        const nextOpen = this._close
        const nextClose = round(this._close - bSize)
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
      // which is at least 1 brick above the previous brick's OPEN (evalHigh >= round(this._open + bSize))
      if (evalHigh >= round(this._open + bSize) && safetyCounter < MAX_BRICKS_PER_BAR) {
        this._dir = 1
        const revOpen = this._open
        const revClose = round(this._open + bSize)
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
        while (evalHigh >= round(this._close + bSize) && safetyCounter < MAX_BRICKS_PER_BAR) {
          const nextOpen = this._close
          const nextClose = round(this._close + bSize)
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

/**
 * Keep the path and Wilder ATR as of the last closed source candle. For an
 * intraday exchange date, seed from the preceding ATR-period true ranges and
 * start from that date's opening price. Older pages cannot move a fully
 * loaded date with the same warmup data.
 */
class RenkoV2Run implements SeriesTransformRun {
  private bars: Bar[] = []
  private bricks: Bar[] = []
  private indexes: number[] = []
  private committed = 0
  private engine: RenkoV2Transform
  private fixedBox: number | undefined
  private atr = 0
  private samples = 0
  private session: number | undefined
  private readonly period: number
  private readonly tick: number
  private readonly offset: number | undefined

  private readonly options: RenkoV2Options

  constructor(options: RenkoV2Options) {
    this.options = options
    this.engine = new RenkoV2Transform(options)
    this.period = Math.max(1, Math.min(500, Math.floor(options.atrPeriod ?? 14)))
    this.tick = Math.max(0.00000001, options.tickSize ?? 0.05)
    this.offset = options.sessionClock === 'ist' ? 19_800 : options.sessionClock === 'utc' ? 0 : undefined
  }

  setData(bars: readonly Bar[]): void {
    this.bars = [...bars]
    this.rebuild()
  }

  prepend(bars: readonly Bar[]): void {
    const oldest = this.bars[0]?.time ?? Infinity
    this.setData([...bars.filter((bar) => bar.time < oldest), ...this.bars])
  }

  update(bar: Bar): number {
    const index = this.bars.length - 1
    const last = this.bars[index]
    if (!last || bar.time < last.time) {
      const ordered = new Map(this.bars.map((source) => [source.time, source]))
      ordered.set(bar.time, bar)
      this.setData([...ordered.values()].sort((a, b) => a.time - b.time))
      return 0
    }

    const from = this.committed
    if (bar.time > last.time) {
      this.commit(index)
      this.bars.push(bar)
    } else {
      this.bars[index] = bar
    }
    this.formTail()
    return from
  }

  source(): readonly Bar[] { return this.bars }
  elements(): readonly Bar[] { return this.bricks }
  sourceIndex(): readonly number[] { return this.indexes }

  private rebuild(): void {
    this.bricks = []
    this.indexes = []
    this.committed = 0
    this.atr = 0
    this.samples = 0
    this.session = undefined
    if (this.bars.length > 0 && this.options.mode !== 'atr') {
      this.fixedBox ??= this.options.boxSize ?? calculateRenkoV2BoxSize(this.bars, this.options)
    }
    this.engine = new RenkoV2Transform({ ...this.options, boxSize: this.fixedBox })
    for (let i = 0; i < this.bars.length - 1; i++) this.commit(i)
    this.formTail()
  }

  private sessionOf(time: number): number {
    return this.offset === undefined ? 0 : Math.floor((time + this.offset) / 86400)
  }

  private rangeAt(index: number): number {
    const bar = this.bars[index]
    return trueRange(bar, this.bars[index - 1]?.close ?? bar.open)
  }

  private seedBefore(index: number): number {
    const start = Math.max(0, index - this.period)
    let total = 0
    for (let i = start; i < index; i++) total += this.rangeAt(i)
    return index === start ? 0 : total / (index - start)
  }

  private form(engine: RenkoV2Transform, index: number, closing: boolean): void {
    const bar = this.bars[index]
    if (this.options.mode === 'atr') {
      const session = this.sessionOf(bar.time)
      const starting = this.session !== session
      const atr = starting ? this.seedBefore(index) : this.atr
      const samples = starting ? Math.min(this.period, index) : this.samples
      if (starting) engine.reset()
      engine.setBoxSize(quantizeBox(atr * (this.options.atrMultiplier ?? 1), this.tick))
      // At the beginning of all loaded history there is no previous ATR.
      // Learn it from the first closed candle without inventing a tick-sized path.
      if (atr > 0) this.append(engine.push(bar), index)
      else if (starting && closing) engine.anchor(bar.open)

      if (closing) {
        this.session = session
        this.samples = Math.min(this.period, samples + 1)
        this.atr = atr + (this.rangeAt(index) - atr) / this.samples
      }
      return
    }
    this.append(engine.push(bar), index)
  }

  private trimTail(): void {
    this.bricks.length = this.committed
    this.indexes.length = this.committed
  }

  private commit(index: number): void {
    this.trimTail()
    this.form(this.engine, index, true)
    this.committed = this.bricks.length
  }

  private formTail(): void {
    this.trimTail()
    if (this.bars.length > 0) this.form(this.engine.clone(), this.bars.length - 1, false)
  }

  private append(bricks: readonly Bar[], index: number): void {
    for (const brick of bricks) {
      const previous = this.bricks.at(-1)?.time ?? -Infinity
      // Preserve the actual source minute, even when a gap forms many bricks.
      const time = this.options.mode === 'atr'
        ? Math.max(brick.time, previous + 0.000001)
        : Math.max(brick.time, previous + 1)
      this.bricks.push(time === brick.time ? brick : { ...brick, time })
      this.indexes.push(index)
    }
  }
}

registerSeriesTransform('renko-v2', {
  name: 'Renko Version 2',
  renderer: 'candlestick',
  inputs: [
    { key: 'boxSize', type: 'number', label: 'Fixed box size (0 = auto)', default: 0, min: 0 },
    { key: 'percent', type: 'number', label: 'Box percent', default: 0.04, min: 0 },
    { key: 'points', type: 'number', label: 'Box points', default: 10, min: 0 },
    { key: 'atrPeriod', type: 'number', label: 'ATR period', default: 14, min: 1, max: 500, step: 1 },
    { key: 'atrMultiplier', type: 'number', label: 'ATR multiplier', default: 1, min: 0.1 },
    { key: 'tickSize', type: 'number', label: 'Instrument tick size', default: 0.05, min: 0.00000001 },
    {
      key: 'sessionClock',
      type: 'select',
      label: 'ATR session clock',
      default: 'continuous',
      options: [
        { label: 'Continuous', value: 'continuous' },
        { label: 'India', value: 'ist' },
        { label: 'UTC', value: 'utc' },
      ],
    },
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
  create: (options) => {
    const boxSize = Number(options.boxSize)
    return new RenkoV2Run({
      ...options as RenkoV2Options,
      boxSize: boxSize > 0 ? boxSize : undefined,
    })
  },
})
