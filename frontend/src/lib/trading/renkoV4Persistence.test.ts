import { beforeEach, describe, expect, it, vi } from 'vitest'
import { restoreRenkoV4, saveRenkoV4 } from './renkoV4Persistence'
import { RenkoV4Run } from './renkoV4Transform'

beforeEach(() => localStorage.clear())

function run() {
  const value = new RenkoV4Run({ boxSize: 10 })
  value.setData([{ time: 1000, open: 100, high: 120, low: 100, close: 120 }])
  return value
}

describe('Renko V4 cache', () => {
  it('matches workspace-serialized option order without crossing instruments', () => {
    const prefix = 'oa-trading-scalper-p0-renko-v4-cache:NSE_INDEX:NIFTY:'
    const stored = `${prefix}{"reversal":2,"boxSize":10}`
    saveRenkoV4(run(), stored, 'oa-trading-scalper-p0-renko-v4-cache:')
    const restored = new RenkoV4Run({ boxSize: 10 })
    expect(
      restoreRenkoV4(restored, 'new-trading-key', `${prefix}{"boxSize":10,"reversal":2}`)
    ).toBe(true)
    expect(restored.elements()).toEqual(run().elements())
    expect(
      restoreRenkoV4(
        new RenkoV4Run({ boxSize: 10 }),
        'absent',
        'oa-trading-scalper-p0-renko-v4-cache:BSE_INDEX:SENSEX:{"boxSize":10,"reversal":2}'
      )
    ).toBe(false)
  })
  it('can recover the matching confirmed Scalper run without modifying that cache', () => {
    const working = run()
    saveRenkoV4(working, 'scalper:matching', 'scalper:')
    const original = localStorage.getItem('scalper:matching')
    localStorage.setItem('trading:recovered', '{invalid')
    const restored = new RenkoV4Run({ boxSize: 10 })
    expect(restoreRenkoV4(restored, 'trading:recovered', 'scalper:matching')).toBe(true)
    expect(restored.elements()).toEqual(working.elements())
    expect(localStorage.getItem('scalper:matching')).toBe(original)
    expect(restoreRenkoV4(new RenkoV4Run({ boxSize: 20 }), 'absent', 'scalper:matching')).toBe(
      false
    )
  })
  it('recovers confirmed data and ignores corrupt cache entries', () => {
    const first = run()
    saveRenkoV4(first, 'cache:one', 'cache:')
    const restored = new RenkoV4Run({ boxSize: 10 })
    restoreRenkoV4(restored, 'cache:one')
    expect(restored.elements()).toEqual(first.elements())
    localStorage.setItem('cache:bad', '{invalid')
    expect(() => restoreRenkoV4(restored, 'cache:bad')).not.toThrow()
    expect(restored.elements()).toEqual(first.elements())
  })

  it('bounds cached configurations and preserves unrelated preferences', () => {
    localStorage.setItem('other-preference', 'keep')
    for (let i = 0; i < 20; i++) saveRenkoV4(run(), `cache:${i}`, 'cache:')
    expect(Object.keys(localStorage).filter((k) => k.startsWith('cache:'))).toHaveLength(8)
    expect(localStorage.getItem('cache:19')).not.toBeNull()
    expect(localStorage.getItem('other-preference')).toBe('keep')
  })

  it('handles unavailable storage without breaking tick updates', () => {
    const store = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new DOMException('full', 'QuotaExceededError')
    })
    const first = run()
    expect(() => saveRenkoV4(first, 'cache:one', 'cache:')).not.toThrow()
    first.update({ time: 1001, open: 120, high: 130, low: 120, close: 130 })
    expect(first.elements().at(-1)?.close).toBe(130)
    store.mockRestore()
  })
})
