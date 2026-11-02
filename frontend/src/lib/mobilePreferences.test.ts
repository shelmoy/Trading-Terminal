import { beforeEach, expect, it } from 'vitest'
import { exportChartPreferences, importChartPreferences } from './mobilePreferences'
beforeEach(() => localStorage.clear())
it('copies only explicit chart settings and excludes credentials, prices and execution state', () => {
  for (const key of ['session', 'api_key', 'oa-trading-p0-qty', 'oa-trading-armed', 'oa-trading-p0-renko-v4-cache:fake', 'oa-scalper-ce-lots']) localStorage.setItem(key, 'private')
  localStorage.setItem('oa-trading-p0-ctype', 'renko-v4')
  localStorage.setItem('oa-trading-p0-indicators', '{"indicators":[]}')
  const raw = exportChartPreferences(localStorage)
  expect(raw).not.toContain('private')
  localStorage.clear()
  expect(importChartPreferences(raw, localStorage)).toBe(2)
  expect(localStorage.getItem('oa-trading-p0-ctype')).toBe('renko-v4')
})
it('rejects a mixed malicious document before writing anything', () => {
  expect(() => importChartPreferences(JSON.stringify({ version: 1, entries: { 'oa-trading-p0-ctype': 'renko-v4', session: 'bad' } }), localStorage)).toThrow()
  expect(localStorage.length).toBe(0)
})
