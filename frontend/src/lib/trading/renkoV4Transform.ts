import { registerSeriesTransform, type Bar, type SeriesTransformRun } from 'openalgo-charts'
import type { ISeriesTransform } from 'openalgo-charts/transform'
import { calculateRenkoV2BoxSize } from './renkoV2Transform'

export interface RenkoV4Options {
  mode?: 'percent' | 'points' | 'atr'
  atrPeriod?: number
  atrMultiplier?: number
  percent?: number
  points?: number
  boxSize?: number
  tickSize?: number
  reversal?: number
}

interface EngineState {
  anchor: number
  level: number
  direction: -1 | 0 | 1
  box: number
}
interface SavedRun {
  version: 1
  reversal: number
  engine: EngineState
  lastBar: Bar
  latestTime: number
  live: boolean
  bricks: [number, number, number, number][]
  olderCount?: number
  backfill?: { before: number; engine: EngineState | null }
}

function positive(value: number | undefined, fallback: number): number {
  return Number.isFinite(value) && value! > 0 ? value! : fallback
}

/** Size is resolved from the seed once, never from a forming candle or ATR. */
export function calculateRenkoV4BoxSize(reference: number, options: RenkoV4Options): number {
  const tick = positive(options.tickSize, 0.00000001)
  const raw = positive(
    options.boxSize,
    options.mode === 'points'
      ? positive(options.points, 10)
      : (Math.abs(reference) * positive(options.percent, 0.04)) / 100
  )
  return Number(Math.max(tick, Math.round(raw / tick) * tick).toPrecision(14))
}

/** Price-only state machine. Times label bricks; they never decide whether one forms. */
export class RenkoV4Transform implements ISeriesTransform {
  private anchor: number | null = null
  private level = 0
  private direction: -1 | 0 | 1 = 0
  private box = 0
  readonly reversal: number
  readonly options: RenkoV4Options

  constructor(options: RenkoV4Options = {}) {
    this.options = { ...options }
    this.reversal = Math.max(2, Math.min(20, Math.floor(positive(options.reversal, 2))))
  }

  reset(): void {
    this.anchor = null
    this.level = 0
    this.direction = 0
    this.box = 0
  }

  clone(): RenkoV4Transform {
    const copy = new RenkoV4Transform(this.options)
    copy.anchor = this.anchor
    copy.level = this.level
    copy.direction = this.direction
    copy.box = this.box
    return copy
  }

  getBoxSize(): number {
    return this.box
  }

  state(): EngineState | null {
    return this.anchor === null
      ? null
      : {
          anchor: this.anchor,
          level: this.level,
          direction: this.direction,
          box: this.box,
        }
  }

  restore(state: EngineState): void {
    this.anchor = state.anchor
    this.level = state.level
    this.direction = state.direction
    this.box = state.box
  }

  seed(price: number, sizing = this.options): void {
    if (this.anchor !== null || !Number.isFinite(price) || price <= 0) return
    this.anchor = price
    this.box = calculateRenkoV4BoxSize(price, sizing)
  }

  push(bar: Bar): Bar[] {
    if (!Number.isFinite(bar.close) || bar.close <= 0 || !Number.isFinite(bar.time)) return []
    this.seed(bar.open)
    return this.pushTick(bar.close, bar.time)
  }

  pushTick(price: number, time: number): Bar[] {
    if (!Number.isFinite(price) || price <= 0 || !Number.isFinite(time)) return []
    if (this.anchor === null) {
      this.seed(price)
      return []
    }
    const units = (price - this.anchor) / this.box
    const epsilon = 1e-8
    const up = Math.floor(units + epsilon)
    const down = Math.ceil(units - epsilon)
    let nextDirection: -1 | 1
    let target: number
    let firstOpen = this.level
    if (this.direction === 0) {
      if (up > this.level) {
        nextDirection = 1
        target = up
      } else if (down < this.level) {
        nextDirection = -1
        target = down
      } else return []
    } else if (this.direction === 1) {
      if (up > this.level) {
        nextDirection = 1
        target = up
      } else if (down <= this.level - this.reversal) {
        nextDirection = -1
        target = down
        firstOpen = this.level - this.reversal + 1
      } else return []
    } else {
      if (down < this.level) {
        nextDirection = -1
        target = down
      } else if (up >= this.level + this.reversal) {
        nextDirection = 1
        target = up
        firstOpen = this.level + this.reversal - 1
      } else return []
    }
    // Refuse unreasonable settings before changing state, rather than silently
    // truncating a gap and manufacturing more bricks on repeated identical ticks.
    if (Math.abs(target - firstOpen) > 100_000)
      throw new RangeError('Renko brick size is too small for this price move. Increase the size.')
    const bricks: Bar[] = []
    const priceAt = (level: number) => Number((this.anchor! + level * this.box).toPrecision(14))
    for (let level = firstOpen; level !== target; level += nextDirection) {
      const open = priceAt(level)
      const close = priceAt(level + nextDirection)
      bricks.push({ time, open, close, high: Math.max(open, close), low: Math.min(open, close) })
    }
    this.level = target
    this.direction = nextDirection
    return bricks
  }
}

/** Append-only committed bricks, with an isolated OHLC branch for replay. */
export class RenkoV4Run implements SeriesTransformRun {
  private engine: RenkoV4Transform
  private bars: Bar[] = []
  private bricks: Bar[] = []
  private indexes: number[] = []
  private completionTimes: number[] = []
  private trend: Bar[] = []
  private branch: RenkoV4Run | null = null
  private latestTime = -Infinity
  private latestObservedBar: Bar | null = null
  private historyStart = Infinity
  private olderCount = 0
  private backfillEngine: RenkoV4Transform | null = null
  private live = false
  private liveSnapshot = false
  readonly options: RenkoV4Options
  private readonly seedSeconds: number

  constructor(options: RenkoV4Options = {}, seedSeconds = 0) {
    this.seedSeconds = seedSeconds
    this.options = { ...options }
    this.engine = new RenkoV4Transform(options)
  }

  setData(bars: readonly Bar[]): void {
    const authoritative = this.liveSnapshot
    this.liveSnapshot = false
    if (!bars.length) {
      // Empty replay prefixes must not destroy the live state.
      if (!authoritative && this.bars.length) this.branch = new RenkoV4Run(this.options, this.seedSeconds)
      return
    }
    const newest = bars[bars.length - 1]
    if (!authoritative && this.bars.length && newest.time < this.latestTime) {
      this.branch = new RenkoV4Run(this.options, this.seedSeconds)
      this.branch.setData(bars)
      return
    }
    this.branch = null
    if (this.seedSeconds > 0) {
      // V5 seeds from the earliest confirmed ATR window. Only subsequent
      // closes may extend the price path during history recovery.
      const confirmed = bars.filter((bar) => bar.time + this.seedSeconds <= Date.now() / 1000)
      this.bars = bars.map((bar) => ({ ...bar }))
      this.reindex()
      if (!this.engine.state()) {
        const period = Math.min(500, Math.max(1, Math.floor(positive(this.options.atrPeriod, 14))))
        const seedCount = this.options.mode === 'atr' ? period + 1 : 1
        if (confirmed.length < seedCount) return
        const seed = confirmed[seedCount - 1]
        const boxSize = this.options.mode === 'atr'
          ? calculateRenkoV2BoxSize(confirmed.slice(0, seedCount), { ...this.options, atrPeriod: period })
          : this.options.boxSize
        this.engine.seed(seed.close, { ...this.options, boxSize })
        this.latestTime = seed.time
        this.latestObservedBar = seed
        this.historyStart = confirmed[0].time
      }
      this.extendOlderHistory(confirmed)
      for (const bar of confirmed) {
        if (bar.time <= this.latestTime) continue
        this.append(this.engine.pushTick(bar.close, bar.time), this.indexOf(bar.time))
        this.latestTime = bar.time
        this.latestObservedBar = bar
      }
      return
    }
    if (!this.bars.length) {
      this.bars = bars.map((bar) => ({ ...bar }))
      for (let i = 0; i < this.bars.length; i++) this.append(this.engine.push(this.bars[i]), i)
      this.latestTime = newest.time
      return
    }
    // Authoritative OHLC corrections cannot replace previously observed price
    // paths. Only newly closed bars beyond the last input may seed missing data.
    const pending = bars.filter((bar) => bar.time > this.latestTime)
    const previous = this.latestTime
    this.bars = bars.map((bar) => ({ ...bar }))
    this.reindex()
    for (const bar of pending) {
      this.append(this.engine.pushTick(bar.close, bar.time), this.indexOf(bar.time))
      this.latestTime = bar.time
    }
    if (!this.live && newest.time === previous)
      this.append(this.engine.pushTick(newest.close, newest.time), this.bars.length - 1)
  }

  /**
   * Work backwards from the existing chart edge at the locked brick size.
   * Older closes are an approximation. Keep their state separate so adding a
   * page can never move a brick or change the next live reversal threshold.
   */
  private extendOlderHistory(closed: readonly Bar[]): void {
    const older = closed.filter((bar) => bar.time < this.historyStart)
    if (!older.length) return
    const engine = this.backfillEngine?.clone() ?? new RenkoV4Transform(this.options)
    if (!this.backfillEngine) {
      const live = this.engine.state()!
      engine.seed(this.bricks[0]?.open ?? live.anchor, { ...this.options, boxSize: live.box })
    }
    const backwards: Bar[] = []
    for (let index = older.length - 1; index >= 0; index--) {
      for (const brick of engine.pushTick(older[index].close, older[index].time)) backwards.push(brick)
    }

    const generated: Bar[] = []
    const times: number[] = []
    for (const brick of backwards.reverse()) {
      const previous = generated.at(-1)?.time ?? -Infinity
      const step = Math.max(0.000001, Math.abs(previous) * Number.EPSILON * 2)
      const time = brick.time > previous ? brick.time : previous + step
      generated.push({ ...brick, time, open: brick.close, close: brick.open })
      times.push(brick.time)
    }
    this.historyStart = older[0].time
    this.backfillEngine = engine
    this.olderCount += generated.length
    this.bricks = [...generated, ...this.bricks]
    this.completionTimes = [...times, ...this.completionTimes]
    this.trend = [...generated.map((brick) => this.trendPoint(brick)), ...this.trend]
    this.reindex()
  }

  prepend(bars: readonly Bar[]): void {
    this.resumeLive()
    this.setData([...bars, ...this.bars])
  }

  /** A normal refresh can lag the socket; it is not a request to rewind. */
  resumeLive(): void {
    this.branch = null
    this.liveSnapshot = true
  }

  update(bar: Bar): number {
    if (this.branch) return this.branch.update(bar)
    const firstChanged = this.bricks.length
    if (bar.time < this.latestTime || !Number.isFinite(bar.close) || bar.close <= 0)
      return firstChanged
    const last = this.bars.at(-1)
    if (last?.time === bar.time) this.bars[this.bars.length - 1] = { ...bar }
    else this.bars.push({ ...bar })
    if (this.seedSeconds > 0 && !this.engine.state()) {
      this.setData(this.bars)
      if (!this.engine.state()) return firstChanged
    }
    this.live = true
    this.latestTime = bar.time
    if (this.seedSeconds > 0) this.latestObservedBar = bar
    this.append(this.engine.push(bar), this.bars.length - 1)
    return firstChanged
  }

  /** Keep collecting the actual live path while replay owns the visible branch. */
  observeLive(bar: Bar): void {
    const branch = this.branch
    this.branch = null
    try {
      this.update(bar)
    } finally {
      this.branch = branch
    }
  }

  source(): readonly Bar[] {
    return this.branch?.source() ?? this.bars
  }
  elements(): readonly Bar[] {
    return this.branch?.elements() ?? this.bricks
  }
  sourceIndex(): readonly number[] {
    return this.branch?.sourceIndex() ?? this.indexes
  }
  trendPoints(): readonly Bar[] {
    return this.branch?.trendPoints() ?? this.trend
  }
  get committedCount(): number {
    return this.bricks.length
  }

  /** Compact, bounded cache of the observed path; replay is never persisted. */
  snapshot(): SavedRun | null {
    const engine = this.engine.state()
    const lastBar = this.seedSeconds > 0 ? this.latestObservedBar : this.bars.at(-1)
    if (!engine || !lastBar) return null
    const start = Math.max(0, this.bricks.length - 10_000)
    return {
      version: 1,
      reversal: this.engine.reversal,
      engine,
      lastBar: { ...lastBar },
      latestTime: this.latestTime,
      live: this.live,
      ...(this.seedSeconds > 0 ? {
        olderCount: Math.max(0, this.olderCount - start),
        ...(start === 0 ? {
          backfill: { before: this.historyStart, engine: this.backfillEngine?.state() ?? null },
        } : {}),
      } : {}),
      bricks: this.bricks
        .slice(start)
        .map((b, i) => [b.time, b.open, b.close, this.completionTimes[start + i]]),
    }
  }

  restoreSnapshot(value: unknown): boolean {
    if (!value || typeof value !== 'object') return false
    const saved = value as SavedRun
    const engine = saved.engine
    const lastBar = saved.lastBar
    const finite = (n: unknown): n is number => typeof n === 'number' && Number.isFinite(n)
    if (
      saved.version !== 1 ||
      saved.reversal !== this.engine.reversal ||
      !engine ||
      !lastBar ||
      !Array.isArray(saved.bricks) ||
      saved.bricks.length > 10_000 ||
      !finite(saved.latestTime) ||
      typeof saved.live !== 'boolean' ||
      !finite(engine.anchor) ||
      engine.anchor <= 0 ||
      !finite(engine.level) ||
      !Number.isSafeInteger(engine.level) ||
      ![-1, 0, 1].includes(engine.direction) ||
      !finite(engine.box) ||
      engine.box <= 0 ||
      engine.box !== calculateRenkoV4BoxSize(
        engine.anchor,
        this.seedSeconds > 0 && this.options.mode === 'atr'
          ? { ...this.options, boxSize: engine.box }
          : this.options
      ) ||
      !finite(lastBar.time) ||
      lastBar.time > saved.latestTime ||
      ![lastBar.open, lastBar.high, lastBar.low, lastBar.close].every((n) => finite(n) && n > 0)
    )
      return false
    let previous = -Infinity
    for (const brick of saved.bricks) {
      if (
        !Array.isArray(brick) ||
        brick.length !== 4 ||
        !brick.every(finite) ||
        brick[0] <= previous ||
        brick[1] <= 0 ||
        brick[2] <= 0 ||
        brick[3] > saved.latestTime ||
        Math.abs(Math.abs(brick[2] - brick[1]) - engine.box) > engine.box * 1e-7
      )
        return false
      previous = brick[0]
    }
    const olderCount = this.seedSeconds > 0 ? (saved.olderCount ?? 0) : 0
    if (!Number.isSafeInteger(olderCount) || olderCount < 0 || olderCount > saved.bricks.length)
      return false
    const backfill = this.seedSeconds > 0 ? saved.backfill : undefined
    if (backfill && (!finite(backfill.before) || backfill.before > saved.latestTime)) return false
    const backwards = backfill?.engine
    if (backwards && (
      !finite(backwards.anchor) || backwards.anchor <= 0 ||
      !Number.isSafeInteger(backwards.level) ||
      ![-1, 0, 1].includes(backwards.direction) || backwards.box !== engine.box
    )) return false
    const final = saved.bricks.length > olderCount ? saved.bricks.at(-1) : undefined
    if (final) {
      const close = Number((engine.anchor + engine.level * engine.box).toPrecision(14))
      if (final[2] !== close || engine.direction !== (final[2] > final[1] ? 1 : -1)) return false
    } else if (engine.level !== 0 || engine.direction !== 0) return false
    this.engine.restore(engine)
    this.bars = [{ ...lastBar }]
    this.latestTime = saved.latestTime
    if (this.seedSeconds > 0) this.latestObservedBar = { ...lastBar }
    this.live = saved.live
    this.branch = null
    this.bricks = saved.bricks.map(([time, open, close]) => ({
      time,
      open,
      close,
      high: Math.max(open, close),
      low: Math.min(open, close),
    }))
    this.completionTimes = saved.bricks.map((b) => b[3])
    if (this.seedSeconds > 0) {
      this.historyStart = backfill?.before ?? this.completionTimes[0] ?? this.latestTime
      this.olderCount = olderCount
      this.backfillEngine = backwards ? new RenkoV4Transform(this.options) : null
      if (backwards) this.backfillEngine?.restore(backwards)
    }
    this.indexes = this.bricks.map(() => 0)
    this.trend = this.bricks.map((brick) => this.trendPoint(brick))
    return true
  }

  private indexOf(time: number): number {
    let lo = 0,
      hi = this.bars.length - 1
    while (lo < hi) {
      const mid = (lo + hi) >>> 1
      if (this.bars[mid].time < time) lo = mid + 1
      else hi = mid
    }
    return lo
  }

  private reindex(): void {
    this.indexes = this.completionTimes.map((time) => this.indexOf(time))
  }

  private append(bricks: readonly Bar[], sourceIndex: number): void {
    for (const brick of bricks) {
      // The chart requires unique timestamps. Use fractional labels so a gap
      // producing many bricks does not invent hours of future trading time.
      const previousTime = this.bricks.at(-1)?.time ?? -Infinity
      const spacing = Number.isFinite(previousTime)
        ? Math.max(0.000001, Math.abs(previousTime) * Number.EPSILON * 2)
        : 0
      const time = Math.max(brick.time, previousTime + spacing)
      const confirmed = { ...brick, time }
      this.bricks.push(confirmed)
      this.indexes.push(sourceIndex)
      this.completionTimes.push(brick.time)
      this.trend.push(this.trendPoint(confirmed))
    }
  }

  private trendPoint(brick: Bar): Bar {
    const direction = brick.close > brick.open ? 1 : -1
    const stop = Number(
      (brick.close - direction * (this.engine.reversal - 1) * this.engine.getBoxSize()).toPrecision(
        14
      )
    )
    return {
      time: brick.time,
      open: stop,
      high: stop,
      low: stop,
      close: stop,
      color: direction > 0 ? '#26a69a' : '#ef5350',
    }
  }
}

// The terminal supplies its pane-owned run during synchronous series creation.
// Chart recreation can then repaint exactly the same committed live bricks.
let suppliedRun: RenkoV4Run | null = null
export const currentRenkoRun = (): RenkoV4Run | null => suppliedRun
export function withRenkoV4Run<T>(run: RenkoV4Run, create: () => T): T {
  const previous = suppliedRun
  suppliedRun = run
  try {
    return create()
  } finally {
    suppliedRun = previous
  }
}

registerSeriesTransform('renko-v4', {
  name: 'Renko Version 4',
  renderer: 'candlestick',
  inputs: [
    {
      key: 'mode',
      type: 'select',
      label: 'Brick sizing',
      default: 'percent',
      options: [
        { label: 'Percentage at seed', value: 'percent' },
        { label: 'Fixed points', value: 'points' },
      ],
    },
    { key: 'percent', type: 'number', label: 'Brick percent', default: 0.04, min: 0.000001 },
    { key: 'points', type: 'number', label: 'Brick points', default: 10, min: 0.00000001 },
    { key: 'boxSize', type: 'number', label: 'Fixed size override (0 = auto)', default: 0, min: 0 },
    {
      key: 'tickSize',
      type: 'number',
      label: 'Instrument tick size',
      default: 0.00000001,
      min: 0.00000001,
    },
    {
      key: 'reversal',
      type: 'number',
      label: 'Reversal bricks',
      default: 2,
      min: 2,
      max: 20,
      step: 1,
    },
  ],
  create: (options) => suppliedRun ?? new RenkoV4Run(options as RenkoV4Options),
})
