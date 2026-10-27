import { describe, it, expect } from 'vitest'
import { allocateTradeLabels, CleanTradeButtons } from './chartTradingLayer'
describe('clean chart labels', () => {
  it('separates equal-price labels and reserves the LTP/countdown', () => {
    const labels = allocateTradeLabels(
      Array.from({ length: 6 }, (_, i) => ({ id: String(i), y: 100 })),
      260,
      100
    )
    const ys = [...labels.values()]
    expect(new Set(ys).size).toBe(6)
    expect(ys.every((y) => Math.abs(y - 100) > 26)).toBe(true)
    expect(ys.every((y) => y >= 12 && y <= 248)).toBe(true)
  })
  it('does not overflow a pane with more labels than available rows', () => {
    const labels = allocateTradeLabels(
      Array.from({ length: 20 }, (_, i) => ({ id: String(i), y: 40 })),
      80,
      40
    )
    expect(labels.size).toBeLessThan(20)
    expect([...labels.values()].every((y) => y >= 12 && y <= 68 && Math.abs(y - 40) > 26)).toBe(
      true
    )
  })
  it('an LTP never masquerades as bid/ask', () => {
    const button = new CleanTradeButtons('1', String)
    button.setMark(100)
    expect((button as unknown as { bid: unknown }).bid).toBeNull()
    expect((button as unknown as { ask: unknown }).ask).toBeNull()
    button.setPrices(99, 101)
    expect((button as unknown as { bid: number }).bid).toBe(99)
  })
  it('keeps labels in price order and clear of the trade controls', () => {
    const items = Array.from({ length: 7 }, (_, i) => ({ id: String(i), y: 130 + i * 3 }))
    const labels = allocateTradeLabels(items, 480, 165, 96)
    const ys = items.map((item) => labels.get(item.id)!)
    expect(ys.every((y) => y >= 96)).toBe(true)
    expect(ys).toEqual([...ys].sort((a, b) => a - b))
    expect(ys.every((y, i) => !i || y - ys[i - 1] >= 22)).toBe(true)
  })
})
