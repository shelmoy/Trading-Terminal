// All HTTP/WebSocket traffic is fulfilled in-process with fake data. No broker.
import { chromium } from '@playwright/test'
import fs from 'node:fs/promises'
import path from 'node:path'
const base = process.env.MOBILE_FIXTURE_DIR
if (!base) throw new Error('Set MOBILE_FIXTURE_DIR to the isolated production build')
const html = await fs.readFile(path.join(base, 'index.html'), 'utf8')
const browser = await chromium.launch({ headless: true, channel: 'chrome' })
const records = []
const blocked = []
try {
  for (const broker of ['kotak', 'fyers']) for (const colorScheme of ['light', 'dark'])
    for (const viewport of [{ width: 412, height: 700 }, { width: 915, height: 330 }]) {
      const origin = 'https://terminal.fixture.ts.net' + (broker === 'fyers' ? ':8443' : '')
      const context = await browser.newContext({ viewport, colorScheme, userAgent: 'Mozilla/5.0 (Linux; Android 15) TradingTerminalAndroid/1' })
      const page = await context.newPage()
      const errors = []
      const requests = []
      page.on('pageerror', e => errors.push(e.message))
      await context.addInitScript(() => { window.__nativeSignals = []; window.TerminalNative = { postMessage: text => window.__nativeSignals.push(JSON.parse(text)) } })
      await context.route('**/*', async route => {
        const req = route.request(), url = new URL(req.url())
        const p = url.pathname
        if (url.origin !== origin) return route.abort()
        requests.push(req.method() + ' ' + p)
        if (/placeorder|modifyorder|cancelorder|closeposition|analyzer-toggle|logout/.test(p)) {
          blocked.push(p); return route.abort()
        }
        if (p.startsWith('/assets/')) {
          const file = path.join(base, p.slice(1))
          const contentType = p.endsWith('.js') ? 'application/javascript' : p.endsWith('.css') ? 'text/css' : 'application/octet-stream'
          return route.fulfill({ body: await fs.readFile(file), contentType })
        }
        if (p === '/trading') return route.fulfill({ body: html, contentType: 'text/html' })
        let body = { status: 'success', data: [] }
        if (p === '/auth/session-status') body = { status: 'success', authenticated: true, logged_in: true, user: 'fake-fixture', broker, api_key: 'fake-only' }
        else if (p === '/auth/analyzer-mode') body = { status: 'success', data: { analyze_mode: true, mode: 'analyze' } }
        else if (p === '/api/broker/capabilities') body = { status: 'success', data: { broker_name: broker, broker_type: 'IN_stock', supported_exchanges: ['NSE_INDEX', 'BSE_INDEX', 'NFO', 'BFO'], leverage_config: false } }
        else if (p === '/mobile/bootstrap') body = { protocol: 1, connected: true }
        else if (p === '/api/websocket/apikey') body = { status: 'success', api_key: 'fake-only' }
        else if (p === '/api/websocket/config') body = { status: 'success', websocket_url: origin.replace('https:', 'wss:') + '/ws' }
        else if (p === '/api/v1/intervals') body = { status: 'success', data: { minutes: ['1m', '3m', '5m', '15m'], hours: ['1h'], days: ['D'] } }
        else if (p === '/api/v1/symbol' || p === '/api/v1/search' || p === '/api/v1/quotes' || p === '/api/v1/history') {
          const payload = JSON.parse(req.postData() || '{}')
          const symbol = payload.symbol || payload.query || 'SENSEX', exchange = payload.exchange || 'BSE_INDEX'
          const ltp = symbol === 'NIFTY' ? 23500 : 80000
          if (p.endsWith('/symbol')) body = { status: 'success', data: { symbol, exchange, name: symbol, lotsize: 1, tick_size: 0.05, freeze_qty: 1000, instrumenttype: 'INDEX' } }
          else if (p.endsWith('/search')) body = { status: 'success', data: [{ symbol, exchange, lotsize: 1, tick_size: 0.05 }] }
          else if (p.endsWith('/quotes')) body = { status: 'success', data: { ltp, prev_close: ltp - 500, bid: 0, ask: 0 } }
          else {
            const now = Math.floor(Date.now() / 60000) * 60
            body = { status: 'success', data: Array.from({ length: 180 }, (_, i) => ({ timestamp: now - (180-i)*60,
              open: ltp-100+i*.5, high: ltp-90+i*.5, low: ltp-110+i*.5, close: ltp-98+i*.5, volume: 0 })) }
          }
        } else if (p === '/api/v1/orderbook') body = { status: 'success', data: { orders: [] } }
        else if (p === '/api/v1/funds') body = { status: 'success', data: { availablecash: 100000 } }
        return route.fulfill({ json: body })
      })
      await context.routeWebSocket('**/*', ws => {
        ws.onMessage(text => {
          let command
          try { command = JSON.parse(text) } catch { return }
          if (typeof command !== 'object') return
          if (!['authenticate','subscribe','unsubscribe','subscribe_orders','unsubscribe_orders','ping'].includes(command.action)) {
            blocked.push('ws:' + command.action); return
          }
          if (command.action === 'authenticate') ws.send(JSON.stringify({ type: 'auth', status: 'success' }))
          if (command.action === 'subscribe') for (const row of command.symbols || []) ws.send(JSON.stringify({ type: 'market_data', symbol: row.symbol, exchange: row.exchange,
            data: { ltp: row.symbol === 'NIFTY' ? 23500 : 80000, close: row.symbol === 'NIFTY' ? 23000 : 79500, timestamp: Date.now() } }))
        })
      })
      await page.goto(origin + '/trading?android_chart=1&symbol=SENSEX&exchange=BSE_INDEX&chartType=renko-v4&native_request=fixture', { waitUntil: 'domcontentloaded' })
      try {
        await page.waitForFunction(() => window.__nativeSignals.some(s => s.type === 'chart-state' && s.state === 'ready'), { timeout: 35000 })
      } catch (e) {
        const diagnostic = await page.evaluate(() => ({ signals: window.__nativeSignals, text: document.body.innerText.slice(0,1200) }))
        throw new Error(JSON.stringify({ broker, colorScheme, viewport, diagnostic, errors, requests }) + '\n' + e.message)
      }
      const check = await page.evaluate(() => ({
        canvases: document.querySelectorAll('canvas').length,
        pane: document.querySelector('[data-chart-pane]')?.getBoundingClientRect().toJSON(),
        overflow: document.documentElement.scrollWidth > innerWidth + 1,
        text: document.body.innerText.slice(0, 200),
        ready: window.__nativeSignals.filter(s => s.state === 'ready').length,
      }))
      if (errors.length || !check.canvases || check.pane.height < viewport.height - 5 || check.overflow || blocked.length)
        throw new Error(JSON.stringify({ errors, check, blocked }))
      await page.screenshot({ path: path.join(base,'..',`chart-${broker}-${colorScheme}-${viewport.width}.png`) })
      records.push({ broker, colorScheme, viewport, ...check })
      await context.close()
    }
  await fs.writeFile(path.join(base,'..','chart-browser-checks.json'), JSON.stringify(records,null,2))
  console.log(`Passed ${records.length} real SDK Chrome fixtures with fake transports; no mutations`)
} finally { await browser.close() }
