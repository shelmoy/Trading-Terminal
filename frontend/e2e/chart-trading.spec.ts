import { test, expect, type Page } from '@playwright/test'

const orders = Array.from({ length: 6 }, (_, i) => ({
  orderid: `FIXTURE-${i}`,
  symbol: 'FIXTURE',
  exchange: 'NFO',
  product: 'NRML',
  action: 'BUY',
  pricetype: 'LIMIT',
  quantity: 75,
  price: 100.9 + i * 0.05,
  order_status: 'open',
  version: `v${i}`,
}))
const state = {
  scope: 'mock-account',
  mode: 'analyze',
  orders,
  positions: [
    {
      symbol: 'FIXTURE',
      exchange: 'NFO',
      product: 'MIS',
      quantity: 75,
      average_price: 100.95,
      version: 'p1',
    },
  ],
}
const protection = {
  brokerId: 'MOCK-GTT',
  kind: 'gtt',
  identity: { symbol: 'FIXTURE', exchange: 'NFO', product: 'NRML' },
  positionQuantity: 75,
  positionVersion: 'p1',
  nativeVersion: 'g1',
  state: 'active',
  review: '',
  roles: { stop: { trigger: 99.4, limit: 99.35 }, target: { trigger: 101.6, limit: 101.6 } },
  confirmedRoles: {
    stop: { trigger: 99.4, limit: 99.35 },
    target: { trigger: 101.6, limit: 101.6 },
  },
}
async function fixture(page: Page, query = '') {
  const commands: Record<string, unknown>[] = []
  const book = query.includes('protection=1')
    ? {
        ...state,
        mode: 'live',
        orders: [],
        positions: [{ ...state.positions[0], product: 'NRML' }],
        protections: [protection],
      }
    : query.includes('dense=1')
      ? {
          ...state,
          orders: Array.from({ length: 40 }, (_, i) => ({
            ...orders[i % orders.length],
            orderid: `DENSE-${i}`,
          })),
        }
      : state
  await page.route('**/*', (route) => {
    const request = route.request(),
      url = new URL(request.url())
    // A fixture can never contact either live instance or a broker host.
    if (url.origin !== 'http://127.0.0.1:5178') return route.abort()
    if (url.pathname === '/chart-trading/state')
      return route.fulfill({ json: { status: 'success', data: book } })
    if (url.pathname === '/chart-trading/command') {
      commands.push(request.postDataJSON())
      return route.fulfill({ json: { state: 'accepted', orderId: 'MOCK-ONLY' } })
    }
    if (request.method() !== 'GET') return route.abort()
    return route.continue()
  })
  await page.goto(`/e2e/fixtures/chart-trading.html?${query}`)
  await page.waitForFunction(() =>
    Boolean((window as unknown as { fixtureReady: boolean }).fixtureReady)
  )
  return commands
}
for (const theme of ['light', 'dark'])
  for (const type of ['candlestick', 'renko', 'renko-v2', 'renko-v3', 'renko-v4']) {
    test(`${theme} ${type}: exact native SL/TP levels in a narrow pane`, async ({ page }, info) => {
      const commands = await fixture(
        page,
        `theme=${theme}&type=${type}&width=380&protection=1&mode=live`
      )
      const boxes = await page.evaluate(() => (window as any).chartFixture.boxes())
      expect(boxes).toHaveLength(3)
      expect(
        boxes.find((line: any) => line.options.id === 'ct:protection:MOCK-GTT:stop').price
      ).toBe(99.4)
      expect(
        boxes.find((line: any) => line.options.id === 'ct:protection:MOCK-GTT:target').price
      ).toBe(101.6)
      expect(boxes.find((line: any) => line.options.id === 'ct:position:NRML').price).toBe(100.95)
      const ys = boxes
        .filter((line: any) => line.box)
        .map((line: any) => line.box.y)
        .sort((a: number, b: number) => a - b)
      for (let i = 1; i < ys.length; i++) expect(ys[i] - ys[i - 1]).toBeGreaterThanOrEqual(20)
      await page
        .locator('#chart')
        .screenshot({ path: info.outputPath(`${theme}-${type}-protection.png`) })
      expect(commands).toHaveLength(0)
    })
  }
test('native OCO drag changes one role once, preserving the other leg and limit offset', async ({
  page,
}) => {
  const commands = await fixture(page, 'theme=dark&width=900&protection=1&mode=live')
  const rect = (await page.locator('#chart').boundingBox())!
  const box = await page.evaluate(
    () =>
      (window as any).chartFixture
        .boxes()
        .find((line: any) => line.options.id === 'ct:protection:MOCK-GTT:stop').box
  )
  const x = rect.x + box.x + 10,
    y = rect.y + box.y + 10
  await page.mouse.move(x, y)
  await page.mouse.down()
  await page.mouse.move(x, y + 30, { steps: 5 })
  await page.mouse.up()
  await expect.poll(() => commands.length).toBe(1)
  expect(commands[0]).toMatchObject({
    operation: 'modifyProtection',
    expectedVersion: 'p1',
    payload: {
      protectionId: 'MOCK-GTT',
      protectionVersion: 'g1',
      targetTrigger: 101.6,
      targetLimit: 101.6,
    },
  })
  const payload = commands[0].payload as Record<string, number>
  expect(payload.stopTrigger - payload.stopLimit).toBeCloseTo(0.05, 8)
})
for (const theme of ['light', 'dark'])
  for (const type of ['candlestick', 'renko', 'renko-v2', 'renko-v3', 'renko-v4']) {
    test(`${theme} ${type}: narrow-pane labels retain exact prices`, async ({ page }, info) => {
      const commands = await fixture(page, `theme=${theme}&type=${type}&width=380`)
      const boxes = await page.evaluate(() => (window as any).chartFixture.boxes())
      expect(boxes.length).toBe(7)
      const visible = boxes.filter((line: any) => line.box)
      expect(visible.length).toBeGreaterThan(0)
      const ys = visible.map((line: any) => line.box.y + 10).sort((a: number, b: number) => a - b)
      for (let i = 1; i < ys.length; i++) expect(ys[i] - ys[i - 1]).toBeGreaterThanOrEqual(20)
      expect(ys.every((y: number) => y >= 96)).toBe(true)
      const ltpY = await page.evaluate(() => (window as any).chartFixture.nativeMarkY())
      expect(ys.every((y: number) => Math.abs(y - ltpY) > 26)).toBe(true)
      const ordered = [...visible]
        .sort((a: any, b: any) => a.pixelY - b.pixelY)
        .map((line: any) => line.box.y)
      expect(ordered).toEqual([...ordered].sort((a, b) => a - b))
      for (const line of boxes) expect(line.options.price).toBe(line.price)
      await page.locator('#chart').screenshot({ path: info.outputPath(`${theme}-${type}.png`) })
      expect(commands).toHaveLength(0)
    })
  }
test('a real canvas drag modifies once; panning and Escape never place', async ({ page }) => {
  const commands = await fixture(page, 'theme=dark&width=900')
  const rect = await page.locator('#chart').boundingBox()
  expect(rect).not.toBeNull()
  const box = await page.evaluate(
    () =>
      (window as any).chartFixture
        .boxes()
        .find((line: any) => line.options.id === 'ct:order:FIXTURE-0').box
  )
  const x = rect!.x + box.x + 12,
    y = rect!.y + box.y + 10
  await page.mouse.move(x, y)
  await page.mouse.down()
  await page.mouse.move(x, y + 35, { steps: 5 })
  await page.mouse.up()
  await expect.poll(() => commands.length).toBe(1)
  expect(commands[0]).toMatchObject({ operation: 'modify', expectedVersion: 'v0' })
  await page.mouse.move(rect!.x + 90, rect!.y + 300)
  await page.mouse.down()
  await page.mouse.move(rect!.x + 140, rect!.y + 320)
  await page.mouse.up()
  expect(commands).toHaveLength(1)
  await page.evaluate(() => (window as any).chartFixture.arm())
  await page.locator('#outside').focus()
  await page.keyboard.press('Escape')
  expect(await page.evaluate(() => (window as any).chartFixture.draftArmed())).toBe(false)
  expect(commands).toHaveLength(1)
})
test('inverted and zoomed scales preserve numeric order levels', async ({ page }) => {
  const commands = await fixture(page, 'theme=light&inverted=1&width=900')
  const before = await page.evaluate(() =>
    (window as any).chartFixture.boxes().map((line: any) => line.price)
  )
  await page.locator('#chart').hover({ position: { x: 300, y: 180 } })
  await page.mouse.wheel(0, -180)
  await page.evaluate(() => (window as any).chartFixture.frames())
  expect(
    await page.evaluate(() => (window as any).chartFixture.boxes().map((line: any) => line.price))
  ).toEqual(before)
  expect(commands).toHaveLength(0)
})
test('dense levels have an explicit overflow indicator', async ({ page }, info) => {
  const commands = await fixture(page, 'theme=dark&width=380&dense=1')
  expect(await page.evaluate(() => (window as any).chartFixture.overflow())).toBeGreaterThan(0)
  const boxes = await page.evaluate(() => (window as any).chartFixture.boxes())
  expect(boxes).toHaveLength(41)
  await page.locator('#chart').screenshot({ path: info.outputPath('dense-levels.png') })
  expect(commands).toHaveLength(0)
})
test('records local processing and draw timing separately from broker delivery', async ({
  page,
}, info) => {
  const commands = await fixture(page, 'theme=dark&width=900')
  const timing = await page.evaluate(() => (window as any).chartFixture.measure(60))
  expect(timing.samples).toBe(60)
  expect(timing.processingP95).toBeGreaterThanOrEqual(0)
  expect(timing.drawP95).toBeGreaterThanOrEqual(timing.processingP50)
  await info.attach('local-fixture-timings', {
    body: JSON.stringify(timing, null, 2),
    contentType: 'application/json',
  })
  console.log('LOCAL_FIXTURE_TIMINGS', JSON.stringify(timing))
  expect(commands).toHaveLength(0)
})
test('new broker lines follow the price pane after it moves below a study', async ({ page }) => {
  const commands = await fixture(page, 'theme=dark&width=900')
  expect(await page.evaluate(() => (window as any).chartFixture.movePrimary())).toBe(true)
  const moved = { ...orders[0], orderid: 'MOVED', price: 101.4, version: 'moved-v1' }
  await page.route('**/chart-trading/state?*', (route) =>
    route.fulfill({ json: { status: 'success', data: { ...state, orders: [moved] } } })
  )
  await page.evaluate(async () => {
    await (window as any).chartFixture.refresh()
    await (window as any).chartFixture.frames()
  })
  const geometry = await page.evaluate(() => {
    const fixture = (window as any).chartFixture
    return {
      box: fixture.boxes().find((line: any) => line.options.id === 'ct:order:MOVED').box,
      pane: fixture.chart.plotRect(fixture.chart.primaryPaneIndex()),
      index: fixture.chart.primaryPaneIndex(),
    }
  })
  expect(geometry.index).toBe(1)
  expect(geometry.box).not.toBeNull()
  const rect = await page.locator('#chart').boundingBox()
  const x = rect!.x + geometry.pane.left + geometry.box.x + 12,
    y = rect!.y + geometry.pane.top + geometry.box.y + 10
  await page.mouse.move(x, y)
  await page.mouse.down()
  await page.mouse.move(x, y + 20, { steps: 4 })
  await page.mouse.up()
  await expect.poll(() => commands.length).toBe(1)
  expect(commands[0]).toMatchObject({
    operation: 'modify',
    expectedVersion: 'moved-v1',
    payload: { orderid: 'MOVED' },
  })
})
