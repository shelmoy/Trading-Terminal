// Run against the isolated production-asset fixture server, never a live broker.
import { chromium } from '@playwright/test'
import fs from 'node:fs/promises'
const base = process.env.MOBILE_FIXTURE_DIR
if (!base) throw new Error('Set MOBILE_FIXTURE_DIR to the isolated frontend build')
const html = await fs.readFile(`${base}/index.html`, 'utf8')
const browser = await chromium.launch({ headless: true, channel: 'chrome' })
const records = []
try {
  for (const colorScheme of ['light', 'dark']) for (const viewport of [{ width: 412, height: 915 }, { width: 915, height: 412 }]) {
    const context = await browser.newContext({ viewport, colorScheme, userAgent: 'Mozilla/5.0 TradingTerminalAndroid/1' })
    const page = await context.newPage()
    await page.route('**/login', route => route.fulfill({ body: html, contentType: 'text/html' }))
    await page.route('**/auth/**', route => route.fulfill({ json: route.request().url().includes('check-setup') ? { status: 'success', needs_setup: false } : { status: 'success', authenticated: false } }))
    await page.route('**/mobile/bootstrap', route => route.fulfill({ status: 401, json: { status: 'error' } }))
    await page.goto('http://127.0.0.1:5190/login')
    await page.getByLabel('Username', { exact: true }).waitFor()
    await page.getByLabel('Password', { exact: true }).fill('fake-only')
    const check = await page.evaluate(() => ({ mobile: document.documentElement.dataset.mobileTerminal, dark: document.documentElement.classList.contains('dark'), overflow: document.documentElement.scrollWidth > innerWidth + 1, armed: localStorage.getItem('mobile-v1:oa-trading-armed') }))
    if (check.mobile !== 'true' || check.dark !== (colorScheme === 'dark') || check.overflow || check.armed !== '0') throw new Error(JSON.stringify(check))
    await page.screenshot({ path: `${base}/../login-${colorScheme}-${viewport.width}.png`, fullPage: true })
    records.push({ colorScheme, viewport, ...check })
    await context.close()
  }
  await fs.writeFile(`${base}/../browser-checks.json`, JSON.stringify(records, null, 2))
  console.log(`Passed ${records.length} mocked Chrome layout/theme fixtures`)
} finally { await browser.close() }
